# ScoutGPT Backend Audit Report — February 4, 2026

**Audit Date:** February 4, 2026  
**Scope:** Read-only audit of ScoutGPT backend codebase  
**Status:** ✅ Complete — No source files modified

---

## SECTION 1: FILE INVENTORY

### src/tools/
| Filename | Lines | Last Modified | First 3 Lines |
|----------|-------|---------------|---------------|
| `index.js` | 321 | 2026-02-04 17:04:37 | `// src/tools/index.js`<br>`// Tool definitions for Claude Anthropic API`<br>`import { executeTool } from './handlers.js';` |
| `handlers.js` | 652 | 2026-02-04 17:04:37 | `// src/tools/handlers.js`<br>`// Tool execution handlers - wraps existing services`<br>`import { PrismaClient } from '@prisma/client';` |

### src/routes/
| Filename | Lines | Last Modified | First 3 Lines |
|----------|-------|---------------|---------------|
| `chat.js` | 347 | 2026-02-04 17:04:37 | `// src/routes/chat.js`<br>`// Chat endpoint with Claude tool-use loop and write-back integration`<br>`import express from 'express';` |
| `mcp.js` | 52 | 2026-02-04 17:04:37 | `/**`<br>` * MCP Status and Management Routes`<br>` */` |

### src/services/mcp/
| Filename | Lines | Last Modified | First 3 Lines |
|----------|-------|---------------|---------------|
| `server-manager.js` | 260 | 2026-02-04 17:04:37 | `/**`<br>` * MCP Server Manager`<br>` * Manages MCP server lifecycle and communication` |
| `tool-router.js` | 105 | 2026-02-04 17:04:37 | `/**`<br>` * MCP Tool Router`<br>` * Routes tool calls to MCP servers or fallback handlers` |

### src/services/claude-writeback/
| Filename | Lines | Last Modified | First 3 Lines |
|----------|-------|---------------|---------------|
| `index.js` | 241 | 2026-02-04 17:04:37 | `/**`<br>` * Claude Write-Back Service`<br>` * Handles persistence of Claude conversations, enrichments, and training data` |
| `enrichment-extractor.js` | 116 | 2026-02-04 17:04:37 | `/**`<br>` * Enrichment Extractor`<br>` * Extracts valuable insights from tool results for storage` |

### src/db/
| Filename | Lines | Last Modified | First 3 Lines |
|----------|-------|---------------|---------------|
| `pool.js` | 16 | 2026-01-23 00:47:03 | `import pg from 'pg';`<br>`const { Pool } = pg;`<br>`const pool = new Pool({` |

### src/utils/
| Filename | Lines | Last Modified | First 3 Lines |
|----------|-------|---------------|---------------|
| `apiResponse.js` | 22 | 2026-01-23 00:47:03 | `export function successResponse(data) {`<br>`  return {`<br>`    success: true,` |
| `filterAssertions.js` | 198 | 2026-01-23 00:47:03 | `/**`<br>` * Filter Assertions`<br>` *` |
| `normalizeProperty.js` | 49 | 2026-02-04 17:04:37 | `/**`<br>` * Normalizes database field names to frontend-expected names`<br>` * Single source of truth for field mapping` |
| `polygonSearchNames.js` | 53 | 2026-01-23 00:47:03 | `/**`<br>` * Generate a name for a polygon search based on location and area`<br>` * @param {string} locationName` |

**Total Lines:** 2,432 across all audited files

---

## SECTION 2: TOOL DEFINITIONS

**File:** `src/tools/index.js`

### Tool 1: `intelligent_property_search`
- **Description:** Search properties with intelligent query understanding and enriched results. Handles natural language location, relative size terms, property types, investment criteria. Returns enriched GeoJSON.
- **Input Schema:**
  - `query` (string, required): Natural language description
  - `filters` (object, optional):
    - `asset_class` (enum: 'residential', 'commercial', 'industrial', 'land', 'agricultural')
    - `min_acres` (number)
    - `max_acres` (number)
    - `min_value` (number)
    - `max_value` (number)
    - `zoning_code` (string)
    - `owner_type` (enum: 'individual', 'llc', 'corporation', 'trust', 'government')
    - `tax_delinquent` (boolean)
    - `exclude_flood_zone` (boolean)
    - `zip_code` (string)
    - `city` (string)
  - `location` (object, optional):
    - `reference` (string): Location description
    - `distance_meters` (number, default: 5000)
    - `bbox` (array[4 numbers]): [minLng, minLat, maxLng, maxLat]
  - `sort_by` (enum: 'value_per_acre', 'market_value', 'acres_calc', 'year_built')
  - `limit` (number, default: 25, max: 100)

### Tool 2: `search_properties`
- **Description:** Search Travis County property database. Returns GeoJSON for map display.
- **Input Schema:**
  - `filters` (object, optional):
    - `zip_code` (string|number)
    - `city` (string)
    - `min_acres` (number)
    - `max_acres` (number)
    - `min_value` (number)
    - `max_value` (number)
    - `asset_class` (enum: 'land', 'residential', 'commercial', 'industrial')
    - `zoning_code` (string)
    - `is_vacant` (boolean)
    - `has_homestead` (boolean)
    - `is_tax_delinquent` (boolean)
  - `bbox` (array[4 numbers])
  - `limit` (number, default: 50)

### Tool 3: `get_property`
- **Description:** Get detailed information about a specific property by parcel ID.
- **Input Schema:**
  - `parcel_id` (string, required)

### Tool 4: `analyze_property`
- **Description:** Analyze development feasibility for one or more properties. Returns constraints, opportunities, and recommendations.
- **Input Schema:**
  - `parcel_ids` (array[string], required, min: 1, max: 5)

### Tool 5: `web_search`
- **Description:** Search the web for market news, current information, or recent activity related to real estate, properties, or locations.
- **Input Schema:**
  - `query` (string, required)
  - `search_type` (enum: 'market_news', 'zoning_news', 'development_news', 'general')
  - `location` (string, optional)

### Tool 6: `get_osm_nearby`
- **Description:** Find nearby points of interest (POIs) like restaurants, retail, transit, schools, parks, hospitals, banks, grocery stores using OpenStreetMap data.
- **Input Schema:**
  - `lat` (number, required)
  - `lng` (number, required)
  - `radius_meters` (number, default: 500, min: 50, max: 5000)
  - `categories` (array[enum], optional): 'restaurant', 'retail', 'transit', 'school', 'park', 'hospital', 'bank', 'grocery'

### Tool 7: `get_gis_layers`
- **Description:** Get GIS layer data for a bounding box or specific parcel. Returns GeoJSON FeatureCollection for local layers, or ArcGIS endpoint URL for external layers.
- **Input Schema:**
  - `layer_id` (enum, required): 'zoning_districts', 'parcels_boundaries', 'fema_flood_zones', 'floodplain', 'water_mains', 'sewer_mains', 'wetlands', 'building_permits', 'gas_mains'
  - `bbox` (array[4 numbers], optional)
  - `parcel_id` (string, optional)

### Tool 8: `generate_artifact`
- **Description:** Generate a downloadable artifact (report, analysis, comparison) for properties. Creates professional reports that users can view and download.
- **Input Schema:**
  - `type` (enum, required): 'development_analysis', 'acquisition_report', 'property_comparison', 'market_analysis'
  - `parcel_ids` (array[string], required, min: 1, max: 10)
  - `title` (string, optional)

### Tool 9: `get_census_data`
- **Description:** Get demographic data from the US Census Bureau for a location. Returns population, median income, median age, housing statistics, vacancy rates, and rent data for the census tract containing the given coordinates.
- **Input Schema:**
  - `latitude` (number, required)
  - `longitude` (number, required)

**Total Tools:** 9 tools defined

**Note:** `intelligent_property_search` is documented as preferred over `search_properties` in tool description.

---

## SECTION 3: TOOL HANDLERS

**File:** `src/tools/handlers.js`

### Handler 1: `searchProperties`
- **Function Name:** `searchProperties`
- **Database Table(s):** `parcel_features_travis`
- **Columns Referenced:**
  - `parcel_id`
  - `situs_address`
  - `owner_name_raw`
  - `acres_calc`
  - `asset_class`
  - `market_value`
  - `tax_delinquent_flag`
  - `homestead_exemption_flag`
  - `mail_zip`
  - `geom_centroid` (via ST_AsGeoJSON)
- **Returns:** GeoJSON FeatureCollection with properties: `parcel_id`, `address`, `owner`, `acres`, `asset_class`, `market_value`, `tax_delinquent`, `homestead`, `zip`
- **Error Handling:** ❌ No try/catch — errors propagate
- **Utility Functions:** None

### Handler 2: `getProperty`
- **Function Name:** `getProperty`
- **Database Table(s):** `parcel_features_travis`, `parcels_travis` (LEFT JOIN)
- **Columns Referenced:**
  - `pf.*` (all columns from parcel_features_travis)
  - `ST_Y(pf.geom_centroid)` as `latitude`
  - `ST_X(pf.geom_centroid)` as `longitude`
  - `ST_AsGeoJSON(pf.geom_centroid)` as `centroid_geom`
  - `ST_AsGeoJSON(pt.geom)` as `parcel_geom`
- **Returns:** Object with: `parcel_id`, `address`, `owner`, `owner_type`, `acres`, `asset_class`, `year_built`, `building_sqft`, `market_value`, `land_value`, `improvement_value`, `tax_delinquent`, `homestead`, `zoning_code`, `flood_zone`, `land_use`, `last_sale_date`, `last_sale_price`, `latitude`, `longitude`, `geometry`
- **Error Handling:** ❌ No try/catch — errors propagate
- **Utility Functions:** None

### Handler 3: `analyzeProperty`
- **Function Name:** `analyzeProperty`
- **Database Table(s):** Indirect — calls `analyzeDevelopmentFeasibility` service
- **Columns Referenced:** Unknown (delegates to orchestrator service)
- **Returns:** `{ analyses: [...] }` array with analysis objects
- **Error Handling:** ✅ Yes — try/catch per parcel, continues on error
- **Utility Functions:** `analyzeDevelopmentFeasibility` from `../services/enrichment/orchestrator.js`

### Handler 4: `webSearchTool`
- **Function Name:** `webSearchTool`
- **Database Table(s):** None — external API call
- **Columns Referenced:** None
- **Returns:** Results from `webSearch` service or `{ error, query }` on failure
- **Error Handling:** ✅ Yes — try/catch returns error object
- **Utility Functions:** `webSearch` from `../services/webSearch/index.js`

### Handler 5: `getOsmNearby`
- **Function Name:** `getOsmNearby`
- **Database Table(s):** `osm_pois_travis`
- **Columns Referenced:**
  - `id`
  - `name`
  - `category`
  - `subcategory`
  - `latitude`
  - `longitude`
  - `address`
  - `geom` (via ST_AsGeoJSON)
  - `ST_Distance(...)` as `distance_meters`
- **Returns:** `{ center: {lat, lng}, radius_meters, pois: [...] }`
- **Error Handling:** ❌ No try/catch — errors propagate
- **Utility Functions:** None

### Handler 6: `getGisLayers`
- **Function Name:** `getGisLayers`
- **Database Table(s):** 
  - `zoning_districts` (local)
  - `parcels_travis` (local)
  - External ArcGIS layers (returns URL)
- **Columns Referenced:**
  - For `zoning_districts`: `*`, `geometry` (via ST_AsGeoJSON)
  - For `parcels_travis`: `*`, `geom` (via ST_AsGeoJSON)
- **Returns:** 
  - Local: `{ type: 'FeatureCollection', layer_id, source: 'local', features: [...] }`
  - External: `{ layer_id, source: 'arcgis', arcgisUrl: '...', queryHint: '...' }`
- **Error Handling:** ✅ Yes — try/catch with fallback to ArcGIS URLs
- **Utility Functions:** None

### Handler 7: `generateArtifact`
- **Function Name:** `generateArtifact`
- **Database Table(s):** Indirect — calls `getProperty` handler
- **Columns Referenced:** Via `getProperty` handler
- **Returns:** `{ type, title, reactComponent, data, artifact_id, downloadUrl }`
- **Error Handling:** ✅ Yes — try/catch around artifact creation, continues on error
- **Utility Functions:** 
  - `getProperty` (internal)
  - `analyzeProperty` (internal)
  - `webSearchTool` (internal)
  - `createArtifact` from `../services/artifacts/index.js`

### Handler 8: `handleIntelligentSearch`
- **Function Name:** `handleIntelligentSearch`
- **Database Table(s):** Indirect — calls `intelligentPropertySearch` service
- **Columns Referenced:** Unknown (delegates to query orchestrator)
- **Returns:** GeoJSON FeatureCollection or error FeatureCollection
- **Error Handling:** ✅ Yes — try/catch returns error FeatureCollection
- **Utility Functions:** `intelligentPropertySearch` from `../services/query-orchestrator/index.js`

### Handler 9: `getCensusData`
- **Function Name:** `getCensusData`
- **Database Table(s):** None — external API call
- **Columns Referenced:** None
- **Returns:** Results from `getDemographicsForLocation` service or `{ error }` on failure
- **Error Handling:** ✅ Yes — try/catch returns error object
- **Utility Functions:** `getDemographicsForLocation` from `../services/census/index.js`

---

## SECTION 4: DATABASE COLUMN VERIFICATION

⚠️ **NOTE:** Cannot execute SQL queries without database credentials. Analysis based on code inspection and Prisma schema.

### Expected Columns in `parcel_features_travis` (from Prisma schema):
- `parcel_id` (String, PK)
- `county_fips` (String, default: "48453")
- `situs_address` (String?)
- `mailing_address` (String?)
- `mail_city` (String?)
- `mail_state` (String?)
- `mail_zip` (String?)
- `owner_name_raw` (String?)
- `owner_name_norm` (String?)
- `owner_entity_type` (String?)
- `owner_portfolio_count_travis` (Int?)
- `owner_segment` (String?)
- `acres_calc` (Decimal)
- `acres_calc_source` (String, default: "enrichment.acreage")
- `acres_calc_confidence` (Decimal?)
- `asset_class` (String?)
- `asset_class_confidence` (Decimal?)
- `year_built` (Int?)
- `building_sqft` (Decimal?)
- `market_value` (Decimal?)
- `assessed_total_value` (Decimal?)
- `land_value` (Decimal?)
- `improvement_value` (Decimal?)
- `tax_delinquent_flag` (Boolean?)
- `homestead_exemption_flag` (Boolean?)
- `last_sale_date` (DateTime?)
- `last_sale_price` (Decimal?)
- `zoning_code` (String?)
- `flood_zone` (String?)
- `land_use_code` (String?)
- `land_use_desc` (String?)
- `geom_centroid` (geometry?)
- `created_at` (DateTime)
- `updated_at` (DateTime)

### Expected Columns in `parcels_travis` (from Prisma schema):
- `parcel_id` (String, PK)
- `geom` (geometry)
- `created_at` (DateTime)

### Expected Columns in `parcels_travis_enrichment` (from Prisma schema):
- `parcel_id` (String, PK)
- `owner_name` (String?)
- `owner2` (String?)
- `mail_address1` (String?)
- `mail_address2` (String?)
- `mail_city` (String?)
- `mail_state` (String?)
- `mail_zip` (String?)
- `situs_address` (String?)
- `land_use` (String?)
- `land_use_desc` (String?)
- `legal_desc` (String?)
- `year_built` (Int?)
- `acres` (Decimal?)
- `land_value` (Decimal?)
- `improvement_value` (Decimal?)
- `market_value` (Decimal?)
- `assessed_value` (Decimal?)
- `last_update` (DateTime?)
- `source_layer` (String?)
- `raw` (Json?)
- `updated_at` (DateTime)
- `ingested_at` (DateTime?)
- `owner_type` (String?)
- `mailing_address` (String?)
- `land_use_code` (String?)
- `land_use_description` (String?)
- `assessed_land_value` (Decimal?)
- `assessed_improvement_value` (Decimal?)
- `assessed_total_value` (Decimal?)
- `acreage` (Decimal?)
- `zoning_code` (String?)
- `flood_zone` (String?)
- `tax_delinquent_flag` (Boolean?)
- `last_sale_date` (DateTime?)
- `last_sale_price` (Decimal?)
- `homestead_exemption_flag` (Boolean?)

### Expected GIS Tables (from code inspection):
- `zoning_districts` ✅ (exists in schema)
- `osm_pois_travis` ✅ (exists in schema)
- `flood_zones` ❌ (not in schema — external ArcGIS only)
- `utility_water` ❌ (not in schema — external ArcGIS only)
- `utility_sewer` ❌ (not in schema — external ArcGIS only)
- `building_footprints` ❌ (not in schema — external ArcGIS only)
- `wetlands` ❌ (not in schema — external ArcGIS only)
- `building_permits` ❌ (not in schema — external ArcGIS only)
- `opportunity_zones` ❌ (not in schema)

**Row Counts:** Cannot verify without database access.

---

## SECTION 5: CHAT.JS ENDPOINT ANALYSIS

**File:** `src/routes/chat.js`

### 1. HTTP Method and Path
- **Method:** `POST /api/chat`
- **Additional Routes:**
  - `GET /api/chat/session/:claudeSessionId`
  - `POST /api/chat/session/:claudeSessionId/end`

### 2. Request Body Extraction
```javascript
const { messages, sessionId, claudeSessionId: existingClaudeSessionId } = req.body;
```
- Extracts: `messages` (array), `sessionId` (string), `claudeSessionId` (optional string)
- Validates: `messages` must be non-empty array, last message must be from user

### 3. Claude API Call
- **Model:** `claude-sonnet-4-20250514` (hardcoded constant)
- **System Prompt:** Defined inline as `SYSTEM_PROMPT` constant (lines 26-55)
- **Tools:** `TOOLS` imported from `../tools/index.js`
- **Max Tokens:** 4096
- **Initial Call:**
```javascript
response = await client.messages.create({
  model: MODEL,
  max_tokens: 4096,
  system: SYSTEM_PROMPT,
  tools: TOOLS,
  messages: claudeMessages
});
```

### 4. Tool-Use Loop
- **Max Iterations:** `MAX_ITERATIONS = 10` (hardcoded)
- **Break Condition:** `response.stop_reason !== 'tool_use'` OR `iterations >= MAX_ITERATIONS`
- **Loop Logic:**
  1. Extract `tool_use` blocks from `response.content`
  2. For each tool use, call `routeToolCall(toolUse.name, toolUse.input)`
  3. Collect results into `toolResults` array
  4. Continue conversation with tool results appended
  5. Track token usage across iterations

### 5. MapData Collection
- **Location:** Lines 169-174
- **Logic:**
```javascript
if (toolUse.name === 'search_properties' || toolUse.name === 'get_gis_layers') {
  if (result.type === 'FeatureCollection') {
    mapData = result;
  }
}
```
- **Note:** Only captures the LAST tool result that returns a FeatureCollection
- **GeoJSON Aggregation:** Not aggregated — last result overwrites previous

### 6. Artifact Collection
- **Location:** Lines 175-178
- **Logic:**
```javascript
if (toolUse.name === 'generate_artifact') {
  artifact = result;
}
```
- **Note:** Only captures the LAST artifact generated

### 7. Response Shape
```javascript
const chatResponse = {
  success: true,
  message,                    // Text response from Claude
  sessionId: sessionId || 'default',
  ...(claudeSessionId && { claudeSessionId }),
  ...(mapData && { mapData }),      // Conditional GeoJSON FeatureCollection
  ...(artifact && { artifact }),    // Conditional artifact object
  usage: {
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    iterations
  }
};
res.json(chatResponse);
```

### 8. Field Stripping/Transformation
- **No explicit stripping** — Claude's text response is used as-is
- **Tool results** are JSON.stringify'd before being sent back to Claude
- **Final response** includes raw `message` text, `mapData` (if present), `artifact` (if present)
- **Enrichments** are extracted and stored separately (non-blocking), not included in response

---

## SECTION 6: MCP INTEGRATION

**Files:** `src/services/mcp/server-manager.js`, `src/services/mcp/tool-router.js`

### 1. MCP Servers Configured
**Total:** 3 servers

| Server Name | Command | Path | Description |
|-------------|---------|------|-------------|
| `property-data` | `node` | `~/scoutgpt-ops/mcp-servers/property-mcp/src/index.js` | Property data queries and enrichment |
| `sql` | `node` | `~/scoutgpt-ops/mcp-servers/sql-mcp/src/index.js` | Direct SQL queries with spatial support |
| `gis` | `node` | `~/scoutgpt-ops/mcp-servers/gis-mcp/src/index.js` | GIS operations and spatial queries |

**Environment Variables Passed:** `DATABASE_URL` to all servers

### 2. Server Spawning
- **Method:** `StdioClientTransport` from `@modelcontextprotocol/sdk`
- **Process:** Child process spawned via transport
- **Connection:** Uses stdio (stdin/stdout) for communication
- **Timeout:** 10 seconds for initial connection
- **Error Handling:** Transport errors logged, connection status tracked

### 3. Tool Routing Logic
**File:** `src/services/mcp/tool-router.js`

**Tool → Server Mapping:**
```javascript
{
  'search_properties': 'property-data',
  'get_property': 'property-data',
  'get_enrichment': 'property-data',
  'bulk_properties': 'property-data',
  'execute_query': 'sql',
  'get_table_schema': 'sql',
  'spatial_query': 'sql',
  'list_tables': 'sql',
  'get_gis_layers': 'gis',
  'buffer_geometry': 'gis',
  'get_zoning': 'gis',
  'interpret_zoning': 'gis',
  'get_layer_features': 'gis',
  'intelligent_property_search': null,  // Fallback
  'analyze_property': null,              // Fallback
  'web_search': null,                    // Fallback
  'get_osm_nearby': null,                // Fallback
  'generate_artifact': null               // Fallback
}
```

### 4. Fallback Mode
- **Trigger:** 
  1. Tool not mapped to any MCP server (`null` in map)
  2. MCP server not connected
  3. MCP call fails (error caught)
- **Fallback Handler:** `executeTool` from `../../tools/index.js` (local handlers)
- **Force Fallback:** `options.forceFallback = true` parameter available

### 5. Tool Router → Handlers Connection
- **Direct Import:** `import { executeTool as fallbackExecuteTool } from '../../tools/index.js';`
- **Call:** `fallbackExecuteTool(toolName, toolInput)` when fallback needed
- **MCP Response Parsing:** Extracts JSON from MCP `content` array (looks for `type: 'text'`)

---

## SECTION 7: CHAT.JS SYSTEM PROMPT

**File:** `src/routes/chat.js` (lines 26-55)

### Full System Prompt:
```
You are ScoutGPT, an AI assistant for real estate investors analyzing properties in Travis County, Texas.

## Your Data Sources
- Property database with 372,000+ parcels (parcel_features_travis)
- GIS layers: flood zones, zoning, utilities, permits
- Web search for market news and current information
- OpenStreetMap for nearby amenities

## Your Capabilities
1. Search properties by location, size, value, type, and distress signals
2. Get detailed property information including ownership, values, and zoning
3. Analyze development feasibility with constraints and recommendations
4. Search the web for market news and recent activity
5. Find nearby amenities and assess walkability
6. Display GIS layers on the map
7. Generate professional reports and analyses

## Response Guidelines
- Be concise and direct
- When showing properties, mention count and key characteristics
- When analyzing, highlight constraints and opportunities
- For reports, generate artifacts the user can view and download
- If a query is ambiguous, ask for clarification

## Important
- Always use search_properties when user asks to find/show/search properties
- Use analyze_property for feasibility questions
- Use generate_artifact when user wants reports or downloadable content
- Use web_search for market conditions or current news
- Property values are in USD, acreage is in acres
```

### Analysis:
1. **Tool Names Referenced:** ✅ Yes — `search_properties`, `analyze_property`, `generate_artifact`, `web_search`
2. **Available Filters Described:** ❌ No — only mentions "location, size, value, type, and distress signals" generically
3. **Valid Column Names Listed:** ❌ No — no column names mentioned
4. **Response Format Expectations:** ✅ Yes — mentions "count and key characteristics", "constraints and opportunities", "artifacts"
5. **Hallucinated Capabilities:** ⚠️ Potentially — mentions "walkability" but `get_osm_nearby` doesn't calculate walkability scores

**Note:** The system prompt does NOT include schema context from `getSchemaPromptSection()` — this is a potential gap.

---

## SECTION 8: RESPONSE CONTRACT TRACE

**Query:** "Find 5 commercial properties over 2 acres in Austin"

### Step-by-Step Flow:

#### 1. Claude Tool Use Call
**Expected:**
```json
{
  "type": "tool_use",
  "id": "toolu_xxx",
  "name": "search_properties",
  "input": {
    "filters": {
      "asset_class": "commercial",
      "min_acres": 2,
      "city": "Austin"
    },
    "limit": 5
  }
}
```

**OR (if using intelligent search):**
```json
{
  "name": "intelligent_property_search",
  "input": {
    "query": "Find 5 commercial properties over 2 acres in Austin",
    "limit": 5
  }
}
```

#### 2. Handler Processing
- **If `search_properties`:** `searchProperties` handler (lines 48-150)
- **If `intelligent_property_search`:** `handleIntelligentSearch` → `intelligentPropertySearch` service

#### 3. SQL Built (for `search_properties`)
```sql
SELECT 
  parcel_id,
  situs_address,
  owner_name_raw,
  acres_calc,
  asset_class,
  market_value,
  tax_delinquent_flag,
  homestead_exemption_flag,
  mail_zip,
  ST_AsGeoJSON(geom_centroid)::json as geometry
FROM parcel_features_travis
WHERE LOWER(asset_class) = LOWER($1)
  AND acres_calc >= $2
  AND mail_city ILIKE $3
ORDER BY acres_calc DESC
LIMIT $4
```

**Parameters:** `['commercial', 2, '%Austin%', 5]`

#### 4. Columns Selected
- `parcel_id`
- `situs_address`
- `owner_name_raw`
- `acres_calc`
- `asset_class`
- `market_value`
- `tax_delinquent_flag`
- `homestead_exemption_flag`
- `mail_zip`
- `geometry` (GeoJSON)

#### 5. Handler Return
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {...},
      "properties": {
        "parcel_id": "...",
        "address": "...",
        "owner": "...",
        "acres": 2.5,
        "asset_class": "commercial",
        "market_value": 500000,
        "tax_delinquent": false,
        "homestead": false,
        "zip": "78701"
      }
    }
  ],
  "metadata": {
    "count": 5,
    "query_filters": {...}
  }
}
```

#### 6. Claude Text Response
**Expected:** "I found 5 commercial properties over 2 acres in Austin. Here are the key details: [summary]"

#### 7. MapData Extraction
- **Location:** Lines 169-174 in `chat.js`
- **Logic:** If tool name is `search_properties` or `get_gis_layers` AND result.type is `FeatureCollection`, assign to `mapData`
- **Result:** `mapData = toolResult` (entire FeatureCollection)

#### 8. Final Response Object
```json
{
  "success": true,
  "message": "I found 5 commercial properties...",
  "sessionId": "...",
  "claudeSessionId": "...",
  "mapData": {
    "type": "FeatureCollection",
    "features": [...],
    "metadata": {...}
  },
  "usage": {
    "inputTokens": 1234,
    "outputTokens": 567,
    "iterations": 1
  }
}
```

**Note:** If multiple tool calls return FeatureCollections, only the LAST one is captured (no aggregation).

---

## SECTION 9: FIELD MISMATCH ANALYSIS

### Comparison Sources:
- **A.** Prisma schema (`prisma/schema.prisma`) — actual table structure
- **B.** Handlers SQL (`src/tools/handlers.js`) — columns referenced in queries
- **C.** Tool definitions (`src/tools/index.js`) — fields mentioned in descriptions

### Mismatches Found:

#### 1. `mail_city` vs `city`
- **In Code:** `mail_city` used in SQL (handlers.js:59)
- **In Schema:** ✅ `mail_city` exists
- **In Tool Def:** Filter uses `city` (index.js:79)
- **Severity:** ⚠️ COSMETIC — tool accepts `city`, handler maps to `mail_city` correctly

#### 2. `mail_zip` vs `zip_code`
- **In Code:** `mail_zip` used in SQL (handlers.js:55)
- **In Schema:** ✅ `mail_zip` exists
- **In Tool Def:** Filter uses `zip_code` (index.js:74)
- **Severity:** ⚠️ COSMETIC — tool accepts `zip_code`, handler maps to `mail_zip` correctly

#### 3. `situs_address` vs `address`
- **In Code:** `situs_address` used in SQL (handlers.js:108)
- **In Schema:** ✅ `situs_address` exists
- **In Tool Def:** Returns `address` in properties (index.js:131)
- **Severity:** ⚠️ COSMETIC — handler maps `situs_address` → `address` in response

#### 4. `owner_name_raw` vs `owner`
- **In Code:** `owner_name_raw` used in SQL (handlers.js:109)
- **In Schema:** ✅ `owner_name_raw` exists
- **In Tool Def:** Returns `owner` in properties (index.js:132)
- **Severity:** ⚠️ COSMETIC — handler maps `owner_name_raw` → `owner` in response

#### 5. `tax_delinquent_flag` vs `is_tax_delinquent`
- **In Code:** `tax_delinquent_flag` used in SQL (handlers.js:94)
- **In Schema:** ✅ `tax_delinquent_flag` exists
- **In Tool Def:** Filter uses `is_tax_delinquent` (index.js:115)
- **Severity:** ⚠️ COSMETIC — handler maps filter correctly

#### 6. `homestead_exemption_flag` vs `has_homestead`
- **In Code:** `homestead_exemption_flag` used in SQL (handlers.js:90)
- **In Schema:** ✅ `homestead_exemption_flag` exists
- **In Tool Def:** Filter uses `has_homestead` (index.js:111)
- **Severity:** ⚠️ COSMETIC — handler maps filter correctly

#### 7. `asset_class` vs `property_type`
- **In Code:** `asset_class` used in SQL (handlers.js:82)
- **In Schema:** ✅ `asset_class` exists
- **In Tool Def:** Uses `asset_class` correctly
- **Severity:** ✅ NO MISMATCH

#### 8. `acres_calc` vs `acres`
- **In Code:** `acres_calc` used in SQL (handlers.js:67, 71)
- **In Schema:** ✅ `acres_calc` exists
- **In Tool Def:** Filter uses `min_acres`/`max_acres` (index.js:82-88)
- **Severity:** ✅ NO MISMATCH — filters map correctly

**Summary:** All field mappings are correct. Tool definitions use user-friendly names, handlers map to correct database columns. No CRASH or SILENT errors detected.

---

## SECTION 10: PRISMA SCHEMA SPOT CHECK

**File:** `prisma/schema.prisma`

### 1. Total Line Count
**1,826 lines**

### 2. Models Defined
**Total:** 50+ models

**Key Models:**
- `User`
- `UserProfile`
- `Property`
- `Listing`
- `Deal`
- `DealRoom`
- `DealDocument`
- `DealMedia`
- `DealUserAccess`
- `NdaSignature`
- `DealActivityLog`
- `BuyerAssumptions`
- `BuyBox`
- `Document`
- `Activity`
- `Task`
- `Comp`
- `GisLayer`
- `Pin`
- `MapServerRegistry`
- `LayerSet`
- `MapQuery`
- `PolygonSearch`
- `spatial_ref_sys`
- `Owner`
- `OwnerProperty`
- `OwnerFeaturesTx`
- `OwnerSegment`
- `TxEnrichmentRollup`
- `DiscoverRun`
- `DiscoverResult`
- `ScoringModel`
- `austin_land_use`
- `buyboxes`
- `county_config`
- `land_use_codes`
- `osm_pois_travis`
- `parcel_features_travis` ✅
- `parcels_travis` ✅
- `parcels_travis_enrichment` ✅
- `parcels_travis_enrichment_stage`
- `parcels_travis_txgio_stage`
- `parcels_tx`
- `parcels_bastrop` (+ enrichment)
- `parcels_bell` (+ enrichment)
- `parcels_blanco` (+ enrichment)
- `parcels_burnet` (+ enrichment, raw)
- `parcels_caldwell` (+ enrichment)
- `parcels_comal` (+ enrichment)
- `parcels_hays` (+ enrichment)
- `parcels_kendall` (+ enrichment)
- `parcels_lee` (+ enrichment)
- `parcels_llano` (+ enrichment)
- `parcels_williamson` (+ enrichment)
- `stg_attom_property_boundary_travis`
- `txgio_centroids` (ignored)
- `xref_parcel_property_travis`
- `xref_parcel_property_travis_conflicts`
- `zoning_districts` ✅
- `opportunities`
- `signals`
- `Session`
- `ClaudeSession` ✅
- `ClaudeMessage` ✅
- `ParcelEnrichment` ✅
- `TrainingExportLog`
- `Artifact` ✅

### 3. Model for `parcel_features_travis`
**Lines:** 823-868

**Key Fields:**
- `parcel_id` (String, PK)
- `county_fips` (String, default: "48453")
- `situs_address`, `mailing_address`, `mail_city`, `mail_state`, `mail_zip`
- `owner_name_raw`, `owner_name_norm`, `owner_entity_type`, `owner_portfolio_count_travis`, `owner_segment`
- `acres_calc`, `acres_calc_source`, `acres_calc_confidence`
- `asset_class`, `asset_class_confidence`
- `year_built`, `building_sqft`
- `market_value`, `assessed_total_value`, `land_value`, `improvement_value`
- `tax_delinquent_flag`, `homestead_exemption_flag`
- `last_sale_date`, `last_sale_price`
- `zoning_code`, `flood_zone`, `land_use_code`, `land_use_desc`
- `geom_centroid` (geometry)
- `created_at`, `updated_at`

### 4. Model for `claude_sessions`
**Lines:** 1705-1728

**Fields:**
- `id` (String, PK, UUID)
- `sessionId` (String?, unique)
- `userId` (String?)
- `model` (String, default: "claude-sonnet-4-20250514")
- `systemPrompt` (String?, Text)
- `startedAt` (DateTime)
- `endedAt` (DateTime?)
- `messageCount` (Int, default: 0)
- `toolUseCount` (Int, default: 0)
- `totalTokens` (Int, default: 0)
- `metadata` (Json?)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)
- Relations: `messages`, `enrichments`, `artifacts`

### 5. Model for `parcels_travis_enrichment`
**Lines:** 1324-1368

**Fields:**
- `parcel_id` (String, PK)
- `owner_name`, `owner2`, `mail_address1`, `mail_address2`, `mail_city`, `mail_state`, `mail_zip`
- `situs_address`
- `land_use`, `land_use_desc`, `legal_desc`
- `year_built`
- `acres`, `acreage`
- `land_value`, `improvement_value`, `market_value`, `assessed_value`
- `assessed_land_value`, `assessed_improvement_value`, `assessed_total_value`
- `last_update`, `source_layer`, `raw`
- `updated_at`, `ingested_at`
- `owner_type`, `mailing_address`
- `land_use_code`, `land_use_description`
- `zoning_code`, `flood_zone`
- `tax_delinquent_flag`, `last_sale_date`, `last_sale_price`, `homestead_exemption_flag`
- Relation: `parcels_travis`

### 6. Models Referencing Non-Existent Tables
**None found** — all referenced tables exist in schema.

---

## SECTION 11: PACKAGE.JSON

**File:** `package.json`

### 1. Node.js Engine Requirement
**Not specified** — no `engines` field

### 2. Key Dependencies and Versions

| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | `^0.32.1` | Claude API client |
| `@modelcontextprotocol/sdk` | `^1.25.3` | MCP server communication |
| `@prisma/client` | `^6.1.0` | Prisma ORM client |
| `prisma` | `^6.1.0` | Prisma CLI |
| `express` | `^4.21.2` | Web framework |
| `pg` | `^8.16.3` | PostgreSQL client |

**Other Notable Dependencies:**
- `@turf/turf`: `^7.3.1` (geospatial operations)
- `cors`: `^2.8.5`
- `csv-parse`: `^6.1.0`
- `dotenv`: `^16.4.7`
- `exceljs`: `^4.4.0`
- `multer`: `^2.0.2`
- `papaparse`: `^5.4.1`
- `pdfkit`: `^0.17.2`
- `proj4`: `^2.20.2` (coordinate transformations)
- `replicate`: `^1.4.0`
- `shapefile`: `^0.6.6`
- `uuid`: `^13.0.0`
- `zod`: `^4.3.5`

### 3. Scripts Defined

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `node --watch src/server.js` | Development with watch |
| `dev:local` | `dotenv -e .env.local -- node --watch src/server.js` | Local dev with env file |
| `prestart` | `prisma generate` | Generate Prisma client |
| `start` | `node src/server.js` | Production start |
| `start:local` | `dotenv -e .env.local -- node src/server.js` | Local start with env |
| `build` | `echo 'No build needed'` | No-op |
| `postinstall` | `prisma generate` | Generate Prisma on install |
| `prisma:generate` | `prisma generate` | Generate Prisma client |
| `prisma:push` | `prisma db push` | Push schema to DB |
| `db:drop-fk` | `npx prisma db execute --file scripts/drop-user-fk.sql` | Drop foreign key |
| `seed` | `node scripts/seed-mapservers.js` | Seed map servers |
| `seed:layersets` | `node scripts/seed-layer-sets.js` | Seed layer sets |
| `export:parcels:travis` | `node scripts/export-parcels-to-mts.mjs` | Export parcels to MTS |
| `load:parcels:travis` | `node scripts/load-parcels-travis.mjs` | Load Travis parcels |
| `reload:parcels:travis:ogr` | `bash scripts/reload-parcels-travis-ogr.sh` | Reload via OGR |
| `reload:parcels:travis:node` | `node scripts/load-parcels-travis.mjs --truncateFirst=true --batchSize=1000 --verify=true --forceNode=true` | Reload via Node |
| `mts:travis:publish` | `node scripts/mts/publish-travis.mjs` | Publish MTS tileset |
| `mts:travis:studio` | `node scripts/mts/ndjson-to-geojson.mjs` | Convert NDJSON to GeoJSON |
| `ingest:parcels:tx` | `node scripts/ingest-parcels-tx.mjs` | Ingest TX parcels |
| `ingest:parcels:tx:travis` | `node scripts/ingest-parcels-tx.mjs --countyFips=48453` | Ingest Travis parcels |
| `ingest:txgio:travis` | `bash scripts/ingest-txgio-travis.sh` | Ingest TXGIO data |
| `ingest:travis:enrichment` | `node scripts/ingest-travis-enrichment.mjs` | Ingest enrichment |
| `ingest:travis:enrichment:local` | `node scripts/ingest-travis-enrichment-local.mjs` | Local enrichment ingest |

### 4. Concerning or Outdated Packages
- ⚠️ **No engine specification** — should specify Node.js version requirement
- ✅ **Dependencies appear current** — using latest major versions
- ⚠️ **`uuid` v13** — unusual version number, verify compatibility

---

## SECTION 12: ENV VARS REQUIRED

### Environment Variables Found in Source Code:

| Variable | Files Referencing | Fallback/Default |
|---------|-------------------|------------------|
| `DATABASE_URL` | `src/db/pool.js`, `src/services/mcp/server-manager.js`, `src/routes/gis.js`, `src/routes/ai.js`, `src/services/artifacts/index.js`, `src/services/mcp-client.js`, `src/routes/boundaries.js`, `src/routes/export.js`, `src/routes/mts.js`, `src/routes/parcels-search.js`, `src/services/pipeline/intentLogger.js`, `src/services/pipeline/executor.js`, `src/services/pipeline/spatialResolver.js`, `src/services/pipeline/geographyResolver.js`, `src/services/sessions/index.js`, `src/services/referenceResolver.js` | ❌ None — **REQUIRED** |
| `CLAUDE_API_KEY` | `src/routes/chat.js`, `src/routes/ai.js`, `src/services/pipeline/interpreter.js` | ❌ None — **REQUIRED** |
| `ANTHROPIC_API_KEY` | `src/routes/discover.js` | Falls back to `CLAUDE_API_KEY` |
| `BRAVE_SEARCH_API_KEY` | `src/services/webSearch/index.js` | ❌ None — **REQUIRED** for web search |
| `CENSUS_API_KEY` | `src/services/census/index.js` | ⚠️ Warns if missing in non-production |
| `REPLICATE_API_TOKEN` | `src/services/sqlcoder.js` | ❌ None — **REQUIRED** for SQL coder |
| `PORT` | `src/server.js`, `src/utils/polygonSearchNames.js` | Default: `3001` |
| `NODE_ENV` | `src/server.js`, `src/routes/gis.js`, `src/utils/apiResponse.js`, `src/routes/query.js` | Default: `development` |
| `CORS_ORIGINS` | `src/server.js` | ❌ None — splits by comma if provided |
| `FRONTEND_URL` | `src/server.js` | ❌ None |
| `HOME` | `src/services/mcp/server-manager.js` | Falls back to `USERPROFILE` or `/Users/braydonirwin` |
| `USERPROFILE` | `src/services/mcp/server-manager.js` | Used as fallback for `HOME` |
| `MCP_PROPERTY_ENABLED` | `src/services/mcp-client.js` | Default: `'true'` (string) |
| `MCP_SQL_ENABLED` | `src/services/mcp-client.js` | Default: `'true'` (string) |
| `MCP_GIS_ENABLED` | `src/services/mcp-client.js` | Default: `'true'` (string) |
| `ARTIFACT_STORAGE_TYPE` | `src/services/artifacts/storage.js` | Default: `'local'` |
| `ARTIFACT_STORAGE_PATH` | `src/services/artifacts/storage.js` | Default: `'/tmp/scoutgpt-artifacts'` |
| `ARTIFACT_S3_BUCKET` | `src/services/artifacts/storage.js` | Default: `null` |

### Critical Required Variables (No Fallback):
1. ⚠️ **`DATABASE_URL`** — Used in 15+ files
2. ⚠️ **`CLAUDE_API_KEY`** — Required for chat endpoint
3. ⚠️ **`BRAVE_SEARCH_API_KEY`** — Required for web search tool
4. ⚠️ **`REPLICATE_API_TOKEN`** — Required for SQL coder service

---

## SUMMARY OF FINDINGS

### ✅ Strengths:
1. **Well-structured tool definitions** — Clear schemas with enums
2. **Proper field mapping** — Tool names map correctly to database columns
3. **Comprehensive Prisma schema** — 50+ models covering all use cases
4. **MCP fallback system** — Graceful degradation if MCP servers unavailable
5. **Error handling** — Most handlers have try/catch blocks

### ⚠️ Issues Found:
1. **System prompt lacks schema context** — `getSchemaPromptSection()` not included
2. **MapData overwrites** — Only last FeatureCollection captured, no aggregation
3. **No Node.js engine requirement** — Should specify minimum version
4. **Missing database verification** — Cannot verify actual table structure without DB access
5. **Hardcoded model version** — `claude-sonnet-4-20250514` hardcoded in multiple places
6. **No explicit error handling** — Some handlers (`searchProperties`, `getProperty`, `getOsmNearby`) lack try/catch

### ❌ Critical Gaps:
1. **Database column verification** — Need actual SQL queries to verify schema matches code
2. **Row count verification** — Cannot verify table row counts without DB access
3. **Runtime testing** — Cannot verify end-to-end flow without running the application

---

## RECOMMENDATIONS

1. **Add schema context to system prompt** — Include `getSchemaPromptSection()` output
2. **Aggregate multiple mapData results** — Merge FeatureCollections instead of overwriting
3. **Add Node.js engine requirement** — Specify minimum version in `package.json`
4. **Add error handling** — Wrap all handler functions in try/catch
5. **Extract model version** — Move Claude model to environment variable
6. **Database audit** — Run SQL queries from Section 4 to verify actual schema
7. **Add integration tests** — Test end-to-end tool execution flow

---

**Report Generated:** February 4, 2026  
**Auditor:** AI Assistant (Read-Only Mode)  
**Status:** ✅ Complete
