/**
 * Query LOC_LAND_USE from database if shapefile was already loaded
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function queryLandUseFromDB() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    CHECKING DATABASE FOR LOC_LAND_USE                        ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Check if shapefile data exists in any table
    const tables = await prisma.$queryRawUnsafe(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name LIKE '%travis%' OR table_name LIKE '%parcel%' OR table_name LIKE '%stage%')
      ORDER BY table_name;
    `);

    console.log('Potential tables with shapefile data:');
    console.table(tables);

    // Check each table for LOC_LAND_USE columns
    for (const table of tables) {
      const tableName = table.table_name;
      
      const columns = await prisma.$queryRawUnsafe(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = $1
        AND (LOWER(column_name) LIKE '%loc_land%' OR LOWER(column_name) LIKE '%land_use%' OR LOWER(column_name) LIKE '%stat_land%')
        ORDER BY column_name;
      `, tableName);

      if (columns.length > 0) {
        console.log(`\n✅ Found land use columns in ${tableName}:`);
        console.table(columns);
        
        // Try to query distinct values
        for (const col of columns) {
          const colName = col.column_name;
          console.log(`\n📊 Distinct ${colName} values from ${tableName} (top 50):`);
          try {
            const values = await prisma.$queryRawUnsafe(`
              SELECT DISTINCT "${colName}" as code, COUNT(*) as count
              FROM ${tableName}
              WHERE "${colName}" IS NOT NULL 
              AND "${colName}"::text <> ''
              AND "${colName}"::text <> ' '
              GROUP BY "${colName}"
              ORDER BY COUNT(*) DESC
              LIMIT 50;
            `);
            if (values.length > 0) {
              console.table(values);
            } else {
              console.log('   (No non-empty values found)');
            }
          } catch (e) {
            console.log(`   Error: ${e.message}`);
          }
        }
      }
    }

    // Also check if we can query the raw JSON in enrichment table
    console.log('\n\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    CHECKING ENRICHMENT TABLE RAW JSON                        ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    try {
      const rawSamples = await prisma.$queryRawUnsafe(`
        SELECT 
          parcel_id,
          raw->>'LOC_LAND_U' as loc_land_use,
          raw->>'STAT_LAND_' as stat_land_use,
          raw->>'loc_land_use' as loc_land_use_lower,
          raw->>'stat_land_use' as stat_land_use_lower
        FROM parcels_travis_enrichment
        WHERE (raw->>'LOC_LAND_U' IS NOT NULL AND raw->>'LOC_LAND_U' <> '')
           OR (raw->>'loc_land_use' IS NOT NULL AND raw->>'loc_land_use' <> '')
        LIMIT 100;
      `);

      if (rawSamples.length > 0) {
        console.log(`Found ${rawSamples.length} records with LOC_LAND_USE in raw JSON\n`);
        
        const locCodes = new Set();
        const statCodes = new Set();
        
        for (const row of rawSamples) {
          if (row.loc_land_use) locCodes.add(row.loc_land_use);
          if (row.loc_land_use_lower) locCodes.add(row.loc_land_use_lower);
          if (row.stat_land_use) statCodes.add(row.stat_land_use);
          if (row.stat_land_use_lower) statCodes.add(row.stat_land_use_lower);
        }
        
        console.log(`Unique LOC_LAND_USE codes found: ${locCodes.size}`);
        console.log(`Codes: ${Array.from(locCodes).join(', ')}`);
        
        console.log(`\nUnique STAT_LAND_USE codes found: ${statCodes.size}`);
        console.log(`Codes: ${Array.from(statCodes).join(', ')}`);
        
        // Show sample records
        console.log('\n📋 Sample records:');
        console.table(rawSamples.slice(0, 10));
      } else {
        console.log('No LOC_LAND_USE found in enrichment table raw JSON');
      }
    } catch (e) {
      console.log(`Error querying enrichment table: ${e.message}`);
    }

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

queryLandUseFromDB()
  .then(() => {
    console.log('\n✅ Query complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Query failed:', error);
    process.exit(1);
  });



