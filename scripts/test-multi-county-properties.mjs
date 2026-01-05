#!/usr/bin/env node
/**
 * Test script for multi-county property bundle endpoint
 * 
 * Tests GET /api/properties/parcel/:parcelId with:
 * - Travis County parcelId
 * - Williamson County parcelId  
 * - Fake parcelId (should return 404)
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function log(message, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

async function testParcelEndpoint(parcelId, countyName) {
  const url = `${API_BASE_URL}/api/properties/parcel/${encodeURIComponent(parcelId)}`;
  
  log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, BLUE);
  log(`Testing: ${countyName}`, BLUE);
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, BLUE);
  log(`ParcelId: ${parcelId}`, CYAN);
  log(`URL: ${url}\n`, CYAN);
  
  try {
    const startTime = Date.now();
    const response = await fetch(url);
    const duration = Date.now() - startTime;
    
    const statusCode = response.status;
    const statusColor = statusCode === 200 ? GREEN : statusCode === 404 ? YELLOW : RED;
    
    log(`Status Code: ${statusCode}`, statusColor);
    log(`Duration: ${duration}ms\n`, BLUE);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Could not parse error response' }));
      log(`Error: ${errorData.error || errorData.message || 'Unknown error'}`, RED);
      return {
        parcelId,
        countyName,
        statusCode,
        success: false,
        hasGeometry: false,
        hasEnrichment: false,
        error: errorData.error || errorData.message,
        duration
      };
    }
    
    const data = await response.json();
    
    const hasGeometry = !!(data.geometry);
    const hasEnrichment = !!(data.enrichment);
    const hasCore = !!(data.core);
    
    log(`✅ Response received:`, GREEN);
    log(`   - Has Geometry: ${hasGeometry ? '✅' : '❌'}`, hasGeometry ? GREEN : RED);
    log(`   - Has Enrichment: ${hasEnrichment ? '✅' : '❌'}`, hasEnrichment ? GREEN : RED);
    log(`   - Has ATTOM Core: ${hasCore ? '✅' : '❌'}`, hasCore ? GREEN : YELLOW);
    
    if (data.meta) {
      log(`\n   Metadata:`, BLUE);
      log(`   - Enrichment Source: ${data.meta.enrichmentSource || 'null'}`, BLUE);
      log(`   - ATTOM Matched: ${data.meta.attomMatched ? 'yes' : 'no'}`, BLUE);
    }
    
    if (data.enrichment) {
      log(`\n   Enrichment Fields:`, BLUE);
      log(`   - Owner: ${data.enrichment.ownerName || 'null'}`, BLUE);
      log(`   - Mailing Address: ${data.enrichment.mailingAddress || 'null'}`, BLUE);
      log(`   - Situs Address: ${data.enrichment.situsAddress || 'null'}`, BLUE);
      log(`   - Market Value: ${data.enrichment.marketValue ? `$${data.enrichment.marketValue.toLocaleString()}` : 'null'}`, BLUE);
      log(`   - Assessed Value: ${data.enrichment.assessedValue ? `$${data.enrichment.assessedValue.toLocaleString()}` : 'null'}`, BLUE);
      log(`   - Acres: ${data.enrichment.acres || data.enrichment.acreage || 'null'}`, BLUE);
      log(`   - Legal Desc: ${data.enrichment.legalDesc ? (data.enrichment.legalDesc.substring(0, 50) + '...') : 'null'}`, BLUE);
    }
    
    return {
      parcelId,
      countyName,
      statusCode,
      success: true,
      hasGeometry,
      hasEnrichment,
      hasCore,
      duration,
      data
    };
    
  } catch (error) {
    log(`❌ Request failed: ${error.message}`, RED);
    if (error.code === 'ECONNREFUSED' || error.message.includes('fetch failed')) {
      log(`\n⚠️  Could not connect to ${API_BASE_URL}`, YELLOW);
      log(`   Make sure the backend server is running:`, YELLOW);
      log(`   cd ~/scoutgptpro-backend && npm start`, YELLOW);
      log(`   Or check if it's running on a different port.`, YELLOW);
    }
    return {
      parcelId,
      countyName,
      statusCode: 0,
      success: false,
      hasGeometry: false,
      hasEnrichment: false,
      error: error.message,
      duration: 0
    };
  }
}

async function runTests() {
  log('\n🧪 Multi-County Property Bundle Endpoint Tests\n', BLUE);
  log(`API Base URL: ${API_BASE_URL}\n`, CYAN);
  
  const tests = [
    { parcelId: '105015', countyName: 'Travis County' },
    { parcelId: 'R527983', countyName: 'Williamson County' },
    { parcelId: 'XXXXX999', countyName: 'Fake ParcelId (Should Fail)' }
  ];
  
  const results = [];
  
  for (const test of tests) {
    const result = await testParcelEndpoint(test.parcelId, test.countyName);
    results.push(result);
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Summary
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', BLUE);
  log('Test Summary', BLUE);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', BLUE);
  log('');
  
  results.forEach(result => {
    const statusIcon = result.success ? '✅' : result.statusCode === 404 ? '⚠️' : '❌';
    const statusText = result.success ? 'SUCCESS' : result.statusCode === 404 ? 'NOT FOUND' : 'FAILED';
    
    log(`${statusIcon} ${result.countyName} (${result.parcelId}):`, result.success ? GREEN : result.statusCode === 404 ? YELLOW : RED);
    log(`   Status: ${result.statusCode} (${statusText})`, BLUE);
    if (result.success) {
      log(`   Geometry: ${result.hasGeometry ? '✅' : '❌'}`, result.hasGeometry ? GREEN : RED);
      log(`   Enrichment: ${result.hasEnrichment ? '✅' : '❌'}`, result.hasEnrichment ? GREEN : RED);
      log(`   Duration: ${result.duration}ms`, BLUE);
    } else if (result.error) {
      log(`   Error: ${result.error}`, RED);
    }
    log('');
  });
  
  const successCount = results.filter(r => r.success).length;
  const expectedSuccess = 2; // Travis and Williamson should succeed
  
  log(`Results: ${successCount}/${tests.length} tests passed`, successCount >= expectedSuccess ? GREEN : RED);
  
  if (successCount >= expectedSuccess) {
    log('\n✅ Multi-county support is working correctly!\n', GREEN);
  } else {
    log('\n⚠️  Some tests failed. Check the output above.\n', YELLOW);
  }
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test script failed:', error);
  process.exit(1);
});
