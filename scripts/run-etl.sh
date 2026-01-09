#!/bin/bash
# Run Phase 0 ETL scripts in order
# 
# Usage:
#   ./scripts/run-etl.sh
#   ./scripts/run-etl.sh --dry-run  # Show what would be updated

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable is not set"
  echo "Please set it in .env file or export it"
  exit 1
fi

echo "================================================================================"
echo "PHASE 0 ETL - Populate asset_class and owner_segment"
echo "================================================================================"
echo ""

if [ "$1" == "--dry-run" ]; then
  echo "⚠️  DRY RUN MODE - No changes will be made"
  echo ""
fi

# Step 1: Populate asset_class
echo "Step 1: Populating asset_class..."
echo "-----------------------------------"
if [ "$1" == "--dry-run" ]; then
  echo "Would run: psql \$DATABASE_URL -f scripts/populate-asset-class-v2.sql"
  echo ""
else
  psql "$DATABASE_URL" -f scripts/populate-asset-class-v2.sql
  echo "✅ asset_class populated"
  echo ""
fi

# Step 2: Populate owner_segment
echo "Step 2: Populating owner_segment..."
echo "-----------------------------------"
if [ "$1" == "--dry-run" ]; then
  echo "Would run: psql \$DATABASE_URL -f scripts/populate-owner-segment-v2.sql"
  echo ""
else
  psql "$DATABASE_URL" -f scripts/populate-owner-segment-v2.sql
  echo "✅ owner_segment populated"
  echo ""
fi

# Step 3: Verify
echo "Step 3: Running verification queries..."
echo "-----------------------------------"
if [ "$1" == "--dry-run" ]; then
  echo "Would run: psql \$DATABASE_URL -f scripts/verify-etl.sql"
  echo ""
else
  psql "$DATABASE_URL" -f scripts/verify-etl.sql
  echo ""
  echo "✅ Verification complete"
fi

echo ""
echo "================================================================================"
echo "ETL COMPLETE"
echo "================================================================================"
