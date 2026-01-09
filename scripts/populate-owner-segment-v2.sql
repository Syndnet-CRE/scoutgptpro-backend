-- Populate owner_segment in parcel_features_travis
-- Version 2: Based on actual data audit findings
--
-- Strategy:
-- 1. Sync mail_state from parcels_travis_enrichment.raw->>'MAIL_STAT'
-- 2. Use owner_entity_type + mail_state + owner name patterns for segmentation:
--    - Institutional: Name patterns (REIT, Fund, Holdings, etc.)
--    - Absentee: mail_state != 'TX'
--    - Small operator: LLC/Corp entities
--    - Trust/Estate: trust_estate entity type
--    - Mom & pop: Person entities
--    - Default: local_owner (safer than unknown)

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

-- Step 2: Populate owner_segment based on owner_entity_type, mail_state, and name patterns
UPDATE parcel_features_travis
SET owner_segment = CASE
    -- Institutional: Large corporate names or REITs (check first, highest priority)
    WHEN owner_name_raw ILIKE '%REIT%' 
      OR owner_name_raw ILIKE '%REAL ESTATE INVESTMENT TRUST%'
      OR owner_name_raw ILIKE '%INVESTMENT TRUST%'
      OR owner_name_raw ILIKE '%FUND%'
      OR owner_name_raw ILIKE '%CAPITAL%'
      OR owner_name_raw ILIKE '%INVESTORS%'
      OR owner_name_raw ILIKE '%HOLDINGS%'
      OR owner_name_raw ILIKE '%PROPERTIES LLC%'
      OR owner_name_raw ILIKE '%PROPERTIES LP%'
      OR owner_name_raw ILIKE '%MANAGEMENT LLC%'
      OR owner_name_raw ILIKE '%INVESTMENTS LLC%'
      OR owner_name_raw ILIKE '%PARTNERS LP%'
      OR owner_name_raw ILIKE '%LIMITED PARTNERSHIP%'
      OR owner_name_raw ILIKE '%PENSION%'
      OR owner_name_raw ILIKE '%RETIREMENT%'
      OR owner_name_raw ILIKE '%ENDOWMENT%'
      OR owner_name_raw ILIKE '%FOUNDATION%'
    THEN 'institutional'
    
    -- Absentee: Out of state owners
    WHEN mail_state IS NOT NULL AND mail_state != 'TX' THEN 'absentee'
    
    -- Small operator: LLC/Corp entities
    WHEN owner_entity_type IN ('llc', 'corp', 'inc', 'lp') THEN 'small_operator'
    
    -- Trust/Estate
    WHEN owner_entity_type = 'trust_estate' THEN 'trust_estate'
    
    -- Mom and pop: Individual persons
    WHEN owner_entity_type = 'person' THEN 'mom_pop'
    
    -- Default: local_owner (safer than unknown)
    ELSE 'local_owner'
END,
updated_at = NOW()
WHERE owner_segment IS NULL OR owner_segment = 'unknown';

-- Step 3: Verify distribution
SELECT 'owner_segment distribution:' as check;
SELECT owner_segment, COUNT(*) as count,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct
FROM parcel_features_travis
GROUP BY owner_segment
ORDER BY count DESC;

COMMIT;

-- Expected results:
-- - institutional: ~X% (from name patterns)
-- - absentee: ~X% (from mail_state != 'TX')
-- - small_operator: ~X% (LLC/Corp entities)
-- - trust_estate: ~X% (Trust/Estate entities)
-- - mom_pop: ~X% (Person entities)
-- - local_owner: ~X% (default for remaining)
