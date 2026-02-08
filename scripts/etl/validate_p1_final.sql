-- ATTOM P1 Final Tables Validation Queries
-- Run after all 3 tables are loaded

-- Row counts verification
SELECT 'attom_climate_change_risk' AS tbl, count(*) FROM attom_climate_change_risk
UNION ALL
SELECT 'attom_boundary_floodzones', count(*) FROM attom_boundary_floodzones
UNION ALL
SELECT 'attom_building_permit', count(*) FROM attom_building_permit;

-- Expected results:
-- attom_climate_change_risk: 415,848
-- attom_boundary_floodzones: 410,656
-- attom_building_permit: 3,121,551

-- Join verification (all should join to assessor via ATTOMID)
SELECT 'climate_join' AS test, count(*) 
FROM attom_climate_change_risk c 
JOIN attom_assessor a ON c.attomid = a.attom_id

UNION ALL

SELECT 'floodzones_join', count(*) 
FROM attom_boundary_floodzones f 
JOIN attom_assessor a ON f.attomid = a.attom_id

UNION ALL

SELECT 'permit_join', count(DISTINCT bp.attomid) 
FROM attom_building_permit bp 
JOIN attom_assessor a ON bp.attomid = a.attom_id;

-- Sample data checks for climate change risk
SELECT attomid, totalrisk, heatriskscore, floodriskscore, wildfireriskscore 
FROM attom_climate_change_risk 
WHERE totalrisk IS NOT NULL AND totalrisk != '' 
LIMIT 5;

-- Sample data checks for flood zones
SELECT attomid, geoid, geotype 
FROM attom_boundary_floodzones 
LIMIT 5;

-- Sample data checks for building permits
SELECT attomid, type, subtype, status, jobvalue, effectivedate 
FROM attom_building_permit 
WHERE jobvalue IS NOT NULL AND jobvalue != '' 
ORDER BY effectivedate DESC 
LIMIT 5;