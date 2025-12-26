# FULL SCOPE AUDIT REPORT
**Date:** December 25, 2024  
**Repository:** /Users/braydonirwin/scoutgptpro-backend  
**Purpose:** Complete inventory for query intelligence redesign

---

## 1. BUY BOX STATUS

### Table Structure
- **Table:** `buy_boxes`
- **Status:** ✅ EXISTS
- **Linked to:** `users` table (foreign key: `userId`)
- **Columns:**
  - `id` (text, PK)
  - `userId` (text, FK → users.id)
  - `name` (text)
  - `isActive` (boolean, default: true)
  - `markets` (jsonb) - Market filters
  - `counties` (jsonb) - County filters
  - `propertyTypes` (jsonb) - Property type filters
  - `minSize` / `maxSize` (float) - Size filters
  - `sizeUnit` (text)
  - `minPrice` / `maxPrice` (float) - Price filters
  - `minCap` / `maxCap` (float) - Cap rate filters
  - `zoning` (jsonb) - Zoning filters
  - `minYearBuilt` (integer)
  - `filters` (jsonb) - Additional filters
  - `createdAt` / `updatedAt` (timestamps)

### Current State
- **Records:** 0 (empty table)
- **Purpose:** User-defined property search criteria (buy boxes)
- **Integration:** Ready for use, linked to User model

---

## 2. GIS INVENTORY

### MapServer Registry

**Total Entries:** 416 MapServers

**Breakdown by Category:**
| Category | Count | % of Total |
|----------|-------|------------|
| Buildings | 87 | 20.9% |
| Water Utilities | 86 | 20.7% |
| Floodplain | 79 | 19.0% |
| Sewer Utilities | 63 | 15.1% |
| Gas Utilities | 42 | 10.1% |
| Wetlands | 16 | 3.8% |
| Parcels | 15 | 3.6% |
| Final Extraction | 15 | 3.6% |
| Permits | 7 | 1.7% |
| Zoning | 6 | 1.4% |

**Key GIS Layers Available:**
- **Zoning:** 6 layers (Austin zoning districts)
- **Floodplain:** 79 layers (FEMA flood zones, floodplains)
- **Permits:** 7 layers (building permits, development permits)
- **Parcels:** 15 layers (property boundaries, cadastral)
- **Utilities:** 191 layers total
  - Water: 86 layers (water mains, fire hydrants, water meters)
  - Sewer: 63 layers (sewer mains, manholes)
  - Gas: 42 layers (gas mains, service lines)
- **Buildings:** 87 layers (building footprints, structures)
- **Environmental:** 16 wetlands layers

### Layer Sets

**Total Layer Sets:** 32
- Grouped by category
- Each set contains multiple related layers
- Used for organized layer management

### GIS Layers Table

**Status:** ✅ EXISTS (empty)
- Stores custom GIS layer configurations
- Fields: name, category, sourceType, sourceUrl, style, zoom levels
- Ready for custom layer management

### Hardcoded Canonical Layers (in gis.js)

The system has hardcoded canonical layer mappings:
- `zoning_districts` → Austin Zoning MapServer
- `fema_flood_zones` → FEMA Flood Zones
- `sewer_mains` → Pape-Dawson Sewer
- `sewer_manholes` → Horrocks Engineering
- `water_mains` → Austin Water
- `fire_hydrants` → Austin Water
- `water_meters` → Austin Water
- `wetland_types` → Austin Environmental
- `building_permits` → Austin Permits
- `parcel_boundaries` → Austin Parcels
- `gas_mains` → Austin Gas

**Note:** These are hardcoded in `src/routes/gis.js` and should be moved to database or config.

---

## 3. PROPERTY DATA

### Total Count
- **Properties:** 352,431

### Field Population Statistics

| Field | Count | % Populated |
|-------|-------|-------------|
| **siteAddress** | 349,097 | **99.05%** ✅ |
| **siteZip** | 342,422 | 97.16% ✅ |
| **siteCity** | 182,662 | 51.85% ⚠️ |
| **owner** | 352,431 | 100% ✅ |
| **isAbsentee** (true) | 3,742 | 1.06% |
| **isTaxDelinquent** (true) | 1,155 | 0.33% |
| **isVacantLand** (true) | 352,431 | 100% (all marked as vacant land) |
| **mktValue** | 0 | 0% ❌ |
| **appraisedValue** | 0 | 0% ❌ |
| **acres** | 352,431 | 100% ✅ |
| **propertyType** | 352,431 | 100% ✅ |
| **motivationScore** | 352,431 | 100% ✅ |
| **totalTax** | 331,319 | 94.00% ✅ |
| **totalDue** | 331,319 | 94.00% ✅ |
| **latitude/longitude** | 352,431 | 100% ✅ |

### Property Types

**Current State:** All properties marked as `land` (352,431)
- **Issue:** Property type detection needs improvement
- **Expected:** Mix of residential, commercial, industrial, land

### Geographic Coverage

**Top 20 ZIP Codes:**
- 78660 (Pflugerville): 33,064 properties
- 78653 (Leander): 16,281 properties
- 78745 (Austin): 14,570 properties
- 78645 (Georgetown): 14,276 properties
- 78748 (Austin): 13,610 properties
- ... (20 total ZIPs shown)

**Top 20 Cities:**
- AUSTIN: 117,403 properties
- PFLUGERVILLE: 17,231 properties
- Austin (mixed case): 12,414 properties
- LEANDER: 5,946 properties
- MANOR: 5,077 properties
- ... (20 total cities shown)

**Coverage:** Primarily Travis County, Texas (Austin metro area)

---

## 4. SERVICES ARCHITECTURE

### Service Files

**Location:** `src/services/`

1. **property-service.js** (19,095 bytes)
   - `queryProperties()` - Queries properties from parcel chunks
   - `parseQueryCriteria()` - Extracts criteria from natural language
   - `calculateMotivationScore()` - Scores properties (0-100)
   - `getOpportunityFlags()` - Identifies opportunity flags
   - `needsPropertyData()` - Determines if query needs property data
   - **Data Source:** Parcel chunk files (GeoJSON), not database

2. **mapserver-service.js** (3,738 bytes)
   - `searchMapServers()` - Searches MapServer registry
   - Fetches GeoJSON features from ArcGIS MapServers
   - Updates query statistics
   - Handles bounds filtering

3. **category-mapper.js** (4,108 bytes)
   - `extractCategories()` - Maps query keywords to MapServer categories
   - Categories: Zoning, Parcels, Floodplain, Sewer/Water/Gas Utilities, etc.
   - Helper functions for infrastructure/regulatory queries

### Route Files

**Location:** `src/routes/`

1. **ai.js** (10,448 bytes)
   - `POST /api/ai/query` - Main AI query endpoint
   - Integrates MapServer and property data
   - Uses Claude API (claude-sonnet-4-20250514)
   - Returns properties, overlays, pins, insights

2. **properties.js** (3,869 bytes)
   - `POST /api/properties/search` - Property search
   - Requires bbox (bounding box)
   - Filters: propertyType, price, acres, absenteeOwner, etc.
   - Uses Prisma with raw SQL queries

3. **mapservers.js** (4,531 bytes)
   - `GET /api/mapservers/categories` - Get categories
   - `GET /api/mapservers/layer-sets` - Get layer sets
   - `GET /api/mapservers/search` - Search MapServers
   - `POST /api/mapservers/search` - AI-powered search

4. **gis.js** (5,811 bytes)
   - `GET /api/gis/layers` - Get GIS layers
   - `POST /api/gis/layers` - Handle layer toggle
   - Hardcoded canonical layer mappings

5. **query.js** (5,523 bytes)
   - `POST /api/query/polygon` - Query properties within polygon
   - Uses PostGIS for spatial queries
   - Supports filters (price, acres, property type, etc.)

6. **parcels.js** (12,451 bytes)
   - Parcel data endpoints
   - Chunk-based parcel loading

7. **listings.js** (12,411 bytes)
   - Property listing management

8. **geocode.js** (4,193 bytes)
   - Geocoding endpoints

9. **polygonSearches.js** (6,170 bytes)
   - Polygon search management

### Utils Files

**Location:** `src/utils/`

1. **polygonSearchNames.js** (1,619 bytes)
   - Polygon search naming utilities

**Missing:** No query routing or intent classification in backend utils

---

## 5. API INTEGRATIONS

### External APIs Used

1. **Anthropic Claude API** ✅
   - Model: `claude-sonnet-4-20250514`
   - Used in: `src/routes/ai.js`
   - Status: Configured (CLAUDE_API_KEY)
   - Purpose: AI-powered query analysis

2. **ArcGIS MapServers** ✅
   - Public APIs (no keys needed)
   - Sources:
     - Austin Maps (zoning, environmental, water, gas, permits, parcels)
     - Travis County TCAD (property boundaries)
     - Horrocks Engineering (general services)
     - Pape-Dawson (land development)
   - Status: Active, 416 MapServers registered

3. **OpenStreetMap Nominatim** ✅
   - Used in: `src/routes/geocode.js`
   - Purpose: Reverse geocoding
   - Status: Public API (no keys needed)

4. **Mapbox** ⚠️
   - Used in: Frontend only
   - Backend: No direct integration
   - Status: Frontend handles map rendering

### Missing Integrations

- **ATTOM Data** ❌ - Not integrated
- **AVM/Valuation APIs** ❌ - Not integrated
- **Property Valuation Services** ❌ - Not integrated

### Environment Variables

**Current (.env):**
- `DATABASE_URL` - PostgreSQL connection
- `FRONTEND_URL` - Frontend URL
- `NODE_ENV` - Environment
- `PORT` - Server port

**Missing from .env:**
- `CLAUDE_API_KEY` - Should be in .env.local (configured)

---

## 6. QUERY LOGIC CURRENT STATE

### Frontend Query Logic

**Location:** `/Users/braydonirwin/scoutgpt_9461/src/utils/`

1. **queryRouter.js** ✅
   - Routes classified intents to correct endpoints
   - Uses `classifyIntent()` from `intentClassifier.js`
   - Uses `resolveGeography()` from `geographyResolver.js`
   - Intent types:
     - `GIS_LAYER_TOGGLE` - Toggle GIS layers
     - `PROPERTY_SEARCH` - Search properties
     - `HYBRID_SPATIAL_QUERY` - Combined GIS + property search

2. **intentClassifier.js** ✅
   - Classifies user queries into intent types
   - Extracts property filters
   - Identifies GIS layer requests
   - Determines geography from text

3. **geographyResolver.js** ✅
   - Resolves geography text to bbox
   - Gets bbox from viewport
   - Gets bbox from polygon

4. **gisDataFetcher.js** ✅
   - Fetches GIS layer data from ArcGIS MapServers
   - Handles polygon filtering
   - Converts to GeoJSON

### Backend Query Logic

**Current State:**
- **No centralized intent classification** ❌
- **No query router** ❌
- **Property service** queries parcel chunks (not database)
- **AI route** handles queries but no structured intent system
- **GIS route** has hardcoded canonical layers

**Query Flow:**
1. Frontend classifies intent
2. Frontend routes to appropriate endpoint
3. Backend endpoints handle queries independently
4. No unified query processing layer

---

## 7. GAPS IDENTIFIED

### Critical Gaps

1. **Property Data Source Mismatch**
   - **Issue:** `property-service.js` queries parcel chunks (GeoJSON files), not database
   - **Impact:** Can't use enriched database properties (349,097 with siteAddress)
   - **Fix Needed:** Update property-service to query PostgreSQL database

2. **Missing Market Value Data**
   - **Issue:** `mktValue` and `appraisedValue` fields are 0% populated
   - **Impact:** Can't filter/search by price
   - **Fix Needed:** Integrate valuation API or import market value data

3. **Property Type Detection**
   - **Issue:** All properties marked as `land` (100%)
   - **Impact:** Can't filter by property type accurately
   - **Fix Needed:** Improve property type detection logic

4. **No Intent Classification in Backend**
   - **Issue:** Intent classification only in frontend
   - **Impact:** Backend can't intelligently route queries
   - **Fix Needed:** Move or duplicate intent classification to backend

5. **Hardcoded GIS Layers**
   - **Issue:** Canonical layers hardcoded in `gis.js`
   - **Impact:** Can't dynamically manage layers
   - **Fix Needed:** Move to database or config file

6. **No Query Router in Backend**
   - **Issue:** Each route handles queries independently
   - **Impact:** No unified query processing
   - **Fix Needed:** Create backend query router

7. **Buy Boxes Not Used**
   - **Issue:** Buy boxes table exists but empty, not integrated
   - **Impact:** Can't use user-defined search criteria
   - **Fix Needed:** Integrate buy boxes into property search

8. **No ATTOM/AVM Integration**
   - **Issue:** No property valuation or market data APIs
   - **Impact:** Limited property analysis capabilities
   - **Fix Needed:** Integrate valuation APIs

### Medium Priority Gaps

9. **City Data Inconsistency**
   - **Issue:** Mixed case city names (AUSTIN vs Austin)
   - **Impact:** Filtering by city may miss results
   - **Fix Needed:** Normalize city names

10. **Property Service Uses Chunks**
    - **Issue:** Queries GeoJSON chunk files instead of database
    - **Impact:** Slower, can't use database indexes
    - **Fix Needed:** Migrate to database queries

11. **No Query Caching**
    - **Issue:** No caching layer for frequent queries
    - **Impact:** Slower response times
    - **Fix Needed:** Add Redis or in-memory caching

12. **No Query Analytics**
    - **Issue:** No tracking of query patterns
    - **Impact:** Can't optimize based on usage
    - **Fix Needed:** Add query logging/analytics

---

## 8. RECOMMENDATIONS FOR QUERY INTELLIGENCE REDESIGN

### Phase 1: Fix Data Source

1. **Update property-service.js**
   - Change from parcel chunks to PostgreSQL database
   - Use Prisma queries instead of file reading
   - Leverage database indexes for performance

2. **Fix Property Type Detection**
   - Use `impValue` to determine if land vs improved
   - Use `zoning` field for property type hints
   - Update property type calculation logic

3. **Import Market Value Data**
   - Integrate ATTOM or similar API
   - Or import from TCAD data
   - Populate `mktValue` and `appraisedValue` fields

### Phase 2: Backend Query Intelligence

1. **Create Backend Intent Classifier**
   - Port or duplicate frontend intent classification
   - Support: PROPERTY_SEARCH, GIS_LAYER, HYBRID, COMPS, SITE_ANALYSIS

2. **Create Backend Query Router**
   - Unified query processing layer
   - Routes to appropriate services
   - Handles query optimization

3. **Move Canonical Layers to Database**
   - Store canonical layer mappings in database
   - Allow dynamic layer management
   - Remove hardcoded mappings

### Phase 3: Enhanced Features

1. **Integrate Buy Boxes**
   - Use buy boxes for user-specific search criteria
   - Auto-apply buy box filters to queries
   - Support multiple buy boxes per user

2. **Add Query Caching**
   - Cache frequent queries
   - Cache GIS layer data
   - Cache property search results

3. **Add Query Analytics**
   - Track query patterns
   - Monitor performance
   - Identify optimization opportunities

### Phase 4: Advanced Intelligence

1. **Machine Learning Integration**
   - Learn from user query patterns
   - Improve intent classification
   - Optimize search results ranking

2. **Natural Language Understanding**
   - Enhanced query parsing
   - Multi-intent queries
   - Context-aware responses

---

## SUMMARY STATISTICS

### Database
- **Total Tables:** 16
- **Total Properties:** 352,431
- **Enriched Properties:** 349,097 (99.05%)
- **Database Size:** 271 MB (local)

### GIS Infrastructure
- **MapServers:** 416
- **Layer Sets:** 32
- **Categories:** 10
- **Canonical Layers:** 11 (hardcoded)

### Services
- **Service Files:** 3
- **Route Files:** 9
- **Utils Files:** 1

### API Integrations
- **Claude API:** ✅ Configured
- **ArcGIS:** ✅ 416 MapServers
- **Nominatim:** ✅ Configured
- **ATTOM:** ❌ Not integrated
- **AVM:** ❌ Not integrated

### Query Logic
- **Frontend Intent Classification:** ✅ Exists
- **Backend Intent Classification:** ❌ Missing
- **Frontend Query Router:** ✅ Exists
- **Backend Query Router:** ❌ Missing
- **Property Service:** ⚠️ Uses chunks, not database

---

**Report Generated:** December 25, 2024  
**Next Steps:** Review gaps and prioritize redesign tasks

