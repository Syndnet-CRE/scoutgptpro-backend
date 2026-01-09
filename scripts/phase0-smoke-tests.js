/**
 * Phase 0 Smoke Tests
 * 
 * Verifies that asset_class and owner_segment are working correctly:
 * 1. Direct database checks
 * 2. API endpoint tests (/api/ai/query)
 * 
 * Usage:
 *   node scripts/phase0-smoke-tests.js
 */

import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const API_BASE = 'http://localhost:3001';

const testResults = [];

/**
 * Test result structure
 */
class TestResult {
  constructor(name) {
    this.name = name;
    this.status = 'PENDING';
    this.message = '';
    this.details = {};
  }
  
  pass(message, details = {}) {
    this.status = 'PASS';
    this.message = message;
    this.details = details;
  }
  
  fail(message, details = {}) {
    this.status = 'FAIL';
    this.message = message;
    this.details = details;
  }
}

/**
 * Check database directly
 */
async function checkDatabase() {
  console.log('='.repeat(80));
  console.log('DATABASE DIRECT CHECKS');
  console.log('='.repeat(80));
  console.log('');
  
  const client = await pool.connect();
  
  try {
    // Check asset_class distribution
    const assetClassResult = await client.query(`
      SELECT asset_class, COUNT(*) as count
      FROM parcel_features_travis
      GROUP BY asset_class
      ORDER BY count DESC
    `);
    
    console.log('asset_class distribution:');
    assetClassResult.rows.forEach(row => {
      console.log(`  ${row.asset_class || 'NULL'}: ${row.count.toLocaleString()}`);
    });
    console.log('');
    
    // Check owner_segment distribution
    const ownerSegmentResult = await client.query(`
      SELECT owner_segment, COUNT(*) as count
      FROM parcel_features_travis
      GROUP BY owner_segment
      ORDER BY count DESC
    `);
    
    console.log('owner_segment distribution:');
    ownerSegmentResult.rows.forEach(row => {
      console.log(`  ${row.owner_segment || 'NULL'}: ${row.count.toLocaleString()}`);
    });
    console.log('');
    
    // Check for NULL values
    const nullCheck = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE asset_class IS NULL) as null_asset_class,
        COUNT(*) FILTER (WHERE owner_segment IS NULL) as null_owner_segment,
        COUNT(*) FILTER (WHERE asset_class = 'unknown') as unknown_asset_class,
        COUNT(*) FILTER (WHERE owner_segment = 'unknown') as unknown_owner_segment
      FROM parcel_features_travis
    `);
    
    const nulls = nullCheck.rows[0];
    console.log('NULL/Unknown checks:');
    console.log(`  NULL asset_class: ${nulls.null_asset_class}`);
    console.log(`  NULL owner_segment: ${nulls.null_owner_segment}`);
    console.log(`  'unknown' asset_class: ${nulls.unknown_asset_class}`);
    console.log(`  'unknown' owner_segment: ${nulls.unknown_owner_segment}`);
    console.log('');
    
    // Sample queries to verify data exists
    console.log('Sample data verification:');
    
    const sampleQueries = [
      { name: 'Commercial properties', sql: "SELECT COUNT(*) FROM parcel_features_travis WHERE asset_class = 'commercial'" },
      { name: 'Residential properties', sql: "SELECT COUNT(*) FROM parcel_features_travis WHERE asset_class = 'residential'" },
      { name: 'Mom & pop owners', sql: "SELECT COUNT(*) FROM parcel_features_travis WHERE owner_segment = 'mom_pop'" },
      { name: 'Small operators', sql: "SELECT COUNT(*) FROM parcel_features_travis WHERE owner_segment = 'small_operator'" },
      { name: 'LLC entities', sql: "SELECT COUNT(*) FROM parcel_features_travis WHERE owner_entity_type = 'llc'" },
      { name: 'Tax delinquent', sql: "SELECT COUNT(*) FROM parcel_features_travis WHERE tax_delinquent_flag = true" },
    ];
    
    for (const query of sampleQueries) {
      const result = await client.query(query.sql);
      console.log(`  ${query.name}: ${result.rows[0].count.toLocaleString()}`);
    }
    console.log('');
    
  } finally {
    client.release();
  }
}

/**
 * Execute API query
 */
async function executeQuery(query) {
  const url = `${API_BASE}/api/ai/query`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      mode: 'scout'
    })
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Test 1: Acres filtering
 */
async function testAcresFiltering() {
  const result = new TestResult('Acres Filtering (2-4 acres in Travis County)');
  
  try {
    const response = await executeQuery('2-4 acre parcels in Travis County');
    
    if (!response.success) {
      result.fail('Query failed', { error: response.error });
      return result;
    }
    
    const properties = response.properties || [];
    
    if (properties.length === 0) {
      result.fail('No results returned', { responseType: response.type });
      return result;
    }
    
    // Verify all results have acres_calc between 2-4
    const invalidAcres = properties.filter(prop => {
      const acres = parseFloat(prop.acres_calc);
      return isNaN(acres) || acres < 2 || acres > 4;
    });
    
    if (invalidAcres.length > 0) {
      result.fail(`Found ${invalidAcres.length} properties with acres outside 2-4 range`, {
        totalResults: properties.length,
        invalidCount: invalidAcres.length,
        sampleInvalid: invalidAcres.slice(0, 3).map(p => ({
          parcel_id: p.parcel_id,
          acres_calc: p.acres_calc
        }))
      });
    } else {
      result.pass(`All ${properties.length} results have acres between 2-4`, {
        totalResults: properties.length,
        sampleAcres: properties.slice(0, 5).map(p => p.acres_calc)
      });
    }
  } catch (error) {
    result.fail('Test failed with error', { error: error.message });
  }
  
  return result;
}

/**
 * Test 2: Commercial properties
 */
async function testCommercialProperties() {
  const result = new TestResult('Commercial Properties');
  
  try {
    const response = await executeQuery('commercial properties');
    
    if (!response.success) {
      result.fail('Query failed', { error: response.error });
      return result;
    }
    
    const properties = response.properties || [];
    
    if (properties.length === 0) {
      result.fail('No results returned', { responseType: response.type });
      return result;
    }
    
    // Verify all results are commercial
    const nonCommercial = properties.filter(prop => {
      return prop.asset_class !== 'commercial';
    });
    
    if (nonCommercial.length > 0) {
      result.fail(`Found ${nonCommercial.length} non-commercial properties`, {
        totalResults: properties.length,
        nonCommercialCount: nonCommercial.length,
        sampleNonCommercial: nonCommercial.slice(0, 3).map(p => ({
          parcel_id: p.parcel_id,
          asset_class: p.asset_class
        }))
      });
    } else {
      result.pass(`All ${properties.length} results are commercial`, {
        totalResults: properties.length,
        sampleAssetClasses: properties.slice(0, 5).map(p => p.asset_class)
      });
    }
  } catch (error) {
    result.fail('Test failed with error', { error: error.message });
  }
  
  return result;
}

/**
 * Test 3: Residential properties over 1 acre
 */
async function testResidentialOver1Acre() {
  const result = new TestResult('Residential Properties Over 1 Acre');
  
  try {
    const response = await executeQuery('residential properties over 1 acre');
    
    if (!response.success) {
      result.fail('Query failed', { error: response.error });
      return result;
    }
    
    const properties = response.properties || [];
    
    if (properties.length === 0) {
      result.fail('No results returned', { responseType: response.type });
      return result;
    }
    
    // Verify all results are residential and over 1 acre
    const invalid = properties.filter(prop => {
      const acres = parseFloat(prop.acres_calc);
      return prop.asset_class !== 'residential' || isNaN(acres) || acres <= 1;
    });
    
    if (invalid.length > 0) {
      result.fail(`Found ${invalid.length} invalid properties`, {
        totalResults: properties.length,
        invalidCount: invalid.length,
        sampleInvalid: invalid.slice(0, 3).map(p => ({
          parcel_id: p.parcel_id,
          asset_class: p.asset_class,
          acres_calc: p.acres_calc
        }))
      });
    } else {
      result.pass(`All ${properties.length} results are residential and over 1 acre`, {
        totalResults: properties.length
      });
    }
  } catch (error) {
    result.fail('Test failed with error', { error: error.message });
  }
  
  return result;
}

/**
 * Test 4: Mom and pop owned properties
 */
async function testMomPopOwned() {
  const result = new TestResult('Mom and Pop Owned Properties');
  
  try {
    const response = await executeQuery('mom and pop owned properties');
    
    if (!response.success) {
      result.fail('Query failed', { error: response.error });
      return result;
    }
    
    const properties = response.properties || [];
    
    if (properties.length === 0) {
      result.fail('No results returned', { responseType: response.type });
      return result;
    }
    
    // Verify all results are mom_pop
    const nonMomPop = properties.filter(prop => {
      return prop.owner_segment !== 'mom_pop';
    });
    
    if (nonMomPop.length > 0) {
      result.fail(`Found ${nonMomPop.length} non-mom_pop properties`, {
        totalResults: properties.length,
        nonMomPopCount: nonMomPop.length,
        sampleNonMomPop: nonMomPop.slice(0, 3).map(p => ({
          parcel_id: p.parcel_id,
          owner_segment: p.owner_segment
        }))
      });
    } else {
      result.pass(`All ${properties.length} results are mom_pop`, {
        totalResults: properties.length
      });
    }
  } catch (error) {
    result.fail('Test failed with error', { error: error.message });
  }
  
  return result;
}

/**
 * Test 5: Small operator owned properties
 */
async function testSmallOperatorOwned() {
  const result = new TestResult('Small Operator Owned Properties');
  
  try {
    const response = await executeQuery('properties owned by small operators');
    
    if (!response.success) {
      result.fail('Query failed', { error: response.error });
      return result;
    }
    
    const properties = response.properties || [];
    
    if (properties.length === 0) {
      result.fail('No results returned', { responseType: response.type });
      return result;
    }
    
    // Verify all results are small_operator
    const nonSmallOperator = properties.filter(prop => {
      return prop.owner_segment !== 'small_operator';
    });
    
    if (nonSmallOperator.length > 0) {
      result.fail(`Found ${nonSmallOperator.length} non-small_operator properties`, {
        totalResults: properties.length,
        nonSmallOperatorCount: nonSmallOperator.length
      });
    } else {
      result.pass(`All ${properties.length} results are small_operator`, {
        totalResults: properties.length
      });
    }
  } catch (error) {
    result.fail('Test failed with error', { error: error.message });
  }
  
  return result;
}

/**
 * Test 6: LLC owned properties
 */
async function testLLCOwned() {
  const result = new TestResult('LLC Owned Properties');
  
  try {
    const response = await executeQuery('LLC owned properties');
    
    if (!response.success) {
      result.fail('Query failed', { error: response.error });
      return result;
    }
    
    const properties = response.properties || [];
    
    if (properties.length === 0) {
      result.fail('No results returned', { responseType: response.type });
      return result;
    }
    
    // Verify all results have owner_entity_type = 'llc'
    const nonLLC = properties.filter(prop => {
      return prop.owner_entity_type !== 'llc';
    });
    
    if (nonLLC.length > 0) {
      result.fail(`Found ${nonLLC.length} non-LLC properties`, {
        totalResults: properties.length,
        nonLLCCount: nonLLC.length
      });
    } else {
      result.pass(`All ${properties.length} results are LLC-owned`, {
        totalResults: properties.length
      });
    }
  } catch (error) {
    result.fail('Test failed with error', { error: error.message });
  }
  
  return result;
}

/**
 * Test 7: Tax delinquent properties
 */
async function testTaxDelinquent() {
  const result = new TestResult('Tax Delinquent Properties');
  
  try {
    const response = await executeQuery('tax delinquent properties');
    
    if (!response.success) {
      result.fail('Query failed', { error: response.error });
      return result;
    }
    
    const properties = response.properties || [];
    
    if (properties.length === 0) {
      result.fail('No results returned', { responseType: response.type });
      return result;
    }
    
    // Verify all results are tax delinquent
    const nonDelinquent = properties.filter(prop => {
      return !prop.tax_delinquent_flag;
    });
    
    if (nonDelinquent.length > 0) {
      result.fail(`Found ${nonDelinquent.length} non-tax-delinquent properties`, {
        totalResults: properties.length,
        nonDelinquentCount: nonDelinquent.length
      });
    } else {
      result.pass(`All ${properties.length} results are tax delinquent`, {
        totalResults: properties.length
      });
    }
  } catch (error) {
    result.fail('Test failed with error', { error: error.message });
  }
  
  return result;
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('='.repeat(80));
  console.log('API ENDPOINT TESTS');
  console.log('='.repeat(80));
  console.log(`API Base URL: ${API_BASE}`);
  console.log('');
  
  const tests = [
    testAcresFiltering,
    testCommercialProperties,
    testResidentialOver1Acre,
    testMomPopOwned,
    testSmallOperatorOwned,
    testLLCOwned,
    testTaxDelinquent
  ];
  
  for (const testFn of tests) {
    try {
      const result = await testFn();
      testResults.push(result);
      
      // Print result
      const statusIcon = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${statusIcon} ${result.name}: ${result.status}`);
      if (result.message) {
        console.log(`   ${result.message}`);
      }
      if (Object.keys(result.details).length > 0 && result.status === 'FAIL') {
        console.log(`   Details:`, JSON.stringify(result.details, null, 2));
      }
      console.log('');
    } catch (error) {
      console.error(`❌ Test ${testFn.name} crashed:`, error);
      testResults.push({
        name: testFn.name,
        status: 'FAIL',
        message: `Test crashed: ${error.message}`
      });
    }
  }
}

/**
 * Print summary
 */
function printSummary() {
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  
  const passCount = testResults.filter(r => r.status === 'PASS').length;
  const failCount = testResults.filter(r => r.status === 'FAIL').length;
  
  console.log(`Pass: ${passCount}`);
  console.log(`Fail: ${failCount}`);
  console.log('');
  
  if (failCount > 0) {
    console.log('Failed tests:');
    testResults.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.name}: ${r.message}`);
    });
    console.log('');
  }
  
  if (failCount > 0) {
    console.log('❌ Some tests failed - review output above');
    process.exit(1);
  } else {
    console.log('✅ All tests passed');
    process.exit(0);
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    // Step 1: Check database directly
    await checkDatabase();
    
    // Step 2: Run API tests
    await runAllTests();
    
    // Step 3: Print summary
    printSummary();
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
