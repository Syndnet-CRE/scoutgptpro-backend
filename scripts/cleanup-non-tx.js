import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function cleanup() {
  try {
    console.log('🧹 Starting cleanup of non-TX properties...\n');

    // Step 1: Count what will be deleted
    console.log('📊 Counting properties to be deleted...');
    const preCount = await prisma.$queryRaw`
      SELECT 
        CASE 
          WHEN state IS NOT NULL THEN state
          WHEN "siteState" IS NOT NULL THEN "siteState"
          ELSE 'NULL'
        END as state, 
        COUNT(*)::bigint as count 
      FROM properties 
      WHERE (state != 'TX' OR state IS NULL) 
        AND ("siteState" != 'TX' OR "siteState" IS NULL)
      GROUP BY 
        CASE 
          WHEN state IS NOT NULL THEN state
          WHEN "siteState" IS NOT NULL THEN "siteState"
          ELSE 'NULL'
        END
      ORDER BY count DESC
    `;
    
    console.log('Properties to be deleted:');
    let totalToDelete = 0;
    for (const row of preCount) {
      const count = typeof row.count === 'bigint' ? Number(row.count) : row.count;
      console.log(`  ${row.state}: ${count.toLocaleString()}`);
      totalToDelete += count;
    }
    console.log(`  TOTAL: ${totalToDelete.toLocaleString()}\n`);

    // Step 2: Get current database size
    const beforeSize = await prisma.$queryRaw`
      SELECT 
        pg_size_pretty(pg_database_size(current_database())) as size,
        pg_database_size(current_database()) as bytes
    `;
    console.log(`📊 Current database size: ${beforeSize[0].size}\n`);

    // Step 3: Delete non-TX properties
    console.log('🗑️  Deleting non-TX properties...');
    const deleteResult = await prisma.$executeRaw`
      DELETE FROM properties 
      WHERE (state != 'TX' OR state IS NULL) 
        AND ("siteState" != 'TX' OR "siteState" IS NULL)
    `;
    console.log(`✅ Deleted ${deleteResult.toLocaleString()} rows\n`);

    // Step 4: Verify remaining count
    const remaining = await prisma.$queryRaw`
      SELECT COUNT(*)::bigint as count FROM properties
    `;
    const remainingCount = typeof remaining[0].count === 'bigint' 
      ? Number(remaining[0].count) 
      : remaining[0].count;
    console.log(`✅ Remaining TX properties: ${remainingCount.toLocaleString()}\n`);

    // Step 5: Vacuum to reclaim space
    console.log('🧹 Running VACUUM ANALYZE to reclaim space...');
    await prisma.$executeRawUnsafe('VACUUM ANALYZE properties');
    console.log('✅ Vacuum complete\n');

    // Step 6: Check new database size
    const afterSize = await prisma.$queryRaw`
      SELECT 
        pg_size_pretty(pg_database_size(current_database())) as size,
        pg_database_size(current_database()) as bytes
    `;
    const beforeBytes = typeof beforeSize[0].bytes === 'bigint' 
      ? Number(beforeSize[0].bytes) 
      : Number(beforeSize[0].bytes);
    const afterBytes = typeof afterSize[0].bytes === 'bigint' 
      ? Number(afterSize[0].bytes) 
      : Number(afterSize[0].bytes);
    const freedMB = ((beforeBytes - afterBytes) / 1024 / 1024).toFixed(2);
    
    console.log(`📊 New database size: ${afterSize[0].size}`);
    console.log(`💾 Space freed: ${freedMB} MB\n`);

    console.log('✅ Cleanup complete!');
    console.log('\n📋 Summary:');
    console.log(`  - Deleted: ${deleteResult.toLocaleString()} properties`);
    console.log(`  - Remaining: ${remainingCount.toLocaleString()} TX properties`);
    console.log(`  - Space freed: ${freedMB} MB`);
    console.log(`  - New size: ${afterSize[0].size}`);

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

cleanup()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });


