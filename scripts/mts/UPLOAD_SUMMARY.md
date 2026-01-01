# MTS Upload Summary - Travis Parcels
**Date:** 2025-12-28  
**Status:** ✅ Ready to Upload

---

## Validation Results

### Export Files ✅
- **Polygons:** 372,826 lines
- **Centroids:** 372,826 lines
- **Properties:** Only `parcelId`, `hasProperty`, `motivationScore` ✅
- **Manifest:** Valid, SRID 4326, correct counts

### Frontend Compatibility ✅
- Frontend expects: **Single tileset ID** with two source-layers
- Source-layer names: `parcels` and `parcel_centroids` ✅
- Uses `promoteId: 'parcelId'` ✅
- **No frontend changes needed** - already configured correctly

---

## Packaging Decision

**✅ ONE TILESET with TWO LAYERS**

- Single tileset ID: `<MAPBOX_USERNAME>.parcels_travis_v1`
- Two layers in recipe:
  - `parcels` (from polygons source)
  - `parcel_centroids` (from centroids source)
- Frontend uses single `VITE_MTS_PARCELS_TILESET_ID` env var ✅

---

## Files Created

1. **Recipe:** `scripts/mts/travis_parcels.tileset.json`
2. **Commands:** `scripts/mts/MTS_UPLOAD_COMMANDS.md`

---

## Quick Start Commands

**Replace `<MAPBOX_USERNAME>` with your Mapbox username:**

```bash
# 1. Install CLI (if needed)
pip install mapbox-tilesets

# 2. Set token
export MAPBOX_ACCESS_TOKEN="your_token_here"

# 3. Navigate to backend
cd /Users/braydonirwin/scoutgptpro-backend

# 4. Upload sources
tilesets upload-source <MAPBOX_USERNAME> parcels_travis_v1_polygons dist/mts/parcels_travis_v1.polygons.ndjson
tilesets upload-source <MAPBOX_USERNAME> parcels_travis_v1_centroids dist/mts/parcels_travis_v1.centroids.ndjson

# 5. Update recipe (replace <MAPBOX_USERNAME>)
sed -i '' 's/<MAPBOX_USERNAME>/YOUR_USERNAME/g' scripts/mts/travis_parcels.tileset.json

# 6. Create tileset
tilesets create <MAPBOX_USERNAME>.parcels_travis_v1 \
  --recipe scripts/mts/travis_parcels.tileset.json \
  --name "Travis County Parcels v1"

# 7. Publish tileset
tilesets publish <MAPBOX_USERNAME>.parcels_travis_v1

# 8. Check status (wait until complete)
tilesets status <MAPBOX_USERNAME>.parcels_travis_v1
```

---

## Frontend Environment Variables

After tileset is published, set in deployment platform:

```
VITE_MTS_PARCELS_ENABLED=true
VITE_MTS_PARCELS_TILESET_ID=mapbox://<MAPBOX_USERNAME>.parcels_travis_v1
```

**Example:**
```
VITE_MTS_PARCELS_ENABLED=true
VITE_MTS_PARCELS_TILESET_ID=mapbox://bradyirwin.parcels_travis_v1
```

---

## Verification Checklist

After upload and publish:

- [ ] Both sources uploaded successfully
- [ ] Tileset created with recipe
- [ ] Tileset published (status: `complete`)
- [ ] Tileset has 2 layers: `parcels` and `parcel_centroids`
- [ ] Properties preserved: `parcelId`, `hasProperty`, `motivationScore`
- [ ] Frontend env vars set
- [ ] Parcels render at zoom 15.5+ in map
- [ ] Hover highlight works
- [ ] Click selects parcel correctly

---

## Expected Tileset Structure

```
Tileset: <MAPBOX_USERNAME>.parcels_travis_v1
├── Layer: parcels
│   ├── Source: mapbox://tileset-source/<MAPBOX_USERNAME>/parcels_travis_v1_polygons
│   ├── Type: MultiPolygon
│   └── Properties: parcelId, hasProperty, motivationScore
└── Layer: parcel_centroids
    ├── Source: mapbox://tileset-source/<MAPBOX_USERNAME>/parcels_travis_v1_centroids
    ├── Type: Point
    └── Properties: parcelId, hasProperty, motivationScore
```

---

## Next Steps

1. Run upload commands (see `MTS_UPLOAD_COMMANDS.md` for details)
2. Wait for tileset to complete (10-30 minutes)
3. Set frontend environment variables
4. Deploy to staging
5. Test parcel rendering and selection
6. Monitor for issues

---

## Troubleshooting

See `MTS_UPLOAD_COMMANDS.md` for detailed troubleshooting guide.

**Common Issues:**
- CLI not found → `pip install mapbox-tilesets`
- Auth failed → Check `MAPBOX_ACCESS_TOKEN`
- Source not found → Wait a few minutes after upload
- Tileset stuck → Normal for large datasets, wait 15-30 min


