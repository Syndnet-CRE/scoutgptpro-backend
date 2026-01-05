-- Generate enrichment keys report
-- Top 80 top-level JSON keys by frequency + 10 sample payloads

\echo '========================================'
\echo 'Enrichment Keys Report'
\echo '========================================'
\echo ''

-- Top 80 top-level JSON keys by frequency
\echo 'Top 80 top-level JSON keys by frequency:'
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

\echo ''
\echo '========================================'
\echo 'Sample Raw Payloads (10)'
\echo '========================================'
\echo ''

-- 10 sample raw payloads (pretty printed)
SELECT 
  parcel_id,
  jsonb_pretty(raw) AS raw_pretty
FROM parcels_travis_enrichment
WHERE raw IS NOT NULL
ORDER BY ingested_at DESC NULLS LAST, parcel_id
LIMIT 10;

\echo ''
\echo '========================================'
\echo 'Report complete'
\echo '========================================'



