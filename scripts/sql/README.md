# Travis Enrichment Upsert SQL Scripts

**Purpose:** Refresh `parcels_travis_enrichment` from `parcels_travis_enrichment_stage` using RIGHT(detected_id, 6) as join key.

## Schema Summary

### parcels_travis_enrichment
**Columns used:**
- `parcel_id` (TEXT PRIMARY KEY) - 6-digit parcel identifier
- `owner_name`, `owner2`, `mail_address1`, `mail_address2`, `mail_city`, `mail_state`, `mail_zip`
- `situs_address`, `land_use`, `land_use_desc`, `legal_desc`
- `year_built` (INT), `acres` (NUMERIC)
- `land_value`, `improvement_value`, `market_value`, `assessed_value` (NUMERIC)
- `last_update` (DATE), `source_layer` (TEXT)
- `raw` (JSONB), `updated_at` (TIMESTAMPTZ)
- `ingested_at` (TIMESTAMPTZ) - **Added if missing**

### parcels_travis_enrichment_stage
**Columns used:**
- `detected_id` (TEXT) - TCAD-style IDs like '0101110201'
- `raw` (JSONB) - Full attribute data
- `ingested_at` (TIMESTAMPTZ) - Timestamp when staged

## Join Key Logic

**parcel_id computation:**
```sql
RIGHT(REGEXP_REPLACE(TRIM(detected_id::text), E'\.0+$', ''), 6)
```

**Example:**
- `detected_id = '0101110201'` → `parcel_id = '110201'`
- `detected_id = '0101110201.0'` → `parcel_id = '110201'`

## Files

1. **travis_enrichment_latest_view.sql** - Creates view `v_travis_enrichment_latest`
   - Deduplicates by `parcel_id` using `DISTINCT ON (parcel_id) ORDER BY ingested_at DESC`
   - Filters: `detected_id IS NOT NULL`, numeric pattern, length = 6

2. **travis_enrichment_upsert.sql** - Main upsert script
   - Adds `ingested_at` column if missing
   - Creates view
   - Upserts from view to enrichment table
   - Only updates `ingested_at` if incoming value is newer

3. **travis_enrichment_validate.sql** - Validation queries
   - Counts, join coverage, sample rows, statistics

## Usage

```bash
psql "$DATABASE_URL" -f scripts/sql/travis_enrichment_upsert.sql
psql "$DATABASE_URL" -f scripts/sql/travis_enrichment_validate.sql
```

## Expected Results

- **matched_rows:** ~160,935 (from join between enrichment and parcels_travis)
- **matched_keys:** ~28,388 (distinct parcel_ids)
- **Join coverage:** Should match most parcels_travis records


