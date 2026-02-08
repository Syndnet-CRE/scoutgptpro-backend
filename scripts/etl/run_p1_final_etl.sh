#!/bin/bash
#
# ATTOM P1 Final ETL - Load 3 Remaining Tables
# Execution script for climate risk, flood zones, and building permits
#
# Expected total time: 25-35 minutes
# Expected total rows: 3,948,055
#

set -e  # Exit on any error

echo "=== ATTOM P1 Final ETL ==="
echo "Loading 3 remaining tables into Neon PostgreSQL"
echo "Expected rows: Climate (415K), Flood (411K), Permits (3.1M)"
echo ""

# Verify we're in the right directory
if [ ! -f "scripts/etl/create_p1_final_tables.sql" ]; then
    echo "ERROR: Must run from scoutgptpro-backend root directory"
    exit 1
fi

# Check if .venv exists
if [ ! -d ".venv" ]; then
    echo "ERROR: Python virtual environment not found. Run: python -m venv .venv"
    exit 1
fi

echo "Step 1: Activating Python virtual environment..."
source .venv/bin/activate

echo "Step 2: Creating tables..."
psql "$DATABASE_URL" -f scripts/etl/create_p1_final_tables.sql
if [ $? -eq 0 ]; then
    echo "✅ Tables created successfully"
else
    echo "❌ Table creation failed"
    exit 1
fi

echo ""
echo "Step 3: Loading flood zones (smallest, ~1 min)..."
python3 scripts/etl/load_floodzones.py
if [ $? -eq 0 ]; then
    echo "✅ Flood zones loaded successfully"
else
    echo "❌ Flood zones load failed"
    exit 1
fi

echo ""
echo "Step 4: Loading climate risk (~2-3 min)..."
python3 scripts/etl/load_climate_risk.py
if [ $? -eq 0 ]; then
    echo "✅ Climate risk loaded successfully"
else
    echo "❌ Climate risk load failed"
    exit 1
fi

echo ""
echo "Step 5: Loading building permits (largest, ~15-25 min)..."
python3 scripts/etl/load_building_permit.py
if [ $? -eq 0 ]; then
    echo "✅ Building permits loaded successfully"
else
    echo "❌ Building permits load failed"
    exit 1
fi

echo ""
echo "Step 6: Running validation queries..."
psql "$DATABASE_URL" -f scripts/etl/validate_p1_final.sql

echo ""
echo "🎉 ATTOM P1 Final ETL Complete!"
echo "All 3 tables loaded and validated."
echo ""
echo "Next steps (separate prompts):"
echo "1. Update STATUS.md"
echo "2. Wire ATTOM data into chat pipeline"
echo "3. Update Mapbox tilesets"
echo "4. Build spatial joins with GIS overlays"