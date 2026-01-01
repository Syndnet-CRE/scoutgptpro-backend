-- Validation: Check materialized column coverage and sample data

\echo '========================================'
\echo 'Travis Enrichment Materialization Validation'
\echo '========================================'
\echo ''

-- 1. Column coverage (non-null count + percentage)
\echo '1. Column coverage (non-null count and percentage):'
SELECT 
  COUNT(*) AS total_rows,
  COUNT(owner_name) AS owner_name_count,
  ROUND(100.0 * COUNT(owner_name) / NULLIF(COUNT(*), 0), 2) AS owner_name_pct,
  COUNT(owner_type) AS owner_type_count,
  ROUND(100.0 * COUNT(owner_type) / NULLIF(COUNT(*), 0), 2) AS owner_type_pct,
  COUNT(mailing_address) AS mailing_address_count,
  ROUND(100.0 * COUNT(mailing_address) / NULLIF(COUNT(*), 0), 2) AS mailing_address_pct,
  COUNT(situs_address) AS situs_address_count,
  ROUND(100.0 * COUNT(situs_address) / NULLIF(COUNT(*), 0), 2) AS situs_address_pct,
  COUNT(land_use_code) AS land_use_code_count,
  ROUND(100.0 * COUNT(land_use_code) / NULLIF(COUNT(*), 0), 2) AS land_use_code_pct,
  COUNT(land_use_description) AS land_use_description_count,
  ROUND(100.0 * COUNT(land_use_description) / NULLIF(COUNT(*), 0), 2) AS land_use_description_pct,
  COUNT(assessed_land_value) AS assessed_land_value_count,
  ROUND(100.0 * COUNT(assessed_land_value) / NULLIF(COUNT(*), 0), 2) AS assessed_land_value_pct,
  COUNT(assessed_improvement_value) AS assessed_improvement_value_count,
  ROUND(100.0 * COUNT(assessed_improvement_value) / NULLIF(COUNT(*), 0), 2) AS assessed_improvement_value_pct,
  COUNT(assessed_total_value) AS assessed_total_value_count,
  ROUND(100.0 * COUNT(assessed_total_value) / NULLIF(COUNT(*), 0), 2) AS assessed_total_value_pct,
  COUNT(year_built) AS year_built_count,
  ROUND(100.0 * COUNT(year_built) / NULLIF(COUNT(*), 0), 2) AS year_built_pct,
  COUNT(acreage) AS acreage_count,
  ROUND(100.0 * COUNT(acreage) / NULLIF(COUNT(*), 0), 2) AS acreage_pct,
  COUNT(zoning_code) AS zoning_code_count,
  ROUND(100.0 * COUNT(zoning_code) / NULLIF(COUNT(*), 0), 2) AS zoning_code_pct,
  COUNT(flood_zone) AS flood_zone_count,
  ROUND(100.0 * COUNT(flood_zone) / NULLIF(COUNT(*), 0), 2) AS flood_zone_pct,
  COUNT(tax_delinquent_flag) AS tax_delinquent_flag_count,
  ROUND(100.0 * COUNT(tax_delinquent_flag) / NULLIF(COUNT(*), 0), 2) AS tax_delinquent_flag_pct,
  COUNT(last_sale_date) AS last_sale_date_count,
  ROUND(100.0 * COUNT(last_sale_date) / NULLIF(COUNT(*), 0), 2) AS last_sale_date_pct,
  COUNT(last_sale_price) AS last_sale_price_count,
  ROUND(100.0 * COUNT(last_sale_price) / NULLIF(COUNT(*), 0), 2) AS last_sale_price_pct,
  COUNT(homestead_exemption_flag) AS homestead_exemption_flag_count,
  ROUND(100.0 * COUNT(homestead_exemption_flag) / NULLIF(COUNT(*), 0), 2) AS homestead_exemption_flag_pct
FROM parcels_travis_enrichment;

\echo ''

-- 2. Sample rows (20)
\echo '2. Sample rows (parcel_id, owner_name, situs_address, assessed_total_value, acreage, zoning_code, flood_zone, last_sale_date, last_sale_price):'
SELECT 
  parcel_id,
  owner_name,
  situs_address,
  assessed_total_value,
  acreage,
  zoning_code,
  flood_zone,
  last_sale_date,
  last_sale_price
FROM parcels_travis_enrichment
WHERE raw IS NOT NULL
ORDER BY ingested_at DESC NULLS LAST, parcel_id
LIMIT 20;

\echo ''

-- 3. Value distributions
\echo '3. Top 10 land_use_code values:'
SELECT 
  land_use_code,
  COUNT(*) AS count
FROM parcels_travis_enrichment
WHERE land_use_code IS NOT NULL
GROUP BY land_use_code
ORDER BY count DESC
LIMIT 10;

\echo ''

\echo '4. Top 10 zoning_code values:'
SELECT 
  zoning_code,
  COUNT(*) AS count
FROM parcels_travis_enrichment
WHERE zoning_code IS NOT NULL
GROUP BY zoning_code
ORDER BY count DESC
LIMIT 10;

\echo ''

\echo '5. Assessed value statistics:'
SELECT 
  COUNT(*) AS total_with_values,
  MIN(assessed_total_value) AS min_assessed_value,
  MAX(assessed_total_value) AS max_assessed_value,
  ROUND(AVG(assessed_total_value), 2) AS avg_assessed_value,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY assessed_total_value) AS median_assessed_value
FROM parcels_travis_enrichment
WHERE assessed_total_value IS NOT NULL;

\echo ''
\echo '========================================'
\echo 'Validation complete'
\echo '========================================'


