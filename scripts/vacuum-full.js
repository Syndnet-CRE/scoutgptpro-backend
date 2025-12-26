import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function vacuumFull() {
  try {
    console.log('🧹 Running VACUUM FULL to reclaim space...\n');
    
    // Get size before
    const beforeSize = await prisma.$queryRaw`
      SELECT 
        pg_size_pretty(pg_database_size(current_database())) as size,
        pg_database_size(current_database()) as bytes
    `;
    console.log(`📊 Size before VACUUM FULL: ${beforeSize[0].size}\n`);

    // Run VACUUM FULL on properties table
    console.log('Running VACUUM FULL on properties table...');
    await prisma.$executeRawUnsafe('VACUUM FULL properties');
    console.log('✅ VACUUM FULL complete\n');

    // Get size after
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
    
    console.log(`📊 Size after VACUUM FULL: ${afterSize[0].size}`);
    console.log(`💾 Space freed: ${freedMB} MB`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('size limit')) {
      console.log('\n⚠️  VACUUM FULL also requires temporary space.');
      console.log('💡 The database cluster is at the 512MB limit.');
      console.log('💡 Consider upgrading Neon plan or contacting Neon support.');
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

vacuumFull();


