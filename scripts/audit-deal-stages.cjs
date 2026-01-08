require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function audit() {
  const prisma = new PrismaClient();
  
  try {
    console.log('=== DATABASE AUDIT ===\n');
    
    // 1. Find actual table name
    const tables = await prisma.$queryRawUnsafe(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' AND tablename ILIKE '%deal%';
    `);
    console.log('1. Tables containing "deal":', tables);
    
    // 2. Get current enum values
    const enumValues = await prisma.$queryRawUnsafe(`
      SELECT enum_range(NULL::"DealStage") as values;
    `);
    console.log('2. Current DealStage enum values:', enumValues[0]?.values);
    
    // 3. Get actual column type and default
    const columnInfo = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, column_default, udt_name
      FROM information_schema.columns 
      WHERE table_name = 'deals' AND column_name = 'stage';
    `);
    console.log('3. Stage column info:', columnInfo);
    
    // 4. Get current deal counts by stage
    const dealCounts = await prisma.$queryRawUnsafe(`
      SELECT stage, COUNT(*)::int as count FROM deals GROUP BY stage ORDER BY count DESC;
    `);
    console.log('4. Current deals by stage:', dealCounts);
    
    // 5. Total deal count
    const total = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as total FROM deals;`);
    console.log('5. Total deals:', total[0]?.total);
    
    console.log('\n=== AUDIT COMPLETE ===');
    
  } catch (error) {
    console.error('Audit failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

audit();
