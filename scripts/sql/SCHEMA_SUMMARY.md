# Schema Summary for Travis Enrichment Upsert

## parcels_travis_enrichment

**Columns used in upsert:**
- `parcel_id` (TEXT PRIMARY KEY) - 6-digit parcel identifier
- `owner_name` (TEXT)
- `owner2` (TEXT)
- `mail_address1` (TEXT)
- `mail_address2` (TEXT)
- `mail_city` (TEXT)
- `mail_state` (TEXT)
- `mail_zip` (TEXT)
- `situs_address` (TEXT)
- `land_use` (TEXT)
- `land_use_desc` (TEXT)
- `legal_desc` (TEXT)
- `year_built` (INT)
- `acres` (NUMERIC)
- `land_value` (NUMERIC)
- `improvement_value` (NUMERIC)
- `market_value` (NUMERIC)
- `assessed_value` (NUMERIC)
- `last_update` (DATE)
- `source_layer` (TEXT)
- `raw` (JSONB)
- `updated_at` (TIMESTAMPTZ)
- `ingested_at` (TIMESTAMPTZ) - **Added if missing**

## parcels_travis_enrichment_stage

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

## Deduplication Rule

**View: v_travis_enrichment_latest**
- `DISTINCT ON (parcel_id) ORDER BY parcel_id, ingested_at DESC`
- Returns latest row per parcel_id

## Filters Applied

- `detected_id IS NOT NULL`
- `detected_id::text ~ '^[0-9]+(\\.[0-9]+)?$'` (numeric only)
- `LENGTH(parcel_id) = 6` (must be exactly 6 digits)


