# Travis Parcel CRS Fix - ogr2ogr Reload
**Date:** 2025-12-28  
**Issue:** Node.js loader produces incorrect coordinates (lon ~ -134, lat ~ 17 instead of lon ~ -97, lat ~ 30)  
**Solution:** Reload using ogr2ogr which properly respects shapefile .prj file  
**Status:** ✅ Script Ready (requires ogr2ogr installation)

---

## Problem Confirmed

**Current State:**
- `parcels_travis` has 372,826 rows
- **Coordinates are WRONG:**
  - Sample centroids: lon ~ -134.87, lat ~ 17.34
  - Bbox: west=-134.92, south=17.22, east=-134.69, north=17.47
- **Expected (Travis County):**
  - Centroids: lon ~ -97.x, lat ~ 30.x
  - Bbox: west ~ -98.5, south ~ 30.0, east ~ -97.0, north ~ 31.0

**Root Cause:** Node.js `shapefile` library does not properly read/apply the shapefile `.prj` file, causing incorrect coordinate transformation.

---

## Preflight Checks

### 1. Shapefile Exists ✅
```
data/shapefiles/land_parcels/stratmap24-landparcels_48453_travis_202404.shp (124 MB)
```

### 2. PRJ File Exists ✅
```
data/shapefiles/land_parcels/stratmap24-landparcels_48453_travis_202404.prj (425 bytes)
```

**PRJ File Contents (first 10 lines):**
```
PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Mercator_Auxiliary_Sphere"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],PARAMETER["Standard_Parallel_1",0.0],PARAMETER["Auxiliary_Sphere_Type",0.0],UNIT["Meter",1.0]]
```

**Analysis:** Shapefile is in Web Mercator (EPSG:3857), needs transformation to WGS84 (EPSG:4326).

### 3. ogr2ogr Check ⚠️

**Status:** `ogr2ogr not found`

**Installation Required:**
```bash
brew install gdal
```

**After Installation, Verify:**
```bash
ogr2ogr --version
```

**Expected Output:**
```
GDAL 3.x.x, released YYYY/MM/DD
```

---

## Implementation

### Files Created

1. **`scripts/reload-parcels-travis-ogr.sh`** - Bash script for ogr2ogr reload
2. **`package.json`** - Added npm script: `"reload:parcels:travis:ogr"`

### Files Modified

1. **`scripts/load-parcels-travis.mjs`** - Added deprecation warning and `--forceNode` requirement

---

## Git Diff

### package.json
```diff
--- a/package.json
+++ b/package.json
@@ -18,7 +18,8 @@
     "seed": "node scripts/seed-mapservers.js",
     "seed:layersets": "node scripts/seed-layer-sets.js",
     "export:parcels:travis": "node scripts/export-parcels-to-mts.mjs",
-    "load:parcels:travis": "node scripts/load-parcels-travis.mjs"
+    "load:parcels:travis": "node scripts/load-parcels-travis.mjs",
+    "reload:parcels:travis:ogr": "bash scripts/reload-parcels-travis-ogr.sh"
   },
```

### scripts/load-parcels-travis.mjs
```diff
--- a/scripts/load-parcels-travis.mjs
+++ b/scripts/load-parcels-travis.mjs
@@ -1,5 +1,15 @@
 /**
- * Load Travis County Parcels from StratMap Shapefile into PostGIS
+ * ⚠️  DEPRECATED: This Node.js loader has CRS issues and produces incorrect coordinates.
+ * 
+ * Use ogr2ogr-based reload instead:
+ *   npm run reload:parcels:travis:ogr
+ * 
+ * This script will refuse to run unless --forceNode=true is passed.
+ */
+
+// ... (forceNode check added at line 86-103)
+if (!FORCE_NODE) {
+  console.error('⚠️  DEPRECATED LOADER - Use ogr2ogr reload instead');
+  process.exit(1);
+}
```

---

## Exact Command to Run

### Step 1: Install ogr2ogr (if not installed)
```bash
brew install gdal
```

### Step 2: Verify Installation
```bash
ogr2ogr --version
```

### Step 3: Run Reload
```bash
cd /Users/braydonirwin/scoutgptpro-backend
npm run reload:parcels:travis:ogr
```

**Note:** Script will prompt for confirmation before truncating `parcels_travis`.

---

## Expected Output

```
🚀 Travis Parcel Reload (ogr2ogr)
==================================

📋 Phase 1: Preflight Checks
----------------------------
✅ ogr2ogr found
GDAL 3.x.x, released YYYY/MM/DD
✅ Shapefile found
✅ PRJ file found

PRJ file contents (first 10 lines):
  PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",...

📁 Using .env
✅ DATABASE_URL loaded

📦 Phase 2: Reload Parcels
---------------------------
Connecting to: ep-rapid-wind-a4k9miff-pooler.us-east-1.aws.neon.tech:5432/neondb

Checking parcels_travis table...
✅ parcels_travis table exists

Current count: 372826

⚠️  This will TRUNCATE parcels_travis and reload from shapefile
Continue? (yes/no): yes

Truncating parcels_travis...
✅ Truncated

Importing shapefile with ogr2ogr...
This may take 5-10 minutes...
0...10...20...30...40...50...60...70...80...90...100 - done.
✅ Shapefile imported to parcels_travis_raw

Inserting into parcels_travis...
✅ Inserted into parcels_travis

Dropping staging table...
✅ Staging table dropped

✅ Phase 3: Verification
------------------------
Total parcels: 374880
✅ Count check passed

Bounding box:
  -98.123456,30.123456,-97.123456,30.987654
✅ Bbox check passed (Travis County range)

Sample centroids (first 5):
 parcel_id |    lon     |    lat
-----------+------------+----------
    105015 | -97.740123 | 30.267890
    105022 | -97.741234 | 30.268901
    105024 | -97.742345 | 30.269012
    105031 | -97.743456 | 30.270123
    105033 | -97.744567 | 30.271234

✅ Centroid check passed (Austin area)

==================================
✅ Reload Complete
==================================
Total parcels: 374880
Bbox: -98.123456,30.123456,-97.123456,30.987654

Next steps:
  1. Run export: npm run export:parcels:travis
  2. Upload to Mapbox: Follow MTS_UPLOAD_RUNBOOK.md
```

---

## Script Details

### reload-parcels-travis-ogr.sh

**What it does:**
1. **Preflight:** Checks ogr2ogr, shapefile, .prj, DATABASE_URL
2. **Truncate:** Clears `parcels_travis` (with confirmation)
3. **Import:** Uses ogr2ogr to import shapefile to staging table `parcels_travis_raw`
   - Transforms to EPSG:4326 (WGS84)
   - Preserves MultiPolygon geometry
4. **Insert:** Copies from staging to `parcels_travis` with `Prop_ID` → `parcel_id` mapping
5. **Cleanup:** Drops staging table (unless `--keepRaw` flag)
6. **Verify:** Runs validation queries and fails if coordinates are wrong

**Key ogr2ogr Options:**
- `-t_srs EPSG:4326` - Transform to WGS84
- `-nlt MULTIPOLYGON` - Ensure MultiPolygon type
- `-lco GEOMETRY_NAME=geom` - Set geometry column name
- `-overwrite` - Replace existing staging table

---

## Verification Queries (Auto-run in Script)

The script automatically runs these queries and validates results:

1. **Count Check:**
   ```sql
   SELECT COUNT(*) FROM parcels_travis;
   ```
   **Pass:** Count > 300,000

2. **Bbox Check:**
   ```sql
   SELECT 
     round(ST_XMin(e)::numeric, 6) AS west,
     round(ST_YMin(e)::numeric, 6) AS south,
     round(ST_XMax(e)::numeric, 6) AS east,
     round(ST_YMax(e)::numeric, 6) AS north
   FROM (SELECT ST_Extent(geom) AS e FROM parcels_travis) t;
   ```
   **Pass:** 
   - west between -98.5 and -97.0
   - east between -98.5 and -97.0
   - south between 29.5 and 30.5
   - north between 30.0 and 31.0

3. **Centroid Check:**
   ```sql
   SELECT 
     parcel_id,
     round(ST_X(ST_PointOnSurface(geom))::numeric, 6) as lon,
     round(ST_Y(ST_PointOnSurface(geom))::numeric, 6) as lat
   FROM parcels_travis 
   LIMIT 5;
   ```
   **Pass:** At least 3 of 5 samples have lon between -98.5 and -97.0, lat between 30.0 and 31.0

---

## Node.js Loader Deprecation

**`scripts/load-parcels-travis.mjs`** now:
- Shows deprecation warning by default
- Refuses to run unless `--forceNode=true` is passed
- Recommends using ogr2ogr reload instead

**Test:**
```bash
npm run load:parcels:travis
# Output: ⚠️ DEPRECATED LOADER - Use ogr2ogr reload instead
```

**Force (not recommended):**
```bash
npm run load:parcels:travis -- --forceNode=true
```

---

## Next Steps After Reload

1. **Verify coordinates are correct** (script does this automatically)
2. **Run export:**
   ```bash
   npm run export:parcels:travis
   ```
3. **Validate export outputs** (check bbox in manifest.json)
4. **Upload to Mapbox** (follow MTS_UPLOAD_RUNBOOK.md)

---

## Troubleshooting

### Issue: "ogr2ogr not found"
**Solution:** Install GDAL:
```bash
brew install gdal
```

### Issue: "Failed to truncate parcels_travis"
**Solution:** Check database connection and permissions. Ensure `DATABASE_URL` is correct.

### Issue: "ogr2ogr import failed"
**Solution:** 
- Check shapefile path is correct
- Verify database connection string format
- Check PostGIS extension is enabled: `CREATE EXTENSION IF NOT EXISTS postgis;`

### Issue: "Bbox check failed"
**Solution:** 
- Verify shapefile .prj is correct
- Check ogr2ogr version supports EPSG:4326 transformation
- Manually inspect staging table: `SELECT ST_Extent(geom) FROM parcels_travis_raw;`

### Issue: "Centroid check failed"
**Solution:**
- Check if shapefile actually contains Travis County data
- Verify Prop_ID field exists and has values
- Inspect sample: `SELECT Prop_ID, ST_AsText(ST_PointOnSurface(geom)) FROM parcels_travis_raw LIMIT 5;`

---

## Summary

✅ **Script Created:** `scripts/reload-parcels-travis-ogr.sh`  
✅ **NPM Script Added:** `npm run reload:parcels:travis:ogr`  
✅ **Node Loader Deprecated:** Requires `--forceNode=true` to run  
✅ **Verification Built-in:** Script validates coordinates automatically  

**Status:** Ready to run after installing ogr2ogr (`brew install gdal`)

**Expected Runtime:** 5-10 minutes for ~375k parcels


