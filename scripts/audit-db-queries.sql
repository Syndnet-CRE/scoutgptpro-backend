-- Database Audit Queries for CURSOR_SYSTEM_AUDIT_JAN23.md
-- Run these queries and capture results

-- 2.1 Core Tables - Row Counts
SELECT 
  'parcel_features_travis' as table_name, COUNT(*) as rows FROM parcel_features_travis
UNION ALL SELECT 'parcels_travis', COUNT(*) FROM parcels_travis
UNION ALL SELECT 'sessions', COUNT(*) FROM sessions
UNION ALL SELECT 'query_intents', COUNT(*) FROM query_intents
UNION ALL SELECT 'artifacts', COUNT(*) FROM artifacts
UNION ALL SELECT 'crm_staging', COUNT(*) FROM crm_staging
UNION ALL SELECT 'deal_rooms', COUNT(*) FROM deal_rooms
UNION ALL SELECT 'deal_room_artifacts', COUNT(*) FROM deal_room_artifacts
UNION ALL SELECT 'reference_geometries', COUNT(*) FROM reference_geometries
UNION ALL SELECT 'opportunity_zones', COUNT(*) FROM opportunity_zones
ORDER BY table_name;

-- 2.2 parcel_features_travis Schema
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'parcel_features_travis' 
ORDER BY ordinal_position;

-- 2.3 Sample Property Record
SELECT parcel_id, situs_address, owner_name_raw, owner_entity_type, 
       acres_calc, asset_class, market_value, tax_delinquent_flag,
       ST_AsText(geom_centroid) as centroid
FROM parcel_features_travis 
WHERE situs_address IS NOT NULL AND situs_address != ''
LIMIT 3;

-- 2.4 Reference Geometries Status
SELECT name, feature_type, ST_GeometryType(geometry) as geom_type
FROM reference_geometries
ORDER BY feature_type, name
LIMIT 20;

SELECT COUNT(*) as total_reference_geometries FROM reference_geometries;

-- 2.5 Sessions Table Schema
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'sessions' 
ORDER BY ordinal_position;

-- 2.6 Artifacts Table Schema
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'artifacts' 
ORDER BY ordinal_position;
