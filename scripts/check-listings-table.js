import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function checkListingsTable() {
  try {
    // Check if listings table exists and has data
    const count = await prisma.$queryRaw`
      SELECT COUNT(*)::bigint as count FROM listings
    `;
    const rowCount = typeof count[0].count === 'bigint' 
      ? Number(count[0].count) 
      : count[0].count;
    
    console.log(`Listings table row count: ${rowCount}`);
    
    if (rowCount === 0) {
      console.log('\n✅ Listings table is empty - safe to drop and recreate');
      return true;
    } else {
      console.log(`\n⚠️  Listings table has ${rowCount} rows - need to preserve data`);
      return false;
    }
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

checkListingsTable();


