-- Count rows in major tables
SELECT 'properties' as table_name, COUNT(*) as row_count FROM properties
UNION ALL
SELECT 'parcels', COUNT(*) FROM parcels
UNION ALL
SELECT 'permits', COUNT(*) FROM permits WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permits')
UNION ALL
SELECT 'recorder_transactions', COUNT(*) FROM recorder_transactions WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recorder_transactions')
UNION ALL
SELECT 'tax_delinquent', COUNT(*) FROM tax_delinquent WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tax_delinquent')
UNION ALL
SELECT 'listings', COUNT(*) FROM listings WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'listings')
UNION ALL
SELECT 'deals', COUNT(*) FROM deals WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'deals')
UNION ALL
SELECT 'users', COUNT(*) FROM users WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users');


