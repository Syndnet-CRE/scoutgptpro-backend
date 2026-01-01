-- ============================================================================
-- Travis Xref Neon Verification Queries
-- ============================================================================
-- Run these queries in Neon after ingestion to verify data integrity
-- ============================================================================

-- A) Table Existence Check
SELECT 
  to_regclass('public.xref_parcel_property_travis') as xref_table_exists,
  to_regclass('public.xref_parcel_property_travis_conflicts') as conflicts_table_exists;

-- Expected: Both should return table names (not NULL)

-- B) Row Counts
SELECT 
  'xref_parcel_property_travis' as table_name,
  COUNT(*) as row_count
FROM xref_parcel_property_travis
UNION ALL
SELECT 
  'xref_parcel_property_travis_conflicts' as table_name,
  COUNT(*) as row_count
FROM xref_parcel_property_travis_conflicts;

-- Expected: 
-- xref_parcel_property_travis: ~401,851 rows
-- xref_parcel_property_travis_conflicts: ~5,067 rows

-- C) Overlap Check (MUST BE 0)
SELECT COUNT(*) as overlap_count
FROM xref_parcel_property_travis x
INNER JOIN xref_parcel_property_travis_conflicts c ON x.parcel_id = c.parcel_id;

-- Expected: 0 (no parcel_id should appear in both tables)

-- D) Coverage % Against properties.parcelId
SELECT 
  COUNT(DISTINCT x.parcel_id) as mapped_parcel_ids,
  (SELECT COUNT(DISTINCT "parcelId") FROM properties WHERE "parcelId" IS NOT NULL) as total_parcel_ids,
  ROUND(
    100.0 * COUNT(DISTINCT x.parcel_id) / 
    (SELECT COUNT(DISTINCT "parcelId") FROM properties WHERE "parcelId" IS NOT NULL), 
    2
  ) as coverage_percentage
FROM xref_parcel_property_travis x
INNER JOIN properties p ON x.parcel_id = p."parcelId";

-- Expected: ~99% coverage (349,090 / 352,431)

-- E) Sample Unique Mappings
SELECT 
  x.parcel_id,
  x.attom_id,
  x.source,
  x.created_at
FROM xref_parcel_property_travis x
ORDER BY x.created_at DESC
LIMIT 10;

-- F) Sample Conflicts (Worst Collisions)
SELECT 
  parcel_id,
  attom_id_count,
  attom_ids[1:5] as first_5_attom_ids,
  created_at
FROM xref_parcel_property_travis_conflicts
ORDER BY attom_id_count DESC
LIMIT 10;

-- G) Index Verification
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('xref_parcel_property_travis', 'xref_parcel_property_travis_conflicts')
ORDER BY tablename, indexname;

-- Expected: Indexes on parcel_id, attom_id, and attom_id_count


