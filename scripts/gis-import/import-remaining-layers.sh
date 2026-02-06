#!/bin/bash
# Import remaining GIS layers once data sources are fixed
# Run: ./scripts/gis-import/import-remaining-layers.sh

set -e

echo "=== GIS Data Import - Remaining Layers ==="
echo "Starting at $(date)"

# NOTE: These layers currently have data source issues
# Update the URLs in import-gis-layers.mjs before running

echo "[1/4] Attempting water districts..."
# Currently fails - Socrata URL returns 0 features
# node scripts/gis-import/import-gis-layers.mjs --layer=water_districts --limit=500

echo "[2/4] Attempting wetlands..."  
# Currently times out - USGS service too slow
# node scripts/gis-import/import-gis-layers.mjs --layer=wetlands_cef --limit=1000

echo "[3/4] Attempting CEF buffers..."
# Currently fails - Socrata URL returns 0 features  
# node scripts/gis-import/import-gis-layers.mjs --layer=cef_buffers --limit=500

echo "[4/4] Attempting contours (filtered)..."
# Currently too large - 1.9M+ features, needs spatial filtering
# Consider: --bbox="-97.75,30.25,-97.70,30.30" for downtown Austin only
# node scripts/gis-import/import-gis-layers.mjs --layer=contours_austin --limit=5000

echo "=== MANUAL FIXES NEEDED ==="
echo ""
echo "1. Find working water districts data source:"
echo "   - Check Travis County GIS portal"  
echo "   - Look for MUD/WCID district boundaries"
echo ""
echo "2. Find working Austin wetlands data:"
echo "   - Check Austin Open Data portal"
echo "   - Look for 'Critical Environmental Features'"
echo ""
echo "3. Find working CEF buffers data:"
echo "   - Check Austin Open Data portal"
echo "   - Search for 'CEF' or 'environmental buffers'"  
echo ""
echo "4. Optimize contours import:"
echo "   - Add spatial bbox filtering to script"
echo "   - Filter to major contours only (e.g. every 20ft)"
echo ""

# For now, just import full floodplain dataset
echo "=== IMPORTING FULL FLOODPLAIN DATASET ==="
echo "Importing all 9,315 floodplain features (may take 2-3 minutes)..."

# Uncomment when ready for full import:
# node scripts/gis-import/import-gis-layers.mjs --layer=floodplain_austin --truncateFirst=true

echo "=== Import Status Check ==="
echo "Current record counts:"

# Connect to database and check counts
if [ -n "$DATABASE_URL" ]; then
  psql $DATABASE_URL -c "
    SELECT 
      'gis_floodplain_austin' as table_name, count(*) as records 
    FROM gis_floodplain_austin
    UNION ALL 
    SELECT 'gis_water_ccn', count(*) FROM gis_water_ccn
    UNION ALL 
    SELECT 'gis_sewer_ccn', count(*) FROM gis_sewer_ccn
    UNION ALL 
    SELECT 'gis_water_districts', count(*) FROM gis_water_districts
    UNION ALL 
    SELECT 'gis_wetlands_cef', count(*) FROM gis_wetlands_cef  
    UNION ALL 
    SELECT 'gis_cef_buffers', count(*) FROM gis_cef_buffers
    UNION ALL 
    SELECT 'gis_contours_austin', count(*) FROM gis_contours_austin
    ORDER BY table_name;
  "
else
  echo "DATABASE_URL not found. Source the .env file first:"
  echo "  source .env"
  echo "  ./scripts/gis-import/import-remaining-layers.sh"
fi

echo "=== Complete at $(date) ==="