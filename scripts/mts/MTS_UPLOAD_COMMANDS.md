# Mapbox MTS Upload Commands - Travis Parcels
**Date:** 2025-12-28  
**Tileset:** Single tileset with two layers (parcels + parcel_centroids)  
**Frontend:** Uses single tileset ID via `VITE_MTS_PARCELS_TILESET_ID`

---

## Prerequisites

1. **Install Mapbox Tilesets CLI:**
   ```bash
   pip install mapbox-tilesets
   ```

2. **Set Mapbox Access Token:**
   ```bash
   export MAPBOX_ACCESS_TOKEN="your_mapbox_access_token_here"
   ```
   Token must have scopes: `tilesets:write`, `tilesets:read`, `tilesets:list`, `tilesets:publish`

3. **Know your Mapbox username:**
   - Find it in Mapbox account settings or dashboard URL
   - Example: `bradyirwin`

---

## Step 1: Validate Exports

```bash
cd /Users/braydonirwin/scoutgptpro-backend

# Check line counts (should be 372826 each)
wc -l dist/mts/parcels_travis_v1.polygons.ndjson
wc -l dist/mts/parcels_travis_v1.centroids.ndjson

# Verify properties (should only be: parcelId, hasProperty, motivationScore)
head -n 1 dist/mts/parcels_travis_v1.polygons.ndjson | python3 -m json.tool | grep -A 5 properties
head -n 1 dist/mts/parcels_travis_v1.centroids.ndjson | python3 -m json.tool | grep -A 5 properties

# Check manifest
cat dist/mts/manifest.json | python3 -m json.tool
```

**Expected Output:**
- Both files: `372826 lines`
- Properties: Only `parcelId`, `hasProperty`, `motivationScore`
- Manifest shows correct counts

---

## Step 2: Upload Sources

Upload each NDJSON file as a separate tileset source:

```bash
# Upload polygons source
tilesets upload-source <MAPBOX_USERNAME> parcels_travis_v1_polygons dist/mts/parcels_travis_v1.polygons.ndjson

# Upload centroids source
tilesets upload-source <MAPBOX_USERNAME> parcels_travis_v1_centroids dist/mts/parcels_travis_v1.centroids.ndjson
```

**Replace `<MAPBOX_USERNAME>` with your actual Mapbox username.**

**Expected Output:**
```
Uploading data...
Upload complete
Source ID: mapbox://tileset-source/<MAPBOX_USERNAME>/parcels_travis_v1_polygons
```

**Note:** Uploads may take 5-15 minutes depending on file size (~100-200MB each).

---

## Step 3: Update Recipe File

Edit `scripts/mts/travis_parcels.tileset.json` and replace `<MAPBOX_USERNAME>` with your actual username:

```bash
# Replace placeholder in recipe
sed -i '' 's/<MAPBOX_USERNAME>/YOUR_USERNAME/g' scripts/mts/travis_parcels.tileset.json

# Verify recipe
cat scripts/mts/travis_parcels.tileset.json | python3 -m json.tool
```

**Recipe should look like:**
```json
{
  "version": 1,
  "layers": {
    "parcels": {
      "source": "mapbox://tileset-source/YOUR_USERNAME/parcels_travis_v1_polygons",
      "minzoom": 0,
      "maxzoom": 16
    },
    "parcel_centroids": {
      "source": "mapbox://tileset-source/YOUR_USERNAME/parcels_travis_v1_centroids",
      "minzoom": 0,
      "maxzoom": 16
    }
  }
}
```

---

## Step 4: Create Tileset

Create the tileset using the recipe:

```bash
tilesets create <MAPBOX_USERNAME>.parcels_travis_v1 \
  --recipe scripts/mts/travis_parcels.tileset.json \
  --name "Travis County Parcels v1"
```

**Replace `<MAPBOX_USERNAME>` with your actual Mapbox username.**

**Expected Output:**
```
Tileset created: <MAPBOX_USERNAME>.parcels_travis_v1
```

---

## Step 5: Publish Tileset

Publish the tileset to make it available:

```bash
tilesets publish <MAPBOX_USERNAME>.parcels_travis_v1
```

**Expected Output:**
```
Publishing tileset <MAPBOX_USERNAME>.parcels_travis_v1...
Publish complete
```

**Note:** Publishing may take 10-30 minutes depending on data size.

---

## Step 6: Check Tileset Status

Monitor tileset status:

```bash
# Check tileset info
tilesets status <MAPBOX_USERNAME>.parcels_travis_v1

# List all tilesets
tilesets list <MAPBOX_USERNAME>
```

**Expected Status:**
- `complete` - Tileset is ready to use
- `processing` - Still being generated (wait and retry)
- `pending` - Queued for processing

---

## Step 7: Verify Tileset

Once status is `complete`, verify the tileset:

```bash
# Check tileset details
tilesets describe <MAPBOX_USERNAME>.parcels_travis_v1
```

**Expected Output:**
- Two layers: `parcels` and `parcel_centroids`
- Properties preserved: `parcelId`, `hasProperty`, `motivationScore`

---

## Step 8: Frontend Configuration

Set environment variable in your deployment platform (Netlify/other):

**Variable:**
```
VITE_MTS_PARCELS_ENABLED=true
VITE_MTS_PARCELS_TILESET_ID=mapbox://<MAPBOX_USERNAME>.parcels_travis_v1
```

**Replace `<MAPBOX_USERNAME>` with your actual Mapbox username.**

**Example:**
```
VITE_MTS_PARCELS_ENABLED=true
VITE_MTS_PARCELS_TILESET_ID=mapbox://bradyirwin.parcels_travis_v1
```

---

## Complete Command Sequence (Copy/Paste Ready)

Replace `<MAPBOX_USERNAME>` with your actual Mapbox username before running:

```bash
# Set token (if not already set)
export MAPBOX_ACCESS_TOKEN="your_token_here"

# Navigate to backend repo
cd /Users/braydonirwin/scoutgptpro-backend

# Validate exports
wc -l dist/mts/parcels_travis_v1.polygons.ndjson dist/mts/parcels_travis_v1.centroids.ndjson

# Upload sources
tilesets upload-source <MAPBOX_USERNAME> parcels_travis_v1_polygons dist/mts/parcels_travis_v1.polygons.ndjson
tilesets upload-source <MAPBOX_USERNAME> parcels_travis_v1_centroids dist/mts/parcels_travis_v1.centroids.ndjson

# Update recipe with your username
sed -i '' 's/<MAPBOX_USERNAME>/<MAPBOX_USERNAME>/g' scripts/mts/travis_parcels.tileset.json

# Create tileset
tilesets create <MAPBOX_USERNAME>.parcels_travis_v1 \
  --recipe scripts/mts/travis_parcels.tileset.json \
  --name "Travis County Parcels v1"

# Publish tileset
tilesets publish <MAPBOX_USERNAME>.parcels_travis_v1

# Check status (wait until complete)
tilesets status <MAPBOX_USERNAME>.parcels_travis_v1

# Verify tileset
tilesets describe <MAPBOX_USERNAME>.parcels_travis_v1
```

---

## Troubleshooting

### Issue: "tilesets: command not found"
**Solution:** Install CLI:
```bash
pip install mapbox-tilesets
```

### Issue: "Authentication failed"
**Solution:** Check token:
```bash
echo $MAPBOX_ACCESS_TOKEN
# Should show your token (starts with pk. or sk.)
```

### Issue: "Source not found" when creating tileset
**Solution:** Wait a few minutes after upload, then retry. Sources need to be processed first.

### Issue: Tileset status stuck on "processing"
**Solution:** This is normal for large datasets. Wait 15-30 minutes and check again.

### Issue: Frontend shows no parcels
**Solution:**
1. Verify tileset ID matches exactly: `mapbox://<username>.<tileset>`
2. Check zoom level (parcels appear at zoom 15.5+)
3. Verify `VITE_MTS_PARCELS_ENABLED=true`
4. Check browser console for errors

---

## Verification Checklist

After publishing, verify:

- [ ] Tileset status is `complete`
- [ ] Tileset has 2 layers: `parcels` and `parcel_centroids`
- [ ] Properties exist: `parcelId`, `hasProperty`, `motivationScore`
- [ ] Frontend env var set: `VITE_MTS_PARCELS_TILESET_ID=mapbox://<username>.parcels_travis_v1`
- [ ] Frontend env var set: `VITE_MTS_PARCELS_ENABLED=true`
- [ ] Parcels render at zoom 15.5+ in map
- [ ] Hover highlight works
- [ ] Click selects parcel and resolves property
- [ ] Chat updates as before

---

## Expected Success Output

**After publish completes:**
```
Tileset <MAPBOX_USERNAME>.parcels_travis_v1 published successfully
Status: complete
Layers: parcels, parcel_centroids
```

**In Mapbox Studio:**
- Navigate to: https://studio.mapbox.com/tilesets/
- Find tileset: `parcels_travis_v1`
- Inspect layers and properties
- View preview map

**In Frontend:**
- Parcels render at zoom 15.5+
- Hover shows blue highlight
- Click selects parcel
- Property data loads correctly

---

## Next Steps

1. Set frontend environment variables
2. Deploy to staging
3. Test parcel rendering and selection
4. Monitor for any issues
5. Roll out to production


