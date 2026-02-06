# GIS Backend & Database Audit
**Date:** February 5, 2026  
**Auditor:** Cursor  

## 1. Database Tables

### GIS Tables Found
| Table | Rows | Has Geometry Column | Has Spatial Index | SRID |
|-------|------|--------------------|--------------------|------|
| census_tracts | 0 | ✅ geometry (MULTIPOLYGON) | ✅ idx_census_geom | 4326 |
| gis_cef_buffers | 0 | ✅ geometry (MULTIPOLYGON) | ✅ idx_gis_cef_buffers_geom | 4326 |
| gis_contours_austin | 0 | ✅ geometry (MULTILINESTRING) | ✅ idx_gis_contours_austin_geom | 4326 |
| gis_floodplain_austin | 0 | ✅ geometry (MULTIPOLYGON) | ✅ idx_gis_floodplain_austin_geom | 4326 |
| gis_layers | 10 | ❌ | ❌ | N/A |
| gis_sewer_ccn | 0 | ✅ geometry (MULTIPOLYGON) | ✅ idx_gis_sewer_ccn_geom | 4326 |
| gis_water_ccn | 0 | ✅ geometry (MULTIPOLYGON) | ✅ idx_gis_water_ccn_geom | 4326 |
| gis_water_districts | 0 | ✅ geometry (MULTIPOLYGON) | ✅ idx_gis_water_districts_geom | 4326 |
| gis_wetlands_cef | 0 | ✅ geometry (MULTIPOLYGON) | ✅ idx_gis_wetlands_cef_geom | 4326 |
| layer_sets | 32 | ❌ | ❌ | N/A |
| map_server_registry | 416 | ❌ | ❌ | N/A |
| opportunity_zones | 3 | ✅ geometry (MULTIPOLYGON) | ✅ idx_oz_geom | 4326 |
| osm_pois_travis | 127 | ✅ geom (POINT) | ✅ idx_osm_pois_travis_geom | 4326 |
| parcels_* (all counties) | >2M total | ✅ geom (MULTIPOLYGON) | ✅ geom spatial indexes | 4326 |
| zip_boundaries | 1,989 | ✅ geom (MULTIPOLYGON) | ✅ idx_zip_boundaries_geom | 4326 |
| zoning_districts | **22,488** | ✅ geometry (MULTIPOLYGON) | ✅ idx_zoning_districts_geom | 4326 |

### GIS Tables Expected But Missing (Data)
- ✅ census_tracts (table exists, **0 rows**)
- ✅ gis_floodplain_austin (table exists, **0 rows**)
- ✅ gis_sewer_ccn (table exists, **0 rows**)
- ✅ gis_water_ccn (table exists, **0 rows**)
- ✅ gis_water_districts (table exists, **0 rows**)
- ✅ gis_wetlands_cef (table exists, **0 rows**)
- ✅ gis_cef_buffers (table exists, **0 rows**)
- ✅ gis_contours_austin (table exists, **0 rows**)
- ❌ fire_hydrants (table doesn't exist)
- ❌ water_meters (table doesn't exist)
- ❌ gas_mains (table doesn't exist)
- ❌ traffic/AADT (table doesn't exist)
- ❌ building_permits (table doesn't exist)
- ❌ fema_flood_zones (table doesn't exist)

### Sample Data (for tables that have rows)

**zoning_districts** (22,488 rows):
```
 id | zoning_code | zoning_desc | overlay | raw_attributes | created_at
----+-------------+-------------+---------+---------------+----------
  1 | SF-1-NP     | SF          |         | {"OBJECTID": 1, "ZONING_BASE": "SF", "ZONING_ZTYPE": "SF-1-NP"} | 2026-01-02 06:12:11
  2 | SF-2-CO     | SF          |         | {"OBJECTID": 2, "ZONING_BASE": "SF", "ZONING_ZTYPE": "SF-2-CO"} | 2026-01-02 06:12:11
```

**zip_boundaries** (1,989 rows):
```
 zcta5 |   aland   | awater  |          created_at
-------+-----------+---------+-------------------------------
 78552 | 124409216 | 1018419 | 2026-01-16 05:59:22.435379+00
 76875 | 319570777 |   87748 | 2026-01-16 05:59:36.02433+00
```

**osm_pois_travis** (127 rows):
```
 id | osm_id    | name              | category     | subcategory    | latitude  | longitude  | address
----+-----------+-------------------+--------------+----------------+-----------+------------+--------
  1 | 3864110275| Public Storage    | self_storage | Public Storage | 30.416159 | -97.706559 | 12312 North MoPac
  3 | 8061343850| Extra Space Storage| self_storage | Extra Space Storage| 30.685161 | -97.718864 |
```

**map_server_registry** (416 rows):
```
id | url | category | context | datasetType | serviceName | layerId | isActive
---|-----|----------|---------|-------------|-------------|---------|----------
cmizn6akn001s1lg78jbxfb4u | https://maps.austintexas.gov/arcgis/rest/services/Shared/Environmental_1/MapServer | Water Utilities | WWValve... | | | | t
```

## 2. Backend Endpoints

### GIS Route File
- **Location:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/gis.js`
- **Endpoints defined:** 
  - `GET /api/gis/catalog` - List all available layers with metadata
  - `GET /api/gis/layers` - Get layer by name/type with fallback to registry
  - `POST /api/gis/layers` - Handle layer toggle actions
  - `GET /api/gis/layers/:layerId/features` - Query layer features (local or proxy to ArcGIS)
  - `GET /api/gis/layers/:id/query` - Legacy endpoint (backward compatibility)
  - `GET /api/gis/local/:layerName/geojson` - Query imported GIS layers
- **Layer types supported:** 
  - **LOCAL:** zoning_districts (22,488 rows)
  - **EXTERNAL ARCGIS:** fema_flood_zones, floodplain, water_mains, fire_hydrants, water_meters, sewer_mains, sewer_manholes, wetlands, building_permits, parcel_boundaries, gas_mains, buildings, transit_routes
- **Tables queried:** 
  - **Successfully:** zoning_districts (only table with data)
  - **Empty tables:** all gis_* tables (0 rows each)
  - **Fallback:** map_server_registry (416 ArcGIS endpoints)
- **Error handling:** Comprehensive with fallback to ArcGIS endpoints when local data unavailable

### Claude Tool: get_gis_layers
- **Defined in:** `/Users/braydonirwin/scoutgptpro-backend/src/tools/index.js`
- **Handler in:** `/Users/braydonirwin/scoutggtpro-backend/src/tools/handlers.js`
- **Layer types in tool definition:** 
  ```
  LOCAL DATA (per description):
  - zoning_districts: 22,488 zoning polygons for Austin/Travis County
  - parcels_boundaries: Parcel boundaries from Travis CAD
  - floodplain: Austin floodplain data (gis_floodplain_austin)
  - water_mains: Water CCN boundaries (gis_water_ccn)
  - sewer_mains: Sewer CCN boundaries (gis_sewer_ccn)
  - wetlands: CEF wetlands (gis_wetlands_cef)
  - contours: Elevation contours (gis_contours_austin)
  - cef_buffers: CEF biological buffers (gis_cef_buffers)
  - water_districts: Water/wastewater districts (gis_water_districts)
  
  NOT YET LOADED (per description):
  - fema_flood_zones: FEMA flood data (use floodplain instead)
  - building_permits: Building permits (not yet imported)
  - gas_mains: Gas infrastructure (not yet imported)
  ```
- **What it actually queries:** Only zoning_districts and parcels_travis (per handler implementation)
- **What fails:** All tables except zoning_districts return `{ error: "Layer not available" }`

### System Prompt GIS References
- **File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/chat.js`
- **GIS layers mentioned:** "GIS layers: flood zones, zoning, utilities, permits"
- **Layer instructions for Claude:** 
  ```javascript
  ## Your Capabilities
  6. Display GIS layers on the map
  
  ## Your Data Sources  
  - GIS layers: flood zones, zoning, utilities, permits
  
  const MAP_TOOLS = ['search_properties', 'intelligent_property_search', 'get_gis_layers'];
  ```

## 3. MCP Servers

### Property MCP
- **Location:** `/Users/braydonirwin/scoutgpt-mcps/property-mcp-python/`
- **Tools:** search_properties, get_property, get_enrichment, bulk_properties
- **GIS-related tools:** None (only references zoning_code field in property data)

### GIS MCP
- **Location:** **Does not exist**
- **Status:** **Not started**
- **Tools:** N/A

## 4. API Test Results

| Endpoint | Status | Response Summary |
|----------|--------|-----------------|
| **REMOTE (scoutgpt-backend.onrender.com)** | | |
| GET /health | ❌ FAILED | Backend not responding |
| GET /api/gis/layers | ❌ FAILED | Backend not responding |
| GET /api/gis/layers?type=zoning | ❌ FAILED | Backend not responding |
| GET /api/gis/layers?type=flood | ❌ FAILED | Backend not responding |
| GET /api/mcp/status | ❌ FAILED | Backend not responding |
| POST /api/chat (flood query) | ❌ FAILED | Backend not responding |
| **LOCAL (localhost:3001)** | | |
| GET /health | ✅ SUCCESS | `{"status":"ok","timestamp":"2026-02-05T21:01:05.261Z","environment":"development"}` |
| GET /api/gis/layers | ✅ SUCCESS | 89KB response with full catalog + 416 registry entries |
| GET /api/boundaries/zip | ❓ NOT TESTED | Local boundaries endpoint available |

## 5. Architecture Summary

### Current GIS Data Flow
1. **User requests GIS layer** (via Claude chat: "show me flood zones")
2. **Claude calls `get_gis_layers` tool** with layer_id parameter
3. **Tool router checks MCP availability** - routes to local handler (no GIS MCP exists)
4. **Handler checks layer availability:**
   - If `zoning_districts`: Query local DB (22,488 rows) ✅
   - If `parcels_travis`: Query local DB (372K+ rows) ✅  
   - All other layers: Return `{ error: "Layer not available" }` ❌
5. **Claude receives response** and generates user-facing message
6. **Frontend receives mapData** if successful, error message if not

### Gaps Identified
1. **No GIS data imported**: 8 GIS tables exist but all have 0 rows (gis_floodplain_austin, gis_water_ccn, gis_sewer_ccn, etc.)
2. **No GIS MCP server**: No specialized MCP for GIS operations - all routed to basic handlers
3. **Tool definition mismatch**: Tool describes 9 available layers, handler supports only 2
4. **Production backend down**: Remote Render deployment not responding to any requests
5. **Missing infrastructure tables**: No fire_hydrants, water_meters, gas_mains, building_permits, fema_flood_zones tables
6. **Registry dependency**: System falls back to 416 external ArcGIS endpoints instead of local data

### Recommendations (DO NOT IMPLEMENT)
1. **Import GIS data**: Populate the 8 empty gis_* tables with actual geometry data
2. **Build GIS MCP**: Create dedicated gis-mcp-python server with spatial query tools
3. **Fix tool definitions**: Update get_gis_layers description to match actual capabilities or fix handler to support all layers
4. **Debug production deployment**: Investigate why Render backend is unresponsive
5. **Add missing tables**: Create and populate fire_hydrants, water_meters, gas_mains, building_permits tables
6. **Optimize spatial queries**: Add bbox optimization and feature count limits to prevent timeouts
7. **Add layer health checks**: Endpoint to verify which layers have data vs empty tables
8. **Implement caching**: Cache expensive spatial queries to improve performance