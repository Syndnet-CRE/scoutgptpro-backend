# GIS Layer Tables Status Report

**Generated:** 2026-01-27  
**Database:** Neon PostgreSQL  
**Verification Script:** `scripts/verify-gis-tables.mjs`

## Executive Summary

- **Total Tables Checked:** 8 (+ parcels_travis)
- **Existing Tables:** 3 (37.5%)
- **Missing Tables:** 6 (62.5%)
- **Total Rows in Existing Tables:** 395,314

## ✅ Existing Tables

### 1. `zoning_districts`
- **Status:** ✅ EXISTS
- **Row Count:** 22,488
- **Geometry Column:** `geometry` (PostGIS geometry type)
- **Layer ID:** `zoning_districts`
- **Columns:**
  - `id` (integer) - Primary key
  - `zoning_code` (varchar) - Zoning classification code
  - `zoning_desc` (varchar) - Zoning description
  - `overlay` (varchar) - Overlay district designation
  - `geometry` (geometry) - **Primary geometry column** (Polygon)
  - `raw_attributes` (jsonb) - Additional attributes
  - `created_at` (timestamp) - Import timestamp
- **Notes:** Fully populated with zoning district boundaries for Travis County
- **Usage:** Active - Used for zoning analysis and property development feasibility

### 2. `census_tracts`
- **Status:** ✅ EXISTS (Empty)
- **Row Count:** 0
- **Geometry Column:** `geometry` (PostGIS geometry type)
- **Layer ID:** `census_tracts`
- **Columns:**
  - `geoid` (text) - Census tract GEOID (11 digits)
  - `name` (text) - Census tract name
  - `county_fips` (text) - County FIPS code
  - `geometry` (geometry) - **Primary geometry column** (Polygon)
  - `population` (integer) - Total population
  - `median_income` (integer) - Median household income
  - `median_age` (numeric) - Median age
  - `metadata` (jsonb) - Additional demographic data
  - `created_at` (timestamptz) - Import timestamp
- **Notes:** Table structure exists but no data imported yet. Ready for Census API integration to populate.
- **Usage:** Available but empty - Can be populated using Census API integration

### 3. `parcels_travis`
- **Status:** ✅ EXISTS
- **Row Count:** 372,826
- **Geometry Column:** `geom` (PostGIS geometry type)
- **Layer ID:** `parcels_boundaries`
- **Columns:** (Full schema not enumerated - standard parcel table)
  - `parcel_id` - Unique parcel identifier
  - `geom` (geometry) - **Primary geometry column** (Polygon)
  - Additional parcel attributes...
- **Notes:** Complete Travis County parcel boundaries dataset
- **Usage:** Active - Used as base layer and for spatial joins with other GIS layers

## ❌ Missing Tables

The following tables are referenced in code but do not exist in the database:

### 1. `flood_zones`
- **Status:** ❌ DOES NOT EXIST
- **Expected Layer ID:** `flood_fema_zones`
- **Expected Geometry Column:** `geom`
- **Priority:** HIGH - Important for property risk assessment
- **Data Source:** FEMA National Flood Hazard Layer (NFHL)
- **Notes:** FEMA flood zone data not yet imported. Critical for property analysis.

### 2. `utility_sewer`
- **Status:** ❌ DOES NOT EXIST
- **Expected Layer ID:** `sewer_mains`
- **Expected Geometry Column:** `geom`
- **Priority:** MEDIUM - Important for development feasibility
- **Data Source:** Local utility provider (Austin Water, etc.)
- **Notes:** Sewer utility infrastructure data not yet imported.

### 3. `utility_water`
- **Status:** ❌ DOES NOT EXIST
- **Expected Layer ID:** `water_mains`
- **Expected Geometry Column:** `geom`
- **Priority:** MEDIUM - Important for development feasibility
- **Data Source:** Local utility provider (Austin Water, etc.)
- **Notes:** Water utility infrastructure data not yet imported.

### 4. `building_footprints`
- **Status:** ❌ DOES NOT EXIST
- **Expected Layer ID:** `building_footprints`
- **Expected Geometry Column:** `geom`
- **Priority:** MEDIUM - Useful for property analysis
- **Data Source:** OpenStreetMap, Microsoft Building Footprints, or local GIS
- **Notes:** Building footprint polygon data not yet imported.

### 5. `wetlands`
- **Status:** ❌ DOES NOT EXIST
- **Expected Layer ID:** `wetlands_boundaries`
- **Expected Geometry Column:** `geom`
- **Priority:** LOW - Important for environmental compliance
- **Data Source:** USFWS National Wetlands Inventory, local GIS
- **Notes:** Wetlands boundary data not yet imported.

### 6. `building_permits`
- **Status:** ❌ DOES NOT EXIST
- **Expected Layer ID:** `permits_building`
- **Expected Geometry Column:** `geom`
- **Priority:** LOW - Useful for development history
- **Data Source:** Local building permit database
- **Notes:** Building permit point/polygon data not yet imported.

## Code Changes Made

### File: `src/tools/handlers.js`

**Current State (as of 2026-01-27):**

The `getGisLayers` function has been updated to:

1. ✅ **Only include existing tables** in `layerMap`:
   - `zoning_districts` → `zoning_districts` table
   - `census_tracts` → `census_tracts` table
   - `parcels_boundaries` → `parcels_travis` table

2. ✅ **Commented out unavailable layers** (kept for reference):
   - `flood_fema_zones` → `flood_zones` (commented)
   - `sewer_mains` → `utility_sewer` (commented)
   - `water_mains` → `utility_water` (commented)
   - `building_footprints` → `building_footprints` (commented)
   - `wetlands_boundaries` → `wetlands` (commented)
   - `permits_building` → `building_permits` (commented)

3. ✅ **Enhanced error handling**:
   - Returns helpful error messages when layer doesn't exist
   - Lists available layers in error response
   - Includes defensive table existence check

4. ✅ **Documentation**:
   - Added comprehensive header comments
   - Documents which tables exist vs missing
   - References this status report

**Available Layer IDs:**
- `zoning_districts` - Zoning district boundaries (22,488 features)
- `census_tracts` - Census tract boundaries (0 features, empty table)
- `parcels_boundaries` - Parcel boundaries (372,826 features)

### File: `src/tools/index.js`

**Changes Made:**

1. ✅ **Updated tool description** to accurately reflect available layers
2. ✅ **Updated enum** to only include available layers:
   - Removed: `flood_fema_zones`, `sewer_mains`, `water_mains`, `building_footprints`, `wetlands_boundaries`, `permits_building`
   - Kept: `zoning_districts`, `census_tracts`, `parcels_boundaries`
3. ✅ **Added note** in description about unavailable layers

## Available Layers Summary

| Layer ID | Table Name | Row Count | Status | Geometry Column |
|----------|------------|-----------|--------|-----------------|
| `zoning_districts` | `zoning_districts` | 22,488 | ✅ Active | `geometry` |
| `census_tracts` | `census_tracts` | 0 | ⚠️ Empty | `geometry` |
| `parcels_boundaries` | `parcels_travis` | 372,826 | ✅ Active | `geom` |

## Unavailable Layers Summary

| Layer ID | Table Name | Status | Priority |
|----------|------------|--------|----------|
| `flood_fema_zones` | `flood_zones` | ❌ Missing | HIGH |
| `sewer_mains` | `utility_sewer` | ❌ Missing | MEDIUM |
| `water_mains` | `utility_water` | ❌ Missing | MEDIUM |
| `building_footprints` | `building_footprints` | ❌ Missing | MEDIUM |
| `wetlands_boundaries` | `wetlands` | ❌ Missing | LOW |
| `permits_building` | `building_permits` | ❌ Missing | LOW |

## Function Behavior

### When Valid Layer Requested
- Function queries the appropriate table
- Returns GeoJSON FeatureCollection
- Includes all attributes from the table
- Limits results (100 for parcel_id queries, 500 for bbox queries)

### When Invalid Layer Requested
- Returns error with message: "Unknown layer: {layer_id}"
- Lists all available layers in response
- Includes `available_layers` array in error response

### When Table Missing (Defensive Check)
- Verifies table exists before querying
- Returns error if table marked as available but missing
- Includes note to check this status report

## Recommendations

### Immediate Actions
1. ✅ **COMPLETED:** Code updated to only reference existing tables
2. ✅ **COMPLETED:** Tool definition updated to reflect available layers
3. ✅ **COMPLETED:** Error handling enhanced with available layer lists

### High Priority - Import Missing Data

#### 1. Flood Zones (HIGH Priority)
- **Source:** FEMA National Flood Hazard Layer (NFHL)
- **URL:** https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer
- **Format:** REST API or GeoJSON download
- **Impact:** Critical for property risk assessment and insurance requirements
- **Action:** Create import script to fetch and load FEMA flood zone data

#### 2. Census Tracts Population (MEDIUM Priority)
- **Source:** Census API (already integrated)
- **Status:** Table exists but empty
- **Action:** Use Census API integration to populate `census_tracts` table with:
  - Tract boundaries (from Census Geocoder)
  - Demographic data (from ACS API)
- **Note:** Census API integration is already implemented in `src/services/census/index.js`

### Medium Priority - Import Missing Data

#### 3. Utility Infrastructure
- **Sewer Mains:** Contact Austin Water or local GIS department
- **Water Mains:** Contact Austin Water or local GIS department
- **Format:** Shapefile or GeoJSON
- **Impact:** Important for development feasibility analysis

#### 4. Building Footprints
- **Source Options:**
  - Microsoft Building Footprints (free, global coverage)
  - OpenStreetMap (via Overpass API)
  - Local GIS department
- **Format:** GeoJSON or Shapefile
- **Impact:** Useful for property analysis and visualization

### Low Priority - Import Missing Data

#### 5. Wetlands
- **Source:** USFWS National Wetlands Inventory
- **URL:** https://www.fws.gov/program/national-wetlands-inventory
- **Format:** Shapefile or GeoJSON
- **Impact:** Important for environmental compliance

#### 6. Building Permits
- **Source:** Local building permit database
- **Format:** CSV with coordinates or Shapefile
- **Impact:** Useful for development history analysis

## Verification Commands

### Check Table Existence
```bash
cd /Users/braydonirwin/scoutgptpro-backend
node scripts/verify-gis-tables.mjs
```

### Query Specific Table Row Count
```bash
psql $DATABASE_URL -c "SELECT 'zoning_districts' as tbl, count(*) FROM zoning_districts;"
psql $DATABASE_URL -c "SELECT 'census_tracts' as tbl, count(*) FROM census_tracts;"
psql $DATABASE_URL -c "SELECT 'parcels_travis' as tbl, count(*) FROM parcels_travis;"
```

### Test GIS Layer Tool
```javascript
// Example: Get zoning districts for a bounding box
{
  "layer_id": "zoning_districts",
  "bbox": [-97.8, 30.2, -97.7, 30.3]
}

// Example: Get parcels for a specific parcel
{
  "layer_id": "parcels_boundaries",
  "parcel_id": "12345678"
}
```

## Related Files

- `src/tools/handlers.js` - Tool handler with GIS layer queries (lines 308-440)
- `src/tools/index.js` - Tool definitions (lines 167-200)
- `scripts/verify-gis-tables.mjs` - Verification script
- `scripts/gis-import/create-gis-tables.sql` - Table creation scripts
- `GIS_TABLES_STATUS.md` - This status report

## Next Steps

1. **Populate Census Tracts:**
   - Use existing Census API integration (`src/services/census/index.js`)
   - Create script to fetch tract boundaries and demographics
   - Populate `census_tracts` table

2. **Import Flood Zones:**
   - Research FEMA NFHL API or download options
   - Create import script
   - Load flood zone polygons into `flood_zones` table
   - Update `getGisLayers` to include `flood_fema_zones`

3. **Import Utility Data:**
   - Contact local GIS departments for sewer/water data
   - Create import scripts
   - Load utility infrastructure into respective tables

4. **Monitor and Update:**
   - Re-run verification script after imports
   - Update this status report
   - Update tool definitions as new layers become available
