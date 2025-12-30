-- View: v_travis_enrichment_latest
-- Purpose: Deduplicate parcels_travis_enrichment_stage by 6-digit parcel_id
-- Join key: RIGHT(REGEXP_REPLACE(TRIM(detected_id::text), E'\.0+$', ''), 6)
-- IMPORTANT: Only includes parcel_ids that exist in parcels_travis (preserves leading zeros)

CREATE OR REPLACE VIEW v_travis_enrichment_latest AS
SELECT DISTINCT ON (p.parcel_id)
  p.parcel_id,
  s.raw,
  s.ingested_at
FROM parcels_travis_enrichment_stage s
INNER JOIN parcels_travis p ON 
  p.parcel_id = RIGHT(REGEXP_REPLACE(TRIM(s.detected_id::text), E'\\.0+$', ''), 6)
WHERE s.detected_id IS NOT NULL
  AND s.detected_id::text ~ '^[0-9]+(\\.[0-9]+)?$'
ORDER BY p.parcel_id, s.ingested_at DESC NULLS LAST;

COMMENT ON VIEW v_travis_enrichment_latest IS 'Latest enrichment data per 6-digit parcel_id, deduplicated by ingested_at DESC, only includes parcel_ids that exist in parcels_travis';
