# GIS Architecture Audit Report

**Generated:** 2026-01-27  
**Scope:** Complete GIS data flow from frontend layer toggles to backend data sources

---

## Executive Summary

This audit documents the complete GIS layer architecture, identifying:
- **Frontend Layer Configuration:** Static JSON config + dynamic layer sets from database
- **Layer Sources:** Mix of ArcGIS REST services, Mapbox tilesets, and database tables
- **Data Flow:** Frontend toggle → API fetch → GeoJSON → Mapbox rendering
- **Database Tables:** 3 GIS tables with data, 5 empty tables, 6 missing tables
- **Layer Sets:** 32 active layer sets organized into 9 categories

**Key Findings:**
- ✅ Zoning districts working (22,488 rows in database)
- ⚠️ Most GIS layers rely on external ArcGIS REST services (not database)
- ❌ Several database tables exist but are empty
- ❌ Some layers referenced in code but tables don't exist

---

## PART 1: FRONTEND LAYER ARCHITECTURE

### 1.1 Layer Configuration Location

**Primary Configuration:** `src/config/mapLayers.json`

This static JSON file defines base layer groups:
- Base Maps (streets, satellite, hybrid)
- Imagery layers
- Parcels & Boundaries
- Buildings & Structures
- Zoning & Land Use
- Floodplain
- Utilities
- Wetlands
- Permits

**Dynamic Layer Sets:** Loaded from backend API `/api/mapservers/layer-sets`

The frontend dynamically loads GIS layer sets from the database, which are then added to the layer groups.

### 1.2 Layer Toggle Mechanism

**Component:** `src/components/providers/MapLayersProvider.jsx`

**Flow:**
1. User clicks checkbox in `LayersTab.jsx`
2. `setLayerVisibility(layerId, visible)` called
3. If layer is GIS layer set (`isGISLayerSet: true`) and turning ON:
   - Fetches GeoJSON from ArcGIS REST service via `fetchLayerGeoJSON()`
   - Adds features to GIS context for table display
   - Updates layer state with GeoJSON data
4. `useMapLayerRenderer` hook detects layer data and renders on map

**Key Code:**
```javascript
// MapLayersProvider.jsx lines 100-226
const setLayerVisibility = useCallback(async (layerId, visible) => {
  // If it's a GIS layer and turning ON, fetch GeoJSON
  if (visible && targetLayer?.isGISLayerSet && !targetLayer.data) {
    const layerData = await fetchLayerGeoJSON(targetLayer.originalLayerSet, bounds);
    // Add to state and render
  }
}, []);
```

### 1.3 Layer Configuration Structure

**Static Layers (mapLayers.json):**
```json
{
  "id": "zoning-current",
  "groupId": "zoning",
  "label": "Current Zoning",
  "dataSource": ["city", "county"],
  "geometryType": "polygon",
  "defaultVisible": false,
  "defaultOpacity": 0.6
}
```

**Dynamic GIS Layer Sets (from database):**
```javascript
{
  id: `gis-${layer.layerSetId}`,
  label: layer.name,
  geometryType: layer.geometryType, // Polygon, LineString, Point
  style: layer.style,
  url: layer.primaryLayerUrl, // ArcGIS REST service URL
  isGISLayerSet: true,
  originalLayerSet: layer
}
```

### 1.4 Layer Count Summary

**Static Layers (mapLayers.json):** ~50+ predefined layers  
**Dynamic Layer Sets (database):** 32 active layer sets  
**Catalog Layers (CSV):** 540 ArcGIS service layers cataloged

**Total Layers Available:** ~600+ layers (many are duplicates/alternatives)

---

## PART 2: MAPBOX CONFIGURATION AUDIT

### 2.1 Mapbox Sources

**Base Map Styles:**
- `mapbox://styles/bradyirwin/cmabvzjn0005601qu8k7f7o5w` - Streets
- `mapbox://styles/bradyirwin/cmk9y89b9001u01s9716f1zms` - Satellite

**Parcel Tilesets:**
- `mapbox://bradyirwin.parcels_travis_v1` (Travis County)
- `mapbox://bradyirwin.parcels_bastrop_v1` (Bastrop County)
- `mapbox://bradyirwin.parcels_bell_v1` (Bell County)
- Plus 9 more counties (total 12 county tilesets)

**Source Types Used:**
1. **GeoJSON Sources** - Dynamic data fetched from APIs
   - Source ID format: `source-${layerId}`
   - Added via `map.addSource(sourceId, { type: 'geojson', data: geojson })`

2. **Vector Tilesets** - Parcel boundaries from Mapbox
   - Source ID: `mts-parcels`
   - Tileset: Combined 12-county tileset

3. **Raster Sources** - Base map imagery (handled by style)

### 2.2 Layer Rendering System

**Hook:** `src/hooks/useMapLayerRenderer.js`

**Process:**
1. Monitors `state.groups` for layers with `data` property
2. For each layer with GeoJSON data:
   - Creates source: `source-${layerId}`
   - Adds layers based on geometry type:
     - **Polygon:** `{layerId}-fill` + `{layerId}-outline`
     - **LineString:** `{layerId}-line`
     - **Point:** `{layerId}-circle` or `{layerId}-symbol`
3. Updates visibility/opacity when state changes
4. Cleans up removed layers

**Code Example:**
```javascript
// Polygon rendering
if (geometryType === 'Polygon') {
  map.addLayer({
    id: `${layerId}-fill`,
    type: 'fill',
    source: sourceId,
    paint: {
      'fill-color': style['fill-color'] || '#3498db',
      'fill-opacity': opacity * 0.5
    },
    layout: { visibility: isVisible ? 'visible' : 'none' }
  });
}
```

### 2.3 Mapbox Tilesets Inventory

| Tileset ID | County | Status | Row Count |
|------------|--------|--------|-----------|
| `bradyirwin.parcels_travis_v1` | Travis | ✅ Active | 372,826 |
| `bradyirwin.parcels_bastrop_v1` | Bastrop | ✅ Active | Unknown |
| `bradyirwin.parcels_bell_v1` | Bell | ✅ Active | Unknown |
| `bradyirwin.parcels_blanco_v1` | Blanco | ✅ Active | Unknown |
| `bradyirwin.parcels_burnet_v1` | Burnet | ✅ Active | Unknown |
| `bradyirwin.parcels_caldwell_v1` | Caldwell | ✅ Active | Unknown |
| `bradyirwin.parcels_comal_v1` | Comal | ✅ Active | Unknown |
| `bradyirwin.parcels_hays_v1` | Hays | ✅ Active | Unknown |
| `bradyirwin.parcels_kendall_v1` | Kendall | ✅ Active | Unknown |
| `bradyirwin.parcels_lee_v1` | Lee | ✅ Active | Unknown |
| `bradyirwin.parcels_llano_v1` | Llano | ✅ Active | Unknown |
| `bradyirwin.parcels_williamson_v1` | Williamson | ✅ Active | Unknown |

**Note:** Only Travis County parcel count verified. Other counties have tilesets but counts unknown.

---

## PART 3: BACKEND API AUDIT

### 3.1 GIS-Related Routes

#### `/api/gis/layers` (GET)
- **Purpose:** Search for GIS layers by name
- **Query:** `?name=Zoning`
- **Returns:** Matching layer from `map_server_registry` table
- **Database Table:** `map_server_registry`

#### `/api/gis/layers` (POST)
- **Purpose:** Handle layer toggle actions
- **Body:** `{ action, layer, bbox, opacity }`
- **Returns:** Layer configuration with ArcGIS URL
- **Hardcoded Canonical Layers:**
  ```javascript
  {
    'zoning_districts': 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Zoning_1/MapServer/0',
    'fema_flood_zones': 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Environmental_2/MapServer/1',
    'sewer_mains': 'https://maps.pape-dawson.com/server1/rest/services/...',
    'water_mains': 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Water/MapServer/0',
    // ... etc
  }
  ```

#### `/api/gis/local/:layerName/geojson` (GET)
- **Purpose:** Query imported GIS layers from database
- **Valid Layers:**
  - `water_ccn` → `gis_water_ccn`
  - `sewer_ccn` → `gis_sewer_ccn`
  - `water_districts` → `gis_water_districts`
  - `floodplain_austin` → `gis_floodplain_austin`
  - `wetlands_cef` → `gis_wetlands_cef`
  - `cef_buffers` → `gis_cef_buffers`
  - `contours_austin` → `gis_contours_austin`
- **Query:** `?bbox=west,south,east,north&limit=1000`
- **Returns:** GeoJSON FeatureCollection

#### `/api/mapservers/layer-sets` (GET)
- **Purpose:** Get all active layer sets grouped by category
- **Database Table:** `layer_sets`
- **Returns:** Grouped layer sets with URLs, geometry types, styles

### 3.2 get_gis_layers Tool

**Location:** `src/tools/handlers.js` (lines 308-440)

**Supported Layers:**
- `zoning_districts` → `zoning_districts` table ✅
- `census_tracts` → `census_tracts` table ⚠️ (empty)
- `parcels_boundaries` → `parcels_travis` table ✅

**Query Methods:**
1. **By bbox:** `ST_Intersects(geom, ST_MakeEnvelope(...))`
2. **By parcel_id:** Joins with `parcels_travis` table

**Returns:** GeoJSON FeatureCollection

---

## PART 4: DATABASE AUDIT

### 4.1 GIS-Related Tables

**Tables Found:**
```sql
-- Existing with data
zoning_districts (22,488 rows)
parcels_travis (372,826 rows)

-- Existing but empty
census_tracts (0 rows)
gis_floodplain_austin (0 rows)
gis_sewer_ccn (0 rows)
gis_water_ccn (0 rows)
gis_water_districts (0 rows)
gis_wetlands_cef (0 rows)
gis_cef_buffers (0 rows)
gis_contours_austin (0 rows)

-- Missing (referenced in code)
flood_zones
utility_sewer
utility_water
building_footprints
wetlands
building_permits
```

### 4.2 Table Schemas

#### `zoning_districts`
```sql
CREATE TABLE zoning_districts (
  id INTEGER PRIMARY KEY,
  zoning_code VARCHAR(50),
  zoning_desc VARCHAR(255),
  overlay VARCHAR(50),
  geometry GEOMETRY(Polygon, 4326),
  raw_attributes JSONB,
  created_at TIMESTAMP
);
-- Row count: 22,488
-- Geometry column: geometry
```

#### `census_tracts`
```sql
CREATE TABLE census_tracts (
  geoid TEXT PRIMARY KEY,
  name TEXT,
  county_fips TEXT,
  geometry GEOMETRY(Polygon, 4326),
  population INTEGER,
  median_income INTEGER,
  median_age NUMERIC,
  metadata JSONB,
  created_at TIMESTAMPTZ
);
-- Row count: 0 (empty)
-- Geometry column: geometry
```

#### `parcels_travis`
```sql
CREATE TABLE parcels_travis (
  parcel_id VARCHAR PRIMARY KEY,
  geom GEOMETRY(Polygon, 4326),
  created_at TIMESTAMPTZ
);
-- Row count: 372,826
-- Geometry column: geom
```

### 4.3 Layer Sets Table

**Table:** `layer_sets`

**Active Layer Sets by Category:**
- Floodplain: 6 layer sets
- Zoning: 5 layer sets
- Sewer Utilities: 5 layer sets
- Buildings: 4 layer sets
- Water Utilities: 4 layer sets
- Wetlands: 3 layer sets
- Permits: 2 layer sets
- Gas Utilities: 2 layer sets
- Parcels: 1 layer set

**Total:** 32 active layer sets

**Schema:**
```sql
CREATE TABLE layer_sets (
  id TEXT PRIMARY KEY,
  layerSetId TEXT UNIQUE,
  name TEXT,
  category TEXT,
  description TEXT,
  geometryType TEXT, -- Polygon, LineString, Point
  style JSONB,
  primaryLayerUrl TEXT, -- ArcGIS REST service URL
  primaryLayerId TEXT,
  alternativeLayers JSONB,
  totalFeatureCount INTEGER DEFAULT 0,
  layerCount INTEGER DEFAULT 1,
  isActive BOOLEAN DEFAULT true,
  queryCount INTEGER DEFAULT 0,
  lastQueried TIMESTAMPTZ,
  createdAt TIMESTAMPTZ,
  updatedAt TIMESTAMPTZ
);
```

---

## PART 5: DATA FLOW ANALYSIS

### 5.1 Working Flow: Zoning Districts

**Complete Flow:**

1. **Frontend:** User toggles "Current Zoning" layer in LayersTab
2. **State Update:** `setLayerVisibility('zoning-current', true)` called
3. **Layer Detection:** System identifies it as a GIS layer set
4. **API Call:** `fetchLayerGeoJSON()` called with:
   - Layer set URL: ArcGIS REST service
   - Bounds: Current map viewport
5. **ArcGIS Query:** 
   ```
   GET {layerUrl}/query?where=1=1&outFields=*&f=geojson
        &geometryType=esriGeometryEnvelope
        &geometry={bbox}
        &inSR=4326&outSR=4326
   ```
6. **GeoJSON Response:** ArcGIS returns FeatureCollection
7. **State Update:** Layer state updated with GeoJSON data
8. **Map Rendering:** `useMapLayerRenderer` detects data:
   - Creates source: `source-zoning-current`
   - Adds layers: `zoning-current-fill` + `zoning-current-outline`
   - Sets visibility: `visible`
9. **Display:** Zoning polygons render on map

**Alternative Flow (Database):**
- If using `get_gis_layers` tool with `layer_id: 'zoning_districts'`:
  - Queries `zoning_districts` table directly
  - Returns GeoJSON from database
  - Same rendering process

### 5.2 Broken Flow: Wetlands

**What Happens:**

1. **Frontend:** User toggles "Wetlands" layer
2. **Layer Set Found:** System finds wetlands layer set from database
3. **API Call:** Fetches from ArcGIS REST service URL
4. **Possible Issues:**
   - **Option A:** ArcGIS service returns empty result (no data for area)
   - **Option B:** ArcGIS service is down/inaccessible
   - **Option C:** Database table `wetlands` doesn't exist (can't use database fallback)
5. **Result:** Layer toggles ON but no features render

**Root Cause:** Reliance on external ArcGIS services without database backup

---

## PART 6: GAP ANALYSIS

### 6.1 Layer Status Matrix

| Layer Category | Layer Name | Frontend Defined | Source Exists | Data Exists | Working |
|----------------|------------|------------------|---------------|-------------|---------|
| **Zoning** | Zoning Districts | ✅ | ✅ (DB + ArcGIS) | ✅ (22,488 rows) | ✅ |
| **Zoning** | Historic Districts | ✅ | ✅ (ArcGIS) | ❓ (External) | ❓ |
| **Floodplain** | FEMA Flood Zones | ✅ | ✅ (ArcGIS) | ❌ (DB empty) | ⚠️ |
| **Floodplain** | 100-Year Flood Zone | ✅ | ✅ (ArcGIS) | ❓ (External) | ❓ |
| **Wetlands** | Wetland Boundaries | ✅ | ✅ (ArcGIS) | ❌ (DB empty) | ⚠️ |
| **Wetlands** | CEF Wetlands | ✅ | ✅ (DB) | ❌ (0 rows) | ❌ |
| **Utilities** | Sewer Mains | ✅ | ✅ (ArcGIS) | ❌ (DB empty) | ⚠️ |
| **Utilities** | Sewer CCN | ✅ | ✅ (DB) | ❌ (0 rows) | ❌ |
| **Utilities** | Water Mains | ✅ | ✅ (ArcGIS) | ❌ (DB empty) | ⚠️ |
| **Utilities** | Water CCN | ✅ | ✅ (DB) | ❌ (0 rows) | ❌ |
| **Buildings** | Building Footprints | ✅ | ❌ (No source) | ❌ (No table) | ❌ |
| **Permits** | Building Permits | ✅ | ✅ (ArcGIS) | ❌ (No table) | ⚠️ |
| **Parcels** | Parcel Boundaries | ✅ | ✅ (Mapbox + DB) | ✅ (372,826 rows) | ✅ |
| **Census** | Census Tracts | ✅ | ✅ (DB) | ❌ (0 rows) | ❌ |

**Legend:**
- ✅ = Working/Exists
- ⚠️ = Partial (depends on external service)
- ❌ = Missing/Broken
- ❓ = Unknown status

### 6.2 Root Cause Analysis

#### Issue 1: External Dependency
**Problem:** Most GIS layers rely on external ArcGIS REST services
- **Impact:** Layers fail if service is down or returns no data
- **Solution:** Import data to database as backup

#### Issue 2: Empty Database Tables
**Problem:** Tables exist but have 0 rows:
- `gis_floodplain_austin` (0 rows)
- `gis_sewer_ccn` (0 rows)
- `gis_water_ccn` (0 rows)
- `gis_wetlands_cef` (0 rows)
- `census_tracts` (0 rows)

**Impact:** Can't use database fallback when ArcGIS fails
**Solution:** Import data to populate tables

#### Issue 3: Missing Tables
**Problem:** Code references tables that don't exist:
- `flood_zones`
- `utility_sewer`
- `utility_water`
- `building_footprints`
- `wetlands`
- `building_permits`

**Impact:** `get_gis_layers` tool can't query these layers
**Solution:** Create tables and import data

#### Issue 4: Inconsistent Naming
**Problem:** Multiple naming conventions:
- Database: `gis_floodplain_austin`
- Tool: `flood_zones`
- Frontend: `fema_flood_zones`

**Impact:** Confusion about which name to use
**Solution:** Standardize naming convention

---

## PART 7: RECOMMENDATIONS

### Option A: Database-First Approach (RECOMMENDED)

**Strategy:** Import all GIS data to database, serve via API

**Pros:**
- ✅ Reliable (no external dependencies)
- ✅ Fast queries (spatial indexes)
- ✅ Can join with parcel data
- ✅ Full control over data

**Cons:**
- ❌ Storage costs
- ❌ Maintenance (updates)
- ❌ Initial import effort

**Implementation:**
1. Create missing tables (`flood_zones`, `utility_sewer`, etc.)
2. Import data from ArcGIS services or public sources
3. Update `get_gis_layers` tool to use database
4. Keep ArcGIS as fallback for dynamic queries

**Priority Order:**
1. **HIGH:** Flood zones (FEMA NFHL)
2. **HIGH:** Census tracts (populate via Census API)
3. **MEDIUM:** Utility infrastructure (sewer/water)
4. **MEDIUM:** Building footprints
5. **LOW:** Wetlands
6. **LOW:** Building permits

### Option B: Mapbox Tilesets Approach

**Strategy:** Upload GIS data to Mapbox as vector tilesets

**Pros:**
- ✅ Fast rendering
- ✅ Handles large datasets well
- ✅ No database queries needed

**Cons:**
- ❌ Mapbox costs (tileset hosting)
- ❌ Less flexible queries
- ❌ Can't easily join with parcels

**Implementation:**
1. Export GIS data to GeoJSON
2. Upload to Mapbox Studio
3. Reference tilesets in frontend
4. Update layer configs to use tilesets

**Use Case:** Best for large, static datasets that don't need filtering

### Option C: Hybrid Approach

**Strategy:** Database for queryable data, Mapbox for visualization

**Pros:**
- ✅ Best of both worlds
- ✅ Database for analysis
- ✅ Mapbox for performance

**Cons:**
- ❌ More complex architecture
- ❌ Two systems to maintain

**Implementation:**
1. Keep database for queryable layers (zoning, flood zones)
2. Use Mapbox tilesets for large static layers (parcels)
3. Use ArcGIS REST for dynamic/rarely-used layers

### Recommended Approach: **Option A (Database-First)**

**Rationale:**
1. **Reliability:** No external service dependencies
2. **Integration:** Can join GIS data with parcels for analysis
3. **Performance:** Spatial indexes make queries fast
4. **Control:** Full control over data updates and quality
5. **Cost:** Database storage is cheaper than Mapbox tilesets

**Implementation Plan:**

#### Phase 1: Critical Layers (Week 1)
1. Import FEMA flood zones to `flood_zones` table
2. Populate `census_tracts` using Census API integration
3. Update `get_gis_layers` tool to support these layers

#### Phase 2: Utility Infrastructure (Week 2)
1. Import sewer/water infrastructure data
2. Create `utility_sewer` and `utility_water` tables
3. Update layer sets to use database

#### Phase 3: Additional Layers (Week 3-4)
1. Import building footprints
2. Import wetlands data
3. Import building permits (if available)

#### Phase 4: Optimization (Ongoing)
1. Add spatial indexes
2. Implement caching for frequently-used layers
3. Set up automated data updates

---

## APPENDIX: Code Snippets

### Frontend Layer Toggle Handler

```javascript
// src/components/providers/MapLayersProvider.jsx
const setLayerVisibility = useCallback(async (layerId, visible) => {
  const targetLayer = findLayerInGroups(layerId);
  
  if (visible && targetLayer?.isGISLayerSet && !targetLayer.data) {
    // Fetch GeoJSON from ArcGIS REST service
    const bounds = getMapBounds();
    const layerData = await fetchLayerGeoJSON(
      targetLayer.originalLayerSet, 
      bounds
    );
    
    if (layerData?.data?.features?.length > 0) {
      // Update state with GeoJSON
      setState(prev => ({
        ...prev,
        groups: updateLayerData(prev.groups, layerId, layerData.data),
        visibility: { ...prev.visibility, [layerId]: true }
      }));
    }
  }
}, []);
```

### Backend GIS Layer Query

```javascript
// src/tools/handlers.js
async function getGisLayers({ layer_id, bbox, parcel_id }) {
  const layerMap = {
    'zoning_districts': { 
      table: 'zoning_districts', 
      geomCol: 'geometry', 
      available: true 
    }
  };
  
  const query = `
    SELECT 
      *,
      ST_AsGeoJSON(${layer.geomCol})::json as geometry
    FROM ${layer.table}
    WHERE ST_Intersects(${layer.geomCol}, ST_MakeEnvelope($1, $2, $3, $4, 4326))
    LIMIT 500
  `;
  
  const result = await prisma.$queryRawUnsafe(query, ...bbox);
  return { type: 'FeatureCollection', features: result };
}
```

### Mapbox Layer Rendering

```javascript
// src/hooks/useMapLayerRenderer.js
layersWithData.forEach(layer => {
  const sourceId = `source-${layer.id}`;
  
  // Add GeoJSON source
  map.addSource(sourceId, {
    type: 'geojson',
    data: layer.data
  });
  
  // Add fill layer for polygons
  if (layer.geometryType === 'Polygon') {
    map.addLayer({
      id: `${layer.id}-fill`,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': '#3498db',
        'fill-opacity': 0.5
      }
    });
  }
});
```

---

## CONCLUSION

The GIS architecture is functional but has several gaps:

1. **Working:** Zoning districts and parcels (database-backed)
2. **Partial:** Most layers depend on external ArcGIS services
3. **Broken:** Several database tables exist but are empty
4. **Missing:** Some layers referenced in code but tables don't exist

**Recommended Next Steps:**
1. Import critical GIS data to database (flood zones, census tracts)
2. Populate empty tables with actual data
3. Create missing tables for referenced layers
4. Update `get_gis_layers` tool to support all database-backed layers
5. Keep ArcGIS REST services as fallback for dynamic queries

This will create a robust, reliable GIS layer system that doesn't depend on external services for core functionality.
