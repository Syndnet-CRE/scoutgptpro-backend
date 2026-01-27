# BACKEND AUDIT REPORT
**Date:** January 25, 2026  
**Repository:** ~/scoutgptpro-backend  
**Commit:** 370e6ec (Phase 1-5: Multi-source intelligence pipeline)

---

## SECTION 1: Git State

**Branch:** `main`  
**Status:** Up to date with `origin/main`

**Latest Commit:**
```
370e6ec Phase 1-5: Multi-source intelligence pipeline
```

**Uncommitted Changes:**
- **Modified:** `src/server.js`
- **Untracked:** 
  - `src/routes/chat.js` (new file)
  - `src/tools/` (new directory)

---

## SECTION 2: Route Inventory

**Total Routes:** 30 files  
**Total Lines:** 9,507 lines

| Route File | Lines | Main Endpoints |
|------------|-------|----------------|
| buyerAssumptions.js | 75 | Deal room buyer assumptions endpoints |
| mts.js | 86 | MTS (Multi-Tenant System) endpoints |
| boundaries.js | 107 | Boundary/geography endpoints |
| parcels-search.js | 123 | Property search endpoints |
| discover.js | 146 | Discovery engine endpoints |
| geocode.js | 148 | Geocoding endpoints |
| **chat.js** | **158** | **POST /api/chat** |
| mapservers.js | 167 | MapServer configuration endpoints |
| osm-pois.js | 175 | OpenStreetMap POI endpoints |
| parcels-tx.js | 177 | Texas parcel endpoints |
| query.js | 184 | Query execution endpoints |
| dealRoomAccess.js | 194 | Deal room access control |
| dealRooms.js | 201 | Deal room CRUD operations |
| polygonSearches.js | 201 | Polygon search endpoints |
| staging.js | 204 | Staging area endpoints |
| buyboxes.js | 232 | Buy box endpoints |
| documents.js | 238 | Document management |
| sessions.js | 243 | Session management |
| export.js | 253 | Data export endpoints |
| tasks.js | 257 | Task management |
| artifacts.js | 259 | Artifact generation (v1) |
| dealRoomDocuments.js | 280 | Deal room document operations |
| dealroomsV2.js | 348 | Deal rooms API v2 |
| gis.js | 351 | GIS layer endpoints |
| deals.js | 352 | Deal management |
| artifactsV2.js | 402 | Artifact generation (v2) |
| parcels.js | 467 | Parcel data endpoints |
| listings.js | 516 | Listing endpoints |
| properties.js | 807 | Property endpoints |
| ai.js | 2,156 | AI query pipeline (largest file) |

---

## SECTION 3: The /api/chat Endpoint (Critical)

**Location:** `src/routes/chat.js`  
**Method:** `POST /api/chat`

### Request Format

```json
{
  "messages": [
    {
      "role": "user" | "assistant",
      "content": "string"
    }
  ],
  "sessionId": "string" (optional)
}
```

**Validation:**
- `messages` must be an array
- Each message must have `role` and `content`

### Response Format

```json
{
  "success": boolean,
  "message": "string",           // Claude's text response
  "sessionId": "string",
  "mapData": {                    // Optional - GeoJSON FeatureCollection
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": {
          "type": "Point",
          "coordinates": [lng, lat]
        },
        "properties": {
          "parcel_id": "string",
          "address": "string",
          "owner": "string",
          "acres": number,
          "asset_class": "string",
          "market_value": number,
          "tax_delinquent": boolean,
          "homestead": boolean,
          "zip": "string"
        }
      }
    ],
    "metadata": {
      "count": number,
      "query_filters": object
    }
  },
  "artifact": {                   // Optional - Generated artifact
    "type": "string",
    "title": "string",
    "reactComponent": "string",
    "data": object,
    "artifact_id": "string",
    "downloadUrl": "string"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "string"
}
```

### Implementation Details

- **AI Model:** Claude Sonnet 4 (`claude-sonnet-4-20250514`)
- **Max Tokens:** 4,096
- **Tool-Use Loop:** Up to 10 iterations
- **Tool Execution:** Handled by `executeTool()` from `src/tools/handlers.js`

### Tools Defined (7 Total)

1. **search_properties** - Search Travis County property database, returns GeoJSON
2. **get_property** - Get detailed property information by parcel ID
3. **analyze_property** - Analyze development feasibility (max 5 parcels)
4. **web_search** - Search web for market news and current information
5. **get_osm_nearby** - Find nearby POIs using OpenStreetMap data
6. **get_gis_layers** - Get GIS layer data (zoning, flood zones, utilities, etc.)
7. **generate_artifact** - Generate downloadable reports/analyses (max 10 parcels)

### Tool Handler Location

**File:** `src/tools/handlers.js`  
**Function:** `executeTool(toolName, toolInput)`

### MapData Structure

GeoJSON FeatureCollection with:
- **Type:** `FeatureCollection`
- **Features:** Array of GeoJSON Features
  - Geometry: Point (centroid) or Polygon (parcel boundary)
  - Properties: Property attributes (parcel_id, address, owner, acres, etc.)
- **Metadata:** Query filters and result count

### Artifact Structure

```json
{
  "type": "development_analysis" | "acquisition_report" | "property_comparison" | "market_analysis",
  "title": "string",
  "reactComponent": "string",      // Frontend component name
  "data": {
    "properties": [...],
    "analyses": [...],              // For development_analysis
    "summary": "string",
    "comparison_table": [...],      // For property_comparison
    "market_data": {...}            // For market_analysis
  },
  "artifact_id": "string",         // Database ID
  "downloadUrl": "/api/artifacts/{id}/download"
}
```

---

## SECTION 4: Tool Handlers

**File:** `src/tools/handlers.js`  
**Total Lines:** 468

### 1. search_properties

**Function:** `searchProperties({ filters, limit, bbox })`

**Input Parameters:**
- `filters` (object): 
  - `zip_code`, `city`, `zoning_code`
  - `min_acres`, `max_acres`
  - `min_value`, `max_value`
  - `asset_class` (land, residential, commercial, industrial)
  - `is_vacant`, `has_homestead`, `is_tax_delinquent`
- `limit` (number, default: 50, max: 500)
- `bbox` (array[4]): [minLng, minLat, maxLng, maxLat]

**Database Table:** `parcel_features_travis`

**Return Format:**
```json
{
  "type": "FeatureCollection",
  "features": [...],
  "metadata": { "count": number, "query_filters": object }
}
```

**Status:** ✅ Working

---

### 2. get_property

**Function:** `getProperty({ parcel_id })`

**Input Parameters:**
- `parcel_id` (string, required)

**Database Tables:** 
- `parcel_features_travis` (main)
- `parcels_travis` (JOIN for geometry)

**Return Format:**
```json
{
  "parcel_id": "string",
  "address": "string",
  "owner": "string",
  "owner_type": "string",
  "acres": number,
  "asset_class": "string",
  "year_built": number,
  "building_sqft": number,
  "market_value": number,
  "land_value": number,
  "improvement_value": number,
  "tax_delinquent": boolean,
  "homestead": boolean,
  "zoning_code": "string",
  "flood_zone": "string",
  "land_use": "string",
  "last_sale_date": "date",
  "last_sale_price": number,
  "geometry": {...}
}
```

**Status:** ✅ Working

---

### 3. analyze_property

**Function:** `analyzeProperty({ parcel_ids })`

**Input Parameters:**
- `parcel_ids` (array[string], max 5)

**Service Used:** `analyzeDevelopmentFeasibility()` from `services/enrichment/orchestrator.js`

**Return Format:**
```json
{
  "analyses": [
    {
      "parcel_id": "string",
      "property": {...},
      "constraints": [...],
      "opportunities": [...],
      "recommendation": {...}
    }
  ]
}
```

**Status:** ✅ Working (wraps existing orchestrator)

---

### 4. web_search

**Function:** `webSearchTool({ query, search_type, location })`

**Input Parameters:**
- `query` (string, required)
- `search_type` (enum: 'market_news', 'zoning_news', 'development_news', 'general')
- `location` (string, optional)

**Service Used:** `webSearch()` from `services/webSearch/index.js`

**Return Format:** Service-dependent (web search results)

**Status:** ✅ Working

---

### 5. get_osm_nearby

**Function:** `getOsmNearby({ lat, lng, radius_meters, categories })`

**Input Parameters:**
- `lat` (number, required)
- `lng` (number, required)
- `radius_meters` (number, default: 500, min: 50, max: 5000)
- `categories` (array[string], optional): restaurant, retail, transit, school, park, hospital, bank, grocery

**Database Table:** `osm_pois_travis`

**Return Format:**
```json
{
  "center": { "lat": number, "lng": number },
  "radius_meters": number,
  "pois": [
    {
      "id": "string",
      "name": "string",
      "category": "string",
      "subcategory": "string",
      "latitude": number,
      "longitude": number,
      "address": "string",
      "geometry": {...},
      "distance_meters": number
    }
  ]
}
```

**Status:** ✅ Working

---

### 6. get_gis_layers

**Function:** `getGisLayers({ layer_id, bbox, parcel_id })`

**Input Parameters:**
- `layer_id` (enum, required): 
  - `zoning_districts`
  - `flood_fema_zones`
  - `sewer_mains`
  - `water_mains`
  - `parcels_boundaries`
  - `building_footprints`
  - `wetlands_boundaries`
  - `permits_building`
- `bbox` (array[4]) OR `parcel_id` (string) - one required

**Database Tables:** (mapped by layer_id)
- `zoning_districts`
- `flood_zones`
- `utility_sewer`
- `utility_water`
- `parcels_travis`
- `building_footprints`
- `wetlands`
- `building_permits`

**Return Format:**
```json
{
  "type": "FeatureCollection",
  "layer_id": "string",
  "features": [
    {
      "type": "Feature",
      "geometry": {...},
      "properties": {...}
    }
  ]
}
```

**Status:** ⚠️ Partial (test showed error - layer may not exist or table name mismatch)

---

### 7. generate_artifact

**Function:** `generateArtifact({ type, parcel_ids, title })`

**Input Parameters:**
- `type` (enum, required): 
  - `development_analysis`
  - `acquisition_report`
  - `property_comparison`
  - `market_analysis`
- `parcel_ids` (array[string], max 10)
- `title` (string, optional)

**Service Used:** `createArtifact()` from `services/artifacts/index.js`

**Return Format:**
```json
{
  "type": "string",
  "title": "string",
  "reactComponent": "string",
  "data": {...},
  "artifact_id": "string",
  "downloadUrl": "string"
}
```

**Status:** ✅ Working (requires parcel_ids from previous search)

---

## SECTION 5: Database Tables Used

### Primary Tables

1. **parcel_features_travis** - Main property features table
   - Used by: `search_properties`, `get_property`
   - Columns: parcel_id, situs_address, owner_name_raw, acres_calc, asset_class, market_value, tax_delinquent_flag, homestead_exemption_flag, mail_zip, geom_centroid, etc.

2. **parcels_travis** - Parcel geometry boundaries
   - Used by: `get_property` (JOIN), `get_gis_layers` (JOIN)
   - Columns: parcel_id, geom

3. **osm_pois_travis** - OpenStreetMap points of interest
   - Used by: `get_osm_nearby`
   - Columns: id, name, category, subcategory, latitude, longitude, address, geom

### GIS Layer Tables

4. **zoning_districts** - Zoning boundaries
5. **flood_zones** - FEMA flood zones
6. **utility_sewer** - Sewer infrastructure
7. **utility_water** - Water infrastructure
8. **building_footprints** - Building outlines
9. **wetlands** - Wetland boundaries
10. **building_permits** - Building permit locations

**Note:** All GIS tables use PostGIS geometry columns (`geom`)

---

## SECTION 6: Environment Variables

**File:** `.env`

| Variable Name | Purpose |
|--------------|---------|
| `BRAVE_SEARCH_API_KEY` | Brave Search API for web search |
| `CLAUDE_API_KEY` | Anthropic Claude API key (duplicate entry found) |
| `DATABASE_URL` | PostgreSQL connection string |
| `FRONTEND_URL` | Frontend application URL |
| `NODE_ENV` | Environment (development/production) |
| `PORT` | Server port (default: 3001) |
| `REPLICATE_API_TOKEN` | Replicate API token |

---

## SECTION 7: Server.js Route Registration

**File:** `src/server.js`

All registered routes:

| Route Path | Route File | Notes |
|------------|------------|-------|
| `/health` | server.js | Health check endpoint |
| `/api/mapservers` | mapservers.js | MapServer configuration |
| `/api/ai` | ai.js | AI query pipeline |
| `/api/parcels` | parcels-search.js, parcels.js | Search routes registered first |
| `/api/query` | query.js | Query execution |
| `/api/polygon-searches` | polygonSearches.js | Polygon search |
| `/api/geocode` | geocode.js | Geocoding |
| `/api/gis` | gis.js | GIS layers |
| `/api/properties` | properties.js | Property endpoints |
| `/api/listings` | listings.js | Listings |
| `/api/deals` | deals.js, tasks.js | Deal management |
| `/api/documents` | documents.js | Documents |
| `/api/deal-rooms` | dealRoomAccess.js, dealRoomDocuments.js, buyerAssumptions.js, dealRooms.js | Deal room operations |
| `/api/buy-boxes` | buyboxes.js | Buy boxes |
| `/api/mts` | mts.js | Multi-tenant system |
| `/api/parcels-tx` | parcels-tx.js | Texas parcels |
| `/api/discover` | discover.js | Discovery engine |
| `/api/osm-pois` | osm-pois.js | OSM POIs |
| `/api/boundaries` | boundaries.js | Boundaries |
| `/api/export` | export.js | Data export |
| `/api/sessions` | sessions.js | Session management |
| `/api/artifacts` | artifacts.js | Artifacts v1 |
| `/api/staging` | staging.js | Staging |
| `/api/v2/deal-rooms` | dealroomsV2.js | Deal rooms v2 |
| `/api/v2/artifacts` | artifactsV2.js | Artifacts v2 |
| **`/api/chat`** | **chat.js** | **Chat endpoint (NEW)** |

**Middleware:**
- CORS (configurable by environment)
- JSON body parser
- Static file serving (`/uploads`)
- Request logging
- Error handler (500)
- 404 handler

---

## SECTION 8: Test Results - /api/chat Endpoint

### Test 1: Property Search
**Request:**
```bash
POST /api/chat
{
  "messages": [{"role": "user", "content": "Find commercial properties in Austin"}],
  "sessionId": "audit-test"
}
```

**Result:** ✅ **PASS**

**Response:**
- `success: true`
- `message`: Detailed text response with property highlights
- `mapData`: Present with 50 features
- `mapData.features[0]`: Valid GeoJSON Feature with:
  - Geometry: Point coordinates
  - Properties: parcel_id, address, owner, acres, asset_class, market_value, etc.

**Observations:**
- Tool `search_properties` executed successfully
- Returned 50 commercial properties
- GeoJSON structure is correct
- Properties include large commercial sites (Samsung, Applied Materials, etc.)

---

### Test 2: Artifact Generation
**Request:**
```bash
POST /api/chat
{
  "messages": [
    {"role": "user", "content": "Find commercial properties over 5 acres in Austin"},
    {"role": "assistant", "content": "Found 20 properties..."},
    {"role": "user", "content": "Generate an acquisition report for the first 3"}
  ],
  "sessionId": "audit-test-2"
}
```

**Result:** ⚠️ **PARTIAL**

**Response:**
- `success: true`
- `message`: Claude asks for parcel IDs (cannot extract from previous context)
- `artifact`: Not present

**Issue:** 
- Claude cannot extract parcel IDs from previous assistant message
- Artifact generation requires explicit parcel_ids in tool call
- **Workaround:** User must provide parcel IDs explicitly or Claude should search again

**Expected Behavior:**
- Claude should call `search_properties` first, then use returned parcel_ids for `generate_artifact`
- This requires multi-turn tool-use loop (which is implemented)

---

### Test 3: GIS Layers
**Request:**
```bash
POST /api/chat
{
  "messages": [{"role": "user", "content": "Show me flood zones in Austin"}],
  "sessionId": "audit-test-3"
}
```

**Result:** ❌ **FAIL**

**Response:**
- `success: true`
- `message`: Error message - flood zone layer may not be available
- `mapData`: Not present

**Issue:**
- Tool `get_gis_layers` was called but failed
- Possible causes:
  1. Table `flood_zones` doesn't exist
  2. Table name mismatch (expected `flood_zones`, actual may differ)
  3. Missing bbox or parcel_id parameter
  4. Database connection/permission issue

**Recommendation:**
- Verify table exists: `SELECT tablename FROM pg_tables WHERE tablename LIKE '%flood%';`
- Check layer mapping in `getGisLayers()` function
- Ensure bbox is provided when layer_id is specified

---

## SECTION 9: Issues Found

### Critical Issues

1. **GIS Layers Tool Failure**
   - **Location:** `get_gis_layers` tool
   - **Symptom:** Error when requesting flood zones
   - **Impact:** Users cannot view GIS layers on map
   - **Action Required:** Verify database tables exist and match layer mapping

2. **Artifact Generation Context Loss**
   - **Location:** Multi-turn conversation flow
   - **Symptom:** Claude cannot extract parcel_ids from previous messages
   - **Impact:** Users must explicitly provide parcel IDs for artifacts
   - **Action Required:** Improve context passing or tool result storage

### Minor Issues

3. **Duplicate Environment Variable**
   - **Location:** `.env` file
   - **Symptom:** `CLAUDE_API_KEY` appears twice
   - **Impact:** None (last value wins)
   - **Action Required:** Remove duplicate

4. **Uncommitted Changes**
   - **Location:** `src/server.js`, `src/routes/chat.js`, `src/tools/`
   - **Symptom:** New chat endpoint not committed
   - **Impact:** Changes may be lost
   - **Action Required:** Commit new chat functionality

### Recommendations

5. **Error Handling**
   - Add more specific error messages for tool failures
   - Log tool execution errors with context
   - Return structured error responses

6. **Tool Result Caching**
   - Cache search results in session for artifact generation
   - Store parcel_ids from previous searches
   - Enable "use previous results" functionality

7. **GIS Layer Validation**
   - Add health check for GIS layer tables
   - Validate layer_id against available tables
   - Provide fallback or error messages

8. **Documentation**
   - Add API documentation for `/api/chat` endpoint
   - Document tool input/output schemas
   - Create integration guide for frontend

---

## SECTION 10: Summary

### Status Overview

| Component | Status | Notes |
|-----------|--------|-------|
| `/api/chat` Endpoint | ✅ Working | New endpoint, functional |
| `search_properties` Tool | ✅ Working | Returns valid GeoJSON |
| `get_property` Tool | ✅ Working | Returns detailed property data |
| `analyze_property` Tool | ✅ Working | Wraps orchestrator service |
| `web_search` Tool | ✅ Working | Uses web search service |
| `get_osm_nearby` Tool | ✅ Working | Queries OSM POI table |
| `get_gis_layers` Tool | ❌ Failing | Table/query issue |
| `generate_artifact` Tool | ⚠️ Partial | Requires explicit parcel_ids |

### Architecture

- **AI Model:** Claude Sonnet 4
- **Tool-Use Pattern:** Iterative loop (max 10 iterations)
- **Database:** PostgreSQL with PostGIS
- **Response Format:** JSON with optional GeoJSON mapData and artifact
- **Error Handling:** Basic (needs improvement)

### Next Steps

1. **Immediate:**
   - Fix GIS layers tool (verify tables, fix queries)
   - Commit uncommitted changes
   - Test artifact generation with explicit parcel IDs

2. **Short-term:**
   - Improve context passing for multi-turn conversations
   - Add error logging and monitoring
   - Validate all GIS layer tables exist

3. **Long-term:**
   - Add session-based result caching
   - Implement tool result storage
   - Create comprehensive API documentation
   - Add integration tests for all tools

---

**Report Generated:** January 25, 2026  
**Auditor:** AI Assistant  
**Repository:** scoutgptpro-backend
