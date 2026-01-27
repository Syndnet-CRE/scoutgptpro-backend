# SCOUTGPT COMPREHENSIVE SYSTEM AUDIT
**Execute Date:** January 26, 2026  
**Requested By:** Boris Cherny (Technical Lead)  
**Purpose:** Full system state assessment for Claude-native platform architecture

---

## EXECUTIVE SUMMARY

### What Works
- ✅ **Backend API**: Functional Express.js server with 30+ route handlers
- ✅ **Claude Integration**: Basic chat endpoint (`/api/chat`) with tool-use loop implemented
- ✅ **Database**: PostgreSQL (Neon) with comprehensive parcel data (372K+ Travis County parcels)
- ✅ **Property Tools**: 7 Claude tools defined and implemented (search, get, analyze, GIS, OSM, web search, artifacts)
- ✅ **Frontend**: React-based chat UI with Mapbox GL integration
- ✅ **Artifact Generation**: System for creating CSV, PDF, XLSX reports
- ✅ **Session Management**: Basic session state storage (though table may be missing)

### What Doesn't Work / Critical Gaps
- ❌ **MCP Integration**: MCP client exists but uses fallback mode (direct DB queries, not actual MCP servers)
- ❌ **Write-Back Schema**: No tables for storing Claude conversation transcripts, findings, or training data
- ❌ **Sessions Table**: Referenced in code but not found in Prisma schema or migrations
- ❌ **White-Label UI**: Frontend still has ScoutGPT branding, not white-label ready
- ❌ **Message Persistence**: Chat messages not stored in database (only in session state JSON)
- ❌ **Training Data Export**: No mechanism for JSONL export of conversations

### Critical Blockers for Claude-Native Architecture
1. **No Write-Back Schema**: Cannot store Claude's findings, enrichments, or conversation data
2. **MCP Not Connected**: Property-data MCP tools are reimplemented as direct DB queries, not using actual MCP servers
3. **No Message Storage**: Conversations exist only in memory/session state, not queryable
4. **Missing Sessions Table**: Code references `sessions` table but it doesn't exist in schema
5. **No Training Data Pipeline**: No way to export conversations for fine-tuning

### Architecture Assessment
**Current State**: Chat-wrapper implementation  
**Target State**: Claude-native intelligence platform  
**Gap**: ~60% - Core infrastructure exists but missing write-back, MCP integration, and training data collection

---

## SECTION 1: BACKEND ARCHITECTURE

### 1.1 Directory Structure

```
scoutgptpro-backend/
├── src/
│   ├── config/          # Attribute mapping configs
│   ├── db/              # Database pool configuration
│   ├── middleware/      # Rate limiting, query logging, upload handling
│   ├── migrations/     # SQL migrations (CRM/dealroom schema)
│   ├── routes/          # 30 API route handlers
│   ├── services/        # Business logic services
│   │   ├── artifacts/  # Report generation (CSV, PDF, XLSX)
│   │   ├── dealrooms/  # Deal room management
│   │   ├── enrichment/ # Property enrichment orchestrator
│   │   ├── pipeline/   # 12-step query pipeline
│   │   ├── sessions/   # Session state management
│   │   ├── staging/    # Staging data handling
│   │   └── webSearch/  # Web search integration
│   ├── tools/          # Claude tool definitions & handlers
│   ├── utils/          # Utilities (normalization, API responses)
│   └── validators/      # Request validation schemas
├── prisma/
│   ├── schema.prisma   # Prisma schema (1689 lines, 100+ models)
│   └── migrations/     # SQL migration files
├── scripts/            # 155+ scripts (data ingestion, MTS publishing)
└── data/               # MapServer cache, CSV exports
```

**Key Directories:**
- `src/routes/`: 30 route files handling all API endpoints
- `src/tools/`: Claude tool definitions (`index.js`) and handlers (`handlers.js`)
- `src/services/`: Core business logic separated by domain
- `prisma/`: Database schema and migrations

### 1.2 Package Dependencies

**Backend (`package.json`):**
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.1",      // Claude API client
    "@prisma/client": "^6.1.0",          // Prisma ORM
    "express": "^4.21.2",                 // Web framework
    "pg": "^8.16.3",                     // PostgreSQL client
    "cors": "^2.8.5",                    // CORS middleware
    "@turf/turf": "^7.3.1",              // Geospatial operations
    "pdfkit": "^0.17.2",                 // PDF generation
    "exceljs": "^4.4.0",                 // Excel generation
    "csv-parse": "^6.1.0",               // CSV parsing
    "replicate": "^1.4.0",               // Replicate API (ML models)
    "zod": "^4.3.5"                      // Schema validation
  }
}
```

**Dependency Analysis:**
- ✅ All dependencies are current (no major version conflicts)
- ✅ Anthropic SDK is latest version (0.32.1)
- ⚠️ **Missing**: `@modelcontextprotocol/sdk` - Referenced in `mcp-client.js` but not in package.json
- ⚠️ **Redundant**: Both `csv-parse` and `papaparse` installed (could consolidate)

### 1.3 Database Configuration

**Prisma Schema Overview:**
- **Total Models**: 100+ models defined
- **Core Tables**: 
  - `parcel_features_travis` (372K+ rows) - Main property features table
  - `parcels_travis` - Geometry table with PostGIS
  - `parcels_travis_enrichment` - Enrichment data
  - `opportunities` - Opportunity scoring
  - `signals` - Distress signals
  - `owners` - Owner entity data
  - `deal_rooms` - Deal room management
  - `listings` - Property listings
  - `artifacts` - Generated reports/exports

**Key Schema Findings:**
- ✅ PostGIS extension enabled (spatial queries supported)
- ✅ Comprehensive indexes on parcel tables (acres, asset_class, market_value, etc.)
- ✅ Foreign key relationships properly defined
- ❌ **Missing**: `sessions` table (referenced in code but not in schema)
- ❌ **Missing**: Tables for Claude conversation storage
- ❌ **Missing**: Tables for training data export

**Database Connection:**
- **Provider**: Neon PostgreSQL (serverless)
- **Connection String**: Configured via `DATABASE_URL` env var
- **Pool Size**: 5-10 connections (varies by service)

### 1.4 API Routes

**Route Files (30 total):**

| Route File | Endpoint Prefix | Purpose |
|------------|----------------|---------|
| `ai.js` | `/api/ai` | Legacy AI query endpoint (12-step pipeline) |
| `chat.js` | `/api/chat` | **NEW** Claude chat endpoint with tool-use |
| `parcels.js` | `/api/parcels` | Parcel CRUD operations |
| `parcels-search.js` | `/api/parcels/search` | Parcel search with filters |
| `parcels-tx.js` | `/api/parcels-tx` | Texas-wide parcel queries |
| `properties.js` | `/api/properties` | Property management |
| `gis.js` | `/api/gis` | GIS layer queries |
| `mapservers.js` | `/api/mapservers` | MapServer registry |
| `discover.js` | `/api/discover` | Discovery engine queries |
| `artifacts.js` | `/api/artifacts` | Artifact generation/download |
| `artifactsV2.js` | `/api/v2/artifacts` | V2 artifact API |
| `sessions.js` | `/api/sessions` | Session management |
| `dealRooms.js` | `/api/deal-rooms` | Deal room CRUD |
| `dealroomsV2.js` | `/api/v2/deal-rooms` | V2 deal rooms API |
| `listings.js` | `/api/listings` | Property listings |
| `deals.js` | `/api/deals` | Deal management |
| `tasks.js` | `/api/deals/:id/tasks` | Task management |
| `documents.js` | `/api/documents` | Document uploads |
| `export.js` | `/api/export` | Data export endpoints |
| `osm-pois.js` | `/api/osm-pois` | OSM POI queries |
| `boundaries.js` | `/api/boundaries` | Boundary queries |
| `staging.js` | `/api/staging` | Staging data operations |
| `buyboxes.js` | `/api/buy-boxes` | Buy box management |
| `geocode.js` | `/api/geocode` | Geocoding |
| `polygonSearches.js` | `/api/polygon-searches` | Polygon search management |
| `query.js` | `/api/query` | Generic query endpoint |
| `mts.js` | `/api/mts` | Mapbox Tileset operations |

**Key Endpoints:**

**POST `/api/chat`** (NEW - Claude-native)
- **Input**: `{ messages: Array, sessionId: string }`
- **Output**: `{ message: string, mapData?: GeoJSON, artifact?: object }`
- **Tools**: 7 tools available (search_properties, get_property, analyze_property, web_search, get_osm_nearby, get_gis_layers, generate_artifact)
- **Model**: `claude-sonnet-4-20250514`
- **Tool-Use Loop**: Up to 10 iterations

**POST `/api/ai`** (Legacy - 12-step pipeline)
- **Input**: `{ query: string, intent?: object }`
- **Output**: `{ results: Array, mapData: GeoJSON }`
- **Pipeline**: 12-step query processing pipeline
- **Status**: Still functional but superseded by `/api/chat`

### 1.5 Claude Tools Implementation

**Tool Definitions (`src/tools/index.js`):**

1. **`search_properties`**
   - **Purpose**: Search Travis County property database
   - **Input**: Filters (zip_code, city, min_acres, max_acres, min_value, max_value, asset_class, zoning_code, is_vacant, has_homestead, is_tax_delinquent), bbox, limit
   - **Output**: GeoJSON FeatureCollection
   - **Database**: Queries `parcel_features_travis` table
   - **Status**: ✅ Functional

2. **`get_property`**
   - **Purpose**: Get detailed property information
   - **Input**: `parcel_id` (required)
   - **Output**: Property object with all fields
   - **Database**: Joins `parcel_features_travis` + `parcels_travis`
   - **Status**: ✅ Functional

3. **`analyze_property`**
   - **Purpose**: Analyze development feasibility
   - **Input**: `parcel_ids` (array, max 5)
   - **Output**: Analysis object with constraints and recommendations
   - **Service**: Calls `analyzeDevelopmentFeasibility()` orchestrator
   - **Status**: ✅ Functional

4. **`web_search`**
   - **Purpose**: Search web for market news
   - **Input**: `query`, `search_type`, `location`
   - **Output**: Search results array
   - **Service**: Uses `webSearch` service (Brave Search API)
   - **Status**: ✅ Functional

5. **`get_osm_nearby`**
   - **Purpose**: Find nearby POIs
   - **Input**: `lat`, `lng`, `radius_meters`, `categories`
   - **Output**: POIs array with distances
   - **Database**: Queries `osm_pois_travis` table
   - **Status**: ✅ Functional

6. **`get_gis_layers`**
   - **Purpose**: Get GIS layer data
   - **Input**: `layer_id`, `bbox` or `parcel_id`
   - **Output**: GeoJSON FeatureCollection
   - **Database**: Queries various GIS tables (zoning_districts, flood_zones, etc.)
   - **Status**: ⚠️ Partial (some tables may not exist)

7. **`generate_artifact`**
   - **Purpose**: Generate downloadable reports
   - **Input**: `type`, `parcel_ids`, `title`
   - **Output**: Artifact object with download URL
   - **Service**: Calls `createArtifact()` service
   - **Status**: ✅ Functional

**Tool Handlers (`src/tools/handlers.js`):**
- All tools execute via `executeTool(toolName, toolInput)` function
- Tools return JSON-serializable objects
- Map data and artifacts are captured and returned separately
- Error handling wraps tool execution

### 1.6 Environment Variables

**Required Environment Variables:**
```bash
DATABASE_URL=postgresql://...          # Neon PostgreSQL connection
CLAUDE_API_KEY=sk-ant-api03-...        # Anthropic API key
PORT=3001                               # Server port
NODE_ENV=development|production        # Environment
FRONTEND_URL=https://scoutcrm.netlify.app  # CORS allowed origin
REPLICATE_API_TOKEN=r8_...             # Replicate API (optional)
BRAVE_SEARCH_API_KEY=BSAI...           # Web search API
```

**Security Findings:**
- ⚠️ **CRITICAL**: API keys visible in `.env` file (should use secrets management)
- ⚠️ **CRITICAL**: `CLAUDE_API_KEY` appears twice in `.env` (duplicate entry)
- ✅ No hardcoded secrets in source code
- ⚠️ CORS allows all origins in development mode

### 1.7 Server Configuration

**Server Setup (`src/server.js`):**
- **Framework**: Express.js 4.21.2
- **Port**: 3001 (configurable via PORT env var)
- **CORS**: Configured with environment-based rules
  - Development: Allows all origins
  - Production: Restricted to FRONTEND_URL + localhost variants
- **Middleware**:
  - `express.json()` - JSON body parsing
  - Request logging middleware
  - Static file serving (`/uploads`)
- **Error Handling**: Global error handler returns 500 with error message
- **Health Check**: `GET /health` endpoint

**Security Concerns:**
- ⚠️ No rate limiting on `/api/chat` endpoint (should add)
- ⚠️ No authentication middleware (all endpoints are public)
- ⚠️ No request size limits (could allow large payloads)
- ✅ CORS properly configured for production

---

## SECTION 2: DATABASE SCHEMA DEEP DIVE

### 2.1 Database Tables Analysis

**Core Property Tables:**

| Table Name | Row Count (Est.) | Purpose | Key Fields |
|------------|------------------|---------|------------|
| `parcel_features_travis` | 372,000+ | Main property features | parcel_id, acres_calc, asset_class, market_value, owner_name_raw |
| `parcels_travis` | 372,000+ | Parcel geometries | parcel_id, geom (PostGIS) |
| `parcels_travis_enrichment` | 372,000+ | Enrichment data | parcel_id, owner_name, market_value, acres |
| `opportunities` | ~50,000+ | Opportunity scores | parcel_id, opportunity_score, distress_score |
| `signals` | Variable | Distress signals | parcel_id, signal_type, signal_date |
| `owners` | ~200,000+ | Owner entities | id, owner_name_norm, entity_type |
| `owner_properties` | ~400,000+ | Owner-parcel relationships | owner_id, parcel_id |
| `osm_pois_travis` | ~50,000+ | Points of interest | id, category, latitude, longitude |
| `zoning_districts` | ~5,000+ | Zoning polygons | id, zoning_code, zoning_desc, geometry |

**GIS Tables (Status Unknown):**
- `flood_zones` - Referenced in code, existence unverified
- `utility_sewer` - Referenced in code, existence unverified
- `utility_water` - Referenced in code, existence unverified
- `building_footprints` - Referenced in code, existence unverified
- `wetlands` - Referenced in code, existence unverified
- `building_permits` - Referenced in code, existence unverified

**Business Tables:**
- `deal_rooms` - Deal room management
- `deal_documents` - Deal documents
- `deal_media` - Deal media files
- `listings` - Property listings
- `artifacts` - Generated reports/exports
- `buy_boxes` - Buy box criteria
- `discover_runs` - Discovery query runs
- `discover_results` - Discovery results

**Missing Tables:**
- ❌ `sessions` - Referenced in `src/services/sessions/index.js` but not in schema
- ❌ `claude_sessions` - For Claude conversation tracking
- ❌ `claude_messages` - For storing conversation messages
- ❌ `parcel_enrichments` - For Claude-discovered enrichments
- ❌ `generated_artifacts` - Already exists as `artifacts`, but may need Claude-specific fields
- ❌ `training_export_log` - For tracking JSONL exports

### 2.2 Schema Structure Analysis

**PostGIS Extension:**
- ✅ PostGIS enabled (confirmed by `spatial_ref_sys` model in schema)
- ✅ Geometry columns use `Unsupported("geometry")` type in Prisma
- ✅ Spatial indexes (GIST) on geometry columns
- ✅ Functions like `ST_AsGeoJSON`, `ST_Intersects`, `ST_DWithin` used in queries

**Indexes:**
- ✅ Comprehensive indexes on `parcel_features_travis`:
  - `idx_pft_acres` on `acres_calc`
  - `idx_pft_asset_class` on `asset_class`
  - `idx_pft_market_value` on `market_value`
  - `idx_pft_geom` (GIST) on `geom_centroid`
  - `idx_pft_owner_segment` on `owner_segment`
- ✅ Foreign key indexes on relationship tables
- ⚠️ Some tables may benefit from composite indexes for common query patterns

**Data Types:**
- ✅ Decimal types used for monetary values (`@db.Decimal(15, 2)`)
- ✅ JSON/JSONB for flexible schema fields
- ✅ Proper use of nullable fields where appropriate
- ✅ Timestamps with timezone (`@db.Timestamptz(6)`)

### 2.3 Missing Schema Elements

**Critical Missing Tables:**

1. **`sessions` Table**
   - **Referenced In**: `src/services/sessions/index.js`
   - **Expected Schema**:
     ```sql
     CREATE TABLE sessions (
       session_id TEXT PRIMARY KEY,
       user_id TEXT,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       last_active_at TIMESTAMPTZ DEFAULT NOW(),
       expires_at TIMESTAMPTZ,
       state JSONB
     );
     ```
   - **Impact**: Session management service will fail on database queries

2. **Claude Write-Back Tables** (See Section 5 for full design)

---

## SECTION 3: FRONTEND ARCHITECTURE

### 3.1 Directory Structure

```
scoutgpt_9461/
├── src/
│   ├── components/      # 70+ React components
│   │   ├── layout/     # Layout components (Header, Panels, Tabs)
│   │   ├── property/   # Property-related components
│   │   ├── chat/       # Chat UI components
│   │   └── ui/         # Reusable UI components
│   ├── contexts/       # 10 React contexts (Map, UI, Data, etc.)
│   ├── hooks/          # 21 custom hooks
│   │   ├── useChatApi.js      # Chat API hook
│   │   ├── useChatHistory.js  # Chat history management
│   │   └── useMCP.js          # MCP integration hooks
│   ├── pages/          # Page components
│   │   ├── scout-ai-chat/    # Main chat interface
│   │   ├── crm/              # CRM pages
│   │   ├── deal-rooms/       # Deal room pages
│   │   └── interactive-map/  # Map interface
│   ├── services/       # API service clients
│   │   ├── api/        # API clients (dealrooms, staging)
│   │   ├── discoverEngine.js # Discovery engine client
│   │   └── gisLayers.js      # GIS layer service
│   ├── tools/          # Frontend tool definitions
│   └── utils/          # Utility functions
├── public/             # Static assets
└── config/             # Configuration files
```

### 3.2 Package Dependencies

**Frontend (`package.json`):**
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@anthropic-ai/sdk": "^0.20.0",      // ⚠️ Older version than backend
    "mapbox-gl": "^3.16.0",             // Mapbox GL JS
    "react-map-gl": "^8.1.0",           // React wrapper for Mapbox
    "axios": "^1.8.4",                  // HTTP client
    "@reduxjs/toolkit": "^2.6.1",       // State management
    "tailwindcss": "3.4.6",             // CSS framework
    "framer-motion": "^10.16.4",        // Animations
    "recharts": "^2.15.2",              // Charts
    "date-fns": "^4.1.0",               // Date utilities
    "react-hot-toast": "^2.6.0"         // Toast notifications
  }
}
```

**Dependency Issues:**
- ⚠️ **Version Mismatch**: Frontend uses `@anthropic-ai/sdk@0.20.0`, backend uses `0.32.1`
- ✅ React 18.2.0 (current stable)
- ✅ Mapbox GL 3.16.0 (current)
- ⚠️ No MCP SDK in frontend dependencies

### 3.3 API Integration

**API Client Pattern:**
- Uses `fetch` API for HTTP requests
- Base URL configured via `VITE_API_BASE_URL` env var
- Default: `http://localhost:3001`
- API calls centralized in hooks (`useChatApi`, `useMCP`)

**Key API Integrations:**

1. **Chat API** (`useChatApi.js`):
   - **Endpoint**: `POST /api/chat`
   - **Payload**: `{ messages: Array, sessionId: string }`
   - **Response**: `{ message: string, mapData?: GeoJSON, artifact?: object }`
   - **Status**: ✅ Functional

2. **Legacy AI API** (`lib/anthropic.js`):
   - **Endpoint**: `POST /api/chat` (same as above, but different format)
   - **Model**: `claude-3-sonnet-20240229` (hardcoded)
   - **Status**: ⚠️ Uses older model, may conflict with new chat endpoint

3. **Property API**:
   - Various endpoints for property queries
   - Used by map components and property panels

**Error Handling:**
- ✅ Try-catch blocks in hooks
- ✅ Error state management
- ⚠️ No global error boundary for API failures

### 3.4 Mapbox Integration

**Map Initialization:**
- Mapbox GL JS initialized in `MapWorkspace` component
- Access token from `config/mapbox.js`
- Map instance stored in ref for component access

**Layer Management:**
- **Sources**: Vector tiles, GeoJSON, raster tiles
- **Layers**: Parcels, boundaries, GIS layers, choropleth visualizations
- **Events**: Click handlers for parcel selection, hover for tooltips

**MTS Integration:**
- References to Mapbox Tileset (MTS) data
- Backend has `/api/mts` endpoints for tileset operations
- Frontend loads parcel data from MTS sources

**Key Components:**
- `MapWorkspace` - Main map container
- `MapDataLayers` - Layer management
- `FloatingPropertyCard` - Property popup on click

### 3.5 State Management

**State Management Pattern:**
- **Primary**: React Context API (10 contexts)
- **Secondary**: Redux Toolkit (for some global state)
- **Local**: useState/useReducer hooks

**Key Contexts:**
1. `MapContext` - Map instance and state
2. `UIContext` - UI state (panels, modals)
3. `DataContext` - Property data and results
4. `PanelLayerContext` - Panel layer management
5. `MapLayersProvider` - Map layer state

**Event System:**
- Custom events: `'parcel-selected'`, `'ai-results'`
- Event listeners in `useEffect` hooks
- Event dispatching via `window.dispatchEvent()`

**Data Flow:**
1. User query → Chat API → Backend `/api/chat`
2. Backend returns `mapData` (GeoJSON)
3. Frontend dispatches `'ai-results'` event with GeoJSON
4. Map components listen and add layers
5. Property selection triggers `'parcel-selected'` event
6. Property panel updates with selected parcel data

### 3.6 Chat Implementation

**Chat Components:**
- `ScoutTab.jsx` - Main chat tab component
- `AIChatPanel.jsx` - Chat panel with message list
- `ChatDrawerEnhanced.jsx` - Enhanced chat drawer (may be deprecated)
- `ConsolidatedPanel.jsx` - Unified panel combining property + chat

**Chat Hooks:**
- `useChatApi.js` - API communication
- `useChatHistory.js` - Message history management
- `useMCP.js` - MCP integration (may not be fully implemented)

**Message Storage:**
- ⚠️ Messages stored in component state (not persisted)
- ⚠️ `useChatHistory` may use localStorage (needs verification)
- ❌ No backend storage of messages

**Chat UI Features:**
- ✅ Message list with user/assistant roles
- ✅ Streaming support (via `streamChatCompletion`)
- ✅ Map data rendering (GeoJSON features)
- ✅ Artifact display/download
- ⚠️ Claude branding in UI (not white-label)

---

## SECTION 4: MCP INTEGRATION ASSESSMENT

### 4.1 Current MCP Tools Available

**Expected MCP Servers:**
1. **Mapbox MCP Server**
   - Tools: search, directions, geocoding, static maps
   - **Status**: ❌ Not integrated

2. **Property-Data MCP**
   - Tools: `get_property`, `search_properties`, `get_enrichment`, `bulk_properties`
   - **Status**: ⚠️ Reimplemented as direct DB queries (fallback mode)

3. **SQL MCP**
   - Tools: `execute_query`, `get_table_schema`, `spatial_query`, `list_tables`
   - **Status**: ⚠️ Reimplemented as direct DB queries (fallback mode)

4. **GIS MCP**
   - Tools: `spatial_query`, `buffer_geometry`, `get_zoning`, `interpret_zoning`, `get_layer_features`
   - **Status**: ⚠️ Reimplemented as direct DB queries (fallback mode)

### 4.2 MCP Implementation Analysis

**MCP Client Service (`src/services/mcp-client.js`):**

**Current State:**
- ✅ MCP client manager class exists
- ✅ Tool definitions match expected MCP tools
- ❌ **Fallback Mode**: All tools use direct database queries, not actual MCP servers
- ❌ **No MCP SDK**: `@modelcontextprotocol/sdk` referenced but not installed
- ❌ **No Process Spawning**: MCP stdio transport not implemented

**Code Evidence:**
```javascript
// From mcp-client.js
async callTool(server, toolName, args) {
  // For now, use fallback mode - direct database queries
  // This provides the same functionality without requiring MCP server processes
  return this.fallbackCall(server, toolName, args);
}
```

**MCP Server Configuration:**
```javascript
const MCP_SERVERS = {
  property: {
    command: 'node',
    args: ['~/scoutgpt-ops/mcp-servers/property-mcp/src/index.js'],
    enabled: process.env.MCP_PROPERTY_ENABLED !== 'false'
  },
  // ... sql, gis servers
};
```

**Findings:**
- MCP server paths point to `~/scoutgpt-ops/mcp-servers/` (external directory)
- Servers are configured but not actually spawned
- All tool calls go through `fallbackCall()` method
- Fallback implementations query database directly

### 4.3 Gap Analysis

**What's Needed for Full MCP Integration:**

1. **Install MCP SDK**
   ```bash
   npm install @modelcontextprotocol/sdk
   ```

2. **Implement MCP Transport**
   - Use `StdioClientTransport` from MCP SDK
   - Spawn MCP server processes
   - Handle process lifecycle (start, stop, restart)

3. **Connect Property-Data MCP**
   - Ensure property-data MCP server exists at configured path
   - Verify it connects to Neon database
   - Test tool calls through MCP protocol

4. **Connect Mapbox MCP**
   - Install/configure Mapbox MCP server
   - Integrate Mapbox tools (search, directions, geocoding)
   - Replace direct Mapbox API calls with MCP tools

5. **Error Handling**
   - Fallback to direct queries if MCP server unavailable
   - Log MCP connection failures
   - Retry logic for transient failures

**Current Workaround:**
- ✅ Functionality works via fallback mode
- ⚠️ Not using actual MCP protocol (no standardization)
- ⚠️ Can't leverage MCP server capabilities (caching, batching, etc.)

---

## SECTION 5: WRITE-BACK SCHEMA DESIGN

### 5.1 Requirements

**Storage Needs:**
1. **Conversation Transcripts**: Store full conversation history for fine-tuning
2. **Per-Parcel Enrichments**: Store Claude-discovered data about parcels
3. **Generated Artifacts**: Track artifacts generated by Claude
4. **Data Provenance**: Track which Claude session generated what data
5. **Training Data Export**: Support JSONL export for fine-tuning

### 5.2 Proposed Schema

**Table 1: `claude_sessions`**
```sql
CREATE TABLE claude_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id TEXT,  -- Links to sessions table
  user_id TEXT,     -- Optional user ID
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  system_prompt TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  message_count INT DEFAULT 0,
  tool_use_count INT DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claude_sessions_session_id ON claude_sessions(session_id);
CREATE INDEX idx_claude_sessions_user_id ON claude_sessions(user_id);
CREATE INDEX idx_claude_sessions_started_at ON claude_sessions(started_at);
```

**Table 2: `claude_messages`**
```sql
CREATE TABLE claude_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  claude_session_id TEXT NOT NULL REFERENCES claude_sessions(id) ON DELETE CASCADE,
  message_index INT NOT NULL,  -- Order within session
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,  -- Full message content
  tool_uses JSONB,  -- Array of tool use blocks (if assistant message)
  tool_results JSONB,  -- Array of tool results (if user message)
  model TEXT,  -- Model used for this message
  tokens_used INT,  -- Token count for this message
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(claude_session_id, message_index)
);

CREATE INDEX idx_claude_messages_session_id ON claude_messages(claude_session_id);
CREATE INDEX idx_claude_messages_role ON claude_messages(role);
CREATE INDEX idx_claude_messages_created_at ON claude_messages(created_at);
```

**Table 3: `parcel_enrichments`**
```sql
CREATE TABLE parcel_enrichments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  parcel_id TEXT NOT NULL,
  claude_session_id TEXT REFERENCES claude_sessions(id) ON DELETE SET NULL,
  enrichment_type TEXT NOT NULL,  -- e.g., 'market_insight', 'zoning_analysis', 'comps'
  enrichment_data JSONB NOT NULL,  -- Flexible schema for different enrichment types
  confidence_score DECIMAL(3, 2),  -- 0.00 to 1.00
  source_tool TEXT,  -- Which tool generated this (e.g., 'analyze_property', 'web_search')
  verified BOOLEAN DEFAULT FALSE,  -- Human-verified flag
  verified_by TEXT,  -- User ID who verified
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_parcel_enrichments_parcel_id ON parcel_enrichments(parcel_id);
CREATE INDEX idx_parcel_enrichments_session_id ON parcel_enrichments(claude_session_id);
CREATE INDEX idx_parcel_enrichments_type ON parcel_enrichments(enrichment_type);
CREATE INDEX idx_parcel_enrichments_verified ON parcel_enrichments(verified);
```

**Table 4: `claude_artifacts`** (extends existing `artifacts` table)
```sql
-- Add Claude-specific fields to existing artifacts table
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS claude_session_id TEXT REFERENCES claude_sessions(id);
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS generated_by_tool TEXT;  -- Tool name that generated it
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS generation_prompt TEXT;  -- User query that triggered generation
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS claude_metadata JSONB;  -- Additional Claude-specific metadata

CREATE INDEX IF NOT EXISTS idx_artifacts_claude_session_id ON artifacts(claude_session_id);
```

**Table 5: `training_export_log`**
```sql
CREATE TABLE training_export_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  export_type TEXT NOT NULL CHECK (export_type IN ('conversation', 'enrichments', 'full')),
  session_ids TEXT[],  -- Array of session IDs included
  date_range_start TIMESTAMPTZ,
  date_range_end TIMESTAMPTZ,
  message_count INT,
  file_path TEXT,  -- Path to exported JSONL file
  file_size_bytes BIGINT,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exported_by TEXT,  -- User ID who triggered export
  metadata JSONB
);

CREATE INDEX idx_training_export_log_exported_at ON training_export_log(exported_at);
CREATE INDEX idx_training_export_log_type ON training_export_log(export_type);
```

### 5.3 Prisma Schema Additions

**Add to `prisma/schema.prisma`:**

```prisma
model ClaudeSession {
  id            String   @id @default(dbgenerated("gen_random_uuid()::text"))
  sessionId     String?  @map("session_id")
  userId        String?  @map("user_id")
  model         String   @default("claude-sonnet-4-20250514")
  systemPrompt  String?  @map("system_prompt") @db.Text
  startedAt     DateTime @default(now()) @map("started_at") @db.Timestamptz(6)
  endedAt       DateTime? @map("ended_at") @db.Timestamptz(6)
  messageCount  Int      @default(0) @map("message_count")
  toolUseCount  Int      @default(0) @map("tool_use_count")
  metadata      Json?
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  messages      ClaudeMessage[]
  enrichments   ParcelEnrichment[]
  artifacts     Artifact[]

  @@index([sessionId], map: "idx_claude_sessions_session_id")
  @@index([userId], map: "idx_claude_sessions_user_id")
  @@index([startedAt], map: "idx_claude_sessions_started_at")
  @@map("claude_sessions")
}

model ClaudeMessage {
  id              String   @id @default(dbgenerated("gen_random_uuid()::text"))
  claudeSessionId String   @map("claude_session_id")
  messageIndex    Int      @map("message_index")
  role            String   // 'user' | 'assistant' | 'system'
  content         String   @db.Text
  toolUses        Json?    @map("tool_uses")
  toolResults     Json?    @map("tool_results")
  model           String?
  tokensUsed      Int?     @map("tokens_used")
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  session         ClaudeSession @relation(fields: [claudeSessionId], references: [id], onDelete: Cascade)

  @@unique([claudeSessionId, messageIndex])
  @@index([claudeSessionId], map: "idx_claude_messages_session_id")
  @@index([role], map: "idx_claude_messages_role")
  @@index([createdAt], map: "idx_claude_messages_created_at")
  @@map("claude_messages")
}

model ParcelEnrichment {
  id              String   @id @default(dbgenerated("gen_random_uuid()::text"))
  parcelId        String   @map("parcel_id")
  claudeSessionId String?  @map("claude_session_id")
  enrichmentType  String   @map("enrichment_type")
  enrichmentData  Json     @map("enrichment_data")
  confidenceScore Decimal? @map("confidence_score") @db.Decimal(3, 2)
  sourceTool      String?  @map("source_tool")
  verified        Boolean  @default(false)
  verifiedBy      String?  @map("verified_by")
  verifiedAt      DateTime? @map("verified_at") @db.Timestamptz(6)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  session         ClaudeSession? @relation(fields: [claudeSessionId], references: [id], onDelete: SetNull)

  @@index([parcelId], map: "idx_parcel_enrichments_parcel_id")
  @@index([claudeSessionId], map: "idx_parcel_enrichments_session_id")
  @@index([enrichmentType], map: "idx_parcel_enrichments_type")
  @@index([verified], map: "idx_parcel_enrichments_verified")
  @@map("parcel_enrichments")
}

model TrainingExportLog {
  id              String   @id @default(dbgenerated("gen_random_uuid()::text"))
  exportType      String   @map("export_type")
  sessionIds      String[] @map("session_ids")
  dateRangeStart  DateTime? @map("date_range_start") @db.Timestamptz(6)
  dateRangeEnd    DateTime? @map("date_range_end") @db.Timestamptz(6)
  messageCount    Int?     @map("message_count")
  filePath        String?  @map("file_path")
  fileSizeBytes   BigInt?  @map("file_size_bytes")
  exportedAt      DateTime @default(now()) @map("exported_at") @db.Timestamptz(6)
  exportedBy      String?  @map("exported_by")
  metadata        Json?

  @@index([exportedAt], map: "idx_training_export_log_exported_at")
  @@index([exportType], map: "idx_training_export_log_type")
  @@map("training_export_log")
}
```

**Update existing `Artifact` model:**
```prisma
model Artifact {
  // ... existing fields ...
  claudeSessionId String?  @map("claude_session_id")
  generatedByTool  String?  @map("generated_by_tool")
  generationPrompt String?  @map("generation_prompt") @db.Text
  claudeMetadata   Json?    @map("claude_metadata")
  claudeSession    ClaudeSession? @relation(fields: [claudeSessionId], references: [id])

  @@index([claudeSessionId], map: "idx_artifacts_claude_session_id")
}
```

### 5.4 JSONL Export Format

**Conversation Export Format:**
```jsonl
{"messages": [{"role": "user", "content": "Find properties in 78758"}, {"role": "assistant", "content": "I found 150 properties..."}], "metadata": {"session_id": "sess_...", "model": "claude-sonnet-4-20250514", "created_at": "2026-01-26T..."}}
{"messages": [{"role": "user", "content": "Analyze parcel 12345"}, {"role": "assistant", "content": "Analysis shows..."}], "metadata": {"session_id": "sess_...", "model": "claude-sonnet-4-20250514", "created_at": "2026-01-26T..."}}
```

**Enrichment Export Format:**
```jsonl
{"parcel_id": "12345", "enrichment_type": "market_insight", "enrichment_data": {"insight": "Property is undervalued", "reasoning": "..."}, "confidence_score": 0.85, "source_tool": "analyze_property", "created_at": "2026-01-26T..."}
```

---

## SECTION 6: BLOCKERS & RECOMMENDATIONS

### 6.1 Critical Blockers

**Blocker 1: Missing Write-Back Schema**
- **Impact**: Cannot store Claude conversations, findings, or training data
- **Severity**: 🔴 CRITICAL
- **Fix**: Implement schema from Section 5.2
- **Effort**: 2-3 days

**Blocker 2: MCP Not Actually Connected**
- **Impact**: Not using standardized MCP protocol, can't leverage MCP server features
- **Severity**: 🟡 HIGH
- **Fix**: Install MCP SDK, implement stdio transport, connect to actual MCP servers
- **Effort**: 3-5 days

**Blocker 3: Missing Sessions Table**
- **Impact**: Session management service will fail on database queries
- **Severity**: 🔴 CRITICAL
- **Fix**: Create `sessions` table migration
- **Effort**: 1 day

**Blocker 4: No Message Persistence**
- **Impact**: Conversations lost on page refresh, can't query past conversations
- **Severity**: 🟡 HIGH
- **Fix**: Implement message storage in `claude_messages` table
- **Effort**: 2-3 days

**Blocker 5: No Training Data Pipeline**
- **Impact**: Can't export conversations for fine-tuning
- **Severity**: 🟡 MEDIUM
- **Fix**: Implement JSONL export endpoint using `training_export_log` table
- **Effort**: 2-3 days

**Blocker 6: White-Label UI Not Ready**
- **Impact**: Frontend still has ScoutGPT branding
- **Severity**: 🟡 MEDIUM
- **Fix**: Replace branding with configurable white-label system
- **Effort**: 3-5 days

### 6.2 Technical Debt

**Code Duplication:**
- ⚠️ Two chat endpoints: `/api/chat` (new) and `/api/ai` (legacy)
- ⚠️ Two Anthropic SDK versions: 0.20.0 (frontend) vs 0.32.1 (backend)
- ⚠️ Multiple chat components: `ScoutTab`, `AIChatPanel`, `ChatDrawerEnhanced`, `ConsolidatedPanel`

**Missing Error Handling:**
- ⚠️ No rate limiting on `/api/chat` endpoint
- ⚠️ No request size limits
- ⚠️ No global error boundary in frontend

**Database Issues:**
- ⚠️ `sessions` table referenced but doesn't exist
- ⚠️ Some GIS tables referenced in code but existence unverified
- ⚠️ No database migrations for write-back schema

**Security Concerns:**
- ⚠️ API keys visible in `.env` file (should use secrets management)
- ⚠️ No authentication middleware (all endpoints public)
- ⚠️ CORS allows all origins in development

### 6.3 Security Concerns

**Critical:**
1. **API Keys in `.env`**: Should use environment variable management (e.g., Render secrets, AWS Secrets Manager)
2. **No Authentication**: All API endpoints are public - anyone can call them
3. **Duplicate API Key**: `CLAUDE_API_KEY` appears twice in `.env` file

**High:**
1. **No Rate Limiting**: `/api/chat` endpoint can be abused
2. **No Request Size Limits**: Could allow large payloads causing DoS
3. **CORS Too Permissive**: Development mode allows all origins

**Medium:**
1. **No Input Validation**: Some endpoints may not validate all inputs
2. **SQL Injection Risk**: Raw queries use parameterized queries (good), but some dynamic SQL construction exists

### 6.4 Recommended Architecture

**Target Architecture Diagram:**

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (White-Label)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Chat UI     │  │  Map View    │  │  Artifacts   │      │
│  │  (React)     │  │  (Mapbox GL) │  │  Viewer      │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                  │               │
│         └─────────────────┼──────────────────┘               │
│                           │                                   │
└───────────────────────────┼───────────────────────────────────┘
                            │ HTTP/REST
┌───────────────────────────┼───────────────────────────────────┐
│                    BACKEND API (Express)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  /api/chat   │  │  /api/artifacts│ │  /api/sessions│     │
│  │  (Claude)    │  │  (Reports)     │  │  (State)     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                  │               │
│         └─────────────────┼──────────────────┘               │
│                           │                                   │
│         ┌─────────────────┼──────────────────┐               │
│         │                 │                  │               │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐        │
│  │  MCP Bridge │  │  Write-Back  │  │  Artifact   │        │
│  │  (MCP SDK)  │  │  Service    │  │  Generator  │        │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘        │
└─────────┼─────────────────┼──────────────────┼───────────────┘
          │                 │                  │
          │ MCP Protocol    │ SQL              │ File Storage
          │                 │                  │
┌─────────┼─────────────────┼──────────────────┼───────────────┐
│         │                 │                  │               │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐        │
│  │  MCP        │  │  PostgreSQL │  │  S3/Local   │        │
│  │  Servers    │  │  (Neon)     │  │  Storage    │        │
│  │             │  │             │  │             │        │
│  │ • Property  │  │ • Parcels    │  │ • PDFs      │        │
│  │ • Mapbox    │  │ • Sessions  │  │ • CSVs      │        │
│  │ • SQL       │  │ • Messages  │  │ • XLSX      │        │
│  │ • GIS       │  │ • Enrichments│  │             │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Key Components:**

1. **Frontend (White-Label)**
   - React-based chat UI (configurable branding)
   - Mapbox GL map integration
   - Artifact viewer/downloader
   - Session management (localStorage + backend sync)

2. **Backend API**
   - `/api/chat` - Claude chat endpoint with tool-use loop
   - `/api/artifacts` - Artifact generation and download
   - `/api/sessions` - Session state management
   - MCP Bridge - Routes tool calls to MCP servers
   - Write-Back Service - Stores conversations, enrichments, artifacts

3. **MCP Servers**
   - Property-Data MCP - Property queries
   - Mapbox MCP - Mapbox API integration
   - SQL MCP - Database queries
   - GIS MCP - GIS operations

4. **Database (PostgreSQL)**
   - Parcel data tables (existing)
   - Claude write-back tables (new)
   - Sessions table (new)
   - Artifacts table (existing, extended)

5. **Storage**
   - S3 or local filesystem for artifact files
   - JSONL exports for training data

---

## RECOMMENDED NEXT STEPS

### Phase 1: Critical Fixes (Week 1)
1. **Create `sessions` table migration** (1 day)
   - Add table to Prisma schema
   - Create migration SQL
   - Run migration on Neon database

2. **Implement write-back schema** (2-3 days)
   - Add Prisma models for `ClaudeSession`, `ClaudeMessage`, `ParcelEnrichment`, `TrainingExportLog`
   - Create migration SQL
   - Update `Artifact` model with Claude fields
   - Run migrations

3. **Update chat endpoint to write messages** (1-2 days)
   - Modify `/api/chat` to create `ClaudeSession` on first message
   - Store each message in `claude_messages` table
   - Link artifacts to `claude_sessions`

### Phase 2: MCP Integration (Week 2)
4. **Install and configure MCP SDK** (1 day)
   - Add `@modelcontextprotocol/sdk` to package.json
   - Update `mcp-client.js` to use actual MCP transport
   - Test connection to property-data MCP server

5. **Connect Mapbox MCP** (2-3 days)
   - Install/configure Mapbox MCP server
   - Replace direct Mapbox API calls with MCP tools
   - Test geocoding, search, directions

6. **Error handling and fallback** (1 day)
   - Implement fallback to direct queries if MCP unavailable
   - Add retry logic for transient failures
   - Log MCP connection status

### Phase 3: Training Data Pipeline (Week 3)
7. **Implement JSONL export** (2-3 days)
   - Create `/api/training/export` endpoint
   - Export conversations in JSONL format
   - Store export metadata in `training_export_log`
   - Support filtering by date range, session IDs

8. **Enrichment export** (1-2 days)
   - Export parcel enrichments in JSONL format
   - Include provenance metadata
   - Support filtering by parcel IDs, enrichment types

### Phase 4: White-Label UI (Week 4)
9. **Remove ScoutGPT branding** (2-3 days)
   - Replace hardcoded "ScoutGPT" strings with configurable branding
   - Add branding configuration file
   - Update UI components to use config

10. **Consolidate chat components** (2-3 days)
    - Choose single chat component (recommend `ConsolidatedPanel`)
    - Remove deprecated components (`ChatDrawerEnhanced`)
    - Update all references

### Phase 5: Security & Performance (Week 5)
11. **Add authentication** (3-5 days)
    - Implement JWT-based authentication
    - Add auth middleware to protected endpoints
    - Update frontend to include auth tokens

12. **Add rate limiting** (1 day)
    - Install `express-rate-limit`
    - Add rate limits to `/api/chat` and other endpoints
    - Configure different limits for authenticated vs anonymous users

13. **Secrets management** (1-2 days)
    - Move API keys to environment variable management
    - Remove `.env` file from repository
    - Update deployment configs

---

## APPENDIX

### A.1 Full File Listings

**Backend Route Files:**
- `src/routes/ai.js` (2157 lines)
- `src/routes/chat.js` (159 lines) - **NEW Claude endpoint**
- `src/routes/parcels.js`
- `src/routes/parcels-search.js`
- `src/routes/parcels-tx.js`
- `src/routes/properties.js`
- `src/routes/gis.js`
- `src/routes/mapservers.js`
- `src/routes/discover.js`
- `src/routes/artifacts.js`
- `src/routes/artifactsV2.js`
- `src/routes/sessions.js`
- `src/routes/dealRooms.js`
- `src/routes/dealroomsV2.js`
- `src/routes/listings.js`
- `src/routes/deals.js`
- `src/routes/tasks.js`
- `src/routes/documents.js`
- `src/routes/export.js`
- `src/routes/osm-pois.js`
- `src/routes/boundaries.js`
- `src/routes/staging.js`
- `src/routes/buyboxes.js`
- `src/routes/geocode.js`
- `src/routes/polygonSearches.js`
- `src/routes/query.js`
- `src/routes/mts.js`

**Frontend Key Files:**
- `src/pages/scout-ai-chat/index.jsx` - Main chat page
- `src/components/layout/tabs/ScoutTab.jsx` - Chat tab
- `src/components/layout/AIChatPanel.jsx` - Chat panel
- `src/components/layout/ConsolidatedPanel.jsx` - Unified panel
- `src/hooks/useChatApi.js` - Chat API hook
- `src/hooks/useChatHistory.js` - Chat history hook
- `src/lib/anthropic.js` - Anthropic client (legacy)

### A.2 Database Schema Dump

**Key Tables (from Prisma schema):**
- `parcel_features_travis` - 858 lines in schema
- `parcels_travis` - Geometry table
- `parcels_travis_enrichment` - Enrichment data
- `opportunities` - Opportunity scoring
- `signals` - Distress signals
- `owners` - Owner entities
- `owner_properties` - Owner-parcel relationships
- `deal_rooms` - Deal room management
- `artifacts` - Generated artifacts (needs Claude fields)

**Missing Tables:**
- `sessions` - Referenced in code, not in schema
- `claude_sessions` - Proposed
- `claude_messages` - Proposed
- `parcel_enrichments` - Proposed
- `training_export_log` - Proposed

### A.3 Environment Variables Reference

**Backend (.env):**
```bash
DATABASE_URL=postgresql://neondb_owner:...@ep-rapid-wind-a4k9miff-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require
NODE_ENV=development
PORT=3001
FRONTEND_URL=https://scoutcrm.netlify.app
CLAUDE_API_KEY=sk-ant-api03-...  # ⚠️ Duplicate entry
REPLICATE_API_TOKEN=r8_...
BRAVE_SEARCH_API_KEY=BSAI...
```

**Frontend (.env):**
```bash
VITE_API_BASE_URL=http://localhost:3001
VITE_ANTHROPIC_API_KEY=...  # May not be used (backend handles Claude)
```

### A.4 Tool Definitions Reference

**Claude Tools (7 total):**
1. `search_properties` - Property search with filters
2. `get_property` - Get property details
3. `analyze_property` - Development feasibility analysis
4. `web_search` - Web search for market news
5. `get_osm_nearby` - Nearby POIs
6. `get_gis_layers` - GIS layer data
7. `generate_artifact` - Generate reports/artifacts

**MCP Tools (Expected but not connected):**
- Property-Data MCP: `get_property`, `search_properties`, `get_enrichment`, `bulk_properties`
- Mapbox MCP: `search`, `directions`, `geocoding`, `static_maps`
- SQL MCP: `execute_query`, `get_table_schema`, `spatial_query`, `list_tables`
- GIS MCP: `spatial_query`, `buffer_geometry`, `get_zoning`, `interpret_zoning`, `get_layer_features`

---

## CONCLUSION

The ScoutGPT platform has a solid foundation with functional Claude integration, comprehensive property data, and a working chat interface. However, critical gaps exist in write-back capabilities, MCP integration, and training data collection that must be addressed to achieve the Claude-native architecture vision.

**Key Takeaways:**
- ✅ Core infrastructure is in place (60% complete)
- ❌ Write-back schema is missing (critical blocker)
- ❌ MCP integration is not actually connected (using fallback mode)
- ❌ White-label UI not ready
- ⚠️ Security improvements needed (auth, rate limiting, secrets management)

**Estimated Timeline to Claude-Native Platform:**
- **Phase 1-2 (Critical Fixes + MCP)**: 2-3 weeks
- **Phase 3-4 (Training Pipeline + White-Label)**: 2-3 weeks
- **Phase 5 (Security & Polish)**: 1-2 weeks
- **Total**: 5-8 weeks to full Claude-native platform

---

**Report Generated:** January 26, 2026  
**Auditor:** AI Assistant (Claude)  
**Next Review:** After Phase 1 completion
