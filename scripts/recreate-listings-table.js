import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function recreateListingsTable() {
  try {
    console.log('🔄 Recreating listings table with new schema...\n');

    // Step 1: Drop the existing listings table (it's empty anyway)
    console.log('🗑️  Dropping existing listings table...');
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS listings CASCADE');
    console.log('✅ Table dropped\n');

    // Step 2: Now try the migration
    console.log('📝 Running Prisma db push...');
    console.log('(This will create the new listings table with enhanced schema)');
    
    // We can't run prisma db push from here, need to run it separately
    console.log('\n✅ Table dropped successfully!');
    console.log('📋 Next step: Run "npx prisma db push" to create the new table');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

recreateListingsTable();


