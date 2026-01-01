/**
 * Query LOC_LAND_U from staging table if shapefile was already loaded
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function queryFromStaging() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    CHECKING STAGING TABLES FOR LOC_LAND_U                    ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Find staging tables
    const tables = await prisma.$queryRawUnsafe(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name LIKE '%stage%' OR table_name LIKE '%staging%' OR table_name LIKE '%travis%')
      ORDER BY table_name;
    `);

    console.log('Potential tables:');
    console.table(tables);

    // Check each table for LOC_LAND_U column
    for (const table of tables) {
      const tableName = table.table_name;
      
      const columns = await prisma.$queryRawUnsafe(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = $1
        AND (LOWER(column_name) LIKE '%loc_land%' OR LOWER(column_name) LIKE '%land_use%')
        LIMIT 10;
      `, tableName);

      if (columns.length > 0) {
        console.log(`\n✅ Found LOC_LAND columns in ${tableName}:`);
        console.table(columns);
        
        // Try to query distinct values
        for (const col of columns) {
          const colName = col.column_name;
          console.log(`\n📊 Distinct ${colName} values from ${tableName} (top 100):`);
          try {
            const values = await prisma.$queryRawUnsafe(`
              SELECT "${colName}" as code, COUNT(*) as count
              FROM ${tableName}
              WHERE "${colName}" IS NOT NULL 
              AND "${colName}"::text <> ''
              AND "${colName}"::text <> ' '
              GROUP BY "${colName}"
              ORDER BY COUNT(*) DESC
              LIMIT 100;
            `);
            if (values.length > 0) {
              console.table(values);
              console.log(`\n   Total unique codes: ${values.length}`);
            } else {
              console.log('   (No non-empty values found)');
            }
          } catch (e) {
            console.log(`   Error: ${e.message}`);
          }
        }
      }
    }

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

queryFromStaging()
  .then(() => {
    console.log('\n✅ Query complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Query failed:', error);
    process.exit(1);
  });


