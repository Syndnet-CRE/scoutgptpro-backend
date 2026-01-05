import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function verifyListingsTable() {
  try {
    console.log('🔍 Verifying listings table structure...\n');

    // Check table exists and get column info
    const columns = await prisma.$queryRaw`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'listings'
      ORDER BY ordinal_position
    `;

    console.log('📋 Listings table columns:');
    console.log('─'.repeat(80));
    columns.forEach((col, index) => {
      console.log(`${index + 1}. ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    // Check indexes
    const indexes = await prisma.$queryRaw`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'listings'
    `;

    console.log('\n📊 Indexes:');
    console.log('─'.repeat(80));
    indexes.forEach((idx, index) => {
      console.log(`${index + 1}. ${idx.indexname}`);
    });

    // Test creating a sample listing
    console.log('\n🧪 Testing listing creation...');
    const testListing = await prisma.listing.create({
      data: {
        propertyType: 'COMMERCIAL',
        title: 'Test Office Building',
        address: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zipCode: '78701',
        askingPrice: 2500000,
        totalSqft: 25000,
        assetType: 'Office'
      }
    });
    console.log('✅ Test listing created:', testListing.id);

    // Clean up test listing
    await prisma.listing.delete({
      where: { id: testListing.id }
    });
    console.log('✅ Test listing deleted');

    console.log('\n✅ Listings table verified and working!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

verifyListingsTable();





