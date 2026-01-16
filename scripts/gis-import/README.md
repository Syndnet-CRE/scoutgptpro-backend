# GIS Layer Import System

This directory contains scripts and SQL for importing GIS layers from various sources (ArcGIS, Socrata) into PostGIS.

## Setup

### 1. Create Database Tables

Run the SQL migration to create all GIS layer tables:

```bash
psql $DATABASE_URL -f scripts/gis-import/create-gis-tables.sql
```

This creates 7 tables:
- `gis_water_ccn` - Water Certificate of Convenience and Necessity
- `gis_sewer_ccn` - Sewer CCN
- `gis_water_districts` - Water/Wastewater Districts
- `gis_floodplain_austin` - City of Austin Floodplain
- `gis_wetlands_cef` - CEF Wetlands
- `gis_cef_buffers` - CEF Biological Resource Buffers
- `gis_contours_austin` - Elevation Contours

All tables include:
- GIST spatial index on geometry column
- Attribute indexes (CCN numbers, zone codes, etc.)
- `raw_attributes` JSONB column for storing all source attributes

### 2. Configure Data Source URLs

Before importing, update the URLs in `import-gis-layers.mjs`:

1. **ArcGIS Sources** (Water CCN, Sewer CCN, Water Districts):
   - Visit the ArcGIS Hub page
   - Find the "FeatureServer" REST endpoint URL
   - Update `LAYER_CONFIGS` in `import-gis-layers.mjs`

2. **Socrata Sources** (Floodplain, Wetlands, CEF Buffers):
   - URLs are already configured (GeoJSON endpoints)
   - May need API key for large datasets

## Importing Layers

### Basic Import

```bash
# Import Water CCN
node scripts/gis-import/import-gis-layers.mjs --layer=water_ccn

# Import Sewer CCN
node scripts/gis-import/import-gis-layers.mjs --layer=sewer_ccn

# Import Floodplain
node scripts/gis-import/import-gis-layers.mjs --layer=floodplain_austin
```

### Options

- `--layer={name}` - **Required**. Layer name to import
- `--truncateFirst=true` - Truncate table before importing (replaces existing data)
- `--limit={number}` - Limit number of features to import (for testing)

### Examples

```bash
# Test import with 100 features
node scripts/gis-import/import-gis-layers.mjs --layer=water_ccn --limit=100

# Replace existing data
node scripts/gis-import/import-gis-layers.mjs --layer=water_ccn --truncateFirst=true
```

## Data Sources

### ArcGIS Hub Sources

These require finding the FeatureServer REST endpoint:

1. **Water CCN**
   - Hub: https://tnr-traviscountytx.opendata.arcgis.com/datasets/water-ccn
   - Look for "View API" or "REST Services" link
   - Pattern: `https://services.arcgis.com/{org}/arcgis/rest/services/{service}/FeatureServer/0`

2. **Sewer CCN**
   - Hub: https://tnr-traviscountytx.opendata.arcgis.com/datasets/TravisCountyTX::puc-ccn-sewer
   - Same pattern as Water CCN

3. **Water/WW Districts**
   - Hub: https://tnr-traviscountytx.opendata.arcgis.com/maps/water-wastewater-districts-1
   - May need to find MapServer or FeatureServer endpoint

### Socrata Sources

These use direct GeoJSON endpoints:

1. **Floodplain (Austin)**
   - URL: `https://data.austintexas.gov/resource/2xn4-j3u2.geojson`
   - ✅ Already configured

2. **Wetlands (CEF)**
   - URL: `https://data.austintexas.gov/resource/uyrh-i4dq.geojson`
   - ✅ Already configured

3. **CEF Buffers**
   - URL: `https://data.austintexas.gov/resource/n7cy-835m.geojson`
   - ✅ Already configured

## Verification

After importing, verify the data:

```sql
-- Check feature count and bounding box
SELECT 
  COUNT(*) as count,
  ST_Extent(geometry) as bbox
FROM gis_water_ccn;

-- Check sample features
SELECT * FROM gis_water_ccn LIMIT 5;

-- Verify geometry is valid
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN ST_IsValid(geometry) THEN 1 END) as valid,
  COUNT(CASE WHEN NOT ST_IsValid(geometry) THEN 1 END) as invalid
FROM gis_water_ccn;
```

## API Usage

After importing, layers are available via API:

```bash
# Get all features (up to limit)
GET /api/gis/local/water_ccn/geojson

# Get features within bounding box
GET /api/gis/local/water_ccn/geojson?bbox=-97.9,30.1,-97.5,30.5

# Limit results
GET /api/gis/local/water_ccn/geojson?bbox=-97.9,30.1,-97.5,30.5&limit=500
```

**Bbox format:** `west,south,east,north` (WGS84 decimal degrees)

**Response:** GeoJSON FeatureCollection

## Troubleshooting

### "Layer URL not configured"
- Update `LAYER_CONFIGS` in `import-gis-layers.mjs` with actual endpoint URL
- For ArcGIS sources, find the FeatureServer REST endpoint
- For Socrata sources, verify the GeoJSON endpoint URL

### "No features found"
- Check if the source URL is correct
- Verify the source has data for Travis County
- Check network connectivity

### Geometry errors
- Verify source CRS is 4326 (WGS84) or can be transformed
- ArcGIS sources: Use `outSR=4326` parameter (already included)
- Check for invalid geometries in source data

### Import is slow
- Large layers (>50k features) may take 10-30 minutes
- Use `--limit` for testing
- Consider bbox filtering if source supports it

## Next Steps

1. **Investigate ArcGIS endpoints:**
   - Visit each Hub page
   - Find FeatureServer REST URL
   - Update `LAYER_CONFIGS` in import script

2. **Test import:**
   - Start with Water CCN (smallest dataset)
   - Verify geometry correctness
   - Test API endpoint

3. **Frontend integration:**
   - Add layers to `GIS_LAYERS` array
   - Update layer toggle to use `/api/gis/local/{name}/geojson`
   - Test rendering on map
