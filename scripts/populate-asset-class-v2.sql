-- Populate asset_class in parcel_features_travis
-- Version 2: Based on actual data audit findings
-- 
-- Strategy:
-- 1. Use properties.asset_class as primary source (349,642 parcels have this)
-- 2. Map properties.asset_class values to our standard values:
--    - residential, multifamily, mobile_home_park → 'residential'
--    - commercial, retail, office, industrial, hospitality, self_storage → 'commercial'
--    - land → 'land'
--    - other, infrastructure, civic → 'unknown'
-- 3. For remaining parcels, derive from improvement_value:
--    - improvement_value = 0 or NULL → 'land'
--    - improvement_value > 0 → 'unknown' (can't determine type without more data)

BEGIN;

-- Step 1: Update from properties table (primary source)
UPDATE parcel_features_travis pft
SET asset_class = CASE
  WHEN p.asset_class IN ('residential', 'multifamily', 'mobile_home_park') THEN 'residential'
  WHEN p.asset_class IN ('commercial', 'retail', 'office', 'industrial', 'hospitality', 'self_storage') THEN 'commercial'
  WHEN p.asset_class = 'land' THEN 'land'
  ELSE 'unknown'
END,
updated_at = NOW()
FROM properties p
WHERE pft.parcel_id = p."parcelId"
  AND p.asset_class IS NOT NULL
  AND p.asset_class != 'unknown'
  AND (pft.asset_class IS NULL OR pft.asset_class = 'unknown' OR pft.asset_class = 'land');

-- Step 2: For parcels not in properties table or without asset_class, derive from improvement_value
UPDATE parcel_features_travis
SET asset_class = CASE
  WHEN improvement_value IS NULL OR improvement_value = 0 THEN 'land'
  ELSE 'unknown'  -- Has improvements but we don't know the type
END,
updated_at = NOW()
WHERE (asset_class IS NULL 
   OR asset_class = 'unknown'
   OR asset_class = 'land')
   AND parcel_id NOT IN (
     SELECT p."parcelId" 
     FROM properties p 
     WHERE p.asset_class IS NOT NULL 
       AND p.asset_class != 'unknown'
   );

-- Step 3: Verify distribution
SELECT 'asset_class distribution:' as check;
SELECT asset_class, COUNT(*) as count, 
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct
FROM parcel_features_travis 
GROUP BY asset_class 
ORDER BY count DESC;

COMMIT;

-- Expected results:
-- - residential: ~X% (from properties table)
-- - commercial: ~X% (from properties table)
-- - land: ~X% (from properties table + improvement_value = 0)
-- - unknown: ~X% (parcels with improvements but no classification)
