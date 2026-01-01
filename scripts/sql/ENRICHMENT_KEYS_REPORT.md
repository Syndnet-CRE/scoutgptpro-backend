# Enrichment Keys Report

**Generated:** Run `psql "$DATABASE_URL" -f scripts/sql/travis_enrichment_keys_report.sql`

## Top 80 Top-Level JSON Keys by Frequency

Run the SQL query to generate this list:

```sql
SELECT 
  key,
  COUNT(*) AS frequency,
  ROUND(100.0 * COUNT(*) / NULLIF((SELECT COUNT(*) FROM parcels_travis_enrichment WHERE raw IS NOT NULL), 0), 2) AS pct_coverage
FROM parcels_travis_enrichment,
LATERAL jsonb_object_keys(raw) AS key
WHERE raw IS NOT NULL
GROUP BY key
ORDER BY frequency DESC
LIMIT 80;
```

## Sample Raw Payloads (10)

Run the SQL query to generate pretty-printed samples:

```sql
SELECT 
  parcel_id,
  jsonb_pretty(raw) AS raw_pretty
FROM parcels_travis_enrichment
WHERE raw IS NOT NULL
ORDER BY ingested_at DESC NULLS LAST, parcel_id
LIMIT 10;
```

## Usage

To generate the full report:

```bash
psql "$DATABASE_URL" -f scripts/sql/travis_enrichment_keys_report.sql > tmp/enrichment_keys_report.txt
```

Then review `tmp/enrichment_keys_report.txt` for:
- Top 80 keys with frequency and coverage percentage
- 10 sample payloads for manual inspection


