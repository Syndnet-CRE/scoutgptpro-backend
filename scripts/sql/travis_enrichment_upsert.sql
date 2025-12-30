-- Upsert: Refresh parcels_travis_enrichment from latest stage data
-- Uses RIGHT(detected_id, 6) as parcel_id join key
-- Only updates if incoming ingested_at is newer than existing
-- Attribute-only enrichment, no geometry changes
-- Minimal columns: parcel_id, raw, ingested_at

-- Step 1: Ensure ingested_at column exists in parcels_travis_enrichment
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parcels_travis_enrichment'
      AND column_name = 'ingested_at'
  ) THEN
    ALTER TABLE parcels_travis_enrichment
    ADD COLUMN ingested_at TIMESTAMPTZ NULL;
    
    COMMENT ON COLUMN parcels_travis_enrichment.ingested_at IS 'Timestamp when enrichment data was ingested from stage';
  END IF;
  
  -- Verify raw column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parcels_travis_enrichment'
      AND column_name = 'raw'
  ) THEN
    RAISE EXCEPTION 'Column raw does not exist in parcels_travis_enrichment. Schema migration required.';
  END IF;
END $$;

-- Step 2: Create view (source from separate file or inline)
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

-- Step 3: Upsert using v_travis_enrichment_latest view (minimal columns only)
INSERT INTO parcels_travis_enrichment (
  parcel_id,
  raw,
  ingested_at
)
SELECT 
  parcel_id,
  raw,
  ingested_at
FROM v_travis_enrichment_latest
ON CONFLICT (parcel_id) DO UPDATE SET
  raw = EXCLUDED.raw,
  ingested_at = CASE
    WHEN EXCLUDED.ingested_at IS NOT NULL AND (
      parcels_travis_enrichment.ingested_at IS NULL OR
      EXCLUDED.ingested_at > parcels_travis_enrichment.ingested_at
    ) THEN EXCLUDED.ingested_at
    ELSE parcels_travis_enrichment.ingested_at
  END
WHERE parcels_travis_enrichment.ingested_at IS NULL
   OR EXCLUDED.ingested_at > parcels_travis_enrichment.ingested_at;

-- Log summary
DO $$
DECLARE
  v_count INTEGER;
  v_distinct_count INTEGER;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT parcel_id)
  INTO v_count, v_distinct_count
  FROM parcels_travis_enrichment;
  
  RAISE NOTICE 'Upsert complete. Total rows: %, Distinct parcel_id: %', v_count, v_distinct_count;
END $$;
