#!/usr/bin/env node
/**
 * Optimize database for schema push
 * Temporarily drops less-critical indexes to free space
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const INDEXES_TO_DROP = [
  // These indexes can be recreated after schema push
  'properties_acres_idx',
  'properties_motivationScore_idx',
  'properties_propertyType_idx',
  'properties_totalTax_idx'
];

async function optimize() {
  console.log('=== OPTIMIZING DATABASE FOR SCHEMA PUSH ===\n');
  
  console.log('Dropping indexes to free space...');
  for (const indexName of INDEXES_TO_DROP) {
    try {
      await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS ${indexName}`);
      console.log(`  ✓ Dropped ${indexName}`);
    } catch (e) {
      console.log(`  ✗ Failed to drop ${indexName}: ${e.message}`);
    }
  }
  
  // Vacuum to reclaim space
  console.log('\nRunning VACUUM...');
  try {
    await prisma.$executeRawUnsafe('VACUUM ANALYZE properties');
    console.log('  ✓ VACUUM completed');
  } catch (e) {
    console.log(`  ✗ VACUUM error: ${e.message}`);
  }
  
  // Check final size
  const dbSize = await prisma.$queryRaw`
    SELECT pg_size_pretty(pg_database_size(current_database())) AS size,
           pg_database_size(current_database())::bigint AS size_bytes
  `;
  const totalMb = Number(dbSize[0].size_bytes) / 1024 / 1024;
  console.log(`\nDatabase size: ${dbSize[0].size} (${totalMb.toFixed(2)} MB)`);
  
  console.log('\n=== OPTIMIZATION COMPLETE ===');
  console.log('You can now try: npx prisma db push --accept-data-loss');
  console.log('\nAfter schema push succeeds, recreate indexes with:');
  console.log('  npx prisma db push  (will recreate missing indexes)');
  
  await prisma.$disconnect();
}

optimize().catch(e => {
  console.error('Optimization error:', e);
  prisma.$disconnect();
  process.exit(1);
});


