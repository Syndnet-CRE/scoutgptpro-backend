-- Check distribution by city/state in properties table
SELECT 
  COALESCE(city, siteCity, 'NULL') as city,
  COALESCE(state, siteState, 'NULL') as state,
  COUNT(*) as count
FROM properties 
GROUP BY COALESCE(city, siteCity), COALESCE(state, siteState)
ORDER BY COUNT(*) DESC 
LIMIT 30;


