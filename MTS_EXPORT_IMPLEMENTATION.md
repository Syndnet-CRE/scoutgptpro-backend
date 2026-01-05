# MTS Export Implementation Summary

**Date:** 2024-12-24  
**Status:** Implementation Complete

---

## Files Created/Modified

### New Files

1. **`scripts/export-parcels-to-mts.mjs`** (NEW)
   - MTS export script
   - Exports parcels_travis to NDJSON format
   - Creates manifest.json
   - Lines: ~250

### Modified Files

1. **`package.json`** (MODIFIED)
   - Added script: `"export:parcels:travis": "node scripts/export-parcels-to-mts.mjs"`

---

## Git Diff Summary

### package.json

```diff
  "scripts": {
    "dev": "node --watch src/server.js",
    "dev:local": "dotenv -e .env.local -- node --watch src/server.js",
    "prestart": "prisma generate",
    "start": "node src/server.js",
    "start:local": "dotenv -e .env.local -- node src/server.js",
    "build": "echo 'No build needed'",
    "postinstall": "prisma generate",
    "prisma:generate": "prisma generate",
    "prisma:push": "prisma db push",
    "seed": "node scripts/seed-mapservers.js",
-   "seed:layersets": "node scripts/seed-layer-sets.js"
+   "seed:layersets": "node scripts/seed-layer-sets.js",
+   "export:parcels:travis": "node scripts/export-parcels-to-mts.mjs"
  },
```

### scripts/export-parcels-to-mts.mjs (New File)

**Key Features:**
- Uses `pg` Pool for direct PostGIS queries
- Batched export (1000 rows per batch)
- Exports polygons and centroids separately
- Creates manifest.json with metadata
- Handles hasProperty via EXISTS subquery
- Handles motivationScore via LEFT JOIN (defaults to 0 if null)

**Output Files:**
- `dist/mts/parcels_travis_v1.polygons.ndjson`
- `dist/mts/parcels_travis_v1.centroids.ndjson`
- `dist/mts/manifest.json`

---

## Database Schema Confirmed

### parcels_travis Table

**Source:** `db/migrations/0001_travis_resolver_and_parcels.sql:111-118`

```sql
CREATE TABLE IF NOT EXISTS parcels_travis (
    parcel_id TEXT PRIMARY KEY,
    geom GEOMETRY(MultiPolygon, 4326) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

**Columns Used:**
- `parcel_id` (TEXT) → exported as `parcelId` property
- `geom` (GEOMETRY(MultiPolygon, 4326)) → exported as GeoJSON geometry

### properties Table

**Source:** `prisma/schema.prisma:45-143`

**Columns Used:**
- `parcelId` (String, unique) → for JOIN and hasProperty check
- `motivationScore` (Int?) → exported as `motivationScore` property (defaults to 0 if null)

**Join Logic:**
```sql
LEFT JOIN properties p ON p."parcelId" = pt.parcel_id::text
```

**hasProperty Logic:**
```sql
EXISTS(SELECT 1 FROM properties p WHERE p."parcelId" = pt.parcel_id::text) as "hasProperty"
```

**motivationScore Logic:**
```sql
COALESCE(p."motivationScore", 0)::int as "motivationScore"
```

---

## Validation Commands

### Run Export

```bash
cd /path/to/scoutgptpro-backend
npm run export:parcels:travis
```

### Verify Output Files

```bash
# Check files exist
ls -lh dist/mts/

# Check file sizes (should be > 1MB each)
du -h dist/mts/*.ndjson
```

### Validate NDJSON Format

```bash
# First 2 lines of polygons
head -n 2 dist/mts/parcels_travis_v1.polygons.ndjson

# First 2 lines of centroids
head -n 2 dist/mts/parcels_travis_v1.centroids.ndjson
```

**Expected Format:**
```json
{"type":"Feature","geometry":{"type":"MultiPolygon","coordinates":[[[[-97.7431,30.2672],...]]]},"properties":{"parcelId":"123456","hasProperty":true,"motivationScore":42}}
{"type":"Feature","geometry":{"type":"MultiPolygon","coordinates":[[[[-97.7432,30.2673],...]]]},"properties":{"parcelId":"123457","hasProperty":false,"motivationScore":0}}
```

### Verify Only 3 Properties

```bash
# Check property keys (should only be parcelId, hasProperty, motivationScore)
head -n 1 dist/mts/parcels_travis_v1.polygons.ndjson | jq '.properties | keys'

# Verify no extra properties in first 100 features
head -n 100 dist/mts/parcels_travis_v1.polygons.ndjson | jq -r '.properties | keys | sort | unique' | sort -u
```

**Expected Output:**
```
hasProperty
motivationScore
parcelId
```

### Verify Manifest

```bash
# Show manifest
cat dist/mts/manifest.json | jq '.'

# Show counts summary
cat dist/mts/manifest.json | jq '.counts'

# Show schema
cat dist/mts/manifest.json | jq '.schema'
```

**Expected Manifest Structure:**
```json
{
  "version": {
    "timestampIso": "2024-12-24T...",
    "gitShaShort": "abc1234"
  },
  "srid": 4326,
  "bbox": [-98.0, 30.0, -97.5, 30.5],
  "counts": {
    "polygons_total": 350000,
    "centroids_total": 350000,
    "polygons_written": 350000,
    "centroids_written": 350000,
    "null_parcelId": 0,
    "invalid_geom": 0
  },
  "schema": {
    "properties": ["parcelId", "hasProperty", "motivationScore"],
    "layers": ["parcels", "parcel_centroids"]
  },
  "notes": []
}
```

### Verify Geometry Types

```bash
# Polygons should be MultiPolygon
head -n 1 dist/mts/parcels_travis_v1.polygons.ndjson | jq '.geometry.type'
# Expected: "MultiPolygon"

# Centroids should be Point
head -n 1 dist/mts/parcels_travis_v1.centroids.ndjson | jq '.geometry.type'
# Expected: "Point"
```

### Verify parcelId Format

```bash
# Check parcelId is numeric string
head -n 10 dist/mts/parcels_travis_v1.polygons.ndjson | jq -r '.properties.parcelId' | grep -E '^[0-9]+$'
# Expected: All parcelIds are numeric strings
```

---

## Sample Output (Expected)

### First Polygon Feature

```json
{
  "type": "Feature",
  "geometry": {
    "type": "MultiPolygon",
    "coordinates": [[[[-97.7431, 30.2672], [-97.7432, 30.2672], ...]]]
  },
  "properties": {
    "parcelId": "123456",
    "hasProperty": true,
    "motivationScore": 42
  }
}
```

### First Centroid Feature

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [-97.7431, 30.2672]
  },
  "properties": {
    "parcelId": "123456",
    "hasProperty": true,
    "motivationScore": 42
  }
}
```

### Manifest Summary

```json
{
  "version": {
    "timestampIso": "2024-12-24T12:00:00.000Z",
    "gitShaShort": "abc1234"
  },
  "srid": 4326,
  "bbox": [-98.1234, 30.1234, -97.5678, 30.5678],
  "counts": {
    "polygons_total": 350000,
    "centroids_total": 350000,
    "polygons_written": 350000,
    "centroids_written": 350000,
    "null_parcelId": 0,
    "invalid_geom": 0
  },
  "schema": {
    "properties": ["parcelId", "hasProperty", "motivationScore"],
    "layers": ["parcels", "parcel_centroids"]
  },
  "notes": []
}
```

---

## Next Steps

1. **Run Export:** `npm run export:parcels:travis`
2. **Validate Output:** Use validation commands above
3. **Upload to Mapbox:** Follow `MTS_UPLOAD_RUNBOOK.md`
4. **Deploy Frontend:** Follow `GO_LIVE_CHECKLIST.md`

---

**End of Implementation Summary**



