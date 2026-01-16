#!/bin/bash
# Download and prepare Texas ZCTA boundaries

set -e

echo "📥 Downloading ZCTA boundaries from Census Bureau..."
mkdir -p scripts/data
cd scripts/data

# Download the national ZCTA shapefile (about 800MB)
curl -L -o zcta.zip "https://www2.census.gov/geo/tiger/TIGER2023/ZCTA520/tl_2023_us_zcta520.zip"

echo "📦 Extracting..."
unzip -o zcta.zip

echo "🔄 Converting to GeoJSON and filtering to Texas..."
ogr2ogr -f GeoJSON texas_zcta.geojson tl_2023_us_zcta520.shp \
  -where "ZCTA5CE20 LIKE '75%' OR ZCTA5CE20 LIKE '76%' OR ZCTA5CE20 LIKE '77%' OR ZCTA5CE20 LIKE '78%' OR ZCTA5CE20 LIKE '79%'"

echo "🧹 Cleaning up..."
rm -f zcta.zip tl_2023_us_zcta520.*

echo "✅ Done! Texas ZCTA boundaries saved to texas_zcta.geojson"
ls -lh texas_zcta.geojson
