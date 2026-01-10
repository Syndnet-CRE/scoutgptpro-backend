#!/usr/bin/env node
/**
 * Foundation Audit: Database Schema and Data Quality Queries
 * 
 * This script runs all queries needed for the foundation audit and saves results to JSON files.
 */

import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const { Pool } = pg;

// Get DATABASE_URL from environment
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.error('   Make sure .env file exists with DATABASE_URL set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1
});

const outputDir = path.join(__dirname, '..', 'audit-results');
await fs.mkdir(outputDir, { recursive: true });

async function runQuery(query, description) {
  try {
    console.log(`\n📊 ${description}...`);
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error(`❌ Error running query: ${description}`);
    console.error(`Query: ${query.substring(0, 200)}...`);
    console.error(`Error: ${error.message}`);
    return null;
  }
}

async function saveResults(filename, data) {
  const filepath = path.join(outputDir, filename);
  await fs.writeFile(filepath, JSON.stringify(data, null, 2));
  console.log(`✅ Saved ${filename}`);
}

// ============================================================================
// PHASE 1: SCHEMA EXTRACTION
// ============================================================================

console.log('🔍 PHASE 1: SCHEMA EXTRACTION');

// 1.1 Get all tables
const tables = await runQuery(`
  SELECT table_name, 
         (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
  FROM information_schema.tables t
  WHERE table_schema = 'public'
  ORDER BY table_name;
`, 'Getting all tables');
await saveResults('01_all_tables.json', tables);

// 1.2 Get complete column definitions for parcel_features_travis
const parcelFeaturesColumns = await runQuery(`
  SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length,
    numeric_precision,
    numeric_scale
  FROM information_schema.columns
  WHERE table_name = 'parcel_features_travis'
  ORDER BY ordinal_position;
`, 'Getting parcel_features_travis columns');
await saveResults('02_parcel_features_travis_columns.json', parcelFeaturesColumns);

// 1.3 Get complete column definitions for parcels_travis
const parcelsTravisColumns = await runQuery(`
  SELECT 
    column_name,
    data_type,
    is_nullable
  FROM information_schema.columns
  WHERE table_name = 'parcels_travis'
  ORDER BY ordinal_position;
`, 'Getting parcels_travis columns');
await saveResults('03_parcels_travis_columns.json', parcelsTravisColumns);

// 1.4 Get complete column definitions for parcels_travis_enrichment
const parcelsTravisEnrichmentColumns = await runQuery(`
  SELECT 
    column_name,
    data_type,
    is_nullable
  FROM information_schema.columns
  WHERE table_name = 'parcels_travis_enrichment'
  ORDER BY ordinal_position;
`, 'Getting parcels_travis_enrichment columns');
await saveResults('04_parcels_travis_enrichment_columns.json', parcelsTravisEnrichmentColumns);

// 1.5 Get all indexes
const indexes = await runQuery(`
  SELECT 
    tablename,
    indexname,
    indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
  AND tablename LIKE '%travis%'
  ORDER BY tablename, indexname;
`, 'Getting indexes');
await saveResults('05_indexes.json', indexes);

// ============================================================================
// PHASE 1.2: DATA QUALITY AUDIT
// ============================================================================

console.log('\n🔍 PHASE 1.2: DATA QUALITY AUDIT');

// Get row count first
const rowCount = await runQuery(`
  SELECT COUNT(*) as total_rows FROM parcel_features_travis;
`, 'Getting row count');
await saveResults('06_row_count.json', rowCount);

// Get all column names for NULL analysis
const columnNames = parcelFeaturesColumns.map(col => col.column_name);

// Build NULL analysis query for all columns
const nullAnalysisQueries = columnNames.map(col => {
  return `SELECT '${col}' as column_name, COUNT(*) as total, COUNT(${col}) as non_null, COUNT(*) - COUNT(${col}) as null_count FROM parcel_features_travis`;
}).join(' UNION ALL ');

const nullAnalysis = await runQuery(nullAnalysisQueries, 'Running NULL analysis for all columns');
await saveResults('07_null_analysis.json', nullAnalysis);

// ============================================================================
// PHASE 1.3: DISTINCT VALUES FOR CATEGORICAL COLUMNS
// ============================================================================

console.log('\n🔍 PHASE 1.3: CATEGORICAL VALUES');

// asset_class values
const assetClassValues = await runQuery(`
  SELECT asset_class, COUNT(*) as count
  FROM parcel_features_travis
  WHERE asset_class IS NOT NULL
  GROUP BY asset_class
  ORDER BY count DESC;
`, 'Getting asset_class values');
await saveResults('08_asset_class_values.json', assetClassValues);

// owner_entity_type values
const ownerEntityTypeValues = await runQuery(`
  SELECT owner_entity_type, COUNT(*) as count
  FROM parcel_features_travis
  WHERE owner_entity_type IS NOT NULL
  GROUP BY owner_entity_type
  ORDER BY count DESC;
`, 'Getting owner_entity_type values');
await saveResults('09_owner_entity_type_values.json', ownerEntityTypeValues);

// owner_segment values
const ownerSegmentValues = await runQuery(`
  SELECT owner_segment, COUNT(*) as count
  FROM parcel_features_travis
  WHERE owner_segment IS NOT NULL
  GROUP BY owner_segment
  ORDER BY count DESC;
`, 'Getting owner_segment values');
await saveResults('10_owner_segment_values.json', ownerSegmentValues);

// county_fips values
const countyFipsValues = await runQuery(`
  SELECT county_fips, COUNT(*) as count
  FROM parcel_features_travis
  WHERE county_fips IS NOT NULL
  GROUP BY county_fips
  ORDER BY count DESC;
`, 'Getting county_fips values');
await saveResults('11_county_fips_values.json', countyFipsValues);

// tax_delinquent_flag values
const taxDelinquentValues = await runQuery(`
  SELECT tax_delinquent_flag, COUNT(*) as count
  FROM parcel_features_travis
  GROUP BY tax_delinquent_flag;
`, 'Getting tax_delinquent_flag values');
await saveResults('12_tax_delinquent_values.json', taxDelinquentValues);

// ============================================================================
// PHASE 1.4: NUMERIC COLUMN DISTRIBUTIONS
// ============================================================================

console.log('\n🔍 PHASE 1.4: NUMERIC DISTRIBUTIONS');

// acres_calc distribution
const acresDistribution = await runQuery(`
  SELECT 
    MIN(acres_calc) as min_acres,
    MAX(acres_calc) as max_acres,
    AVG(acres_calc) as avg_acres,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY acres_calc) as p25,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY acres_calc) as median,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY acres_calc) as p75,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY acres_calc) as p95
  FROM parcel_features_travis
  WHERE acres_calc IS NOT NULL;
`, 'Getting acres_calc distribution');
await saveResults('13_acres_distribution.json', acresDistribution);

// Acreage buckets
const acreageBuckets = await runQuery(`
  SELECT 
    CASE 
      WHEN acres_calc < 0.25 THEN '< 0.25 acres'
      WHEN acres_calc < 1 THEN '0.25-1 acres'
      WHEN acres_calc < 2 THEN '1-2 acres'
      WHEN acres_calc < 5 THEN '2-5 acres'
      WHEN acres_calc < 10 THEN '5-10 acres'
      WHEN acres_calc < 20 THEN '10-20 acres'
      WHEN acres_calc < 50 THEN '20-50 acres'
      ELSE '50+ acres'
    END as acreage_bucket,
    COUNT(*) as count
  FROM parcel_features_travis
  WHERE acres_calc IS NOT NULL
  GROUP BY 1
  ORDER BY MIN(acres_calc);
`, 'Getting acreage buckets');
await saveResults('14_acreage_buckets.json', acreageBuckets);

// market_value distribution
const marketValueDistribution = await runQuery(`
  SELECT 
    MIN(market_value) as min_value,
    MAX(market_value) as max_value,
    AVG(market_value) as avg_value,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY market_value) as median
  FROM parcel_features_travis
  WHERE market_value IS NOT NULL;
`, 'Getting market_value distribution');
await saveResults('15_market_value_distribution.json', marketValueDistribution);

// year_built distribution
const yearBuiltDistribution = await runQuery(`
  SELECT 
    MIN(year_built) as min_year,
    MAX(year_built) as max_year,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY year_built) as median_year
  FROM parcel_features_travis
  WHERE year_built IS NOT NULL;
`, 'Getting year_built distribution');
await saveResults('16_year_built_distribution.json', yearBuiltDistribution);

// ============================================================================
// PHASE 1.5: ZIP CODE COVERAGE
// ============================================================================

console.log('\n🔍 PHASE 1.5: ZIP CODE COVERAGE');

// Check if ZIP code column exists
const zipColumns = await runQuery(`
  SELECT column_name 
  FROM information_schema.columns 
  WHERE table_name = 'parcel_features_travis' 
  AND column_name ILIKE '%zip%';
`, 'Checking for ZIP code columns');
await saveResults('17_zip_columns.json', zipColumns);

// Check if ZIP is derived from address
const zipFromAddress = await runQuery(`
  SELECT situs_address, 
         SUBSTRING(situs_address FROM '\\d{5}') as extracted_zip
  FROM parcel_features_travis
  WHERE situs_address IS NOT NULL
  LIMIT 10;
`, 'Checking ZIP extraction from address');
await saveResults('18_zip_from_address_sample.json', zipFromAddress);

// ============================================================================
// PHASE 3: VALIDATION TESTS
// ============================================================================

console.log('\n🔍 PHASE 3: VALIDATION TESTS');

// Test 1: Acreage filter (2-4 acres)
const test1 = await runQuery(`
  SELECT COUNT(*) as count
  FROM parcel_features_travis 
  WHERE acres_calc >= 2 AND acres_calc <= 4;
`, 'Test 1: Acreage filter (2-4 acres)');
await saveResults('19_test_1_acres_2_4.json', test1);

// Test 2: Asset class filter (Commercial)
const test2 = await runQuery(`
  SELECT COUNT(*) as count
  FROM parcel_features_travis 
  WHERE asset_class = 'Commercial';
`, 'Test 2: Asset class filter (Commercial)');
await saveResults('20_test_2_asset_class_commercial.json', test2);

// Check what asset_class values exist
const assetClassCheck = await runQuery(`
  SELECT DISTINCT asset_class FROM parcel_features_travis WHERE asset_class IS NOT NULL ORDER BY asset_class;
`, 'Checking actual asset_class values');
await saveResults('21_asset_class_actual_values.json', assetClassCheck);

// Test 3: Combined filter (Commercial + 2-4 acres)
const test3 = await runQuery(`
  SELECT COUNT(*) as count
  FROM parcel_features_travis 
  WHERE asset_class = 'Commercial' 
  AND acres_calc >= 2 AND acres_calc <= 4;
`, 'Test 3: Combined filter (Commercial + 2-4 acres)');
await saveResults('22_test_3_combined_commercial_2_4.json', test3);

// Test 4: Tax delinquent
const test4 = await runQuery(`
  SELECT COUNT(*) as count
  FROM parcel_features_travis 
  WHERE tax_delinquent_flag = true;
`, 'Test 4: Tax delinquent');
await saveResults('23_test_4_tax_delinquent.json', test4);

// Test 5: Owner entity type (LLC)
const test5 = await runQuery(`
  SELECT COUNT(*) as count
  FROM parcel_features_travis 
  WHERE owner_entity_type = 'LLC';
`, 'Test 5: Owner entity type (LLC)');
await saveResults('24_test_5_owner_entity_llc.json', test5);

// Check owner_entity_type values
const ownerEntityTypeCheck = await runQuery(`
  SELECT DISTINCT owner_entity_type FROM parcel_features_travis WHERE owner_entity_type IS NOT NULL ORDER BY owner_entity_type;
`, 'Checking actual owner_entity_type values');
await saveResults('25_owner_entity_type_actual_values.json', ownerEntityTypeCheck);

// Test 6: Large parcels (10-20 acres)
const test6 = await runQuery(`
  SELECT COUNT(*) as count
  FROM parcel_features_travis 
  WHERE acres_calc >= 10 AND acres_calc <= 20;
`, 'Test 6: Large parcels (10-20 acres)');
await saveResults('26_test_6_large_parcels.json', test6);

// Verify large parcels are actually undeveloped/land
const test6Sample = await runQuery(`
  SELECT parcel_id, situs_address, acres_calc, asset_class, year_built
  FROM parcel_features_travis
  WHERE acres_calc >= 10 AND acres_calc <= 20
  ORDER BY acres_calc DESC
  LIMIT 20;
`, 'Test 6: Sample large parcels');
await saveResults('27_test_6_large_parcels_sample.json', test6Sample);

console.log('\n✅ Foundation audit queries completed!');
console.log(`📁 Results saved to: ${outputDir}`);

await pool.end();
