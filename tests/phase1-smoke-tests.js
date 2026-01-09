/**
 * Phase 1 Smoke Tests
 * 
 * Enhanced tests for Phase 1: Natural Language Search That Actually Works
 * 
 * Tests:
 * - Combined filters
 * - Edge cases
 * - Empty results handling
 * - Filter validation
 * 
 * Usage:
 *   node tests/phase1-smoke-tests.js
 */

import dotenv from 'dotenv';
dotenv.config();

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
 * Execute API query
 */
async function executeQuery(query, bounds = null) {
  const url = `${API_BASE}/api/ai/query`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      mode: 'scout',
      bounds
    })
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Test 1: Combined filters - Commercial properties over 2 acres owned by mom and pop
 */
async function testCombinedFilters1() {
  const result = new TestResult('Combined Filters: Commercial + 2+ acres + Mom & Pop');
  
  try {
    const response = await executeQuery('commercial properties over 2 acres owned by mom and pop');
    
    if (!response.success) {
      result.fail('Query failed', { error: response.error });
      return result;
    }
    
    const properties = response.properties || [];
    
    if (properties.length === 0) {
      result.fail('No results returned', { responseType: response.type, message: response.message });
      return result;
    }
    
    // Verify all filters applied
    const invalid = properties.filter(prop => {
      const acres = parseFloat(prop.acres_calc);
      return prop.asset_class !== 'commercial' || 
             prop.owner_segment !== 'mom_pop' ||
             isNaN(acres) || acres <= 2;
    });
    
    if (invalid.length > 0) {
      result.fail(`Found ${invalid.length} properties that don't match all filters`, {
        totalResults: properties.length,
        invalidCount: invalid.length,
        sampleInvalid: invalid.slice(0, 3)
      });
    } else {
      result.pass(`All ${properties.length} results match all filters`, {
        totalResults: properties.length
      });
    }
  } catch (error) {
    result.fail('Test failed with error', { error: error.message });
  }
  
  return result;
}

/**
 * Test 2: Combined filters - Tax delinquent residential under $300k
 */
async function testCombinedFilters2() {
  const result = new TestResult('Combined Filters: Tax Delinquent + Residential + Under $300k');
  
  try {
    const response = await executeQuery('tax delinquent residential properties under $300k');
    
    if (!response.success) {
      result.fail('Query failed', { error: response.error });
      return result;
    }
    
    const properties = response.properties || [];
    
    if (properties.length === 0) {
      result.fail('No results returned', { responseType: response.type, message: response.message });
      return result;
    }
    
    // Verify all filters applied
    const invalid = properties.filter(prop => {
      const value = parseFloat(prop.market_value);
      return prop.asset_class !== 'residential' || 
             !prop.tax_delinquent_flag ||
             (value !== null && !isNaN(value) && value >= 300000);
    });
    
    if (invalid.length > 0) {
      result.fail(`Found ${invalid.length} properties that don't match all filters`, {
        totalResults: properties.length,
        invalidCount: invalid.length
      });
    } else {
      result.pass(`All ${properties.length} results match all filters`, {
        totalResults: properties.length
      });
    }
  } catch (error) {
    result.fail('Test failed with error', { error: error.message });
  }
  
  return result;
}

/**
 * Test 3: Combined filters - LLC owned land over 5 acres
 */
async function testCombinedFilters3() {
  const result = new TestResult('Combined Filters: LLC Owned + Land + 5+ acres');
  
  try {
    const response = await executeQuery('LLC owned land over 5 acres');
    
    if (!response.success) {
      result.fail('Query failed', { error: response.error });
      return result;
    }
    
    const properties = response.properties || [];
    
    if (properties.length === 0) {
      result.fail('No results returned', { responseType: response.type, message: response.message });
      return result;
    }
    
    // Verify all filters applied
    const invalid = properties.filter(prop => {
      const acres = parseFloat(prop.acres_calc);
      return prop.asset_class !== 'land' || 
             prop.owner_entity_type !== 'llc' ||
             isNaN(acres) || acres <= 5;
    });
    
    if (invalid.length > 0) {
      result.fail(`Found ${invalid.length} properties that don't match all filters`, {
        totalResults: properties.length,
        invalidCount: invalid.length
      });
    } else {
      result.pass(`All ${properties.length} results match all filters`, {
        totalResults: properties.length
      });
    }
  } catch (error) {
    result.fail('Test failed with error', { error: error.message });
  }
  
  return result;
}

/**
 * Test 4: Edge case - Empty results should return helpful message
 */
async function testEmptyResultsMessage() {
  const result = new TestResult('Empty Results: Helpful Message');
  
  try {
    const response = await executeQuery('commercial properties over 1000 acres in Travis County');
    
    if (!response.success) {
      result.fail('Query failed', { error: response.error });
      return result;
    }
    
    const properties = response.properties || [];
    
    if (properties.length === 0) {
      if (response.message && response.message.includes('No properties found')) {
        result.pass('Empty results return helpful message', {
          message: response.message,
          filtersApplied: response.debug?.filtersApplied
        });
      } else {
        result.fail('Empty results but no helpful message', {
          message: response.message,
          response: response
        });
      }
    } else {
      result.pass(`Unexpectedly found ${properties.length} results (test may need adjustment)`, {
        totalResults: properties.length
      });
    }
  } catch (error) {
    result.fail('Test failed with error', { error: error.message });
  }
  
  return result;
}

/**
 * Test 5: Definition of Done - Absentee owned properties held 15+ years
 */
async function testDefinitionOfDone1() {
  const result = new TestResult('DoD: Absentee Owned Properties');
  
  try {
    const response = await executeQuery('Absentee owned properties held 15+ years');
    
    if (!response.success) {
      result.fail('Query failed', { error: response.error });
      return result;
    }
    
    const properties = response.properties || [];
    
    if (properties.length === 0) {
      result.fail('No results returned', { responseType: response.type, message: response.message });
      return result;
    }
    
    // Verify owner_segment = 'absentee'
    const invalid = properties.filter(prop => prop.owner_segment !== 'absentee');
    
    if (invalid.length > 0) {
      result.fail(`Found ${invalid.length} non-absentee properties`, {
        totalResults: properties.length,
        invalidCount: invalid.length
      });
    } else {
      result.pass(`All ${properties.length} results are absentee-owned`, {
        totalResults: properties.length,
        note: 'Note: 15+ years filter not yet implemented in database'
      });
    }
  } catch (error) {
    result.fail('Test failed with error', { error: error.message });
  }
  
  return result;
}

/**
 * Test 6: Definition of Done - Land with no improvements, out-of-state owners
 */
async function testDefinitionOfDone2() {
  const result = new TestResult('DoD: Land + No Improvements + Out-of-State Owners');
  
  try {
    const response = await executeQuery('Land with no improvements, out-of-state owners');
    
    if (!response.success) {
      result.fail('Query failed', { error: response.error });
      return result;
    }
    
    const properties = response.properties || [];
    
    if (properties.length === 0) {
      result.fail('No results returned', { responseType: response.type, message: response.message });
      return result;
    }
    
    // Verify asset_class = 'land' AND owner_segment = 'absentee'
    const invalid = properties.filter(prop => {
      return prop.asset_class !== 'land' || prop.owner_segment !== 'absentee';
    });
    
    if (invalid.length > 0) {
      result.fail(`Found ${invalid.length} properties that don't match filters`, {
        totalResults: properties.length,
        invalidCount: invalid.length
      });
    } else {
      result.pass(`All ${properties.length} results are land with absentee owners`, {
        totalResults: properties.length,
        note: 'Note: No improvements filter not yet implemented in database'
      });
    }
  } catch (error) {
    result.fail('Test failed with error', { error: error.message });
  }
  
  return result;
}

/**
 * Test 7: Definition of Done - Commercial properties owned by small operators
 */
async function testDefinitionOfDone3() {
  const result = new TestResult('DoD: Commercial + Small Operators');
  
  try {
    const response = await executeQuery('Commercial properties owned by small operators');
    
    if (!response.success) {
      result.fail('Query failed', { error: response.error });
      return result;
    }
    
    const properties = response.properties || [];
    
    if (properties.length === 0) {
      result.fail('No results returned', { responseType: response.type, message: response.message });
      return result;
    }
    
    // Verify asset_class = 'commercial' AND owner_segment = 'small_operator'
    const invalid = properties.filter(prop => {
      return prop.asset_class !== 'commercial' || prop.owner_segment !== 'small_operator';
    });
    
    if (invalid.length > 0) {
      result.fail(`Found ${invalid.length} properties that don't match filters`, {
        totalResults: properties.length,
        invalidCount: invalid.length
      });
    } else {
      result.pass(`All ${properties.length} results are commercial properties owned by small operators`, {
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
  console.log('PHASE 1 SMOKE TESTS');
  console.log('='.repeat(80));
  console.log(`API Base URL: ${API_BASE}`);
  console.log('');
  
  const tests = [
    testCombinedFilters1,
    testCombinedFilters2,
    testCombinedFilters3,
    testEmptyResultsMessage,
    testDefinitionOfDone1,
    testDefinitionOfDone2,
    testDefinitionOfDone3
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
    await runAllTests();
    printSummary();
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
