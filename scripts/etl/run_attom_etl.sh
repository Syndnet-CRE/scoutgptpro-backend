#!/bin/bash
#
# ATTOM P0 ETL Runner Script
# Usage: ./scripts/etl/run_attom_etl.sh [dry-run|full]
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== ATTOM P0 ETL Pipeline ===${NC}"
echo "Date: $(date)"
echo ""

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo -e "${YELLOW}Creating Python virtual environment...${NC}"
    python3 -m venv .venv
fi

# Activate virtual environment
echo -e "${YELLOW}Activating virtual environment...${NC}"
source .venv/bin/activate

# Install/upgrade dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
pip install -r scripts/etl/requirements.txt

# Check environment variables
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}ERROR: DATABASE_URL not set${NC}"
    exit 1
fi

if [ -z "$SNOWFLAKE_ACCOUNT" ]; then
    echo -e "${RED}ERROR: SNOWFLAKE_ACCOUNT not set${NC}"
    exit 1
fi

echo -e "${GREEN}Environment check passed${NC}"
echo ""

# Determine run mode
MODE=${1:-full}

if [ "$MODE" = "dry-run" ]; then
    echo -e "${YELLOW}=== DRY RUN MODE ===${NC}"
    python scripts/etl/attom_p0_import.py --table all --dry-run
    
elif [ "$MODE" = "full" ]; then
    echo -e "${GREEN}=== FULL IMPORT MODE ===${NC}"
    echo -e "${YELLOW}This will import ~918,000 rows total${NC}"
    echo -e "${YELLOW}Estimated time: 60-120 minutes${NC}"
    echo ""
    read -p "Continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
    
    echo -e "${GREEN}Starting full import...${NC}"
    START_TIME=$(date +%s)
    
    # Import tables sequentially
    echo -e "${YELLOW}[1/3] Importing TAX_ASSESSOR...${NC}"
    python scripts/etl/attom_p0_import.py --table assessor
    
    echo -e "${YELLOW}[2/3] Importing PARCELS...${NC}"
    python scripts/etl/attom_p0_import.py --table parcels
    
    echo -e "${YELLOW}[3/3] Importing PREFORECLOSURE...${NC}"
    python scripts/etl/attom_p0_import.py --table preforeclosure
    
    END_TIME=$(date +%s)
    ELAPSED=$((END_TIME - START_TIME))
    echo ""
    echo -e "${GREEN}Import complete in ${ELAPSED} seconds${NC}"
    echo ""
    
    # Run validation
    echo -e "${YELLOW}Running validation...${NC}"
    python scripts/etl/validate_attom_import.py
    
    echo ""
    echo -e "${GREEN}=== ETL PIPELINE COMPLETE ===${NC}"
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Review validation output above"
    echo "2. Share results with Boris Cherny"
    echo "3. Proceed to MCP server updates (separate task)"
    
else
    echo -e "${RED}ERROR: Invalid mode '$MODE'. Use 'dry-run' or 'full'${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Done.${NC}"