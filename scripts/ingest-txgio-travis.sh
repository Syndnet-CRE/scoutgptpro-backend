#!/bin/bash
# Idempotent Travis County Parcel Ingestion from TxGIO
# Shapefile: stratmap24-landparcels_48453_travis_202404.shp

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Configuration
SHP_FILE="${1:-$REPO_ROOT/data/shapefiles/land_parcels/stratmap24-landparcels_48453_travis_202404.shp}"
STAGING_TABLE="parcels_tx_stage"
TARGET_TABLE="parcels_tx"
STATE_FIPS="48"
COUNTY_FIPS="48453"
SOURCE_LAYER="txgio_travis_2025"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}❌ ERROR: DATABASE_URL environment variable not set${NC}"
  exit 1
fi

# Check if shapefile exists
if [ ! -f "$SHP_FILE" ]; then
  echo -e "${RED}❌ ERROR: Shapefile not found: $SHP_FILE${NC}"
  exit 1
fi

echo -e "${GREEN}🚀 Starting Travis County TxGIO parcel ingestion${NC}"
echo "📁 Source file: $SHP_FILE"
echo "📊 Target table: $TARGET_TABLE"
echo ""

# ============================================================================
# STEP 1 — INSPECT THE SHAPEFILE
# ============================================================================
echo -e "${YELLOW}STEP 1: Inspecting shapefile...${NC}"

echo "✅ Detected format: Shapefile"
echo "📄 Shapefile: $(basename "$SHP_FILE")"

# Get feature count and fields
ogrinfo -so -al "$SHP_FILE" > /tmp/ogrinfo_output.txt 2>&1
FEATURE_COUNT=$(ogrinfo -so -al "$SHP_FILE" 2>/dev/null | grep "Feature Count:" | awk '{print $3}')
LAYER_NAME=$(basename "$SHP_FILE" .shp)
GEOM_TYPE=$(ogrinfo -so -al "$SHP_FILE" 2>/dev/null | grep "Geometry:" | awk '{print $2}' || echo "Unknown")

echo "📊 Feature count: $FEATURE_COUNT"

# List attribute fields
echo ""
echo "📋 Available fields:"
ogrinfo -so -al "$SHP_FILE" 2>/dev/null | grep -E "^  " | grep -v "Geometry" | head -20

# Identify parcel ID field (check in priority order)
PARCEL_ID_FIELD=""
FIELD_LIST=$(ogrinfo -so -al "$SHP_FILE" 2>/dev/null | grep -E "^  " | awk '{print $1}' | tr '\n' ' ')

echo ""
echo "🔍 Identifying parcel ID field..."

if echo "$FIELD_LIST" | grep -qi "prop_id"; then
  PARCEL_ID_FIELD="prop_id"
  echo "✅ Selected: prop_id"
elif echo "$FIELD_LIST" | grep -qi "geo_id"; then
  PARCEL_ID_FIELD="geo_id"
  echo "✅ Selected: geo_id"
elif echo "$FIELD_LIST" | grep -qi "parcel_id"; then
  PARCEL_ID_FIELD="parcel_id"
  echo "✅ Selected: parcel_id"
elif echo "$FIELD_LIST" | grep -qi "APN"; then
  PARCEL_ID_FIELD="APN"
  echo "✅ Selected: APN"
elif echo "$FIELD_LIST" | grep -qi "OBJECTID"; then
  PARCEL_ID_FIELD="OBJECTID"
  echo "✅ Selected: OBJECTID"
elif echo "$FIELD_LIST" | grep -qi "FID"; then
  PARCEL_ID_FIELD="FID"
  echo "✅ Selected: FID"
else
  echo -e "${YELLOW}⚠️  Warning: No standard ID field found, using OBJECTID as fallback${NC}"
  PARCEL_ID_FIELD="OBJECTID"
fi

echo "📐 Geometry type: $GEOM_TYPE"

# ============================================================================
# STEP 2 — STAGING INGEST
# ============================================================================
echo ""
echo -e "${YELLOW}STEP 2: Creating staging table and ingesting...${NC}"

# Drop staging table if exists
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS $STAGING_TABLE;" > /dev/null 2>&1

# Ingest using ogr2ogr
echo "📥 Ingesting shapefile to staging table..."
ogr2ogr -f "PostgreSQL" \
  "PG:${DATABASE_URL}" \
  "$SHP_FILE" \
  -nln "$STAGING_TABLE" \
  -lco GEOMETRY_NAME=geom \
  -lco GEOM_TYPE=MULTIPOLYGON \
  -t_srs EPSG:4326 \
  -nlt PROMOTE_TO_MULTI \
  -overwrite \
  -progress 2>&1 | grep -E "(^[0-9]|ERROR|FAILED)" || true

echo "✅ Staging table created"

# ============================================================================
# STEP 3 — CANONICAL parcel_uid
# ============================================================================
echo ""
echo -e "${YELLOW}STEP 3: Generating canonical parcel_uid...${NC}"

# Normalize field name (handle case sensitivity)
PARCEL_ID_COLUMN=$(psql "$DATABASE_URL" -tAc "
  SELECT column_name 
  FROM information_schema.columns 
  WHERE table_name = '$STAGING_TABLE' 
  AND LOWER(column_name) = LOWER('$PARCEL_ID_FIELD')
  LIMIT 1
")

if [ -z "$PARCEL_ID_COLUMN" ]; then
  # Try OBJECTID/FID as fallback
  PARCEL_ID_COLUMN=$(psql "$DATABASE_URL" -tAc "
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = '$STAGING_TABLE' 
    AND (LOWER(column_name) = 'objectid' OR LOWER(column_name) = 'fid')
    LIMIT 1
  ")
fi

if [ -z "$PARCEL_ID_COLUMN" ]; then
  echo -e "${RED}❌ ERROR: Could not find parcel ID column${NC}"
  exit 1
fi

echo "📝 Using column: $PARCEL_ID_COLUMN"

# Add parcel_uid column and populate
psql "$DATABASE_URL" <<EOF
-- Add parcel_uid column
ALTER TABLE $STAGING_TABLE ADD COLUMN IF NOT EXISTS parcel_uid TEXT;

-- Generate parcel_uid: state_fips:county_fips:parcel_id
-- Use CTID as fallback if parcel ID is missing
UPDATE $STAGING_TABLE
SET parcel_uid = '$STATE_FIPS' || ':' || '$COUNTY_FIPS' || ':' || COALESCE(
  NULLIF(TRIM(CAST($PARCEL_ID_COLUMN AS TEXT)), ''),
  'FID' || CAST(ctid::text AS TEXT)
);

-- Ensure NOT NULL
ALTER TABLE $STAGING_TABLE ALTER COLUMN parcel_uid SET NOT NULL;

-- Check for duplicates
SELECT COUNT(*) as total, COUNT(DISTINCT parcel_uid) as unique_uid
FROM $STAGING_TABLE;
EOF

STAGING_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM $STAGING_TABLE;")
echo "✅ Generated $STAGING_COUNT parcel_uid values"

# ============================================================================
# STEP 4 — MERGE INTO parcels_tx (IDEMPOTENT)
# ============================================================================
echo ""
echo -e "${YELLOW}STEP 4: Merging into $TARGET_TABLE (idempotent upsert)...${NC}"

# Get current count before merge
BEFORE_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM $TARGET_TABLE WHERE county_fips = '$COUNTY_FIPS';")

# Extract prop_id and geo_id from staging (handle case-insensitive column names)
PROP_ID_COL=$(psql "$DATABASE_URL" -tAc "SELECT column_name FROM information_schema.columns WHERE table_name = '$STAGING_TABLE' AND LOWER(column_name) = 'prop_id' LIMIT 1;" || echo "")
GEO_ID_COL=$(psql "$DATABASE_URL" -tAc "SELECT column_name FROM information_schema.columns WHERE table_name = '$STAGING_TABLE' AND LOWER(column_name) = 'geo_id' LIMIT 1;" || echo "")

# Build SELECT with dynamic column references
PROP_ID_SELECT="NULL"
GEO_ID_SELECT="NULL"
if [ -n "$PROP_ID_COL" ]; then
  PROP_ID_SELECT="CAST(s.$PROP_ID_COL AS TEXT)"
fi
if [ -n "$GEO_ID_COL" ]; then
  GEO_ID_SELECT="CAST(s.$GEO_ID_COL AS TEXT)"
fi

# Upsert from staging
psql "$DATABASE_URL" <<EOF
-- Insert new parcels or update existing
INSERT INTO $TARGET_TABLE (parcel_uid, geom, state_fips, county_fips, prop_id, geo_id, source_layer, ingested_at, updated_at)
SELECT 
  s.parcel_uid,
  ST_MakeValid(s.geom) as geom,
  '$STATE_FIPS' as state_fips,
  '$COUNTY_FIPS' as county_fips,
  $PROP_ID_SELECT as prop_id,
  $GEO_ID_SELECT as geo_id,
  '$SOURCE_LAYER' as source_layer,
  NOW() as ingested_at,
  NOW() as updated_at
FROM $STAGING_TABLE s
ON CONFLICT (parcel_uid) DO UPDATE SET
  geom = ST_MakeValid(EXCLUDED.geom),
  prop_id = COALESCE(EXCLUDED.prop_id, $TARGET_TABLE.prop_id),
  geo_id = COALESCE(EXCLUDED.geo_id, $TARGET_TABLE.geo_id),
  source_layer = EXCLUDED.source_layer,
  updated_at = NOW();
EOF

AFTER_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM $TARGET_TABLE WHERE county_fips = '$COUNTY_FIPS';")
INSERTED=$((AFTER_COUNT - BEFORE_COUNT))
echo "✅ Merged: $INSERTED new, $AFTER_COUNT total Travis parcels"

# ============================================================================
# STEP 5 — CLEANUP
# ============================================================================
echo ""
echo -e "${YELLOW}STEP 5: Cleaning up...${NC}"

psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS $STAGING_TABLE;" > /dev/null 2>&1
echo "✅ Staging table dropped"

# ============================================================================
# STEP 6 — VALIDATION
# ============================================================================
echo ""
echo -e "${YELLOW}STEP 6: Validation...${NC}"

echo "📊 Validation Results:"
echo ""
echo "Source feature count: $FEATURE_COUNT"
echo "Target table count (Travis):"
psql "$DATABASE_URL" -tAc "SELECT COUNT(*) as travis_count FROM $TARGET_TABLE WHERE county_fips = '$COUNTY_FIPS';"
echo ""
echo "NULL geometries:"
psql "$DATABASE_URL" -tAc "SELECT COUNT(*) as null_geom FROM $TARGET_TABLE WHERE county_fips = '$COUNTY_FIPS' AND geom IS NULL;"
echo ""
echo "Invalid geometries:"
psql "$DATABASE_URL" -tAc "SELECT COUNT(*) as invalid_geom FROM $TARGET_TABLE WHERE county_fips = '$COUNTY_FIPS' AND NOT ST_IsValid(geom);"
echo ""
echo "Distinct parcel_uid count:"
psql "$DATABASE_URL" -tAc "SELECT COUNT(DISTINCT parcel_uid) as unique_uid FROM $TARGET_TABLE WHERE county_fips = '$COUNTY_FIPS';"
echo ""
echo "Duplicate parcel_uid check (should be 0):"
psql "$DATABASE_URL" -tAc "SELECT COUNT(*) as dup_count FROM (SELECT parcel_uid, COUNT(*) as cnt FROM $TARGET_TABLE WHERE county_fips = '$COUNTY_FIPS' GROUP BY parcel_uid HAVING COUNT(*) > 1) as dups;"

FINAL_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM $TARGET_TABLE WHERE county_fips = '$COUNTY_FIPS';")
NULL_GEOM=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM $TARGET_TABLE WHERE county_fips = '$COUNTY_FIPS' AND geom IS NULL;")
INVALID_GEOM=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM $TARGET_TABLE WHERE county_fips = '$COUNTY_FIPS' AND NOT ST_IsValid(geom);")
UNIQUE_UID=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(DISTINCT parcel_uid) FROM $TARGET_TABLE WHERE county_fips = '$COUNTY_FIPS';")
DUP_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM (SELECT parcel_uid, COUNT(*) as cnt FROM $TARGET_TABLE WHERE county_fips = '$COUNTY_FIPS' GROUP BY parcel_uid HAVING COUNT(*) > 1) as dups;")

echo ""
echo -e "${GREEN}✅ Ingestion complete!${NC}"
echo ""
echo "📊 Summary:"
echo "   Source features: $FEATURE_COUNT"
echo "   Final Travis count: $FINAL_COUNT"
echo "   NULL geometries: $NULL_GEOM"
echo "   Invalid geometries: $INVALID_GEOM"
echo "   Unique parcel_uid: $UNIQUE_UID"
echo "   Duplicate parcel_uid: $DUP_COUNT"
echo ""
echo "🔄 Idempotency: Re-running this script will update existing parcels without duplication"

