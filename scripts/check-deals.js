import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Check if Deal table exists and count by stage
  try {
    const stages = await prisma.$queryRaw`
      SELECT stage, COUNT(*) as count 
      FROM "deals" 
      GROUP BY stage
    `;
    console.log('Deals by stage:', stages);
  } catch (e) {
    console.log('Error with "deals" table:', e.message);
    
    // Try Deal (capitalized)
    try {
      const stages2 = await prisma.$queryRaw`
        SELECT stage, COUNT(*) as count 
        FROM "Deal" 
        GROUP BY stage
      `;
      console.log('Deals by stage (capitalized):', stages2);
    } catch (e2) {
      console.log('Error with "Deal" table:', e2.message);
    }
  }
  
  // List all tables
  const tables = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;
  console.log('All tables:', tables);
  
  // Check for any deals with initial_screen stage
  try {
    const initialScreenDeals = await prisma.$queryRaw`
      SELECT COUNT(*) as count 
      FROM "deals" 
      WHERE stage = 'initial_screen'
    `;
    console.log('Deals with initial_screen stage:', initialScreenDeals);
  } catch (e) {
    console.log('Error checking initial_screen:', e.message);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
