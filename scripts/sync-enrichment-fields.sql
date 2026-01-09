-- Sync additional useful fields from parcels_travis_enrichment.raw JSONB
-- This should run BEFORE populate-asset-class-v2.sql and populate-owner-segment-v2.sql
--
-- Fields synced:
-- 1. mail_state - For absentee detection (used in owner_segment population)
-- 2. year_built - Building year (if missing)
-- 3. improvement_value - Improvement value (if missing)

BEGIN;

-- Step 1: Sync mail_state from enrichment raw JSONB
UPDATE parcel_features_travis pft
SET mail_state = pte.raw->>'MAIL_STAT',
    updated_at = NOW()
FROM parcels_travis_enrichment pte
WHERE pte.parcel_id = pft.parcel_id
  AND pte.raw->>'MAIL_STAT' IS NOT NULL
  AND pte.raw->>'MAIL_STAT' != ''
  AND pft.mail_state IS NULL;

-- Step 2: Sync year_built from enrichment raw JSONB
UPDATE parcel_features_travis pft
SET year_built = (pte.raw->>'YEAR_BUILT')::INTEGER,
    updated_at = NOW()
FROM parcels_travis_enrichment pte
WHERE pte.parcel_id = pft.parcel_id
  AND pte.raw->>'YEAR_BUILT' IS NOT NULL
  AND pte.raw->>'YEAR_BUILT' != ''
  AND (pte.raw->>'YEAR_BUILT')::INTEGER > 1800
  AND (pte.raw->>'YEAR_BUILT')::INTEGER <= EXTRACT(YEAR FROM NOW())::INTEGER + 1
  AND pft.year_built IS NULL;

-- Step 3: Sync improvement_value if missing (fallback)
UPDATE parcel_features_travis pft
SET improvement_value = (pte.raw->>'IMP_VALUE')::NUMERIC,
    updated_at = NOW()
FROM parcels_travis_enrichment pte
WHERE pte.parcel_id = pft.parcel_id
  AND pte.raw->>'IMP_VALUE' IS NOT NULL
  AND pte.raw->>'IMP_VALUE' != ''
  AND (pte.raw->>'IMP_VALUE')::NUMERIC >= 0
  AND pft.improvement_value IS NULL;

-- Step 4: Verification
SELECT 'mail_state sync:' as check;
SELECT COUNT(*) as total, 
       COUNT(mail_state) as has_mail_state,
       ROUND(100.0 * COUNT(mail_state) / COUNT(*), 2) as pct_populated
FROM parcel_features_travis;

SELECT 'year_built sync:' as check;
SELECT COUNT(*) as total,
       COUNT(year_built) as has_year_built,
       ROUND(100.0 * COUNT(year_built) / COUNT(*), 2) as pct_populated
FROM parcel_features_travis;

SELECT 'improvement_value sync:' as check;
SELECT COUNT(*) as total,
       COUNT(improvement_value) as has_improvement_value,
       ROUND(100.0 * COUNT(improvement_value) / COUNT(*), 2) as pct_populated
FROM parcel_features_travis;

COMMIT;
