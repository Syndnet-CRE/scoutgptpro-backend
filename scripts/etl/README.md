# ATTOM P0 ETL Pipeline

This directory contains the ETL pipeline for importing ATTOM P0 data (TAX_ASSESSOR, PARCELS, PREFORECLOSURE) from Snowflake to Neon PostgreSQL.

## Files

- `attom_p0_import.py` - Main ETL script
- `validate_attom_import.py` - Post-import validation script
- `requirements.txt` - Python dependencies
- `README.md` - This file

## Prerequisites

### 1. Database Migration

Run the migration to create the tables:

```bash
# Connect to Neon and run the migration
psql $DATABASE_URL -f db/migrations/0004_attom_p0_tables.sql
```

### 2. Python Environment

Create a virtual environment and install dependencies:

```bash
cd ~/scoutgptpro-backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/etl/requirements.txt
```

### 3. Environment Variables

Set the following environment variables in your `.env` file or export them:

```bash
# Snowflake (get from Snowsight)
SNOWFLAKE_ACCOUNT=<account_identifier>
SNOWFLAKE_USER=<username>
SNOWFLAKE_PASSWORD=<password>
SNOWFLAKE_WAREHOUSE=<warehouse_name>

# Neon PostgreSQL (already exists)
DATABASE_URL=postgresql://neondb_owner:...@ep-rapid-wind-a4k9miff-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require
```

## Usage

### Dry Run (Test Connection)

```bash
python scripts/etl/attom_p0_import.py --table all --dry-run
```

### Import Individual Tables

```bash
# Import TAX_ASSESSOR (444K rows, ~15-30 min)
python scripts/etl/attom_p0_import.py --table assessor

# Import PARCELS with geometry (428K rows, ~30-60 min)
python scripts/etl/attom_p0_import.py --table parcels

# Import PREFORECLOSURE (46K rows, ~5 min)
python scripts/etl/attom_p0_import.py --table preforeclosure
```

### Import All Tables

```bash
python scripts/etl/attom_p0_import.py --table all
```

### Validation

After import completes, run validation:

```bash
python scripts/etl/validate_attom_import.py
```

## Expected Results

| Table | Expected Rows | Key Features |
|-------|---------------|--------------|
| `attom_assessor` | ~444,312 | Property details, valuation, ownership |
| `attom_parcels` | ~428,529 | Geometry (PostGIS MultiPolygon) |
| `attom_preforeclosure` | ~45,820 | Foreclosure records linked to assessor |

## Data Sources

- **Snowflake Database:** `ATTOM_SYNDNET_SHARE`
- **Snowflake Schema:** `DELIVERY` 
- **Filter:** Travis County (FIPS `48453`)
- **Target:** Neon PostgreSQL with PostGIS

## Performance Notes

- Uses batch inserts (5,000 rows per batch)
- Progress bars via `tqdm`
- Geometry conversion from GeoJSON to PostGIS MultiPolygon
- ON CONFLICT DO NOTHING for idempotent imports
- Automatic derived field calculation (value per sqft, etc.)

## Troubleshooting

### Connection Issues
- Verify Snowflake credentials in Snowsight
- Check DATABASE_URL connection with `psql $DATABASE_URL`
- Ensure warehouse is running in Snowflake

### Geometry Errors
- Script handles invalid geometry gracefully
- Falls back to NULL geometry for problematic records
- Logs first 5 geometry errors for debugging

### Memory Issues
- Reduce BATCH_SIZE in script if needed
- Process one table at a time instead of --table all

## Next Steps

After successful validation:

1. Update property-mcp to query new `attom_*` tables
2. Modify backend tool handlers to route to ATTOM data
3. Update frontend PropertyCard to display new fields
4. Consider P1 imports (RECORDER, CLIMATE_CHANGE_RISK, etc.)

## Support

Contact Boris Cherny (Technical Lead) with validation results before proceeding to MCP updates.