# PHASE 5C PRE-IMPLEMENTATION AUDIT
**Date:** January 27, 2026  
**Purpose:** Document external data architecture, artifact generation, and identify gaps before Phase 5C implementation

---

## EXECUTIVE SUMMARY

**Overall Status:** ✅ **FOUNDATION EXISTS** - Core external data integrations and artifact generation are implemented, but gaps exist for Phase 5C requirements.

**Key Findings:**
- ✅ **Brave Search API** - Fully implemented and working
- ✅ **Nominatim (OSM)** - Reverse geocoding implemented
- ✅ **OSM POIs** - Database table exists, tool implemented
- ✅ **Artifact Generation** - 6 types implemented (PDF, XLSX, CSV)
- ⚠️ **Missing External APIs** - No Census, Walk Score, Crime, School Ratings, Google APIs
- ⚠️ **GIS Tables** - Referenced in code but existence unverified
- ⚠️ **Map Rendering** - GeoJSON structure defined but frontend expectations unclear

**Critical Gaps:**
1. No Census Bureau API integration
2. No Walk Score API integration
3. No Crime data API integration
4. No School Ratings API integration
5. No Google Street View or Places API
6. GIS layer tables (flood_zones, utility_sewer, etc.) existence unverified
7. No demographic data storage tables

---

## 1. EXTERNAL DATA TOOLS

### 1.1 Working Integrations

| Tool | API | Env Var | Location | Status | Data Returned |
|------|-----|---------|----------|--------|---------------|
| **web_search** | Brave Search API | `BRAVE_SEARCH_API_KEY` | `src/services/webSearch/index.js` | ✅ Working | Web search results (title, URL, description, published date) |
| **get_osm_nearby** | OpenStreetMap (local DB) | None | `src/tools/handlers.js:200` | ✅ Working | POIs within radius (restaurants, retail, transit, schools, parks, hospitals, banks, grocery) |
| **Reverse Geocoding** | Nominatim (OSM) | None | `src/routes/geocode.js` | ✅ Working | Location name, address components, coordinates |

**Details:**

**Brave Search API:**
- **Endpoint:** `https://api.search.brave.com/res/v1/web/search`
- **Authentication:** `X-Subscription-Token` header
- **Rate Limit:** 20 results per query
- **Pricing:** $0.005 per query
- **Features:**
  - Web search with freshness filters (pd, pw, pm, py)
  - Market data search (`searchMarketData()`)
  - Property-specific search (`searchPropertyInfo()`)
  - Property enrichment (`enrichPropertyWithWeb()`)
- **Exposed As:** Claude tool `web_search`
- **Status:** ✅ Fully functional

**OSM POIs:**
- **Source:** Local database table `osm_pois_travis` (~50K+ rows)
- **Categories:** restaurant, retail, transit, school, park, hospital, bank, grocery
- **Query Method:** PostGIS spatial queries (`ST_DWithin`)
- **Exposed As:** Claude tool `get_osm_nearby`
- **Status:** ✅ Fully functional

**Nominatim Reverse Geocoding:**
- **Endpoint:** `https://nominatim.openstreetmap.org/reverse`
- **Authentication:** User-Agent header (required)
- **Rate Limits:** Yes (not documented, but has timeout/fallback)
- **Features:**
  - Reverse geocoding (lat/lng → address)
  - Location name extraction (neighborhood, suburb, city)
- **Exposed As:** API endpoint `GET /api/geocode/reverse`
- **Status:** ✅ Functional with fallback on errors

### 1.2 Broken/Partial Integrations

| Tool | Issue | Fix Needed |
|------|-------|------------|
| **GIS Layers** | Tables referenced but existence unverified | Verify table existence: `flood_zones`, `utility_sewer`, `utility_water`, `building_footprints`, `wetlands`, `building_permits` |
| **Census Tract Filter** | Code references `census_tracts` table but table not found in schema | Create `census_tracts` table or remove filter |

**Details:**

**GIS Layer Tables:**
- **Referenced In:** `src/tools/handlers.js:307` (`getGisLayers()`)
- **Tables Referenced:**
  - `zoning_districts` ✅ (exists in schema)
  - `flood_zones` ⚠️ (not found in schema)
  - `utility_sewer` ⚠️ (not found in schema)
  - `utility_water` ⚠️ (not found in schema)
  - `building_footprints` ⚠️ (not found in schema)
  - `wetlands` ⚠️ (not found in schema)
  - `building_permits` ⚠️ (not found in schema)
- **Code Has:** Existence checks before querying (good)
- **Status:** ⚠️ Partial - Only `zoning_districts` confirmed to exist

**Census Tract Filter:**
- **Referenced In:** `src/routes/ai.js:1122`, `src/services/pipeline/attributeMapper.js:127`
- **Table:** `census_tracts` (not found in schema)
- **Status:** ⚠️ Broken - Code references non-existent table

### 1.3 Missing Integrations

| Tool | Priority | API Required | Use Case |
|------|----------|--------------|----------|
| **Census Data** | HIGH | Census Bureau API | Demographic data (population, income, education, age) |
| **Walk Score** | HIGH | Walk Score API | Walkability scores for properties |
| **Crime Data** | MEDIUM | Crime Data API (FBI, local PD) | Crime statistics by area |
| **School Ratings** | MEDIUM | GreatSchools API or Niche API | School quality ratings |
| **Google Street View** | LOW | Google Street View Static API | Street view images |
| **Google Places** | LOW | Google Places API | Nearby businesses, reviews |
| **Demographic Enrichment** | HIGH | Multiple (Census, ACS) | Income, education, age demographics |

**Details:**

**Census Bureau API:**
- **Priority:** HIGH
- **API:** `https://api.census.gov/data/`
- **Data Needed:**
  - Population by census tract
  - Median household income
  - Education levels
  - Age distribution
  - Housing characteristics
- **Use Case:** Property analysis, market research
- **Implementation:** New Claude tool `get_census_data`

**Walk Score API:**
- **Priority:** HIGH
- **API:** `https://api.walkscore.com/score`
- **Data Needed:**
  - Walk Score (0-100)
  - Transit Score
  - Bike Score
- **Use Case:** Property walkability assessment
- **Implementation:** New Claude tool `get_walk_score`

**Crime Data:**
- **Priority:** MEDIUM
- **APIs:** FBI UCR, local police department APIs
- **Data Needed:**
  - Crime rates by area
  - Crime types
  - Historical trends
- **Use Case:** Safety assessment
- **Implementation:** New Claude tool `get_crime_data`

**School Ratings:**
- **Priority:** MEDIUM
- **APIs:** GreatSchools API, Niche API
- **Data Needed:**
  - School ratings (1-10)
  - Test scores
  - Student-teacher ratios
- **Use Case:** Family-friendly property analysis
- **Implementation:** New Claude tool `get_school_ratings`

**Google APIs:**
- **Priority:** LOW
- **APIs:** Street View Static API, Places API
- **Data Needed:**
  - Street view images
  - Nearby businesses
  - Reviews and ratings
- **Use Case:** Visual property assessment
- **Implementation:** Optional enhancement

---

## 2. ARTIFACT GENERATION

### 2.1 Current Capabilities

| Type | Format | Library | Status | Data Sources | Storage |
|------|--------|---------|--------|--------------|---------|
| **CSV Export** | CSV | Custom (csv-parse) | ✅ Working | `parcel_features_travis` | Local filesystem |
| **Acquisition Report** | PDF | pdfkit | ✅ Working | Property data | Local filesystem |
| **Site Analysis** | PDF | pdfkit | ✅ Working | Property data | Local filesystem |
| **Underwriting Model** | XLSX | exceljs | ✅ Working | Property data | Local filesystem |
| **Comp Analysis** | XLSX | exceljs | ✅ Working | Property data | Local filesystem |
| **Development Analysis** | PDF | pdfkit | ✅ Working | Property + analysis data | Local filesystem |

**Details:**

**CSV Generator** (`src/services/artifacts/csvGenerator.js`):
- **Columns:** 15 default columns (parcel_id, address, owner, acres, values, etc.)
- **Features:** Custom column selection, number formatting, currency formatting
- **Status:** ✅ Fully functional

**PDF Generators** (`src/services/artifacts/pdfGenerator.js`):
- **Acquisition Report:** Property details, valuation, ownership info
- **Site Analysis:** Property analysis with recommendations
- **Library:** `pdfkit@0.17.2`
- **Status:** ✅ Fully functional

**XLSX Generators** (`src/services/artifacts/xlsxGenerator.js`):
- **Underwriting Model:** Multi-sheet workbook (Summary, Assumptions, Cash Flow, Returns)
- **Comp Analysis:** Comparison tables
- **Library:** `exceljs@4.4.0`
- **Status:** ✅ Fully functional

**Development Analysis** (`src/services/artifacts/generators/developmentAnalysis.js`):
- **Format:** PDF
- **Data Sources:** Property data + development feasibility analysis
- **Features:** Constraints, opportunities, recommendations
- **Status:** ✅ Fully functional

**Artifact Service** (`src/services/artifacts/index.js`):
- **Storage:** Local filesystem (`/tmp/scoutgpt-artifacts` or configurable)
- **Database:** `artifacts` table tracks all artifacts
- **Features:**
  - Create, get, download, regenerate, list, delete
  - Checksum verification
  - Download count tracking
  - Regeneration support
- **Status:** ✅ Fully functional

**Claude Tool Integration:**
- **Tool:** `generate_artifact` in `src/tools/handlers.js:416`
- **Types Supported:**
  - `development_analysis` → `development_analysis`
  - `acquisition_report` → `acquisition_report`
  - `property_comparison` → `comp_analysis`
  - `market_analysis` → `site_analysis`
- **Output:** Returns artifact object with `artifact_id`, `downloadUrl`, `reactComponent`, `data`
- **Status:** ✅ Fully functional

### 2.2 Missing Capabilities

| Type | Priority | Implementation Notes |
|------|----------|---------------------|
| **HTML Reports** | MEDIUM | Generate HTML reports for web viewing (currently PDF/XLSX only) |
| **DOCX Reports** | LOW | Word document generation (requires `docx` library) |
| **Interactive Dashboards** | HIGH | React-based interactive artifact viewer (partially implemented via `reactComponent`) |
| **Multi-Property Comparison** | MEDIUM | Enhanced comparison reports with charts |
| **Market Analysis Reports** | HIGH | Comprehensive market analysis with external data integration |
| **Zoning Analysis Reports** | HIGH | Detailed zoning analysis with regulations and constraints |

**Details:**

**HTML Reports:**
- **Priority:** MEDIUM
- **Library Needed:** HTML template engine (Handlebars, EJS, or React SSR)
- **Use Case:** Web-viewable reports without download
- **Implementation:** Add HTML generator to artifact service

**Interactive Dashboards:**
- **Priority:** HIGH
- **Status:** Partially implemented (returns `reactComponent` name)
- **Gap:** Frontend components may not exist
- **Implementation:** Verify frontend components exist, or create them

**Market Analysis Reports:**
- **Priority:** HIGH
- **Data Sources Needed:** Census, Walk Score, Crime, School Ratings
- **Implementation:** Integrate external data APIs, create report template

**Zoning Analysis Reports:**
- **Priority:** HIGH
- **Data Sources:** `zoning_districts` table, zoning regulations database
- **Implementation:** Create zoning analysis generator with constraint mapping

---

## 3. MAP DATA RENDERING

### 3.1 Current Data Flow

**Chat Endpoint → Map:**
1. User sends message → `POST /api/chat`
2. Claude tool `search_properties` or `get_gis_layers` returns GeoJSON
3. Tool result checked for `type === 'FeatureCollection'`
4. If FeatureCollection, captured as `mapData`
5. `mapData` included in response: `{ message, mapData, artifact, ... }`
6. Frontend receives `mapData` and renders on map

**Code Location:** `src/routes/chat.js:126-174`

**GeoJSON Structure:**
```javascript
{
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        parcel_id: '...',
        address: '...',
        acres: 1.5,
        market_value: 500000,
        // ... other properties
      }
    }
  ],
  metadata: {
    count: 10,
    query_filters: { ... }
  }
}
```

**Tools That Return GeoJSON:**
- `search_properties` - Returns FeatureCollection with parcel centroids
- `get_gis_layers` - Returns FeatureCollection with GIS layer geometries
- `get_osm_nearby` - Returns POIs array (not GeoJSON, but has geometry)

### 3.2 Existing Overlay Layers

| Layer | Source | Data | Status |
|-------|--------|------|--------|
| **Parcels** | `parcels_travis` | Polygon geometries | ✅ Working |
| **Parcel Centroids** | `parcel_features_travis.geom_centroid` | Point geometries | ✅ Working |
| **OSM POIs** | `osm_pois_travis` | Point geometries | ✅ Working |
| **Zoning Districts** | `zoning_districts` | Polygon geometries | ✅ Working |
| **Flood Zones** | `flood_zones` (unverified) | Polygon geometries | ⚠️ Unverified |
| **Sewer Mains** | `utility_sewer` (unverified) | Line geometries | ⚠️ Unverified |
| **Water Mains** | `utility_water` (unverified) | Line geometries | ⚠️ Unverified |
| **Building Footprints** | `building_footprints` (unverified) | Polygon geometries | ⚠️ Unverified |
| **Wetlands** | `wetlands` (unverified) | Polygon geometries | ⚠️ Unverified |
| **Building Permits** | `building_permits` (unverified) | Point geometries | ⚠️ Unverified |

**Details:**

**Confirmed Layers:**
- **Parcels:** `parcels_travis` table with `geom` column (polygon)
- **Parcel Centroids:** `parcel_features_travis.geom_centroid` (point)
- **OSM POIs:** `osm_pois_travis` table with `geom` column (point)
- **Zoning Districts:** `zoning_districts` table with `geometry` column (polygon)

**Unverified Layers:**
- Referenced in `get_gis_layers` tool but tables not found in Prisma schema
- Code includes existence checks before querying (good defensive programming)
- Need to verify table existence or create migration

### 3.3 Missing Layers

| Layer | Data Source | Priority | Implementation Notes |
|-------|-------------|----------|---------------------|
| **Census Tracts** | Census Bureau API | HIGH | Create `census_tracts` table, import boundaries |
| **School Districts** | TEA or local data | MEDIUM | Create `school_districts` table |
| **Crime Heatmap** | Crime API | MEDIUM | Create `crime_incidents` table or use API directly |
| **Walk Score Zones** | Walk Score API | HIGH | Create `walk_score_zones` table or use API directly |
| **Demographic Overlays** | Census API | HIGH | Create `demographic_zones` table |

**Details:**

**Census Tracts:**
- **Priority:** HIGH
- **Data Source:** Census Bureau TIGER/Line Shapefiles
- **Implementation:** Import census tract boundaries, create `census_tracts` table
- **Use Case:** Demographic analysis, market research

**School Districts:**
- **Priority:** MEDIUM
- **Data Source:** Texas Education Agency (TEA) or local GIS
- **Implementation:** Import school district boundaries
- **Use Case:** Family-friendly property analysis

**Crime Heatmap:**
- **Priority:** MEDIUM
- **Data Source:** FBI UCR or local police department APIs
- **Implementation:** Aggregate crime data by area, create heatmap layer
- **Use Case:** Safety assessment

**Walk Score Zones:**
- **Priority:** HIGH
- **Data Source:** Walk Score API
- **Implementation:** Store walk scores by location, create color-coded zones
- **Use Case:** Walkability assessment

---

## 4. DATABASE TABLES

### 4.1 External Data Tables

| Table | Rows | Purpose | Status |
|-------|------|---------|--------|
| **osm_pois_travis** | ~50K+ | OpenStreetMap points of interest | ✅ Exists |
| **zoning_districts** | Unknown | Zoning polygon boundaries | ✅ Exists |
| **parcel_enrichments** | Unknown | Claude-discovered enrichments | ✅ Exists |
| **flood_zones** | Unknown | FEMA flood zone polygons | ⚠️ Referenced, not in schema |
| **utility_sewer** | Unknown | Sewer main lines | ⚠️ Referenced, not in schema |
| **utility_water** | Unknown | Water main lines | ⚠️ Referenced, not in schema |
| **building_footprints** | Unknown | Building footprint polygons | ⚠️ Referenced, not in schema |
| **wetlands** | Unknown | Wetland boundaries | ⚠️ Referenced, not in schema |
| **building_permits** | Unknown | Building permit locations | ⚠️ Referenced, not in schema |
| **census_tracts** | 0 | Census tract boundaries | ❌ Referenced, doesn't exist |

**Details:**

**osm_pois_travis:**
- **Schema:** `prisma/schema.prisma:795`
- **Columns:** id, osm_id, name, category, subcategory, latitude, longitude, address, geom, etc.
- **Indexes:** GIST on `geom`, indexes on category, osm_id, property_id
- **Status:** ✅ Fully implemented

**zoning_districts:**
- **Schema:** `prisma/schema.prisma:1533`
- **Columns:** id, zoning_code, zoning_desc, overlay, geometry, raw_attributes
- **Indexes:** GIST on `geometry`, indexes on zoning_code, overlay
- **Status:** ✅ Fully implemented

**parcel_enrichments:**
- **Schema:** `prisma/schema.prisma:1751`
- **Purpose:** Store Claude-discovered enrichments
- **Columns:** id, parcelId, claudeSessionId, enrichmentType, enrichmentData, confidenceScore, sourceTool, verified
- **Status:** ✅ Fully implemented

**Unverified Tables:**
- Referenced in `get_gis_layers` tool but not in Prisma schema
- Code checks for existence before querying (good)
- Need to verify existence or create migrations

### 4.2 Missing Tables

| Table | Purpose | Schema Needed |
|-------|---------|---------------|
| **census_tracts** | Census tract boundaries and demographics | `id`, `tract_code`, `geometry`, `population`, `median_income`, `education_levels`, etc. |
| **demographic_zones** | Aggregated demographic data by zone | `id`, `zone_type`, `geometry`, `demographic_data` (JSONB) |
| **walk_scores** | Walk Score data by location | `id`, `latitude`, `longitude`, `walk_score`, `transit_score`, `bike_score`, `geometry` |
| **crime_incidents** | Crime incident locations | `id`, `incident_type`, `latitude`, `longitude`, `date`, `geometry` |
| **school_districts** | School district boundaries | `id`, `district_name`, `geometry`, `school_count`, `avg_rating` |
| **school_ratings** | Individual school ratings | `id`, `school_name`, `district_id`, `latitude`, `longitude`, `rating`, `test_scores`, `geometry` |

**Details:**

**census_tracts:**
- **Priority:** HIGH
- **Schema:**
  ```sql
  CREATE TABLE census_tracts (
    id SERIAL PRIMARY KEY,
    tract_code VARCHAR(20) UNIQUE,
    geometry GEOMETRY(POLYGON, 4326),
    population INTEGER,
    median_income DECIMAL,
    education_levels JSONB,
    age_distribution JSONB,
    housing_characteristics JSONB
  );
  CREATE INDEX idx_census_tracts_geom ON census_tracts USING GIST(geometry);
  ```

**walk_scores:**
- **Priority:** HIGH
- **Schema:**
  ```sql
  CREATE TABLE walk_scores (
    id SERIAL PRIMARY KEY,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    walk_score INTEGER,
    transit_score INTEGER,
    bike_score INTEGER,
    geometry GEOMETRY(POINT, 4326),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX idx_walk_scores_geom ON walk_scores USING GIST(geometry);
  ```

**crime_incidents:**
- **Priority:** MEDIUM
- **Schema:**
  ```sql
  CREATE TABLE crime_incidents (
    id SERIAL PRIMARY KEY,
    incident_type VARCHAR(50),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    incident_date DATE,
    geometry GEOMETRY(POINT, 4326)
  );
  CREATE INDEX idx_crime_incidents_geom ON crime_incidents USING GIST(geometry);
  CREATE INDEX idx_crime_incidents_date ON crime_incidents(incident_date);
  ```

---

## 5. ENVIRONMENT VARIABLES

### 5.1 Configured

| Var | Service | Has Value | Status |
|-----|---------|-----------|--------|
| **BRAVE_SEARCH_API_KEY** | Brave Search API | ✅ Yes | ✅ Working |
| **CLAUDE_API_KEY** | Anthropic Claude API | ✅ Yes (duplicate) | ✅ Working |
| **REPLICATE_API_TOKEN** | Replicate (SQLCoder) | ✅ Yes | ✅ Working |
| **DATABASE_URL** | PostgreSQL (Neon) | ✅ Yes | ✅ Working |

**Issues:**
- ⚠️ `CLAUDE_API_KEY` appears twice in `.env` (one placeholder, one actual)

### 5.2 Missing

| Var | Service | Required For | Priority |
|-----|---------|--------------|----------|
| **CENSUS_API_KEY** | Census Bureau API | Census data integration | HIGH |
| **WALK_SCORE_API_KEY** | Walk Score API | Walkability scores | HIGH |
| **GOOGLE_MAPS_API_KEY** | Google Maps/Places/Street View | Google services | LOW |
| **GREATSCHOOLS_API_KEY** | GreatSchools API | School ratings | MEDIUM |
| **NICHE_API_KEY** | Niche API | School ratings (alternative) | MEDIUM |
| **CRIME_API_KEY** | Crime data API | Crime statistics | MEDIUM |

**Details:**

**CENSUS_API_KEY:**
- **Priority:** HIGH
- **Service:** Census Bureau API
- **Use Case:** Demographic data retrieval
- **Get Key:** https://api.census.gov/data/key_signup.html

**WALK_SCORE_API_KEY:**
- **Priority:** HIGH
- **Service:** Walk Score API
- **Use Case:** Walkability assessment
- **Get Key:** https://www.walkscore.com/professional/api.php

**GOOGLE_MAPS_API_KEY:**
- **Priority:** LOW
- **Service:** Google Maps Platform
- **Use Case:** Street View, Places, Geocoding
- **Get Key:** https://console.cloud.google.com/

---

## 6. RECOMMENDATIONS

### Phase 5C-1: External Data (Priority Order)

**HIGH PRIORITY:**
1. **Census Bureau API Integration**
   - Get API key
   - Create `census_tracts` table
   - Import census tract boundaries (TIGER/Line Shapefiles)
   - Create Claude tool `get_census_data`
   - Store demographic data in database

2. **Walk Score API Integration**
   - Get API key
   - Create `walk_scores` table
   - Create Claude tool `get_walk_score`
   - Batch import walk scores for Travis County
   - Create map overlay layer

3. **Verify GIS Layer Tables**
   - Check database for `flood_zones`, `utility_sewer`, `utility_water`, `building_footprints`, `wetlands`, `building_permits`
   - If missing, create migrations
   - Import data from local GIS sources

**MEDIUM PRIORITY:**
4. **Crime Data Integration**
   - Identify data source (FBI UCR, local PD)
   - Get API key or data access
   - Create `crime_incidents` table
   - Create Claude tool `get_crime_data`
   - Create crime heatmap layer

5. **School Ratings Integration**
   - Choose API (GreatSchools or Niche)
   - Get API key
   - Create `school_ratings` table
   - Create Claude tool `get_school_ratings`
   - Import school district boundaries

**LOW PRIORITY:**
6. **Google APIs (Optional)**
   - Get Google Maps API key
   - Implement Street View Static API
   - Implement Places API
   - Add to property cards

### Phase 5C-2: Artifacts (Priority Order)

**HIGH PRIORITY:**
1. **Market Analysis Report Generator**
   - Integrate Census data
   - Integrate Walk Score data
   - Create comprehensive market analysis PDF
   - Add to artifact service

2. **Zoning Analysis Report Generator**
   - Use `zoning_districts` table
   - Add zoning regulations database
   - Create detailed zoning analysis PDF
   - Include constraint mapping

3. **Interactive Dashboard Components**
   - Verify frontend components exist for `reactComponent` names
   - Create missing components if needed
   - Ensure artifact data structure matches frontend expectations

**MEDIUM PRIORITY:**
4. **HTML Report Generator**
   - Add HTML template engine (Handlebars or EJS)
   - Create HTML report generator
   - Add to artifact service
   - Enable web-viewable reports

5. **Multi-Property Comparison Enhancement**
   - Add charts and visualizations
   - Create enhanced comparison XLSX
   - Add side-by-side property cards

**LOW PRIORITY:**
6. **DOCX Report Generator**
   - Add `docx` library
   - Create Word document generator
   - Add to artifact service

### Phase 5C-3: Zoning (Requirements)

**HIGH PRIORITY:**
1. **Zoning Regulations Database**
   - Create `zoning_regulations` table
   - Import zoning codes and regulations
   - Link to `zoning_districts` table
   - Enable constraint lookup

2. **Zoning Analysis Tool Enhancement**
   - Enhance `analyze_property` tool with zoning data
   - Add zoning constraint analysis
   - Include overlay district handling
   - Return detailed zoning recommendations

3. **Zoning Map Layer**
   - Ensure `zoning_districts` layer renders correctly
   - Add color coding by zoning code
   - Add overlay district visualization
   - Enable click-to-view zoning details

**MEDIUM PRIORITY:**
4. **Zoning Change History**
   - Create `zoning_changes` table
   - Track zoning code changes over time
   - Enable historical analysis

5. **Zoning Compliance Checker**
   - Create tool to check property compliance
   - Compare current use to zoning code
   - Flag violations

---

## APPENDIX: CODE REFERENCES

### External API Integrations

**Brave Search:**
- Service: `src/services/webSearch/index.js`
- Tool Handler: `src/tools/handlers.js:250`
- Tool Definition: `src/tools/index.js:111`
- Route: N/A (internal service)

**OSM POIs:**
- Tool Handler: `src/tools/handlers.js:200`
- Tool Definition: `src/tools/index.js:134`
- Database Table: `osm_pois_travis` (schema.prisma:795)

**Nominatim Geocoding:**
- Route: `src/routes/geocode.js:6`
- Endpoint: `GET /api/geocode/reverse`

### Artifact Generation

**Service:**
- Main Service: `src/services/artifacts/index.js`
- CSV Generator: `src/services/artifacts/csvGenerator.js`
- PDF Generator: `src/services/artifacts/pdfGenerator.js`
- XLSX Generator: `src/services/artifacts/xlsxGenerator.js`
- Development Analysis: `src/services/artifacts/generators/developmentAnalysis.js`
- Storage: `src/services/artifacts/storage.js`

**Routes:**
- V1: `src/routes/artifacts.js`
- V2: `src/routes/artifactsV2.js`

**Claude Tool:**
- Handler: `src/tools/handlers.js:416`
- Definition: `src/tools/index.js:202`

### Map Data Rendering

**Chat Endpoint:**
- File: `src/routes/chat.js`
- MapData Capture: Lines 126-174
- GeoJSON Structure: FeatureCollection with features array

**Tools Returning GeoJSON:**
- `search_properties`: `src/tools/handlers.js:99`
- `get_gis_layers`: `src/tools/handlers.js:302`

---

## CONCLUSION

The ScoutGPT backend has a **solid foundation** for external data integration and artifact generation, but **critical gaps exist** for Phase 5C requirements:

**Strengths:**
- ✅ Brave Search API fully integrated
- ✅ OSM POIs working
- ✅ 6 artifact types implemented
- ✅ GeoJSON structure defined
- ✅ Storage and retrieval working

**Gaps:**
- ❌ No Census data integration
- ❌ No Walk Score integration
- ❌ No Crime data integration
- ❌ No School Ratings integration
- ⚠️ GIS layer tables unverified
- ⚠️ Missing demographic data tables

**Next Steps:**
1. Prioritize Census and Walk Score API integrations (HIGH)
2. Verify/create GIS layer tables
3. Enhance artifact generation with external data
4. Create missing database tables for external data storage

---

**Report Generated:** January 27, 2026  
**Next Review:** After Phase 5C implementation begins
