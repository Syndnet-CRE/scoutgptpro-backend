-- Verification queries for Phase 0 ETL
-- Run these after populate-asset-class-v2.sql and populate-owner-segment-v2.sql

-- ============================================================================
-- ASSET_CLASS VERIFICATION
-- ============================================================================

SELECT '=== ASSET_CLASS VERIFICATION ===' as section;

-- 1. Distribution of asset_class
SELECT 'asset_class distribution:' as check;
SELECT asset_class, COUNT(*) as count, 
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct
FROM parcel_features_travis
GROUP BY asset_class
ORDER BY count DESC;

-- 2. Check for NULL asset_class (should be 0 or very few)
SELECT 'NULL asset_class count:' as check;
SELECT COUNT(*) as null_count
FROM parcel_features_travis
WHERE asset_class IS NULL;

-- 3. Check how many came from properties table
SELECT 'asset_class source (properties table):' as check;
SELECT 
  p.asset_class as properties_asset_class,
  pft.asset_class as pft_asset_class,
  COUNT(*) as count
FROM properties p
INNER JOIN parcel_features_travis pft ON p."parcelId" = pft.parcel_id
WHERE p.asset_class IS NOT NULL
GROUP BY p.asset_class, pft.asset_class
ORDER BY count DESC
LIMIT 20;

-- 4. Check parcels with improvements but classified as 'land' (potential issues)
SELECT 'land parcels with improvements (potential issues):' as check;
SELECT COUNT(*) as land_with_improvements
FROM parcel_features_travis
WHERE asset_class = 'land'
  AND improvement_value > 0;

-- 5. Check parcels without improvements but not classified as 'land' (potential issues)
SELECT 'non-land parcels without improvements (potential issues):' as check;
SELECT 
  asset_class,
  COUNT(*) as count
FROM parcel_features_travis
WHERE (improvement_value IS NULL OR improvement_value = 0)
  AND asset_class != 'land'
GROUP BY asset_class
ORDER BY count DESC;

-- ============================================================================
-- OWNER_SEGMENT VERIFICATION
-- ============================================================================

SELECT '=== OWNER_SEGMENT VERIFICATION ===' as section;

-- 1. Distribution of owner_segment
SELECT 'owner_segment distribution:' as check;
SELECT owner_segment, COUNT(*) as count,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct
FROM parcel_features_travis
GROUP BY owner_segment
ORDER BY count DESC;

-- 2. Check for NULL owner_segment (should be 0)
SELECT 'NULL owner_segment count:' as check;
SELECT COUNT(*) as null_count
FROM parcel_features_travis
WHERE owner_segment IS NULL;

-- 3. Check absentee detection (mail_state != 'TX')
SELECT 'absentee detection (mail_state != TX):' as check;
SELECT 
  pft.owner_segment,
  pft.mail_state,
  COUNT(*) as count
FROM parcel_features_travis pft
WHERE pft.mail_state IS NOT NULL
GROUP BY pft.owner_segment, pft.mail_state
ORDER BY count DESC
LIMIT 20;

-- 4. Check institutional name patterns
SELECT 'institutional name patterns:' as check;
SELECT 
  owner_segment,
  COUNT(*) as count
FROM parcel_features_travis
WHERE owner_name_raw ILIKE '%REIT%'
   OR owner_name_raw ILIKE '%HOLDINGS%'
   OR owner_name_raw ILIKE '%FUND%'
GROUP BY owner_segment;

-- 5. Check owner_entity_type vs owner_segment mapping
SELECT 'owner_entity_type vs owner_segment mapping:' as check;
SELECT 
  owner_entity_type,
  owner_segment,
  COUNT(*) as count
FROM parcel_features_travis
WHERE owner_entity_type IS NOT NULL
GROUP BY owner_entity_type, owner_segment
ORDER BY owner_entity_type, count DESC;

-- ============================================================================
-- DATA QUALITY CHECKS
-- ============================================================================

SELECT '=== DATA QUALITY CHECKS ===' as section;

-- 1. Total parcels
SELECT 'Total parcels:' as check;
SELECT COUNT(*) as total_parcels FROM parcel_features_travis;

-- 2. Parcels with both asset_class and owner_segment populated
SELECT 'Fully populated parcels (both asset_class and owner_segment):' as check;
SELECT COUNT(*) as fully_populated
FROM parcel_features_travis
WHERE asset_class IS NOT NULL 
  AND owner_segment IS NOT NULL
  AND asset_class != 'unknown'
  AND owner_segment != 'unknown';

-- 3. Parcels still needing classification
SELECT 'Parcels needing classification:' as check;
SELECT 
  CASE 
    WHEN asset_class IS NULL OR asset_class = 'unknown' THEN 'asset_class_missing'
    WHEN owner_segment IS NULL OR owner_segment = 'unknown' THEN 'owner_segment_missing'
    ELSE 'ok'
  END as status,
  COUNT(*) as count
FROM parcel_features_travis
GROUP BY status
ORDER BY count DESC;

-- 4. mail_state population
SELECT 'mail_state population:' as check;
SELECT COUNT(*) as total, 
       COUNT(mail_state) as has_mail_state,
       ROUND(100.0 * COUNT(mail_state) / COUNT(*), 2) as pct_populated
FROM parcel_features_travis;

-- 5. owner_entity_type distribution
SELECT 'owner_entity_type distribution:' as check;
SELECT owner_entity_type, COUNT(*) as count,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct
FROM parcel_features_travis
WHERE owner_entity_type IS NOT NULL
GROUP BY owner_entity_type
ORDER BY count DESC;
