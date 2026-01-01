# MTS Upload + Validation Runbook

**Date:** 2024-12-24  
**Scope:** Travis County parcels to Mapbox Tiling Service  
**Purpose:** Step-by-step guide for uploading and validating MTS tilesets

---

## Prerequisites

- Mapbox account with access token
- Mapbox username (e.g., `bradyirwin`)
- NDJSON export files from `npm run export:parcels:travis`
- Mapbox CLI installed (optional, can use Studio UI)

---

## Phase 1: Preflight Checks

### 1.1 Verify Export Files Exist

**Location:** `dist/mts/`

**Required Files:**
- `parcels_travis_v1.polygons.ndjson`
- `parcels_travis_v1.centroids.ndjson`
- `manifest.json`

**Commands:**
```bash
cd /path/to/scoutgptpro-backend
ls -lh dist/mts/
```

**Expected:** Both NDJSON files should exist and have reasonable file sizes (> 1MB each).

### 1.2 Validate NDJSON Format

**Check first 2 lines of each file:**
```bash
head -n 2 dist/mts/parcels_travis_v1.polygons.ndjson
head -n 2 dist/mts/parcels_travis_v1.centroids.ndjson
```

**Expected Format:**
```json
{"type":"Feature","geometry":{"type":"MultiPolygon","coordinates":[...]},"properties":{"parcelId":"123456","hasProperty":true,"motivationScore":42}}
{"type":"Feature","geometry":{"type":"MultiPolygon","coordinates":[...]},"properties":{"parcelId":"123457","hasProperty":false,"motivationScore":0}}
```

### 1.3 Verify Property Count

**Check property count (should match manifest):**
```bash
wc -l dist/mts/parcels_travis_v1.polygons.ndjson
wc -l dist/mts/parcels_travis_v1.centroids.ndjson
```

**Compare with manifest:**
```bash
cat dist/mts/manifest.json | jq '.counts'
```

**Expected:** Line counts should match `polygons_written` and `centroids_written` from manifest.

### 1.4 Verify Only 3 Properties Exist

**Check property keys (should only be parcelId, hasProperty, motivationScore):**
```bash
head -n 1 dist/mts/parcels_travis_v1.polygons.ndjson | jq '.properties | keys'
```

**Expected Output:**
```json
["parcelId", "hasProperty", "motivationScore"]
```

**Verify no extra properties:**
```bash
head -n 100 dist/mts/parcels_travis_v1.polygons.ndjson | jq -r '.properties | keys | sort | unique' | sort -u
```

**Expected:** Only the 3 allowed properties.

### 1.5 Verify Geometry Types

**Polygons:**
```bash
head -n 1 dist/mts/parcels_travis_v1.polygons.ndjson | jq '.geometry.type'
```

**Expected:** `"MultiPolygon"` or `"Polygon"`

**Centroids:**
```bash
head -n 1 dist/mts/parcels_travis_v1.centroids.ndjson | jq '.geometry.type'
```

**Expected:** `"Point"`

### 1.6 Verify SRID (from manifest)

```bash
cat dist/mts/manifest.json | jq '.srid'
```

**Expected:** `4326`

---

## Phase 2: Upload to Mapbox

### 2.1 Option A: Mapbox CLI (Recommended)

**Install Mapbox CLI (if not installed):**
```bash
npm install -g @mapbox/mapbox-cli-py
```

**Set access token:**
```bash
export MAPBOX_ACCESS_TOKEN=your_token_here
```

**Upload polygons:**
```bash
mapbox upload bradyirwin.parcels_travis_v1_polygons \
  dist/mts/parcels_travis_v1.polygons.ndjson \
  --tileset-name parcels_travis_v1_polygons
```

**Upload centroids:**
```bash
mapbox upload bradyirwin.parcels_travis_v1_centroids \
  dist/mts/parcels_travis_v1.centroids.ndjson \
  --tileset-name parcels_travis_v1_centroids
```

**Note:** Mapbox CLI may require different syntax. Check `mapbox upload --help` for current format.

### 2.2 Option B: Mapbox Studio UI

1. **Go to:** https://studio.mapbox.com/
2. **Navigate to:** Tilesets → New Tileset
3. **Upload:** `parcels_travis_v1.polygons.ndjson`
4. **Name:** `parcels_travis_v1_polygons`
5. **Repeat for:** `parcels_travis_v1.centroids.ndjson` → `parcels_travis_v1_centroids`

**Note:** Mapbox Studio may require GeoJSON FeatureCollection format. If so, convert NDJSON:
```bash
# Convert NDJSON to GeoJSON FeatureCollection
echo '{"type":"FeatureCollection","features":[' > polygons.geojson
cat dist/mts/parcels_travis_v1.polygons.ndjson | sed 's/$/,/' | sed '$s/,$//' >> polygons.geojson
echo ']}' >> polygons.geojson
```

### 2.3 Option C: Mapbox Tilesets API (Programmatic)

**Upload via API:**
```bash
# Step 1: Create upload
UPLOAD_RESPONSE=$(curl -X POST \
  "https://api.mapbox.com/uploads/v1/${MAPBOX_USERNAME}?access_token=${MAPBOX_ACCESS_TOKEN}" \
  -F "file=@dist/mts/parcels_travis_v1.polygons.ndjson" \
  -F "tileset=${MAPBOX_USERNAME}.parcels_travis_v1_polygons")

UPLOAD_ID=$(echo $UPLOAD_RESPONSE | jq -r '.id')

# Step 2: Poll for completion
while true; do
  STATUS=$(curl -s "https://api.mapbox.com/uploads/v1/${MAPBOX_USERNAME}/${UPLOAD_ID}?access_token=${MAPBOX_ACCESS_TOKEN}" | jq -r '.complete')
  if [ "$STATUS" = "true" ]; then
    echo "Upload complete!"
    break
  fi
  sleep 5
done
```

**Repeat for centroids file.**

---

## Phase 3: Tileset Configuration

### 3.1 Source-Layer Names

**After upload, configure source-layers:**

**Polygons tileset:**
- Source-layer name: `parcels` (default, or set during upload)

**Centroids tileset:**
- Source-layer name: `parcel_centroids` (default, or set during upload)

**Note:** Mapbox may auto-detect source-layer names. Verify in Studio → Tileset → Inspect.

### 3.2 Properties Passthrough

**Ensure only 3 properties are included:**
- `parcelId`
- `hasProperty`
- `motivationScore`

**Verification:** In Mapbox Studio → Tileset → Inspect, check a sample tile feature. Should only have these 3 properties.

### 3.3 Tileset Naming Convention

**Production:**
- `{username}.parcels_travis_v1_polygons`
- `{username}.parcels_travis_v1_centroids`

**Staging:**
- `{username}.parcels_travis_v1_staging_polygons`
- `{username}.parcels_travis_v1_staging_centroids`

**Test:**
- `{username}.parcels_travis_v1_test_polygons`
- `{username}.parcels_travis_v1_test_centroids`

---

## Phase 4: Validation

### 4.1 Inspect Sample Tile Feature

**Method 1: Mapbox Studio**
1. Go to Tileset → Inspect
2. Click on a tile
3. View feature properties
4. **Verify:** Only `parcelId`, `hasProperty`, `motivationScore` exist

**Method 2: API Query**
```bash
# Get a sample tile (zoom 16, x=12345, y=67890)
curl "https://api.mapbox.com/v4/${MAPBOX_USERNAME}.parcels_travis_v1_polygons/16/12345/67890.json?access_token=${MAPBOX_ACCESS_TOKEN}" | jq '.features[0].properties'
```

**Expected:**
```json
{
  "parcelId": "123456",
  "hasProperty": true,
  "motivationScore": 42
}
```

### 4.2 Validate Zoom Visibility

**Check tileset metadata:**
```bash
curl "https://api.mapbox.com/v4/${MAPBOX_USERNAME}.parcels_travis_v1_polygons.json?access_token=${MAPBOX_ACCESS_TOKEN}" | jq '.minzoom, .maxzoom'
```

**Expected:** 
- `minzoom`: 10 or lower (Mapbox default)
- `maxzoom`: 16 or higher

**Frontend layer config:** Uses `minzoom: 15.5` in layer definition, which overrides tileset minzoom.

### 4.3 Validate Geometry

**Check geometry type:**
```bash
curl "https://api.mapbox.com/v4/${MAPBOX_USERNAME}.parcels_travis_v1_polygons/16/12345/67890.json?access_token=${MAPBOX_ACCESS_TOKEN}" | jq '.features[0].geometry.type'
```

**Expected:** `"MultiPolygon"` for polygons, `"Point"` for centroids

**Check coordinates are valid:**
```bash
curl "https://api.mapbox.com/v4/${MAPBOX_USERNAME}.parcels_travis_v1_polygons/16/12345/67890.json?access_token=${MAPBOX_ACCESS_TOKEN}" | jq '.features[0].geometry.coordinates[0][0][0]'
```

**Expected:** `[lng, lat]` array, lng between -180 and 180, lat between -90 and 90

### 4.4 Validate parcelId Format

**Check parcelId is numeric string:**
```bash
curl "https://api.mapbox.com/v4/${MAPBOX_USERNAME}.parcels_travis_v1_polygons/16/12345/67890.json?access_token=${MAPBOX_ACCESS_TOKEN}" | jq -r '.features[0].properties.parcelId' | grep -E '^[0-9]+$'
```

**Expected:** Numeric string (e.g., `"123456"`)

---

## Phase 5: Versioning + Rollback

### 5.1 Publishing New Tileset Version

**When updating tileset:**

1. **Export new version:**
   ```bash
   npm run export:parcels:travis
   ```

2. **Upload with new version suffix:**
   - `parcels_travis_v2_polygons`
   - `parcels_travis_v2_centroids`

3. **Update frontend env var:**
   ```bash
   VITE_MTS_PARCELS_TILESET_ID=bradyirwin.parcels_travis_v2_polygons
   ```

4. **Redeploy frontend**

### 5.2 Rollback Procedure

**Option 1: Disable MTS (Immediate)**
```bash
# Set in Netlify env vars or .env
VITE_MTS_PARCELS_ENABLED=false
```

**Redeploy frontend** → Falls back to API geometry automatically.

**Option 2: Rollback to Previous Tileset**
```bash
# Set previous tileset ID
VITE_MTS_PARCELS_TILESET_ID=bradyirwin.parcels_travis_v1_polygons
```

**Redeploy frontend** → Uses previous tileset version.

**Option 3: Code Rollback**
```bash
# Revert frontend commit
git revert {commit-hash}
git push
```

**Netlify auto-deploys** → Previous code version restored.

---

## Phase 6: Production Checklist

Before enabling MTS in production:

- [ ] Export completed successfully
- [ ] Manifest validated (counts match, SRID correct)
- [ ] NDJSON files validated (only 3 properties)
- [ ] Tilesets uploaded to Mapbox
- [ ] Tileset IDs recorded
- [ ] Sample tile features validated (properties correct)
- [ ] Geometry validated (types and coordinates correct)
- [ ] Frontend env vars set in Netlify
- [ ] Frontend tested with staging tileset
- [ ] Rollback procedure tested (flag toggle works)
- [ ] Monitoring in place (error tracking)

---

## Troubleshooting

### Upload Fails

**Error:** "File too large"
- **Solution:** Split NDJSON into multiple files, upload separately, or use Mapbox Studio (handles large files better)

**Error:** "Invalid GeoJSON"
- **Solution:** Validate NDJSON format, ensure each line is valid JSON

### Tileset Not Rendering

**Check:**
1. Tileset ID is correct in frontend env var
2. Mapbox access token is valid
3. Tileset is published (not draft)
4. Source-layer names match frontend config (`parcels`, `parcel_centroids`)

### Properties Missing

**Check:**
1. Export script included all 3 properties
2. Tileset passthrough settings allow properties
3. Frontend reads from correct property keys

---

**End of Runbook**


