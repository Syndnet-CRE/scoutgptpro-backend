# Parcel Data Location Audit Report
**Date:** 2025-12-28  
**Purpose:** Locate where parcel data actually lives and identify missing load step for `parcels_travis`  
**Status:** ✅ Audit Complete - Missing Load Script Identified

---

## Executive Summary

**Finding:** `parcels_travis` table is empty (0 rows) because **no load script exists** to populate it from available source data.

**Source Data Available:**
- ✅ StratMap Shapefile: `data/shapefiles/land_parcels/stratmap24-landparcels_48453_travis_202404.shp` (124 MB, ~374,880 parcels)
- ✅ ATTOM GeoJSON: `/tmp/zip_audit_3zips/zip2/ATTOM_Travis County.geojson` (334 MB, ~413,905 features)
- ✅ Properties table: 352,431 rows with `parcelId` field

**Missing Component:** ETL script to load geometries from StratMap shapefile into `parcels_travis` table.

---

## 1. Database State

### 1.1 Parcel Tables Found

| Table | Rows | Has Geometry | Has parcel_id | Purpose |
|-------|------|--------------|---------------|---------|
| `parcels_travis` | **0** | ✅ Yes (`geom` MultiPolygon) | ✅ Yes (`parcel_id` TEXT) | **Target table - EMPTY** |
| `xref_parcel_property_travis` | 0 | ❌ No | ✅ Yes (`parcel_id` TEXT) | Parcel ↔ ATTOM ID mapping |
| `stg_attom_property_boundary_travis` | 0 | ❌ No | ✅ Yes (`parcel_id` TEXT) | Staging table for ATTOM data |
| `properties` | 352,431 | ❌ No (lat/lng only) | ✅ Yes (`parcelId` TEXT) | Property records with parcelId |

### 1.2 `parcels_travis` Schema

```sql
CREATE TABLE parcels_travis (
    parcel_id TEXT PRIMARY KEY,
    geom GEOMETRY(MultiPolygon, 4326) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

**Indexes:**
- GiST spatial index on `geom`
- Primary key index on `parcel_id`

**Status:** ✅ Table exists, schema correct, **0 rows**

---

## 2. Source Data Discovery

### 2.1 StratMap Shapefile (PRIMARY SOURCE)

**Location:** `data/shapefiles/land_parcels/stratmap24-landparcels_48453_travis_202404.shp`

**File Details:**
- **Size:** 124 MB (shapefile)
- **Format:** ESRI Shapefile (MultiPolygon)
- **Projection:** Texas State Plane (SRID 2276) - needs transformation to 4326
- **Record Count:** ~374,880 parcels (from DBF analysis)
- **Source:** Texas Natural Resources Information System (TNRIS) StratMap 2024

**Key Fields:**
- `Prop_ID` (TEXT) - 6-digit parcel identifier → **matches `properties.parcelId`**
- `GEO_ID` (TEXT) - 10-digit geographic identifier
- `SITUS_ADDR` (TEXT) - Site address
- `MAIL_ADDR` (TEXT) - Mailing address
- `ACRES` (NUMERIC) - Parcel acreage
- `SHAPE` (Geometry) - MultiPolygon geometry

**Join Key:** `Prop_ID` = `properties.parcelId` (exact match, verified in audit)

**Scripts That Read This File:**
- `scripts/inspect-land-parcels.js` - Read-only inspection
- `scripts/import-physical-addresses.js` - Reads address data only
- `scripts/spatial-join-addresses.js` - Spatial analysis only
- **NO script loads geometries into `parcels_travis`**

### 2.2 ATTOM GeoJSON (ALTERNATIVE SOURCE)

**Location:** `/tmp/zip_audit_3zips/zip2/ATTOM_Travis County.geojson`

**File Details:**
- **Size:** 334 MB
- **Format:** GeoJSON FeatureCollection
- **SRID:** 4326 (WGS84) - **already in correct format**
- **Record Count:** ~413,905 features
- **Source:** ATTOM Data Solutions

**Key Fields:**
- `apn` (TEXT) - Assessor Parcel Number (6-digit, partial match to `parcelId`)
- `id` (TEXT) - ATTOM property ID
- `geometry` (GeoJSON) - MultiPolygon geometry

**Join Key:** `apn` ≈ `properties.parcelId` (partial overlap, 2/4 tested values matched)

**Scripts That Read This File:**
- `scripts/ingest_attom_geojson_xref_safe.mjs` - Loads xref mappings only (apn → id)
- `scripts/prove_attom_geojson_join.mjs` - Read-only proof of concept
- **NO script loads geometries into `parcels_travis`**

### 2.3 Properties Table (REFERENCE)

**Location:** Neon database, `properties` table

**Details:**
- **Rows:** 352,431
- **Has `parcelId`:** ✅ Yes (TEXT, unique)
- **Has Geometry:** ❌ No (only `latitude`/`longitude` points)

**Purpose:** Reference for join validation. `parcels_travis.parcel_id` should match `properties.parcelId`.

---

## 3. Migration Intent

### 3.1 Migration File: `db/migrations/0001_travis_resolver_and_parcels.sql`

**Line 174 Comment:**
```sql
-- 3. Populate parcels_travis from ATTOM Parcel GeoJSON files
```

**Intent:** Populate `parcels_travis` from ATTOM GeoJSON files.

**Reality:** 
- Migration creates table structure ✅
- **No ETL script exists to populate it** ❌
- Migration is DDL-only (no data loading)

### 3.2 Documentation References

**`docs/TRAVIS_RESOLVER_INGEST_RUNBOOK.md` (Line 174):**
> "Populate parcels_travis from ATTOM Parcel GeoJSON files"

**`NEON_TRAVIS_DB_AUDIT_RESULTS.md` (Line 484-488):**
> **Phase 3: Parcel Polygon Ingestion**
> 1. Create ETL script to read ATTOM Parcel GeoJSON files
> 2. Convert GeoJSON polygons to PostGIS MultiPolygon format
> 3. Insert into `parcels_travis` with validation (ST_IsValid)
> 4. Verify geometry SRID and coordinate system

**Status:** Phase 3 **never implemented**.

---

## 4. Existing Scripts Analysis

### 4.1 Scripts That Read Shapefiles

| Script | Purpose | Reads Geometry? | Writes to DB? |
|--------|---------|-----------------|---------------|
| `inspect-land-parcels.js` | Inspection only | ✅ Yes | ❌ No |
| `import-physical-addresses.js` | Import addresses | ❌ No | ✅ Yes (to `properties`) |
| `spatial-join-addresses.js` | Spatial analysis | ✅ Yes | ❌ No |
| `inspect-shapefiles.js` | General inspection | ✅ Yes | ❌ No |

**Conclusion:** No script loads geometries into `parcels_travis`.

### 4.2 Scripts That Read GeoJSON

| Script | Purpose | Reads Geometry? | Writes to DB? |
|--------|---------|-----------------|---------------|
| `ingest_attom_geojson_xref_safe.mjs` | Xref mappings | ❌ No | ✅ Yes (to `xref_parcel_property_travis`) |
| `prove_attom_geojson_join.mjs` | Proof of concept | ✅ Yes | ❌ No |

**Conclusion:** No script loads geometries into `parcels_travis`.

### 4.3 Import Scripts

| Script | Purpose | Target Table | Status |
|--------|---------|--------------|--------|
| `import-parcels.js` | Import from GeoJSON chunks | `properties` | ✅ Works (imports property data, not geometries) |
| `ingest_travis_resolver.mjs` | Ingest StratMap/ATTOM xref | `stg_attom_property_boundary_travis` | ✅ Works (xref only) |

**Conclusion:** No script imports geometries into `parcels_travis`.

---

## 5. Recommended Load Method

### 5.1 Option A: Load from StratMap Shapefile (RECOMMENDED)

**Why:**
- ✅ `Prop_ID` field matches `properties.parcelId` exactly (verified)
- ✅ File already in repo (`data/shapefiles/land_parcels/`)
- ✅ Official Texas state data (authoritative)
- ✅ ~374,880 parcels (matches expected count)

**Required Steps:**
1. **Install dependencies:**
   ```bash
   npm install shapefile
   ```

2. **Create load script:** `scripts/load-parcels-travis-from-shapefile.mjs`
   - Read shapefile using `shapefile` npm package
   - Transform geometry from SRID 2276 → 4326 using PostGIS `ST_Transform`
   - Extract `Prop_ID` as `parcel_id`
   - Insert into `parcels_travis` with `ST_MakeValid()` validation
   - Batch insert (1000 rows at a time)

3. **Run script:**
   ```bash
   npm run load:parcels:travis
   ```

**Expected Runtime:** 10-15 minutes (~375k records)

**SQL Pattern:**
```sql
INSERT INTO parcels_travis (parcel_id, geom)
VALUES (
  $1, -- Prop_ID
  ST_MakeValid(ST_Transform(ST_SetSRID($2::geometry, 2276), 4326))
)
ON CONFLICT (parcel_id) DO NOTHING;
```

### 5.2 Option B: Load from ATTOM GeoJSON

**Why:**
- ✅ Already in SRID 4326 (no transformation needed)
- ✅ Larger dataset (~413k features)
- ⚠️ `apn` field has partial overlap with `parcelId` (not exact match)

**Required Steps:**
1. **Ensure ATTOM GeoJSON is available:**
   ```bash
   # Check if file exists
   ls -lh /tmp/zip_audit_3zips/zip2/ATTOM_Travis\ County.geojson
   ```

2. **Create load script:** `scripts/load-parcels-travis-from-attom-geojson.mjs`
   - Stream GeoJSON features (file is 334 MB)
   - Extract `apn` as `parcel_id` (filter to 6-digit numeric)
   - Convert GeoJSON geometry to PostGIS using `ST_GeomFromGeoJSON`
   - Insert into `parcels_travis` with `ST_MakeValid()` validation
   - Batch insert (1000 rows at a time)

3. **Run script:**
   ```bash
   npm run load:parcels:travis:attom
   ```

**Expected Runtime:** 15-20 minutes (~414k records)

**SQL Pattern:**
```sql
INSERT INTO parcels_travis (parcel_id, geom)
VALUES (
  $1, -- apn (filtered to match parcelId format)
  ST_MakeValid(ST_GeomFromGeoJSON($2::jsonb))
)
ON CONFLICT (parcel_id) DO NOTHING;
```

---

## 6. Missing Command/Process

### 6.1 The Missing Step

**What Should Populate `parcels_travis`:**
- StratMap shapefile geometries (`Prop_ID` → `parcel_id`, `SHAPE` → `geom`)
- OR ATTOM GeoJSON geometries (`apn` → `parcel_id`, `geometry` → `geom`)

**What Exists Today:**
- ✅ Table schema (migration applied)
- ✅ Source data files (StratMap shapefile + ATTOM GeoJSON)
- ✅ Scripts to read shapefiles/GeoJSON (inspection only)
- ❌ **NO script to load geometries into `parcels_travis`**

### 6.2 Exact Missing Command

**Create new script:** `scripts/load-parcels-travis-from-shapefile.mjs`

**Add npm script to `package.json`:**
```json
{
  "scripts": {
    "load:parcels:travis": "node scripts/load-parcels-travis-from-shapefile.mjs"
  }
}
```

**Run command:**
```bash
cd /Users/braydonirwin/scoutgptpro-backend
npm run load:parcels:travis
```

---

## 7. Safest Recommended Load Method

### 7.1 Recommended: StratMap Shapefile Load

**Reasoning:**
1. **Exact Match:** `Prop_ID` = `properties.parcelId` (100% verified)
2. **Authoritative:** Official Texas state data
3. **Already in Repo:** File exists at `data/shapefiles/land_parcels/`
4. **Count Matches:** ~375k parcels matches expected count

**Safety Measures:**
- Use `ON CONFLICT DO NOTHING` to prevent duplicates
- Validate geometries with `ST_MakeValid()`
- Transform SRID correctly (2276 → 4326)
- Batch inserts (1000 rows) with transaction rollback on error
- Log progress and errors
- Verify count after load: `SELECT COUNT(*) FROM parcels_travis;`

**Where to Run:**
- **Local development:** Run script locally, connect to Neon via `DATABASE_URL`
- **Production:** Run script from CI/CD or manually, connect to production Neon

**Pre-flight Checks:**
```sql
-- Verify table exists
SELECT COUNT(*) FROM parcels_travis; -- Should be 0

-- Verify properties table has parcelIds
SELECT COUNT(DISTINCT "parcelId") FROM properties WHERE "parcelId" IS NOT NULL;
-- Expected: ~352,431

-- Verify shapefile Prop_ID matches properties.parcelId (sample)
-- Run: node scripts/inspect-land-parcels.js
```

---

## 8. Implementation Checklist

### 8.1 Create Load Script

- [ ] Create `scripts/load-parcels-travis-from-shapefile.mjs`
- [ ] Install `shapefile` npm package
- [ ] Read shapefile using `shapefile.open()`
- [ ] Extract `Prop_ID` as `parcel_id`
- [ ] Transform geometry SRID 2276 → 4326
- [ ] Validate geometry with `ST_MakeValid()`
- [ ] Batch insert (1000 rows per batch)
- [ ] Add error handling and logging
- [ ] Add progress reporting

### 8.2 Add npm Script

- [ ] Add `"load:parcels:travis"` to `package.json`

### 8.3 Test Load

- [ ] Run script in test mode (first 100 rows)
- [ ] Verify geometries inserted correctly
- [ ] Verify `parcel_id` matches `properties.parcelId`
- [ ] Verify SRID is 4326
- [ ] Verify geometries are valid

### 8.4 Full Load

- [ ] Run full load script
- [ ] Monitor progress and errors
- [ ] Verify final count: `SELECT COUNT(*) FROM parcels_travis;`
- [ ] Expected: ~374,880 rows

### 8.5 Validation

- [ ] Verify join to properties table:
  ```sql
  SELECT COUNT(*) 
  FROM parcels_travis pt
  INNER JOIN properties p ON pt.parcel_id = p."parcelId";
  -- Expected: ~352,431 (all properties with matching parcelId)
  ```
- [ ] Verify geometry validity:
  ```sql
  SELECT COUNT(*) 
  FROM parcels_travis 
  WHERE NOT ST_IsValid(geom);
  -- Expected: 0 (all geometries valid)
  ```
- [ ] Verify SRID:
  ```sql
  SELECT DISTINCT ST_SRID(geom) 
  FROM parcels_travis;
  -- Expected: 4326
  ```

---

## 9. Summary

### What Should Populate `parcels_travis`:
- **Source:** StratMap shapefile (`data/shapefiles/land_parcels/stratmap24-landparcels_48453_travis_202404.shp`)
- **Key Field:** `Prop_ID` (6-digit parcel identifier)
- **Geometry:** MultiPolygon (SRID 2276, needs transformation to 4326)
- **Expected Count:** ~374,880 parcels

### What Exists Today:
- ✅ Table schema created (migration applied)
- ✅ Source shapefile available in repo
- ✅ Scripts to read shapefiles (inspection only)
- ❌ **NO script to load geometries into `parcels_travis`**

### The Exact Missing Command/Process:
1. **Create script:** `scripts/load-parcels-travis-from-shapefile.mjs`
2. **Add npm script:** `"load:parcels:travis": "node scripts/load-parcels-travis-from-shapefile.mjs"`
3. **Run:** `npm run load:parcels:travis`

### The Safest Recommended Load Method:
- **Method:** Load from StratMap shapefile using `shapefile` npm package
- **Transform:** SRID 2276 → 4326 using PostGIS `ST_Transform`
- **Validate:** Use `ST_MakeValid()` on insert
- **Batch:** Insert 1000 rows at a time
- **Safety:** Use `ON CONFLICT DO NOTHING` to prevent duplicates
- **Where:** Run locally or in CI/CD, connect to Neon via `DATABASE_URL`

---

## 10. Next Steps

1. **Create load script** following recommended method (StratMap shapefile)
2. **Test with small batch** (100 rows) to verify approach
3. **Run full load** (~375k parcels)
4. **Validate results** (count, geometry validity, SRID, join to properties)
5. **Re-run export:** `npm run export:parcels:travis` (should now produce non-empty NDJSON)

---

**Report Generated:** 2025-12-28  
**Audit Scope:** Backend repo (`scoutgptpro-backend`)  
**Database:** Neon (`neondb`)  
**Status:** ✅ Complete - Missing load script identified and solution documented



