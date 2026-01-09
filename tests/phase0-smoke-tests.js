/**
 * Phase 0 Smoke Tests
 * 
 * Tests critical functionality after Phase 0 implementation:
 * - Asset class filtering
 * - Owner segment filtering
 * - ZIP code resolution
 * - Tax delinquent filtering
 * 
 * Usage:
 *   node tests/phase0-smoke-tests.js
 *   node tests/phase0-smoke-tests.js --api-url=http://localhost:3001
 */

import dotenv from 'dotenv';
dotenv.config();

const API_BASE = process.env.API_BASE_URL || 
  process.argv.find(a => a.startsWith('--api-url='))?.split('=')[1] ||
  'http://localhost:3001';

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
  
  warn(message, details = {}) {
    this.status = 'WARN';
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
      result.warn('No results returned - may indicate ETL has not run', { 
        responseType: response.type 
      });
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
 * Test 2: Asset class filtering
 */
async function testAssetClassFiltering() {
  const result = new TestResult('Asset Class Filtering (Commercial properties over $1M)');
  
  try {
    const response = await executeQuery('Commercial properties over $1M in Travis County');
    
    if (!response.success) {
      result.fail('Query failed', { error: response.error });
      return result;
    }
    
    const properties = response.properties || [];
    
    if (properties.length === 0) {
      result.warn('No results returned - may indicate asset_class ETL has not run', {
        responseType: response.type,
        toolCalls: response.toolCalls
      });
      return result;
    }
    
    // Check if asset_class filtering was applied
    const toolCalls = response.toolCalls || [];
    const searchToolCall = toolCalls.find(tc => tc.tool === 'search_properties');
    
    if (!searchToolCall || searchToolCall.input.asset_class !== 'commercial') {
      result.warn('Asset class filter may not have been applied', {
        toolCalls: toolCalls.map(tc => ({ tool: tc.tool, input: tc.input }))
      });
    }
    
    // Verify results have commercial asset_class
    const nonCommercial = properties.filter(prop => {
      const assetClass = (prop.asset_class || '').toLowerCase();
      return assetClass !== 'commercial';
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
 * Test 3: ZIP code resolution
 */
async function testZipCodeResolution() {
  const result = new TestResult('ZIP Code Resolution (Vacant land in 78759)');
  
  try {
    const response = await executeQuery('Vacant land in 78759');
    
    if (!response.success) {
      result.fail('Query failed', { error: response.error });
      return result;
    }
    
    const properties = response.properties || [];
    const toolCalls = response.toolCalls || [];
    const searchToolCall = toolCalls.find(tc => tc.tool === 'search_properties');
    
    // Check if ZIP was resolved to bbox
    if (searchToolCall) {
      const bbox = searchToolCall.input.bbox;
      
      if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) {
        result.fail('ZIP code was not resolved to bbox array', {
          bbox: bbox,
          toolInput: searchToolCall.input
        });
        return result;
      }
      
      // Verify bbox is valid (78759 is northwest Austin)
      const [minLng, minLat, maxLng, maxLat] = bbox;
      if (minLng < -98 || maxLng > -97 || minLat < 30 || maxLat > 31) {
        result.warn('Bbox values seem incorrect for 78759', {
          bbox: bbox,
          expectedRange: '78759 is northwest Austin (~-97.77, 30.33)'
        });
      } else {
        result.pass('ZIP code resolved to valid bbox', {
          zipCode: '78759',
          bbox: bbox,
          totalResults: properties.length
        });
      }
    } else {
      result.warn('No search_properties tool call found', {
        toolCalls: toolCalls.map(tc => tc.tool)
      });
    }
  } catch (error) {
    result.fail('Test failed with error', { error: error.message });
  }
  
  return result;
}

/**
 * Test 4: Owner segment filtering
 */
async function testOwnerSegmentFiltering() {
  const result = new TestResult('Owner Segment Filtering (Mom and pop owned properties)');
  
  try {
    const response = await executeQuery('Mom and pop owned properties in Travis County');
    
    if (!response.success) {
      result.fail('Query failed', { error: response.error });
      return result;
    }
    
    const properties = response.properties || [];
    
    if (properties.length === 0) {
      result.warn('No results returned - may indicate owner_segment ETL has not run', {
        responseType: response.type,
        toolCalls: response.toolCalls
      });
      return result;
    }
    
    // Check if owner_segment filter was applied
    const toolCalls = response.toolCalls || [];
    const searchToolCall = toolCalls.find(tc => tc.tool === 'search_properties');
    
    if (!searchToolCall || searchToolCall.input.owner_segment !== 'mom_pop') {
      result.warn('Owner segment filter may not have been applied', {
        toolCalls: toolCalls.map(tc => ({ tool: tc.tool, input: tc.input }))
      });
    }
    
    // Verify results have mom_pop owner_segment
    const nonMomPop = properties.filter(prop => {
      const ownerSegment = (prop.owner_segment || '').toLowerCase();
      return ownerSegment !== 'mom_pop';
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
        totalResults: properties.length,
        sampleOwnerSegments: properties.slice(0, 5).map(p => p.owner_segment)
      });
    }
  } catch (error) {
    result.fail('Test failed with error', { error: error.message });
  }
  
  return result;
}

/**
 * Test 5: Tax delinquent filtering
 */
async function testTaxDelinquentFiltering() {
  const result = new TestResult('Tax Delinquent Filtering');
  
  try {
    const response = await executeQuery('Tax delinquent properties in Travis County');
    
    if (!response.success) {
      result.fail('Query failed', { error: response.error });
      return result;
    }
    
    const properties = response.properties || [];
    
    if (properties.length === 0) {
      result.warn('No results returned', {
        responseType: response.type
      });
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
  console.log('PHASE 0 SMOKE TESTS');
  console.log('='.repeat(80));
  console.log(`API Base URL: ${API_BASE}`);
  console.log('');
  
  const tests = [
    testAcresFiltering,
    testAssetClassFiltering,
    testZipCodeResolution,
    testOwnerSegmentFiltering,
    testTaxDelinquentFiltering
  ];
  
  const results = [];
  
  for (const testFn of tests) {
    try {
      const result = await testFn();
      results.push(result);
      
      // Print result
      const statusIcon = result.status === 'PASS' ? '✅' : 
                        result.status === 'WARN' ? '⚠️ ' : '❌';
      console.log(`${statusIcon} ${result.name}: ${result.status}`);
      if (result.message) {
        console.log(`   ${result.message}`);
      }
      if (Object.keys(result.details).length > 0) {
        console.log(`   Details:`, JSON.stringify(result.details, null, 2));
      }
      console.log('');
    } catch (error) {
      console.error(`❌ Test ${testFn.name} crashed:`, error);
      results.push({
        name: testFn.name,
        status: 'FAIL',
        message: `Test crashed: ${error.message}`
      });
    }
  }
  
  // Summary
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  const passCount = results.filter(r => r.status === 'PASS').length;
  const warnCount = results.filter(r => r.status === 'WARN').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  
  console.log(`Pass: ${passCount}`);
  console.log(`Warn: ${warnCount}`);
  console.log(`Fail: ${failCount}`);
  console.log('');
  
  if (failCount > 0) {
    console.log('❌ Some tests failed - review output above');
    process.exit(1);
  } else if (warnCount > 0) {
    console.log('⚠️  Some tests warned - may indicate ETL needs to run');
    process.exit(0);
  } else {
    console.log('✅ All tests passed');
    process.exit(0);
  }
}

runAllTests().catch(console.error);
