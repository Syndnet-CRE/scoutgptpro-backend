#!/bin/bash
# Reload Travis Parcels using ogr2ogr (respects .prj file)
# 
# This script replaces the Node.js loader which had CRS issues.
# ogr2ogr properly reads the shapefile .prj and transforms to WGS84.
#
# Usage:
#   npm run reload:parcels:travis:ogr
#   npm run reload:parcels:travis:ogr -- --keepRaw

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SHAPEFILE="$REPO_ROOT/data/shapefiles/land_parcels/stratmap24-landparcels_48453_travis_202404.shp"
PRJ_FILE="$REPO_ROOT/data/shapefiles/land_parcels/stratmap24-landparcels_48453_travis_202404.prj"

# Check for --keepRaw flag
KEEP_RAW=false
if [[ "${1:-}" == "--keepRaw" ]]; then
  KEEP_RAW=true
fi

echo "🚀 Travis Parcel Reload (ogr2ogr)"
echo "=================================="
echo ""

# PHASE 1: Preflight checks
echo "📋 Phase 1: Preflight Checks"
echo "----------------------------"

# Check ogr2ogr
if ! command -v ogr2ogr &> /dev/null; then
  echo -e "${RED}❌ ogr2ogr not found${NC}"
  echo ""
  echo "Install on macOS:"
  echo "  brew install gdal"
  echo ""
  echo "After installation, verify:"
  echo "  ogr2ogr --version"
  exit 1
fi

echo -e "${GREEN}✅ ogr2ogr found${NC}"
ogr2ogr --version | head -1

# Check shapefile exists
if [[ ! -f "$SHAPEFILE" ]]; then
  echo -e "${RED}❌ Shapefile not found: $SHAPEFILE${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Shapefile found${NC}"

# Check .prj exists
if [[ ! -f "$PRJ_FILE" ]]; then
  echo -e "${RED}❌ PRJ file not found: $PRJ_FILE${NC}"
  exit 1
fi
echo -e "${GREEN}✅ PRJ file found${NC}"

echo ""
echo "PRJ file contents (first 10 lines):"
head -10 "$PRJ_FILE" | sed 's/^/  /'
echo ""

# Load DATABASE_URL from .env
if [[ -f "$REPO_ROOT/.env.local" ]]; then
  source "$REPO_ROOT/.env.local"
  echo "📁 Using .env.local"
elif [[ -f "$REPO_ROOT/.env" ]]; then
  source "$REPO_ROOT/.env"
  echo "📁 Using .env"
else
  echo -e "${RED}❌ No .env or .env.local found${NC}"
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo -e "${RED}❌ DATABASE_URL not set${NC}"
  exit 1
fi

echo -e "${GREEN}✅ DATABASE_URL loaded${NC}"
echo ""

# PHASE 2: Reload
echo "📦 Phase 2: Reload Parcels"
echo "---------------------------"

# Extract connection details from DATABASE_URL
# Handle both postgresql:// and postgres:// URLs
DB_URL="$DATABASE_URL"
if [[ "$DB_URL" == postgresql://* ]] || [[ "$DB_URL" == postgres://* ]]; then
  # Parse URL
  DB_URL_CLEAN="${DB_URL#*://}"  # Remove protocol
  DB_USER_PASS="${DB_URL_CLEAN%%@*}"
  DB_USER="${DB_USER_PASS%%:*}"
  DB_PASS="${DB_USER_PASS#*:}"
  DB_HOST_PORT="${DB_URL_CLEAN#*@}"
  DB_HOST="${DB_HOST_PORT%%:*}"
  DB_PORT="${DB_HOST_PORT#*:}"
  DB_PORT="${DB_PORT%%/*}"
  DB_NAME="${DB_URL_CLEAN##*/}"
  DB_NAME="${DB_NAME%%\?*}"
else
  echo -e "${RED}❌ Invalid DATABASE_URL format${NC}"
  exit 1
fi

echo "Connecting to: $DB_HOST:$DB_PORT/$DB_NAME"
echo ""

# Check table exists
echo "Checking parcels_travis table..."
if ! psql "$DATABASE_URL" -tAc "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='parcels_travis'" | grep -q 1; then
  echo -e "${RED}❌ parcels_travis table does not exist. Run migration first.${NC}"
  exit 1
fi
echo -e "${GREEN}✅ parcels_travis table exists${NC}"
echo ""

# Get current count
CURRENT_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM parcels_travis")
echo "Current count: $CURRENT_COUNT"
echo ""

# Confirm truncate
echo -e "${YELLOW}⚠️  This will TRUNCATE parcels_travis and reload from shapefile${NC}"
read -p "Continue? (yes/no): " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  echo "Aborted."
  exit 0
fi

# TRUNCATE
echo ""
echo "Truncating parcels_travis..."
psql "$DATABASE_URL" -c "TRUNCATE TABLE parcels_travis;" || {
  echo -e "${RED}❌ Failed to truncate parcels_travis${NC}"
  exit 1
}
echo -e "${GREEN}✅ Truncated${NC}"
echo ""

# Import with ogr2ogr
echo "Importing shapefile with ogr2ogr..."
echo "This may take 5-10 minutes..."

PG_CONNECTION="PG:\"host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER password=$DB_PASS\""

ogr2ogr \
  -f PostgreSQL \
  "$PG_CONNECTION" \
  "$SHAPEFILE" \
  -nln parcels_travis_raw \
  -lco GEOMETRY_NAME=geom \
  -lco FID=gid \
  -nlt MULTIPOLYGON \
  -t_srs EPSG:4326 \
  -overwrite \
  -progress || {
  echo -e "${RED}❌ ogr2ogr import failed${NC}"
  exit 1
}

echo -e "${GREEN}✅ Shapefile imported to parcels_travis_raw${NC}"
echo ""

# Insert into parcels_travis
echo "Inserting into parcels_travis..."
psql "$DATABASE_URL" <<SQL || {
  echo -e "${RED}❌ Failed to insert into parcels_travis${NC}"
  exit 1
}
INSERT INTO parcels_travis(parcel_id, geom)
SELECT 
  Prop_ID::text as parcel_id,
  ST_Multi(geom) as geom
FROM parcels_travis_raw
WHERE Prop_ID IS NOT NULL
ON CONFLICT (parcel_id) DO NOTHING;
SQL

echo -e "${GREEN}✅ Inserted into parcels_travis${NC}"
echo ""

# Drop staging table unless --keepRaw
if [[ "$KEEP_RAW" == "false" ]]; then
  echo "Dropping staging table..."
  psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS parcels_travis_raw;" || {
    echo -e "${YELLOW}⚠️  Warning: Failed to drop parcels_travis_raw (non-fatal)${NC}"
  }
  echo -e "${GREEN}✅ Staging table dropped${NC}"
else
  echo -e "${YELLOW}⚠️  Keeping staging table parcels_travis_raw (--keepRaw flag)${NC}"
fi
echo ""

# PHASE 3: Verification
echo "✅ Phase 3: Verification"
echo "------------------------"

# Count
FINAL_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM parcels_travis")
echo "Total parcels: $FINAL_COUNT"

if (( FINAL_COUNT < 300000 )); then
  echo -e "${RED}❌ FAIL: Count too low (< 300,000)${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Count check passed${NC}"
echo ""

# Bbox
echo "Bounding box:"
BBOX=$(psql "$DATABASE_URL" -tAc "
  SELECT 
    round(ST_XMin(e)::numeric, 6) || ',' ||
    round(ST_YMin(e)::numeric, 6) || ',' ||
    round(ST_XMax(e)::numeric, 6) || ',' ||
    round(ST_YMax(e)::numeric, 6)
  FROM (SELECT ST_Extent(geom) AS e FROM parcels_travis) t;
")
echo "  $BBOX"

WEST=$(echo "$BBOX" | cut -d',' -f1)
SOUTH=$(echo "$BBOX" | cut -d',' -f2)
EAST=$(echo "$BBOX" | cut -d',' -f3)
NORTH=$(echo "$BBOX" | cut -d',' -f4)

# Check if bbox is roughly Travis County (lon ~ -98 to -97, lat ~ 30 to 31)
# Use awk for floating point comparison (more portable than bc)
WEST_CHECK=$(echo "$WEST" | awk '{if ($1 < -98.5 || $1 > -97.0) print "fail"}')
EAST_CHECK=$(echo "$EAST" | awk '{if ($1 < -98.5 || $1 > -97.0) print "fail"}')
SOUTH_CHECK=$(echo "$SOUTH" | awk '{if ($1 < 29.5 || $1 > 30.5) print "fail"}')
NORTH_CHECK=$(echo "$NORTH" | awk '{if ($1 < 30.0 || $1 > 31.0) print "fail"}')

if [[ -n "$WEST_CHECK" ]]; then
  echo -e "${RED}❌ FAIL: Bbox west ($WEST) not in Travis County range (-98.5 to -97.0)${NC}"
  exit 1
fi
if [[ -n "$EAST_CHECK" ]]; then
  echo -e "${RED}❌ FAIL: Bbox east ($EAST) not in Travis County range (-98.5 to -97.0)${NC}"
  exit 1
fi
if [[ -n "$SOUTH_CHECK" ]]; then
  echo -e "${RED}❌ FAIL: Bbox south ($SOUTH) not in Travis County range (29.5 to 30.5)${NC}"
  exit 1
fi
if [[ -n "$NORTH_CHECK" ]]; then
  echo -e "${RED}❌ FAIL: Bbox north ($NORTH) not in Travis County range (30.0 to 31.0)${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Bbox check passed (Travis County range)${NC}"
echo ""

# Sample centroids
echo "Sample centroids (first 5):"
psql "$DATABASE_URL" -c "
  SELECT 
    parcel_id,
    round(ST_X(ST_PointOnSurface(geom))::numeric, 6) as lon,
    round(ST_Y(ST_PointOnSurface(geom))::numeric, 6) as lat
  FROM parcels_travis 
  LIMIT 5;
" || {
  echo -e "${RED}❌ Failed to query centroids${NC}"
  exit 1
}

# Check sample centroids are in Austin area
SAMPLE_CHECK=$(psql "$DATABASE_URL" -tAc "
  SELECT COUNT(*)
  FROM (
    SELECT 
      round(ST_X(ST_PointOnSurface(geom))::numeric, 6) as lon,
      round(ST_Y(ST_PointOnSurface(geom))::numeric, 6) as lat
    FROM parcels_travis 
    LIMIT 5
  ) t
  WHERE lon BETWEEN -98.5 AND -97.0
    AND lat BETWEEN 30.0 AND 31.0;
")

SAMPLE_CHECK=${SAMPLE_CHECK:-0}
if [[ "$SAMPLE_CHECK" -lt 3 ]]; then
  echo -e "${RED}❌ FAIL: Sample centroids not in Austin area (lon ~ -97.x, lat ~ 30.x)${NC}"
  echo "   Only $SAMPLE_CHECK out of 5 samples in correct range"
  exit 1
fi
echo -e "${GREEN}✅ Centroid check passed (Austin area)${NC}"
echo ""

# Final summary
echo "=================================="
echo -e "${GREEN}✅ Reload Complete${NC}"
echo "=================================="
echo "Total parcels: $FINAL_COUNT"
echo "Bbox: $BBOX"
echo ""
echo "Next steps:"
echo "  1. Run export: npm run export:parcels:travis"
echo "  2. Upload to Mapbox: Follow MTS_UPLOAD_RUNBOOK.md"
echo ""

