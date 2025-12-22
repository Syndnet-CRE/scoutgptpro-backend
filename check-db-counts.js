import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('=== DATABASE RECORD COUNTS ===\n');
  
  try {
    // Try each table and catch errors for missing tables
    const tables = [
      'user',
      'userProfile', 
      'property',
      'pin',
      'deal',
      'buyBox',
      'listing',
      'document',
      'activity',
      'task',
      'gisLayer',
      'layerSet',
      'mapServerRegistry',
      'comp',
      'mapQuery'
    ];
    
    for (const table of tables) {
      try {
        const count = await prisma[table].count();
        console.log(`${table.padEnd(20)}: ${count} records`);
      } catch (e) {
        console.log(`${table.padEnd(20)}: ERROR - ${e.message.slice(0, 60)}`);
      }
    }
  } catch (e) {
    console.error('Database error:', e.message);
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);

