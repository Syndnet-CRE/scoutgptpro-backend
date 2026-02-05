# GIS Layers Working State Analysis

## Last Known Working State

Based on git history analysis, GIS layers were last working around **December 22, 2025**.

### Key Commits

1. **Commit: `d0c5050`** (2025-12-22)
   - **Message:** "Fix GIS zoning layer render on toggle"
   - **Files Changed:**
     - `src/components/providers/MapLayersProvider.jsx` (+39 lines)
     - `src/hooks/useMapLayerRenderer.js` (+48 lines)
   - **Status:** This commit fixed GIS zoning layer rendering

2. **Commit: `e276e3e`** (Earlier)
   - **Message:** "feat: Wire LayersTab to working GIS data sources"
   - **Key Finding:** This commit shows a `LAYER_ID_MAP` that mapped UI layer keys to GIS layer IDs:
     ```javascript
     const LAYER_ID_MAP = {
       // Zoning - from local database (22,488 polygons)
       zoning: 'gis-zoning_districts',
       zoningHistoric: 'gis-zoning_historic',
       // Environmental - from ArcGIS map_server_registry
       floodZones: 'gis-flood_fema_zones',
       wetlands: 'gis-wetlands_types',
       // ... more mappings
     };
     ```

### How It Worked (December 2025)

**Data Flow:**
1. User toggles layer in LayersTab
2. `setLayerVisibility(layerId, true)` called
3. System finds GIS layer set from backend (`/api/mapservers/layer-sets`)
4. `fetchLayerGeoJSON()` queries **ArcGIS REST service directly** using `layerSet.url`
5. ArcGIS returns GeoJSON FeatureCollection
6. Data stored in `layer.data`
7. `useMapLayerRenderer` detects data and creates Mapbox source/layers
8. Features render on map

**Key Code Pattern (from commit d0c5050):**
```javascript
// useGISLayerSets.js - fetchLayerGeoJSON
const url = layerSet.url; // ArcGIS REST service URL
const queryUrl = `${url}/query?where=...&f=geojson&geometryType=esriGeometryEnvelope&geometry=${bbox}...`;
const response = await fetch(queryUrl);
const geojson = await response.json();
return { ...layerSet, data: geojson };
```

### What Changed Since Then

**Current Issue (February 2026):**
- Frontend still queries ArcGIS directly
- **Problem:** ArcGIS queries may fail or return no data
- **Solution Needed:** Use local database (`zoning_districts` table with 22,488 rows) instead

**Recent Changes:**
- December 22, 2025: Fixed GIS zoning layer render on toggle
- December 22, 2025: Fixed GIS overlay rendering for all layer toggles
- December 22, 2025: Added targeted logging for sewer layer debugging
- January 2-3, 2026: Multiple flood layer fixes (MTS vs GeoJSON conflicts)

### Why It Stopped Working

**Root Cause:**
The system was designed to query ArcGIS REST services directly. When those services:
1. Return empty results for certain areas
2. Are slow or timeout
3. Are inaccessible
4. Have CORS issues

...the layers fail to render, even though local database has the data.

**Evidence:**
- GIS_ARCHITECTURE_AUDIT.md (Jan 27, 2026) states: "✅ Zoning districts working (22,488 rows in database)"
- But this refers to **database having data**, not frontend successfully rendering it
- Current audit shows: `layersWithData=0` - meaning data is never fetched/stored

### The Fix Applied (February 5, 2026)

**Change:** Modified `fetchLayerGeoJSON` to:
1. Check if layer has local data available
2. Use `/api/gis/local/zoning_districts/geojson` for local layers
3. Fallback to ArcGIS if local unavailable

**Files Modified:**
- `src/hooks/useGISLayerSets.js` - Added local data detection
- `src/components/providers/MapLayersProvider.jsx` - Added debug logging

### Restoring Previous Working State

If you need to see exactly how it worked in December 2025:

```bash
# Checkout the working commit
cd /Users/braydonirwin/scoutgpt_9461
git show d0c5050:src/hooks/useGISLayerSets.js > ~/Downloads/useGISLayerSets_working.js
git show d0c5050:src/components/providers/MapLayersProvider.jsx > ~/Downloads/MapLayersProvider_working.jsx
git show d0c5050:src/hooks/useMapLayerRenderer.js > ~/Downloads/useMapLayerRenderer_working.js
```

### Key Differences: Working vs Current

| Aspect | Working (Dec 2025) | Current (Feb 2026) | Fix Applied |
|--------|-------------------|-------------------|-------------|
| Data Source | ArcGIS REST only | ArcGIS REST only | **Local DB first, ArcGIS fallback** |
| Query Method | Direct ArcGIS query | Direct ArcGIS query | **Backend API endpoint** |
| Local Data | Ignored | Ignored | **Now used** |
| Error Handling | Basic | Basic | **Improved with fallback** |

### Conclusion

**Working State:** December 22, 2025 - GIS layers rendered successfully by querying ArcGIS REST services directly.

**Current State:** February 5, 2026 - Same approach, but ArcGIS queries failing. Local database (22,488 zoning records) exists but was never used.

**Fix:** Modified to use local database first, with ArcGIS as fallback. This should restore functionality while being more reliable.
