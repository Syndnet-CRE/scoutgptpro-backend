-- Verification Queries for parcels_travis Table
-- Run these after loading parcels to verify data integrity

-- 1. Total count
SELECT COUNT(*) as total_parcels FROM parcels_travis;

-- 2. Count with null geometries (should be 0)
SELECT COUNT(*) as null_geometries 
FROM parcels_travis 
WHERE geom IS NULL;

-- 3. Verify SRID (should all be 4326)
SELECT 
  COUNT(*) as total,
  COUNT(DISTINCT ST_SRID(geom)) as distinct_srids,
  MIN(ST_SRID(geom)) as min_srid,
  MAX(ST_SRID(geom)) as max_srid
FROM parcels_travis;

-- 4. Invalid geometries (should be 0 or very few)
SELECT COUNT(*) as invalid_geometries
FROM parcels_travis
WHERE NOT ST_IsValid(geom);

-- 5. Sample parcel_ids (verify format)
SELECT 
  parcel_id,
  LENGTH(parcel_id) as id_length,
  ST_GeometryType(geom) as geom_type,
  ST_SRID(geom) as srid
FROM parcels_travis
LIMIT 5;

-- 6. Join with properties table (verify parcel_id matches)
SELECT 
  COUNT(*) as matching_properties
FROM parcels_travis pt
INNER JOIN properties p ON pt.parcel_id = p."parcelId";

-- 7. Parcels without matching properties
SELECT COUNT(*) as orphaned_parcels
FROM parcels_travis pt
LEFT JOIN properties p ON pt.parcel_id = p."parcelId"
WHERE p."parcelId" IS NULL;

-- 8. Geometry statistics
SELECT 
  COUNT(*) as total,
  COUNT(DISTINCT ST_GeometryType(geom)) as distinct_types,
  AVG(ST_Area(geom::geography)) as avg_area_sqm,
  MIN(ST_Area(geom::geography)) as min_area_sqm,
  MAX(ST_Area(geom::geography)) as max_area_sqm
FROM parcels_travis
WHERE geom IS NOT NULL;

-- 9. Index verification
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'parcels_travis'
ORDER BY indexname;

-- 10. Bounding box of all parcels
SELECT 
  ST_XMin(ST_Extent(geom)) as west,
  ST_YMin(ST_Extent(geom)) as south,
  ST_XMax(ST_Extent(geom)) as east,
  ST_YMax(ST_Extent(geom)) as north
FROM parcels_travis;


