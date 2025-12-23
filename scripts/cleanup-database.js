#!/usr/bin/env node
/**
 * Database Cleanup Script
 * Removes old/unused data to free up space
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function cleanup() {
  console.log('=== DATABASE CLEANUP ===\n');
  
  let totalDeleted = 0;
  
  // 1. Delete test/zero parcel IDs
  console.log('1. Cleaning test/zero parcel IDs...');
  const testDelete = await prisma.property.deleteMany({
    where: {
      parcelId: '0'
    }
  });
  console.log(`   Deleted ${testDelete.count} properties with parcelId '0'`);
  totalDeleted += testDelete.count;
  
  // 2. Delete old archived polygon searches (>90 days old)
  console.log('\n2. Cleaning old archived polygon searches...');
  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 90);
  
  const oldSearches = await prisma.polygonSearch.findMany({
    where: {
      OR: [
        { isArchived: true },
        { updatedAt: { lt: oldDate } }
      ]
    },
    select: { id: true }
  });
  
  if (oldSearches.length > 0) {
    const searchDelete = await prisma.polygonSearch.deleteMany({
      where: {
        id: { in: oldSearches.map(s => s.id) }
      }
    });
    console.log(`   Deleted ${searchDelete.count} old polygon searches`);
    totalDeleted += searchDelete.count;
  } else {
    console.log('   No old searches to delete');
  }
  
  // 3. Delete inactive map server registry entries (if any)
  console.log('\n3. Cleaning inactive map server registry entries...');
  const inactiveDelete = await prisma.mapServerRegistry.deleteMany({
    where: {
      isActive: false
    }
  });
  console.log(`   Deleted ${inactiveDelete.count} inactive registry entries`);
  totalDeleted += inactiveDelete.count;
  
  // 4. Vacuum to reclaim space
  console.log('\n4. Running VACUUM ANALYZE to reclaim space...');
  try {
    await prisma.$executeRawUnsafe('VACUUM ANALYZE properties');
    await prisma.$executeRawUnsafe('VACUUM ANALYZE');
    console.log('   VACUUM completed');
  } catch (e) {
    console.log(`   VACUUM error (may require superuser): ${e.message}`);
  }
  
  // 5. Check final database size
  console.log('\n5. Checking final database size...');
  const dbSize = await prisma.$queryRaw`
    SELECT pg_size_pretty(pg_database_size(current_database())) AS size,
           pg_database_size(current_database())::bigint AS size_bytes
  `;
  const totalMb = Number(dbSize[0].size_bytes) / 1024 / 1024;
  console.log(`   Database size: ${dbSize[0].size} (${totalMb.toFixed(2)} MB)`);
  
  console.log(`\n=== CLEANUP COMPLETE ===`);
  console.log(`Total records deleted: ${totalDeleted}`);
  console.log(`Database size: ${totalMb.toFixed(2)} MB`);
  
  await prisma.$disconnect();
}

cleanup().catch(e => {
  console.error('Cleanup error:', e);
  prisma.$disconnect();
  process.exit(1);
});

