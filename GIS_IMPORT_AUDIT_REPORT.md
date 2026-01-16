# GIS IMPORT AUDIT REPORT

**Date:** January 13, 2025  
**Auditor:** AI Assistant  
**Scope:** GIS Layer Import Strategy Audit

---

## Current System State

### PostGIS Setup
- **PostGIS Version:** ✅ Available (extension exists)
- **SRID 4326:** ✅ Available (WGS84)
- **Geometry Columns:** ✅ System table exists (`geometry_columns`)
- **Existing GIS Tables:**
  - `parcels_travis` - MultiPolygon geometry (SRID 4326)
  - `zoning_districts` - Geometry column (SRID 4326, GIST index)
  - `parcel_features_travis` - `geom_centroid` Point geometry (SRID 4326)

### Existing Import Patterns

#### 1. Parcel Import (ogr2ogr-based)
**File:** `scripts/reload-parcels-travis-ogr.sh`

**Pattern:**
- Uses `ogr2ogr` CLI tool (available at `/opt/homebrew/bin/ogr2ogr`)
- Imports shapefile → PostgreSQL with proper CRS transformation
- Two-stage process:
  1. Import to staging table (`parcels_travis_raw`)
  2. Transform and insert to final table (`parcels_travis`)
- Uses `ST_Multi()` to ensure MultiPolygon type
- Validates bbox and centroids after import

**Key Commands:**
```bash
ogr2ogr -f PostgreSQL "$PG_CONNECTION" "$SHAPEFILE" \
  -nln parcels_travis_raw \
  -lco GEOMETRY_NAME=geom \
  -t_srs EPSG:4326 \
  -nlt MULTIPOLYGON \
  -overwrite
```

#### 2. Zoning Import (Node.js + ArcGIS API)
**File:** `scripts/import-austin-zoning.mjs`

**Pattern:**
- Fetches GeoJSON directly from ArcGIS MapServer REST API
- Uses batch fetching with `resultOffset` and `resultRecordCount`
- Inserts using PostGIS functions: `ST_SetSRID(ST_GeomFromGeoJSON(...), 4326)`
- Handles resumable imports (checks existing count)
- Stores raw attributes as JSONB

**Key Features:**
- Direct API integration (no file download)
- Batch processing (1000 features at a time)
- Error handling and retry logic
- Verification queries after import

### Frontend Layer System

#### Current Architecture
**File:** `src/pages/scout-ai-chat/components/MapWorkspace.jsx`

**Layer Management:**
- Uses Mapbox GL JS for rendering
- Layers added via `addSource()` and `addLayer()`
- Layer IDs follow pattern: `gis-layer-{id}`, `drawer-layer-{id}`, `mts-parcels-{type}`
- GeoJSON sources added dynamically from API responses

**Layer Toggle System:**
- `handleLayerToggle()` function (line 610)
- Fetches GeoJSON from MapServer when layer enabled
- Uses `fetchMapServerGeoJSON()` utility
- Adds layers via `addAIOverlays()` function
- Tracks active layers in `drawerLayersRef.current` Map

**Data Flow:**
1. User toggles layer → `handleLayerToggle()`
2. Validates MapServer URL
3. Fetches GeoJSON with bbox filter (limit 1000 features)
4. Creates overlay object with style
5. Adds to map via `addAIOverlays()`
6. Tracks in ref for cleanup

#### Layer Configuration
**File:** `src/services/gisLayers.js`

**Structure:**
- `GIS_LAYERS` array with layer definitions
- Each layer has: `id`, `name`, `type` (raster/vector), `source`, `color`, `opacity`
- `addGISLayer()` function handles Mapbox layer addition
- Supports both raster and vector layer types

**File:** `src/components/providers/MapLayersProvider.jsx`
- Manages layer visibility state
- Fetches GeoJSON when layer enabled
- Integrates with `useGISLayerSets` hook

### Backend GIS Routes

**File:** `src/routes/gis.js`

**Endpoints:**
- `GET /api/gis/layers?name={name}` - Search layers by name
- `POST /api/gis/layers` - Handle layer toggle actions
- `GET /api/gis/layers/:id/query` - Query specific layer (stub)

**Current Implementation:**
- Uses `MapServerRegistry` Prisma model
- Hardcoded `CANONICAL` layer mappings (zoning, flood zones, sewer, water, etc.)
- Returns ArcGIS MapServer URLs
- Frontend fetches GeoJSON directly from MapServer

### Database Connection Pattern

**Current Approach:**
- **Prisma** for ORM (models: `GisLayer`, `MapServerRegistry`, `LayerSet`)
- **Raw `pg` Pool** for spatial queries (PostGIS functions)
- **Both** used together:
  - Prisma for metadata/registry queries
  - Raw SQL for geometry operations (`ST_*` functions)

**Example Spatial Query Pattern:**
```javascript
await pool.query(`
  INSERT INTO zoning_districts (geometry, ...)
  VALUES (ST_SetSRID(ST_GeomFromGeoJSON($1::jsonb), 4326), ...)
`);
```

### Dependencies

**Backend (`package.json`):**
- ✅ `@turf/turf` (v7.3.1) - Geospatial analysis
- ✅ `pg` (v8.16.3) - PostgreSQL client
- ✅ `shapefile` (v0.6.6) - Shapefile parsing (used in deprecated loader)
- ✅ `proj4` (v2.20.2) - Coordinate transformation
- ❌ `ogr2ogr` - Not a Node.js package, but CLI tool available

**System Tools:**
- ✅ `ogr2ogr` available at `/opt/homebrew/bin/ogr2ogr`

---

## Data Source Analysis

### Water CCN (Travis County)
- **URL:** https://tnr-traviscountytx.opendata.arcgis.com/datasets/water-ccn
- **Format:** ArcGIS OpenData Hub (likely GeoJSON API available)
- **Geometry Type:** Unknown (likely Polygon/MultiPolygon for service areas)
- **CRS:** Likely 4326 (WGS84) or 2276 (Texas State Plane)
- **Access:** Public ArcGIS OpenData portal
- **Note:** May require API key for bulk downloads

### Sewer CCN (Travis County)
- **URL:** https://tnr-traviscountytx.opendata.arcgis.com/datasets/TravisCountyTX::puc-ccn-sewer
- **Format:** ArcGIS OpenData Hub
- **Geometry Type:** Unknown (likely Polygon/MultiPolygon)
- **CRS:** Likely 4326 or 2276
- **Access:** Public ArcGIS OpenData portal

### Water/WW Districts
- **URL:** https://tnr-traviscountytx.opendata.arcgis.com/maps/water-wastewater-districts-1
- **Format:** ArcGIS Map (may have MapServer endpoint)
- **Geometry Type:** Polygon (districts)
- **CRS:** Unknown
- **Access:** Public map viewer (may need to find REST endpoint)

### Zoning (City of Austin)
- **URL:** https://data.austintexas.gov/Geodata/Zoning/5rzy-nm5e
- **Format:** ✅ **ArcGIS MapServer** (already imported)
- **MapServer URL:** `https://maps.austintexas.gov/arcgis/rest/services/Shared/Zoning_1/MapServer/0`
- **Geometry Type:** ✅ Polygon
- **CRS:** ✅ 4326 (WGS84)
- **Status:** ✅ **Already imported** (`zoning_districts` table exists)
- **Import Script:** ✅ `scripts/import-austin-zoning.mjs`
- **Feature Count:** Unknown (import script handles batching)

### Floodplain (City of Austin)
- **URL:** https://data.austintexas.gov/Locations-and-Maps/Austin-Fully-Developed-Floodplain/2xn4-j3u2
- **Format:** Socrata OpenData portal (may have GeoJSON export)
- **Geometry Type:** Polygon (flood zones)
- **CRS:** Unknown
- **Access:** Public Socrata API or direct download

### Wetlands (CEF)
- **URL:** https://data.austintexas.gov/Locations-and-Maps/Wetland/uyrh-i4dq
- **Format:** Socrata OpenData portal
- **Geometry Type:** Polygon
- **CRS:** Unknown
- **Access:** Public Socrata API

### CEF Buffers
- **URL:** https://data.austintexas.gov/Locations-and-Maps/Biological-Resource-Buffer/n7cy-835m
- **Format:** Socrata OpenData portal
- **Geometry Type:** Polygon (buffers)
- **CRS:** Unknown
- **Access:** Public Socrata API

---

## Recommended Approach

### Import Method

**Recommendation: Hybrid Approach**

1. **For ArcGIS MapServer sources:** Use Node.js script (like `import-austin-zoning.mjs`)
   - ✅ Direct API access (no file downloads)
   - ✅ Handles batching automatically
   - ✅ Can resume interrupted imports
   - ✅ Already proven pattern

2. **For Shapefile/File-based sources:** Use `ogr2ogr` CLI (like `reload-parcels-travis-ogr.sh`)
   - ✅ Proper CRS handling (respects .prj files)
   - ✅ Handles large files efficiently
   - ✅ Proven to work correctly (parcels import)

3. **For Socrata sources:** Use Node.js script with Socrata API
   - ✅ Can fetch GeoJSON directly
   - ✅ Supports bbox filtering
   - ⚠️ May need API key for large datasets

**Why Hybrid:**
- ArcGIS MapServer → Node.js (already working pattern)
- Shapefiles → ogr2ogr (proven CRS handling)
- Socrata → Node.js (API access)

### Storage Pattern

**Recommendation: Separate tables per layer**

**Rationale:**
1. **Different schemas:** Each layer has unique attributes
   - Water CCN: service provider, CCN number, etc.
   - Sewer CCN: different attributes
   - Zoning: zoning_code, zoning_desc, overlay
   - Floodplain: flood zone type, base elevation, etc.

2. **Indexing:** Each table can have layer-specific indexes
   - `zoning_districts` has index on `zoning_code`
   - Each can have GIST index on geometry

3. **Query performance:** Separate tables = better query plans
   - Can filter by layer-specific attributes efficiently
   - Can optimize indexes per layer

4. **Existing pattern:** `zoning_districts` table already follows this pattern

**Table Structure:**
```sql
-- Example: water_ccn table
CREATE TABLE water_ccn (
  id SERIAL PRIMARY KEY,
  ccn_number TEXT,
  provider_name TEXT,
  geometry GEOMETRY(MultiPolygon, 4326),
  raw_attributes JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_water_ccn_geom ON water_ccn USING GIST(geometry);
CREATE INDEX idx_water_ccn_ccn ON water_ccn(ccn_number);
```

### Serving Strategy

**Recommendation: Direct PostGIS queries with GeoJSON output**

**Rationale:**
1. **Current system already does this:** Frontend fetches GeoJSON from MapServer
2. **PostGIS is fast:** With proper indexes, spatial queries are efficient
3. **Flexible filtering:** Can filter by bbox, attributes, or spatial relationships
4. **No tile generation needed:** For property analysis, full features are needed

**Implementation:**
```javascript
// Backend endpoint: GET /api/gis/layers/:layerName/geojson
router.get('/layers/:layerName/geojson', async (req, res) => {
  const { bbox, where } = req.query;
  
  let query = `SELECT ST_AsGeoJSON(geometry)::jsonb as geometry, * FROM ${tableName}`;
  const params = [];
  
  if (bbox) {
    const [west, south, east, north] = bbox.split(',');
    query += ` WHERE ST_Intersects(geometry, ST_MakeEnvelope($1, $2, $3, $4, 4326))`;
    params.push(west, south, east, north);
  }
  
  if (where) {
    query += bbox ? ' AND' : ' WHERE';
    query += ` ${where}`;
  }
  
  const result = await pool.query(query, params);
  // Transform to GeoJSON FeatureCollection
});
```

**Alternative (if performance becomes issue):**
- Pre-generate vector tiles using `tippecanoe` or `tilesets-cli`
- Serve via Mapbox Vector Tiles (MTS)
- Only if layer has >100k features or frequent queries

### Frontend Integration

**Recommendation: Extend existing layer system**

**Current System:**
- ✅ Layer toggle UI exists (`PropertyPanel.jsx`)
- ✅ GeoJSON rendering works (`MapWorkspace.jsx`)
- ✅ Layer state management (`MapLayersProvider.jsx`)

**Integration Points:**
1. **Add new layers to `GIS_LAYERS` array** in `src/services/gisLayers.js`
2. **Backend endpoint:** `GET /api/gis/layers/:name/geojson` (new)
3. **Frontend:** Use existing `handleLayerToggle()` pattern
4. **Update:** `MapServerRegistry` or create new `GisLayer` entries

**No new patterns needed** - existing system handles:
- Layer visibility toggle
- GeoJSON fetching
- Map rendering
- Style customization

### Dependencies

**Already Installed:**
- ✅ `pg` - PostgreSQL client
- ✅ `@turf/turf` - Geospatial utilities
- ✅ `ogr2ogr` - CLI tool (system)

**May Need:**
- ⚠️ `node-fetch` or native `fetch` - For API calls (Node 18+ has native fetch)
- ⚠️ `dotenv` - Already installed
- ❌ No new dependencies required

### Prerequisites

**Database:**
- ✅ PostGIS extension enabled
- ✅ SRID 4326 available
- ✅ GIST indexes supported

**System:**
- ✅ `ogr2ogr` available (`/opt/homebrew/bin/ogr2ogr`)
- ✅ Node.js 18+ (for native fetch)

**Backend:**
- ✅ Database connection pool configured
- ✅ Prisma schema has `GisLayer` model (can extend)

### Risks/Concerns

#### Data Size
- **Water/Sewer CCN:** Likely <10k features each (service areas)
- **Zoning:** Already imported, ~thousands of districts
- **Floodplain:** Could be large (detailed flood zones)
- **Wetlands:** Likely <5k features
- **CEF Buffers:** Likely <5k features

**Mitigation:**
- Use bbox filtering for large layers
- Add `LIMIT` clauses to queries
- Consider vector tiles if >50k features

#### Performance
- **Spatial queries:** With GIST indexes, should be fast
- **GeoJSON generation:** `ST_AsGeoJSON()` is efficient
- **Frontend rendering:** Mapbox GL JS handles large GeoJSON well

**Mitigation:**
- Add indexes on geometry columns
- Use bbox filtering in queries
- Consider pagination for very large layers

#### Data Updates
- **Frequency:** Unknown (need to check source update schedules)
- **Strategy:** Full reload vs incremental updates

**Mitigation:**
- Design tables with `updated_at` timestamps
- Add `last_imported` tracking
- Consider incremental updates if sources support it

#### CRS Issues
- **Risk:** Some sources may use Texas State Plane (2276) instead of WGS84 (4326)
- **Mitigation:** `ogr2ogr` handles CRS transformation automatically
- **For API sources:** ArcGIS MapServer can return in 4326 via `outSR=4326`

---

## Implementation Checklist

### Phase 1: Data Source Investigation
- [ ] Test each data source URL to determine:
  - [ ] Available formats (GeoJSON, Shapefile, API)
  - [ ] Feature count
  - [ ] CRS/SRID
  - [ ] Required authentication
  - [ ] API endpoints (if applicable)

### Phase 2: Database Schema
- [ ] Create Prisma migrations for new tables:
  - [ ] `water_ccn`
  - [ ] `sewer_ccn`
  - [ ] `water_ww_districts`
  - [ ] `floodplain_zones`
  - [ ] `wetlands`
  - [ ] `cef_buffers`
- [ ] Add GIST indexes on geometry columns
- [ ] Add attribute indexes (CCN numbers, zone types, etc.)

### Phase 3: Import Scripts
- [ ] Create import script for Water CCN (ArcGIS or ogr2ogr)
- [ ] Create import script for Sewer CCN
- [ ] Create import script for Water/WW Districts
- [ ] Create import script for Floodplain (Socrata API)
- [ ] Create import script for Wetlands (Socrata API)
- [ ] Create import script for CEF Buffers (Socrata API)

### Phase 4: Backend API
- [ ] Create `GET /api/gis/layers/:name/geojson` endpoint
- [ ] Add bbox filtering support
- [ ] Add attribute filtering support
- [ ] Add layer metadata endpoint

### Phase 5: Frontend Integration
- [ ] Add new layers to `GIS_LAYERS` array
- [ ] Update `MapServerRegistry` or `GisLayer` entries
- [ ] Test layer toggle functionality
- [ ] Verify GeoJSON rendering

### Phase 6: Testing
- [ ] Test import scripts with sample data
- [ ] Verify geometry correctness (bbox, centroids)
- [ ] Test API endpoints with various filters
- [ ] Test frontend layer rendering
- [ ] Performance test with full datasets

---

## Ready to Implement

- [x] **Yes** - System is ready
- [ ] **Blockers:** None identified

**Next Steps:**
1. Investigate each data source to confirm format/access
2. Create database migrations for new tables
3. Implement import scripts (one per layer)
4. Add backend API endpoints
5. Integrate with frontend layer system

---

## Summary

The current system has a solid foundation:
- ✅ PostGIS is set up and working
- ✅ Import patterns exist (ogr2ogr for files, Node.js for APIs)
- ✅ Frontend layer system is functional
- ✅ Database models exist (`GisLayer`, `MapServerRegistry`)

**Recommended approach:**
1. Use **separate tables per layer** (like `zoning_districts`)
2. Use **hybrid import method** (ogr2ogr for files, Node.js for APIs)
3. Serve via **direct PostGIS queries** (GeoJSON output)
4. **Extend existing frontend layer system** (no new patterns needed)

The main work is:
- Creating import scripts for each data source
- Adding backend API endpoints for GeoJSON queries
- Integrating new layers into the existing UI

No major blockers or architectural changes needed.
