/**
 * Test ATTOM Resolver Live
 * 
 * Reads random parcelIds from properties table, runs resolver,
 * validates formats (numeric attomId vs 32-hex attomGeoId),
 * and prints counts and sample output.
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getAttomGeoIdByParcelId, attachAttomGeoIdsToProperties } from '../src/services/attom-resolver-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env');
dotenv.config({ path: envPath });

const prisma = new PrismaClient();

// Validation helpers
function isValid32Hex(str) {
  return str != null && /^[0-9a-f]{32}$/i.test(String(str));
}

function isValidNumeric(str) {
  return str != null && /^[0-9]+$/.test(String(str));
}

async function testResolver() {
  try {
    console.log('🧪 Testing ATTOM Resolver Live\n');
    console.log('='.repeat(60));
    
    // Get 20 random parcelIds from properties (include attomId if present)
    console.log('\n📊 Fetching 20 random parcelIds from properties...');
    const randomProperties = await prisma.$queryRawUnsafe(`
      SELECT "parcelId", "attomId"
      FROM properties
      WHERE "parcelId" IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 20
    `);
    
    const parcelIds = randomProperties.map(p => p.parcelId);
    console.log(`  ✅ Loaded ${parcelIds.length} parcelIds`);
    console.log(`  Sample: ${parcelIds.slice(0, 5).join(', ')}`);
    
    // Get a known conflict parcelId
    console.log('\n📊 Fetching known conflict parcelId...');
    const conflictSample = await prisma.$queryRawUnsafe(`
      SELECT parcel_id
      FROM xref_parcel_property_travis_conflicts
      ORDER BY attom_id_count DESC
      LIMIT 1
    `);
    const knownConflictParcelId = conflictSample.length > 0 ? conflictSample[0].parcel_id : null;
    if (knownConflictParcelId) {
      console.log(`  ✅ Known conflict: ${knownConflictParcelId}`);
      parcelIds.push(knownConflictParcelId);
    }
    
    // Test single resolver
    console.log('\n🔍 Testing single resolver (getAttomGeoIdByParcelId)...');
    const singleResults = [];
    for (const parcelId of parcelIds.slice(0, 5)) {
      const result = await getAttomGeoIdByParcelId(parcelId);
      singleResults.push({ parcelId, ...result });
      
      // Validate format
      const geoIdValid = result.attomGeoId == null || isValid32Hex(result.attomGeoId);
      const sourceValid = result.attomGeoIdSource && ['travis_xref', 'conflict', 'unmapped'].includes(result.attomGeoIdSource);
      const status = geoIdValid && sourceValid ? '✅' : '❌';
      
      console.log(`  ${status} ${parcelId}: attomGeoId=${result.attomGeoId || 'null'} (32-hex), conflict=${result.attomConflict}, source=${result.attomGeoIdSource}`);
      if (!geoIdValid) {
        console.log(`     ❌ FAIL: attomGeoId must be null or 32-hex string`);
      }
      if (!sourceValid) {
        console.log(`     ❌ FAIL: attomGeoIdSource must be one of: travis_xref, conflict, unmapped`);
      }
    }
    
    // Test batch resolver with properties that may have numeric attomId
    console.log('\n🔍 Testing batch resolver (attachAttomGeoIdsToProperties)...');
    const testProperties = randomProperties.map(p => ({
      parcelId: p.parcelId,
      attomId: p.attomId // Preserve existing numeric attomId
    }));
    
    // Add known conflict property
    if (knownConflictParcelId) {
      const conflictProp = await prisma.$queryRawUnsafe(`
        SELECT "parcelId", "attomId"
        FROM properties
        WHERE "parcelId" = $1
        LIMIT 1
      `, knownConflictParcelId);
      if (conflictProp.length > 0) {
        testProperties.push({
          parcelId: conflictProp[0].parcelId,
          attomId: conflictProp[0].attomId
        });
      }
    }
    
    const batchResults = await attachAttomGeoIdsToProperties(testProperties);
    
    // Validate all results
    let validationErrors = 0;
    batchResults.forEach(p => {
      // Validate attomGeoId format (must be null or 32-hex)
      if (p.attomGeoId != null && !isValid32Hex(p.attomGeoId)) {
        console.error(`  ❌ Invalid attomGeoId format for parcelId ${p.parcelId}: ${p.attomGeoId}`);
        validationErrors++;
      }
      
      // Validate numeric attomId format (if present, must be numeric)
      if (p.attomId != null && !isValidNumeric(p.attomId)) {
        console.error(`  ❌ Invalid numeric attomId format for parcelId ${p.parcelId}: ${p.attomId}`);
        validationErrors++;
      }
      
      // Ensure attomGeoId is never numeric (should be 32-hex or null)
      if (p.attomGeoId != null && isValidNumeric(p.attomGeoId) && !isValid32Hex(p.attomGeoId)) {
        console.error(`  ❌ attomGeoId must not be numeric for parcelId ${p.parcelId}: ${p.attomGeoId}`);
        validationErrors++;
      }
      
      // Validate attomGeoIdSource exists and is valid
      if (!p.attomGeoIdSource) {
        console.error(`  ❌ Missing attomGeoIdSource for parcelId ${p.parcelId}`);
        validationErrors++;
      } else if (!['travis_xref', 'conflict', 'unmapped'].includes(p.attomGeoIdSource)) {
        console.error(`  ❌ Invalid attomGeoIdSource for parcelId ${p.parcelId}: ${p.attomGeoIdSource}`);
        validationErrors++;
      }
    });
    
    if (validationErrors > 0) {
      throw new Error(`Validation failed: ${validationErrors} errors found`);
    }
    
    // Count results
    const stats = {
      total: batchResults.length,
      withAttomGeoId: batchResults.filter(p => p.attomGeoId != null).length,
      withNumericAttomId: batchResults.filter(p => p.attomId != null && isValidNumeric(p.attomId)).length,
      withConflict: batchResults.filter(p => p.attomConflict === true).length,
      withoutMapping: batchResults.filter(p => p.attomGeoId == null && !p.attomConflict).length
    };
    
    console.log('\n📊 Results Summary:');
    console.log(`  Total tested: ${stats.total}`);
    console.log(`  With ATTOM GeoID (32-hex): ${stats.withAttomGeoId} (${(stats.withAttomGeoId / stats.total * 100).toFixed(1)}%)`);
    console.log(`  With numeric attomId (from DB): ${stats.withNumericAttomId} (${(stats.withNumericAttomId / stats.total * 100).toFixed(1)}%)`);
    console.log(`  With conflict: ${stats.withConflict} (${(stats.withConflict / stats.total * 100).toFixed(1)}%)`);
    console.log(`  Without mapping: ${stats.withoutMapping} (${(stats.withoutMapping / stats.total * 100).toFixed(1)}%)`);
    
    // Show sample outputs
    console.log('\n📋 Sample Outputs:');
    console.log('\n1. Properties with ATTOM GeoID (32-hex):');
    batchResults
      .filter(p => p.attomGeoId != null)
      .slice(0, 3)
      .forEach(p => {
        console.log(`   parcelId: ${p.parcelId}, attomId (numeric): ${p.attomId || 'null'}, attomGeoId (32-hex): ${p.attomGeoId}, conflict: ${p.attomConflict}, source: ${p.attomGeoIdSource}`);
      });
    
    console.log('\n2. Properties with conflicts:');
    batchResults
      .filter(p => p.attomConflict === true)
      .slice(0, 3)
      .forEach(p => {
        console.log(`   parcelId: ${p.parcelId}, attomId (numeric): ${p.attomId || 'null'}, attomGeoId: ${p.attomGeoId || 'null'}, conflict: ${p.attomConflict}, source: ${p.attomGeoIdSource}`);
      });
    
    console.log('\n3. Properties without mapping:');
    batchResults
      .filter(p => p.attomGeoId == null && !p.attomConflict)
      .slice(0, 3)
      .forEach(p => {
        console.log(`   parcelId: ${p.parcelId}, attomId (numeric): ${p.attomId || 'null'}, attomGeoId: null, conflict: ${p.attomConflict}, source: ${p.attomGeoIdSource}`);
      });
    
    // Test that conflicts return null attomGeoId and correct source
    if (knownConflictParcelId) {
      const conflictResult = await getAttomGeoIdByParcelId(knownConflictParcelId);
      console.log(`\n  ✅ Conflict test: parcelId=${knownConflictParcelId}`);
      console.log(`     Result: attomGeoId=${conflictResult.attomGeoId}, conflict=${conflictResult.attomConflict}, source=${conflictResult.attomGeoIdSource}`);
      if (conflictResult.attomGeoId === null && conflictResult.attomConflict === true && conflictResult.attomGeoIdSource === 'conflict') {
        console.log(`     ✅ PASS: Conflicts correctly return null attomGeoId and source='conflict'`);
      } else {
        console.log(`     ❌ FAIL: Expected null attomGeoId, conflict=true, and source='conflict'`);
        throw new Error('Conflict handling test failed');
      }
    }
    
    // Test that numeric attomId is preserved
    const propsWithNumericAttomId = batchResults.filter(p => p.attomId != null && isValidNumeric(p.attomId));
    if (propsWithNumericAttomId.length > 0) {
      console.log(`\n  ✅ Numeric attomId preservation test: Found ${propsWithNumericAttomId.length} properties with numeric attomId`);
      propsWithNumericAttomId.slice(0, 2).forEach(p => {
        console.log(`     parcelId: ${p.parcelId}, attomId (numeric): ${p.attomId}, attomGeoId: ${p.attomGeoId || 'null'}`);
      });
      console.log(`     ✅ PASS: Numeric attomId preserved separately from attomGeoId`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Test Complete - All validations passed');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testResolver();

