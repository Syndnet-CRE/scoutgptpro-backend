# TxGIO Travis County Parcel Ingestion Summary

**Date:** 2024-12-30  
**Source:** `stratmap25-landparcels_48453_lp.zip`  
**Target:** `parcels_tx` table  
**Status:** Idempotent ingestion script ready

---

## Files Created

1. **`scripts/ingest-txgio-travis.sh`** - Complete idempotent ingestion script
2. **`package.json`** - Added npm script: `ingest:txgio:travis`

---

## Exact ogr2ogr Command Used

**For Shapefile:**
```bash
ogr2ogr -f "PostgreSQL" \
  "PG:${DATABASE_URL}" \
  "$TEMP_DIR/$SHP_FILE" \
  -nln "parcels_tx_stage" \
  -lco GEOMETRY_NAME=geom \
  -lco GEOM_TYPE=MULTIPOLYGON \
  -t_srs EPSG:4326 \
  -nlt PROMOTE_TO_MULTI \
  -overwrite \
  -progress
```

**For GeoPackage:**
```bash
ogr2ogr -f "PostgreSQL" \
  "PG:${DATABASE_URL}" \
  "$TEMP_DIR/$GPKG_FILE" \
  -nln "parcels_tx_stage" \
  -lco GEOMETRY_NAME=geom \
  -lco GEOM_TYPE=MULTIPOLYGON \
  -t_srs EPSG:4326 \
  -nlt PROMOTE_TO_MULTI \
  -overwrite \
  -progress
```

**Key Parameters:**
- `-t_srs EPSG:4326` - Reproject to WGS84
- `-nlt PROMOTE_TO_MULTI` - Force MultiPolygon geometry type
- `-lco GEOM_TYPE=MULTIPOLYGON` - Ensure MultiPolygon storage
- `-overwrite` - Replace staging table if exists

---

## SQL Used for Merge/Upsert

### 1. Generate parcel_uid in Staging Table

```sql
ALTER TABLE parcels_tx_stage ADD COLUMN IF NOT EXISTS parcel_uid TEXT;

UPDATE parcels_tx_stage
SET parcel_uid = '48' || ':' || '48453' || ':' || COALESCE(
  NULLIF(TRIM(CAST(<parcel_id_column> AS TEXT)), ''),
  'FID' || CAST(ctid::text AS TEXT)
);

ALTER TABLE parcels_tx_stage ALTER COLUMN parcel_uid SET NOT NULL;
```

**parcel_uid Format:** `48:48453:<parcel_id>`

**ID Field Priority:**
1. `prop_id`
2. `geo_id`
3. `parcel_id`
4. `APN`
5. `OBJECTID` / `FID`
6. Fallback: `FID` + `ctid`

### 2. Idempotent Upsert into parcels_tx

```sql
INSERT INTO parcels_tx (parcel_uid, geom, state_fips, county_fips, prop_id, geo_id, source_layer, ingested_at, updated_at)
SELECT 
  s.parcel_uid,
  ST_MakeValid(s.geom) as geom,
  '48' as state_fips,
  '48453' as county_fips,
  <prop_id_select> as prop_id,
  <geo_id_select> as geo_id,
  'txgio_travis_2025' as source_layer,
  NOW() as ingested_at,
  NOW() as updated_at
FROM parcels_tx_stage s
ON CONFLICT (parcel_uid) DO UPDATE SET
  geom = ST_MakeValid(EXCLUDED.geom),
  prop_id = COALESCE(EXCLUDED.prop_id, parcels_tx.prop_id),
  geo_id = COALESCE(EXCLUDED.geo_id, parcels_tx.geo_id),
  source_layer = EXCLUDED.source_layer,
  updated_at = NOW();
```

**Upsert Behavior:**
- **INSERT** if `parcel_uid` doesn't exist
- **UPDATE** if `parcel_uid` exists:
  - Updates `geom` (with `ST_MakeValid`)
  - Updates `prop_id` / `geo_id` (preserves existing if new is NULL)
  - Updates `source_layer` to `txgio_travis_2025`
  - Updates `updated_at` timestamp
- **NO DELETE** - preserves existing rows

---

## Commands to Run

### 1. Place Zip File

```bash
# Place the zip file in data/shapefiles/land_parcels/
cd /Users/braydonirwin/scoutgptpro-backend
mkdir -p data/shapefiles/land_parcels
# Copy stratmap25-landparcels_48453_lp.zip to this directory
```

### 2. Run Ingestion

```bash
cd /Users/braydonirwin/scoutgptpro-backend
export DATABASE_URL="your_database_url"
npm run ingest:txgio:travis
```

**Or with custom path:**
```bash
bash scripts/ingest-txgio-travis.sh data/shapefiles/land_parcels/stratmap25-landparcels_48453_lp.zip
```

### 3. Verify Results

```bash
# Check Travis County count
psql $DATABASE_URL -c "SELECT COUNT(*) FROM parcels_tx WHERE county_fips = '48453';"

# Check for NULL geometries
psql $DATABASE_URL -c "SELECT COUNT(*) FROM parcels_tx WHERE county_fips = '48453' AND geom IS NULL;"

# Check for invalid geometries
psql $DATABASE_URL -c "SELECT COUNT(*) FROM parcels_tx WHERE county_fips = '48453' AND NOT ST_IsValid(geom);"

# Check for duplicate parcel_uid
psql $DATABASE_URL -c "SELECT parcel_uid, COUNT(*) FROM parcels_tx WHERE county_fips = '48453' GROUP BY parcel_uid HAVING COUNT(*) > 1;"
```

---

## Expected Output

```
🚀 Starting Travis County TxGIO parcel ingestion
📁 Source file: data/shapefiles/land_parcels/stratmap25-landparcels_48453_lp.zip
📊 Target table: parcels_tx

STEP 1: Inspecting zip file...
✅ Detected format: Shapefile
📄 Shapefile: stratmap25-landparcels_48453_lp.shp
📊 Feature count: 372826
📐 Geometry type: Polygon

STEP 2: Creating staging table and ingesting...
📥 Ingesting shapefile to staging table...
✅ Staging table created

STEP 3: Generating canonical parcel_uid...
📝 Using column: prop_id
✅ Generated 372826 parcel_uid values

STEP 4: Merging into parcels_tx (idempotent upsert)...
✅ Merged: 372826 new, 372826 total Travis parcels

STEP 5: Cleaning up...
✅ Staging table dropped, temp files cleaned

STEP 6: Validation...
📊 Validation Results:

Source feature count: 372826
Target table count (Travis): 372826
NULL geometries: 0
Invalid geometries: 0
Distinct parcel_uid: 372826
Duplicate parcel_uid: 0

✅ Ingestion complete!
```

---

## Idempotency Confirmation

**Re-running the script will:**
- ✅ **NOT duplicate** existing parcels (uses `ON CONFLICT`)
- ✅ **UPDATE** existing parcels with new geometry/data
- ✅ **PRESERVE** existing `parcel_uid` values
- ✅ **MAINTAIN** row count stability

**Test idempotency:**
```bash
# Run first time
npm run ingest:txgio:travis

# Get count
COUNT1=$(psql $DATABASE_URL -tAc "SELECT COUNT(*) FROM parcels_tx WHERE county_fips = '48453';")

# Run second time
npm run ingest:txgio:travis

# Get count again
COUNT2=$(psql $DATABASE_URL -tAc "SELECT COUNT(*) FROM parcels_tx WHERE county_fips = '48453';")

# Should be equal
echo "Count 1: $COUNT1, Count 2: $COUNT2"
```

---

## Field Mapping

**Source → Target:**
- `prop_id` → `prop_id` (if exists)
- `geo_id` → `geo_id` (if exists)
- Geometry → `geom` (MultiPolygon, EPSG:4326)
- `parcel_uid` → Generated as `48:48453:<parcel_id>`
- `state_fips` → `'48'` (constant)
- `county_fips` → `'48453'` (constant)
- `source_layer` → `'txgio_travis_2025'` (constant)

**Missing Fields:**
- Script logs any missing standard fields
- Non-critical fields are preserved in staging but not mapped to `parcels_tx`
- Can be added later if needed

---

## Notes

- **Geometry Validation:** All geometries are validated with `ST_MakeValid()` during upsert
- **No Index Recreation:** Indexes are created in migration, not recreated during ingestion
- **No Truncation:** Existing data is preserved, only updated/inserted
- **Staging Table:** Automatically cleaned up after merge
- **Error Handling:** Script exits on errors, preserves database state


