/**
 * Test land use CSV match rate - reads property_ids from JSON file
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();

async function testLandUseMatch() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    LAND USE MATCH TEST (1000 ROW SAMPLE)                    ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Read property_ids from JSON file
    const propertyIds = JSON.parse(readFileSync('/tmp/test_property_ids.json', 'utf-8'));
    
    console.log(`✅ Loaded ${propertyIds.length} property_ids from CSV sample\n`);

    // Show sample
    console.log('Sample property_ids (first 20):');
    propertyIds.slice(0, 20).forEach((id, idx) => {
      console.log(`   ${idx + 1}. ${id}`);
    });
    console.log('');

    // Step 2: Create temp table and insert property_ids
    console.log('Step 2: Creating temporary test table...\n');
    
    await prisma.$executeRawUnsafe(`
      CREATE TEMP TABLE test_land_use_ids (property_id VARCHAR(20));
    `);

    // Insert in batches
    const batchSize = 100;
    for (let i = 0; i < propertyIds.length; i += batchSize) {
      const batch = propertyIds.slice(i, i + batchSize);
      const values = batch.map(id => {
        const escaped = String(id).replace(/'/g, "''");
        return `('${escaped}')`;
      }).join(',');
      
      await prisma.$executeRawUnsafe(`
        INSERT INTO test_land_use_ids (property_id) VALUES ${values};
      `);
    }

    console.log(`✅ Inserted ${propertyIds.length} property_ids into temp table\n`);

    // Step 3: Test match rate
    console.log('Step 3: Testing match rate...\n');

    const matchResult = await prisma.$queryRawUnsafe(`
      SELECT 
        (SELECT COUNT(*) FROM test_land_use_ids) as csv_sample_count,
        COUNT(*) as matched_in_properties
      FROM properties p
      WHERE p."parcelId" IN (SELECT property_id FROM test_land_use_ids);
    `);

    const csvCount = Number(matchResult[0].csv_sample_count);
    const matchedCount = Number(matchResult[0].matched_in_properties);
    const matchPct = csvCount > 0 ? ((matchedCount / csvCount) * 100).toFixed(2) : '0.00';

    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    MATCH TEST RESULTS                                       ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    console.log(`CSV Sample Size:        ${csvCount.toLocaleString()} property_ids`);
    console.log(`Matched in Properties:  ${matchedCount.toLocaleString()} properties`);
    console.log(`Match Rate:             ${matchPct}%\n`);

    // Show some matched examples
    const matchedSamples = await prisma.$queryRawUnsafe(`
      SELECT 
        p."parcelId",
        p."propertyType",
        p.asset_class,
        t.property_id as csv_property_id
      FROM properties p
      INNER JOIN test_land_use_ids t ON p."parcelId" = t.property_id
      LIMIT 10;
    `);

    if (matchedSamples.length > 0) {
      console.log('Sample Matched Properties:');
      console.log('parcelId  | propertyType    | asset_class | CSV property_id');
      console.log('──────────┼─────────────────┼─────────────┼─────────────────');
      matchedSamples.forEach(row => {
        const pid = String(row.parcelId || '').substring(0, 8).padEnd(8);
        const ptype = String(row.propertyType || '').substring(0, 15).padEnd(15);
        const asset = String(row.asset_class || 'NULL').substring(0, 11).padEnd(11);
        const csvId = String(row.csv_property_id || '').substring(0, 15);
        console.log(`${pid} | ${ptype} | ${asset} | ${csvId}`);
      });
    }

    // Show some unmatched CSV IDs (if any)
    if (matchedCount < csvCount) {
      const unmatchedSamples = await prisma.$queryRawUnsafe(`
        SELECT property_id
        FROM test_land_use_ids
        WHERE property_id NOT IN (SELECT "parcelId" FROM properties WHERE "parcelId" IS NOT NULL)
        LIMIT 10;
      `);

      if (unmatchedSamples.length > 0) {
        console.log(`\n\nSample Unmatched CSV property_ids (first 10):`);
        unmatchedSamples.forEach((row, idx) => {
          console.log(`   ${idx + 1}. ${row.property_id}`);
        });
      }
    }

    // Additional analysis: Check if we need to try alternative matching
    console.log('\n\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    RECOMMENDATION                                             ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    
    const matchRate = parseFloat(matchPct);
    if (matchRate > 50) {
      console.log(`✅ Match rate: ${matchPct}% - EXCELLENT`);
      console.log(`   Proceed with full CSV load using property_id matching\n`);
    } else if (matchRate > 10) {
      console.log(`⚠️  Match rate: ${matchPct}% - MODERATE`);
      console.log(`   Consider testing alternative matching strategies:\n`);
      console.log(`   1. Try matching on PARCEL_ID_10 (padded):`);
      console.log(`      LPAD(properties.parcelId, 10, '0') = austin_land_use.parcel_id_10\n`);
      console.log(`   2. Try matching on last 6 digits of PARCEL_ID_10:`);
      console.log(`      properties.parcelId = RIGHT(austin_land_use.parcel_id_10, 6)\n`);
    } else {
      console.log(`❌ Match rate: ${matchPct}% - VERY LOW`);
      console.log(`   property_id may not be the correct matching field\n`);
      console.log(`   Alternative strategies to test:\n`);
      console.log(`   1. Match on PARCEL_ID_10 (padded to 10 digits)`);
      console.log(`   2. Match on numeric portion of PARCEL_ID_10`);
      console.log(`   3. Check if there's another ID field in properties table\n`);
    }

    console.log('✅ Test complete!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testLandUseMatch()
  .then(() => {
    console.log('\n✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });



