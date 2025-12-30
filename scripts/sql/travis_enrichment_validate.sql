-- Validation: Check parcels_travis_enrichment data quality and join coverage

\echo '========================================'
\echo 'Travis Enrichment Validation Report'
\echo '========================================'
\echo ''

-- 1. Counts in parcels_travis_enrichment
\echo '1. parcels_travis_enrichment counts:'
SELECT 
  COUNT(*) AS total_rows,
  COUNT(DISTINCT parcel_id) AS distinct_parcel_ids,
  COUNT(*) FILTER (WHERE raw IS NOT NULL) AS rows_with_raw,
  COUNT(*) FILTER (WHERE ingested_at IS NOT NULL) AS rows_with_ingested_at
FROM parcels_travis_enrichment;

\echo ''

-- 2. Counts in v_travis_enrichment_latest view
\echo '2. v_travis_enrichment_latest view statistics:'
SELECT 
  COUNT(*) AS view_total_rows,
  COUNT(DISTINCT parcel_id) AS view_distinct_parcel_ids,
  MIN(ingested_at) AS earliest_ingested_at,
  MAX(ingested_at) AS latest_ingested_at
FROM v_travis_enrichment_latest;

\echo ''

-- 3. Join coverage with parcels_travis
\echo '3. Join coverage with parcels_travis:'
SELECT 
  COUNT(*) AS matched_rows
FROM parcels_travis_enrichment e
INNER JOIN parcels_travis p ON e.parcel_id = p.parcel_id;

\echo ''

-- 4. Sample rows (20) showing parcel_id + ingested_at + raw length
\echo '4. Sample rows (parcel_id, ingested_at, raw_length):'
SELECT 
  parcel_id,
  ingested_at,
  LENGTH(raw::text) AS raw_length
FROM parcels_travis_enrichment
ORDER BY ingested_at DESC NULLS LAST, parcel_id
LIMIT 20;

\echo ''

-- 5. Stage statistics
\echo '5. parcels_travis_enrichment_stage statistics:'
SELECT 
  COUNT(*) AS stage_total_rows,
  COUNT(DISTINCT detected_id) AS stage_distinct_detected_ids,
  COUNT(*) FILTER (WHERE detected_id IS NOT NULL AND detected_id::text ~ '^[0-9]+(\\.[0-9]+)?$') AS stage_valid_numeric_ids
FROM parcels_travis_enrichment_stage;

\echo ''

-- 6. Join key distribution (6-digit parcel_id from stage that match parcels_travis)
\echo '6. Join key distribution (matching parcel_ids):'
SELECT 
  RIGHT(REGEXP_REPLACE(TRIM(s.detected_id::text), E'\\.0+$', ''), 6) AS parcel_id_6digit,
  COUNT(*) AS count
FROM parcels_travis_enrichment_stage s
INNER JOIN parcels_travis p ON 
  p.parcel_id = RIGHT(REGEXP_REPLACE(TRIM(s.detected_id::text), E'\\.0+$', ''), 6)
WHERE s.detected_id IS NOT NULL
  AND s.detected_id::text ~ '^[0-9]+(\\.[0-9]+)?$'
GROUP BY RIGHT(REGEXP_REPLACE(TRIM(s.detected_id::text), E'\\.0+$', ''), 6)
ORDER BY count DESC
LIMIT 10;

\echo ''
\echo '========================================'
\echo 'Validation complete'
\echo '========================================'
