/**
 * Load Austin Land Use CSV into staging table
 * Extracts: property_id, land_use, general_land_use
 * Uses batch inserts with ON CONFLICT handling
 */

import { PrismaClient } from '@prisma/client';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';

const prisma = new PrismaClient();
const CSV_PATH = process.env.HOME + '/Downloads/Land_Use_Inventory_Detailed_20251231.csv';
const BATCH_SIZE = 5000;
const LOG_INTERVAL = 25000;

async function loadLandUse() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    LOADING AUSTIN LAND USE DATA                             ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    console.log(`📁 CSV File: ${CSV_PATH}`);
    console.log(`📦 Batch Size: ${BATCH_SIZE.toLocaleString()} rows`);
    console.log(`📊 Log Interval: ${LOG_INTERVAL.toLocaleString()} rows\n`);

    let batch = [];
    let totalProcessed = 0;
    let totalInserted = 0;
    let skippedNull = 0;
    let lastLogTime = Date.now();

    return new Promise((resolve, reject) => {
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true
      });

      const processBatch = async () => {
        if (batch.length === 0) return;

        try {
          // Deduplicate batch by property_id (keep last occurrence)
          const uniqueMap = new Map();
          batch.forEach(row => {
            uniqueMap.set(row.property_id, row);
          });
          const uniqueBatch = Array.from(uniqueMap.values());

          // Build VALUES clause
          const values = uniqueBatch.map((row, idx) => {
            const baseIdx = idx * 3;
            return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3})`;
          }).join(', ');

          // Build parameters array
          const params = uniqueBatch.flatMap(row => [
            row.property_id,
            row.land_use || null,
            row.general_land_use || null
          ]);

          const query = `
            INSERT INTO austin_land_use (property_id, land_use, general_land_use)
            VALUES ${values}
            ON CONFLICT (property_id) 
            DO UPDATE SET 
              land_use = EXCLUDED.land_use,
              general_land_use = EXCLUDED.general_land_use
          `;

          await prisma.$executeRawUnsafe(query, ...params);
          totalInserted += uniqueBatch.length;
          batch = [];

        } catch (error) {
          console.error(`\n❌ Error processing batch: ${error.message}`);
          throw error;
        }
      };

      createReadStream(CSV_PATH)
        .pipe(parser)
        .on('data', async (row) => {
          totalProcessed++;

          // Extract only the columns we need
          const propertyId = (row.PROPERTY_ID || row['PROPERTY_ID'] || '').trim();
          const landUse = (row.LAND_USE || row['LAND_USE'] || '').trim();
          const generalLandUse = (row.GENERAL_LAND_USE || row['GENERAL_LAND_USE'] || '').trim();

          // Skip if property_id is NULL or empty
          if (!propertyId || propertyId === '' || propertyId.toLowerCase() === 'null') {
            skippedNull++;
            return;
          }

          batch.push({
            property_id: propertyId,
            land_use: landUse || null,
            general_land_use: generalLandUse || null
          });

          // Process batch when full
          if (batch.length >= BATCH_SIZE) {
            parser.pause();
            await processBatch();
            parser.resume();
          }

          // Log progress
          if (totalProcessed % LOG_INTERVAL === 0) {
            const elapsed = ((Date.now() - lastLogTime) / 1000).toFixed(1);
            const rate = (LOG_INTERVAL / elapsed).toFixed(0);
            console.log(`   Processed: ${totalProcessed.toLocaleString()} rows | Inserted: ${totalInserted.toLocaleString()} | Rate: ${rate} rows/sec`);
            lastLogTime = Date.now();
          }
        })
        .on('end', async () => {
          // Process remaining batch
          if (batch.length > 0) {
            console.log(`\n   Processing final batch of ${batch.length} rows...`);
            await processBatch();
          }

          console.log(`\n\n✅ Load complete!`);
          console.log(`   Total rows processed: ${totalProcessed.toLocaleString()}`);
          console.log(`   Total rows inserted: ${totalInserted.toLocaleString()}`);
          console.log(`   Skipped (NULL property_id): ${skippedNull.toLocaleString()}`);

          // Verify load
          const countResult = await prisma.$queryRawUnsafe(`
            SELECT COUNT(*) as count FROM austin_land_use;
          `);
          const loadedCount = Number(countResult[0].count);
          console.log(`   Records in table: ${loadedCount.toLocaleString()}\n`);

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

loadLandUse()
  .then(() => {
    console.log('✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });

