/**
 * Test land use CSV match rate before loading full dataset
 * Reads first 1000 rows and tests matching on property_id
 */

import { PrismaClient } from '@prisma/client';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';

const prisma = new PrismaClient();
const CSV_PATH = process.env.HOME + '/Downloads/Land_Use_Inventory_Detailed_20251231.csv';

async function testLandUseMatch() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    LAND USE MATCH TEST (1000 ROW SAMPLE)                    ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Step 1: Read first 1000 rows from CSV
    console.log('Step 1: Reading first 1000 rows from CSV...\n');
    
    const propertyIds = [];
    let rowCount = 0;

    return new Promise((resolve, reject) => {
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true
      });

      createReadStream(CSV_PATH)
        .pipe(parser)
        .on('data', (row) => {
          rowCount++;
          if (rowCount <= 1000) {
            const propertyId = row.PROPERTY_ID || row['PROPERTY_ID'];
            if (propertyId && propertyId.trim()) {
              propertyIds.push(propertyId.trim());
            }
          } else {
            parser.end();
          }
        })
        .on('end', async () => {
          console.log(`✅ Read ${rowCount} rows from CSV`);
          console.log(`✅ Extracted ${propertyIds.length} property_id values\n`);

          // Show sample property_ids
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
            const values = batch.map(id => `('${id.replace(/'/g, "''")}')`).join(',');
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
          const matchPct = ((matchedCount / csvCount) * 100).toFixed(2);

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

          // Cleanup temp table (will be dropped automatically when connection closes)
          console.log('\n\n✅ Test complete!');
          console.log(`   Match rate: ${matchPct}%`);
          
          if (parseFloat(matchPct) > 50) {
            console.log(`   ✅ Good match rate - proceed with full load`);
          } else if (parseFloat(matchPct) > 10) {
            console.log(`   ⚠️  Low match rate - may need alternative matching strategy`);
          } else {
            console.log(`   ❌ Very low match rate - property_id may not be the right match field`);
          }

          resolve();
        })
        .on('error', (error) => {
          reject(error);
        });
    });

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



