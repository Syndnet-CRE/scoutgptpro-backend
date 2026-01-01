/**
 * Extract LOC_LAND_USE from Travis County shapefile
 * Shows what land use codes exist and their distribution
 */

import { PrismaClient } from '@prisma/client';
import { open } from 'shapefile';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

// Path to shapefile (.shp contains both geometry and attributes)
const SHP_PATH = join(__dirname, '../data/shapefiles/land_parcels/stratmap24-landparcels_48453_travis_202404.shp');

async function extractLandUseCodes() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    EXTRACTING LOC_LAND_USE FROM SHAPEFILE                    ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    console.log(`📁 Reading shapefile: ${SHP_PATH}`);

    const source = await open(SHP_PATH);
    
    // Read first record to get field names
    const firstResult = await source.read();
    if (firstResult.done) {
      throw new Error('Shapefile is empty');
    }

    const firstRecord = firstResult.value;
    const headers = Object.keys(firstRecord.properties || {});

    console.log(`\n📋 Fields found: ${headers.length}`);
    console.log(`   Fields: ${headers.slice(0, 10).join(', ')}${headers.length > 10 ? '...' : ''}`);
    
    // Find LOC_LAND_U field (DBF field names are truncated to 10 chars)
    const locLandUseField = headers.find(h => 
      h.toLowerCase().includes('loc_land') || 
      h.toLowerCase().includes('locland') ||
      h.toLowerCase() === 'loc_land_u' ||
      h.toLowerCase() === 'loc_land_use'
    );
    
    const statLandUseField = headers.find(h => 
      h.toLowerCase().includes('stat_land') || 
      h.toLowerCase().includes('statland') ||
      h.toLowerCase() === 'stat_land' ||
      h.toLowerCase() === 'stat_land_use'
    );

    const propIdField = headers.find(h => 
      h.toLowerCase().includes('prop_id') || 
      h.toLowerCase() === 'prop_id'
    );

    console.log(`\n🔍 Found fields:`);
    console.log(`   LOC_LAND_USE field: ${locLandUseField || 'NOT FOUND'}`);
    console.log(`   STAT_LAND_USE field: ${statLandUseField || 'NOT FOUND'}`);
    console.log(`   PROP_ID field: ${propIdField || 'NOT FOUND'}`);

    if (!locLandUseField) {
      console.log('\n❌ LOC_LAND_USE field not found. Available fields:');
      headers?.forEach((h, i) => {
        console.log(`   ${i + 1}. ${h}`);
      });
      return;
    }

    // Collect land use codes
    const landUseCodes = new Map();
    const statLandUseCodes = new Map();
    let totalRecords = 0;
    let recordsWithLocLandUse = 0;
    let recordsWithStatLandUse = 0;

    console.log('\n📊 Reading records...');

    // Process first record we already read
    totalRecords++;
    let record = firstRecord;
    let locLandUse = record.properties?.[locLandUseField];
    let statLandUse = statLandUseField ? record.properties?.[statLandUseField] : null;
    let propId = propIdField ? record.properties?.[propIdField] : null;

    if (locLandUse && String(locLandUse).trim()) {
      recordsWithLocLandUse++;
      const code = String(locLandUse).trim();
      landUseCodes.set(code, (landUseCodes.get(code) || 0) + 1);
    }

    if (statLandUse && String(statLandUse).trim()) {
      recordsWithStatLandUse++;
      const code = String(statLandUse).trim();
      statLandUseCodes.set(code, (statLandUseCodes.get(code) || 0) + 1);
    }

    // Continue reading rest of records
    while (true) {
      const result = await source.read();
      if (result.done) break;

      totalRecords++;
      record = result.value;

      locLandUse = record.properties?.[locLandUseField];
      statLandUse = statLandUseField ? record.properties?.[statLandUseField] : null;
      propId = propIdField ? record.properties?.[propIdField] : null;

      if (locLandUse && String(locLandUse).trim()) {
        recordsWithLocLandUse++;
        const code = String(locLandUse).trim();
        landUseCodes.set(code, (landUseCodes.get(code) || 0) + 1);
      }

      if (statLandUse && String(statLandUse).trim()) {
        recordsWithStatLandUse++;
        const code = String(statLandUse).trim();
        statLandUseCodes.set(code, (statLandUseCodes.get(code) || 0) + 1);
      }

      if (totalRecords % 50000 === 0) {
        process.stdout.write(`\r   Processed: ${totalRecords.toLocaleString()} records...`);
      }
    }

    console.log(`\n\n✅ Processing complete!`);
    console.log(`   Total records: ${totalRecords.toLocaleString()}`);
    console.log(`   Records with LOC_LAND_USE: ${recordsWithLocLandUse.toLocaleString()} (${((recordsWithLocLandUse / totalRecords) * 100).toFixed(1)}%)`);
    console.log(`   Records with STAT_LAND_USE: ${recordsWithStatLandUse.toLocaleString()} (${((recordsWithStatLandUse / totalRecords) * 100).toFixed(1)}%)`);

    // Sort by count
    const sortedLocCodes = Array.from(landUseCodes.entries())
      .sort((a, b) => b[1] - a[1]);

    const sortedStatCodes = Array.from(statLandUseCodes.entries())
      .sort((a, b) => b[1] - a[1]);

    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    LOC_LAND_USE CODE DISTRIBUTION                            ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    console.log(`Top 50 LOC_LAND_USE codes:\n`);
    console.log('Code    | Count      | Percentage');
    console.log('────────┼────────────┼─────────────');
    
    sortedLocCodes.slice(0, 50).forEach(([code, count]) => {
      const pct = ((count / totalRecords) * 100).toFixed(2);
      console.log(`${code.padEnd(7)} | ${String(count).padStart(10)} | ${pct.padStart(6)}%`);
    });

    if (sortedStatCodes.length > 0) {
      console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
      console.log('║                    STAT_LAND_USE CODE DISTRIBUTION                           ║');
      console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

      console.log(`Top 20 STAT_LAND_USE codes:\n`);
      console.log('Code    | Count      | Percentage');
      console.log('────────┼────────────┼─────────────');
      
      sortedStatCodes.slice(0, 20).forEach(([code, count]) => {
        const pct = ((count / totalRecords) * 100).toFixed(2);
        console.log(`${code.padEnd(7)} | ${String(count).padStart(10)} | ${pct.padStart(6)}%`);
      });
    }

    // Sample records with different codes
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    SAMPLE RECORDS BY LAND USE CODE                            ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Re-read to get samples
    const source2 = await open(SHP_PATH);
    const samples = new Map();
    
    while (true) {
      const result = await source2.read();
      if (result.done) break;

      const record = result.value;
      const locLandUse = record.properties?.[locLandUseField];
      const propId = propIdField ? String(record.properties?.[propIdField] || '').trim() : null;

      if (locLandUse && String(locLandUse).trim() && !samples.has(String(locLandUse).trim())) {
        samples.set(String(locLandUse).trim(), propId);
        if (samples.size >= 20) break;
      }
    }

    console.log('Sample PROP_ID values by LOC_LAND_USE code:');
    Array.from(samples.entries()).forEach(([code, propId]) => {
      console.log(`   ${code}: ${propId || 'N/A'}`);
    });

    console.log(`\n\n📊 Summary:`);
    console.log(`   Unique LOC_LAND_USE codes: ${landUseCodes.size}`);
    console.log(`   Unique STAT_LAND_USE codes: ${statLandUseCodes.size}`);
    console.log(`   Coverage: ${((recordsWithLocLandUse / totalRecords) * 100).toFixed(1)}% of parcels have LOC_LAND_USE`);

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

extractLandUseCodes()
  .then(() => {
    console.log('\n✅ Extraction complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Extraction failed:', error);
    process.exit(1);
  });

