# GIS Layer Render Audit Report
**Date:** February 5, 2026  
**Issue:** Zoning Districts layer never renders on map despite toggle being ON

## Executive Summary

The issue was that the frontend was querying ArcGIS endpoints directly, bypassing the backend's local database which contains 22,488 zoning district records. The frontend `fetchLayerGeoJSON` function in `useGISLayerSets.js` always queried ArcGIS URLs, even when local data was available via `/api/gis/local/zoning_districts/geojson`.

## Root Cause Analysis

### Step 1: Frontend Toggle Flow ✅
- **File:** `src/components/providers/MapLayersProvider.jsx`
- **Status:** Working correctly
- **Finding:** `setLayerVisibility()` is called correctly when toggle is clicked
- **Evidence:** Console logs show `[GIS TOGGLE]` messages firing

### Step 2: Layer Detection ✅
- **File:** `src/components/providers/MapLayersProvider.jsx` (lines 131-138)
- **Status:** Working correctly
- **Finding:** `targetLayer` is found in `state.groups`, `isGISLayerSet` is true, `originalLayerSet` exists
- **Evidence:** Debug logs confirm layer is found

### Step 3: GeoJSON Fetch ❌ **ROOT CAUSE**
- **File:** `src/hooks/useGISLayerSets.js` (lines 44-98)
- **Status:** **BROKEN** - Fixed
- **Problem:** Function always queried ArcGIS directly using `layerSet.url`, ignoring local database
- **Impact:** 
  - ArcGIS queries may fail or return no data
  - Local database (22,488 rows) was never used
  - No fallback mechanism

### Step 4: Backend Endpoint ✅
- **File:** `src/routes/gis.js` (lines 484-612)
- **Status:** Working correctly
- **Finding:** `/api/gis/local/zoning_districts/geojson` endpoint exists and queries local database
- **Evidence:** Endpoint accepts `bbox` parameter and returns GeoJSON FeatureCollection

### Step 5: Database ✅
- **Table:** `zoning_districts`
- **Status:** Data exists (22,488 rows confirmed in previous session)
- **Finding:** Local data is available and should be used

### Step 6: Renderer ✅
- **File:** `src/hooks/useMapLayerRenderer.js` (lines 124-132)
- **Status:** Working correctly
- **Finding:** Renderer correctly checks `layer.data` to find layers with data
- **Issue:** `layersWithData=0` because data was never fetched/stored

## The Fix

### Changes Made

1. **Modified `fetchLayerGeoJSON` in `useGISLayerSets.js`:**
   - Added logic to check if layer has local data available
   - Maps layer IDs to local backend endpoints
   - Uses `/api/gis/local/zoning_districts/geojson` for zoning layers
   - Falls back to ArcGIS if local data unavailable or request fails
   - Added comprehensive debug logging

2. **Added Debug Logging:**
   - `MapLayersProvider.jsx`: Added logs to trace toggle flow
   - `useGISLayerSets.js`: Added logs for local vs ArcGIS fetch paths

### Layer ID Matching Logic

The fix handles multiple layer ID formats:
- `zoning_districts` → `zoning_districts` (local)
- `zoning-districts` → `zoning_districts` (local)
- `gis-zoning_districts` → `zoning_districts` (local)
- `gis-zoning-districts` → `zoning_districts` (local)
- Any ID containing "zoning" → `zoning_districts` (local, fuzzy match)

### Code Changes

**File:** `/Users/braydonirwin/scoutgpt_9461/src/hooks/useGISLayerSets.js`

```javascript
// Added LOCAL_LAYER_MAP to map layer IDs to local endpoints
const LOCAL_LAYER_MAP = {
  'zoning_districts': 'zoning_districts',
  'zoning-districts': 'zoning_districts',
  'gis-zoning_districts': 'zoning_districts',
  'gis-zoning-districts': 'zoning_districts'
};

// Check for local data first
if (localLayerName) {
  const queryUrl = `${API_URL}/gis/local/${localLayerName}/geojson${bbox ? `?bbox=${bbox}&limit=5000` : '?limit=5000'}`;
  // ... fetch from local endpoint
} else {
  // Fallback to ArcGIS
  // ... original ArcGIS query logic
}
```

## Testing Checklist

- [ ] Toggle "Zoning Districts" ON in Layers panel
- [ ] Verify console shows `[GIS FETCH LOCAL]` message
- [ ] Verify console shows `features=X` where X > 0
- [ ] Verify map renders zoning districts polygons
- [ ] Verify `layersWithData > 0` in renderer logs
- [ ] Test with map bounds (viewport) - should filter by bbox
- [ ] Test without map bounds - should return all data (up to limit)
- [ ] Verify fallback to ArcGIS if local endpoint fails

## Expected Behavior After Fix

1. User toggles "Zoning Districts" ON
2. Frontend detects it's a zoning layer
3. Frontend calls `/api/gis/local/zoning_districts/geojson?bbox=...&limit=5000`
4. Backend queries local `zoning_districts` table
5. Backend returns GeoJSON FeatureCollection with features
6. Frontend stores data in `layer.data`
7. Renderer detects `layer.data` exists
8. Renderer creates Mapbox source and layers
9. Zoning districts render on map

## Debug Logs to Watch

When testing, look for these console messages:

```
[GIS TOGGLE START] layerId=... visible=true
[GIS TOGGLE] targetLayer=found isGISLayerSet=true hasData=false
[GIS FETCH LOCAL] layerId=... localLayer=zoning_districts url=...
[GIS FETCH LOCAL] layerId=... status=200 features=XXX
[GIS FETCHED] key=... count=XXX geom=Polygon
[GIS RENDER] visibleKeys=X layersWithData=1
[RENDERER] layer=... visible=true hasData=true features=XXX
```

## Remaining Issues (If Any)

If layers still don't render after this fix, check:

1. **Layer ID Mismatch:** The actual `layerSetId` in database might not match expected values
   - Check database: `SELECT layerSetId, name FROM layer_sets WHERE category = 'Zoning';`
   - Update `LOCAL_LAYER_MAP` if needed

2. **Backend Endpoint:** Verify `/api/gis/local/zoning_districts/geojson` returns data
   - Test: `curl "http://localhost:3001/api/gis/local/zoning_districts/geojson?limit=10"`

3. **Database Connection:** Verify backend can connect to database
   - Check backend logs for connection errors

4. **CORS/Network:** Verify frontend can reach backend API
   - Check Network tab in browser DevTools

## Files Modified

1. `/Users/braydonirwin/scoutgpt_9461/src/hooks/useGISLayerSets.js`
   - Added local data detection and fetching logic
   - Added debug logging

2. `/Users/braydonirwin/scoutgpt_9461/src/components/providers/MapLayersProvider.jsx`
   - Added debug logging for toggle flow

## Next Steps

1. Test the fix in development environment
2. Verify zoning districts render correctly
3. Remove debug logs if not needed for production
4. Consider adding similar logic for other local layers (water_ccn, sewer_ccn, etc.)
5. Consider adding a backend endpoint to list which layers have local data available
