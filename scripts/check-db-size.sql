-- Check total database size
SELECT pg_size_pretty(pg_database_size(current_database())) as total_size;

-- Check size of each table
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname || '.' || tablename)) as table_size,
  pg_size_pretty(pg_indexes_size(schemaname || '.' || tablename)) as index_size,
  pg_total_relation_size(schemaname || '.' || tablename) as total_size_bytes
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;


