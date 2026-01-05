#!/usr/bin/env node
/**
 * Test script for countyResolver service
 * 
 * Tests the resolveParcelCounty function with:
 * - Known Travis County parcelId
 * - Known Williamson County parcelId
 * - Fake parcelId that doesn't exist
 */

import { resolveParcelCounty, COUNTY_TABLES, getCacheStats, clearParcelCountyCache } from '../src/services/countyResolver.js';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
dotenv.config({ path: join(rootDir, '.env') });

const prisma = new PrismaClient();

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function log(message, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

async function testCountyResolver() {
  log('\n🧪 Testing County Resolver Service\n', BLUE);
  
  // Clear cache before starting
  clearParcelCountyCache();
  log('✅ Cache cleared\n');
  
  // Get sample parcelIds from database
  log('📊 Fetching sample parcelIds from database...\n', BLUE);
  
  let travisParcelId = null;
  let williamsonParcelId = null;
  
  try {
    const travisResult = await prisma.$queryRaw`
      SELECT parcel_id FROM parcels_travis LIMIT 1
    `;
    if (travisResult && travisResult.length > 0) {
      travisParcelId = travisResult[0].parcel_id;
      log(`✅ Travis County parcelId: ${travisParcelId}`, GREEN);
    } else {
      log('⚠️  No Travis County parcels found', YELLOW);
    }
  } catch (error) {
    log(`❌ Error fetching Travis parcelId: ${error.message}`, RED);
  }
  
  try {
    const williamsonResult = await prisma.$queryRaw`
      SELECT parcel_id FROM parcels_williamson LIMIT 1
    `;
    if (williamsonResult && williamsonResult.length > 0) {
      williamsonParcelId = williamsonResult[0].parcel_id;
      log(`✅ Williamson County parcelId: ${williamsonParcelId}`, GREEN);
    } else {
      log('⚠️  No Williamson County parcels found', YELLOW);
    }
  } catch (error) {
    log(`❌ Error fetching Williamson parcelId: ${error.message}`, RED);
  }
  
  log('');
  
  // Test 1: Travis County parcelId
  if (travisParcelId) {
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', BLUE);
    log('Test 1: Travis County Parcel', BLUE);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', BLUE);
    log(`ParcelId: ${travisParcelId}\n`);
    
    const startTime = Date.now();
    const result = await resolveParcelCounty(travisParcelId, prisma);
    const duration = Date.now() - startTime;
    
    if (result) {
      log(`✅ Found in: ${result.name} County (${result.fips})`, GREEN);
      log(`   Table: ${result.table}`, GREEN);
      log(`   Enrichment: ${result.enrichment}`, GREEN);
      log(`   Duration: ${duration}ms`, GREEN);
    } else {
      log(`❌ Not found in any county`, RED);
    }
    log('');
  }
  
  // Test 2: Williamson County parcelId
  if (williamsonParcelId) {
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', BLUE);
    log('Test 2: Williamson County Parcel', BLUE);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', BLUE);
    log(`ParcelId: ${williamsonParcelId}\n`);
    
    const startTime = Date.now();
    const result = await resolveParcelCounty(williamsonParcelId, prisma);
    const duration = Date.now() - startTime;
    
    if (result) {
      log(`✅ Found in: ${result.name} County (${result.fips})`, GREEN);
      log(`   Table: ${result.table}`, GREEN);
      log(`   Enrichment: ${result.enrichment}`, GREEN);
      log(`   Duration: ${duration}ms`, GREEN);
    } else {
      log(`❌ Not found in any county`, RED);
    }
    log('');
  }
  
  // Test 3: Fake parcelId
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', BLUE);
  log('Test 3: Fake ParcelId (Should Not Exist)', BLUE);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', BLUE);
  const fakeParcelId = '999999';
  log(`ParcelId: ${fakeParcelId}\n`);
  
  const startTime = Date.now();
  const result = await resolveParcelCounty(fakeParcelId, prisma);
  const duration = Date.now() - startTime;
  
  if (result) {
    log(`⚠️  Unexpected: Found in ${result.name} County`, YELLOW);
  } else {
    log(`✅ Correctly returned null (not found)`, GREEN);
    log(`   Duration: ${duration}ms`, GREEN);
  }
  log('');
  
  // Test 4: Cache test (should be fast)
  if (travisParcelId) {
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', BLUE);
    log('Test 4: Cache Test (Same Travis ParcelId)', BLUE);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', BLUE);
    log(`ParcelId: ${travisParcelId} (should be cached)\n`);
    
    const startTime = Date.now();
    const result = await resolveParcelCounty(travisParcelId, prisma);
    const duration = Date.now() - startTime;
    
    if (result) {
      log(`✅ Found in: ${result.name} County (${result.fips})`, GREEN);
      log(`   Duration: ${duration}ms (should be < 10ms if cached)`, duration < 10 ? GREEN : YELLOW);
    } else {
      log(`❌ Not found (cache issue?)`, RED);
    }
    log('');
  }
  
  // Test 5: Cache statistics
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', BLUE);
  log('Test 5: Cache Statistics', BLUE);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', BLUE);
  const stats = getCacheStats();
  log(`Cache size: ${stats.size}`, BLUE);
  if (stats.entries.length > 0) {
    log('Cached entries:', BLUE);
    stats.entries.forEach(({ parcelId, county }) => {
      log(`  - ${parcelId} → ${county}`, BLUE);
    });
  }
  log('');
  
  // Summary
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', BLUE);
  log('Summary', BLUE);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', BLUE);
  log(`Total counties configured: ${COUNTY_TABLES.length}`, BLUE);
  log(`Cached parcelIds: ${stats.size}`, BLUE);
  log('');
  
  // Cleanup
  await prisma.$disconnect();
  log('✅ Test complete\n', GREEN);
}

// Run tests
testCountyResolver().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
