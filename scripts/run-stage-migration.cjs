require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function runMigration() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Starting DealStage enum migration...');
    
    // Step 1: Migrate existing data
    console.log('Step 1: Migrating existing deal stages...');
    await prisma.$executeRawUnsafe(`UPDATE deals SET stage = 'inbound' WHERE stage = 'PIPELINE';`);
    await prisma.$executeRawUnsafe(`UPDATE deals SET stage = 'buy_box_match' WHERE stage = 'ACTIVE';`);
    await prisma.$executeRawUnsafe(`UPDATE deals SET stage = 'underwriting' WHERE stage = 'UNDERWRITING';`);
    await prisma.$executeRawUnsafe(`UPDATE deals SET stage = 'offer_submitted' WHERE stage = 'PENDING';`);
    await prisma.$executeRawUnsafe(`UPDATE deals SET stage = 'closed' WHERE stage = 'CLOSED';`);
    await prisma.$executeRawUnsafe(`UPDATE deals SET stage = 'loi' WHERE stage = 'HOLD';`);
    console.log('Data migration complete.');
    
    // Step 2: Rename old enum
    console.log('Step 2: Renaming old enum...');
    await prisma.$executeRawUnsafe(`ALTER TYPE "DealStage" RENAME TO "DealStage_old";`);
    
    // Step 3: Create new enum
    console.log('Step 3: Creating new enum...');
    await prisma.$executeRawUnsafe(`
      CREATE TYPE "DealStage" AS ENUM (
        'inbound',
        'buy_box_match',
        'initial_screen',
        'underwriting',
        'loi',
        'offer_submitted',
        'under_contract',
        'closed',
        'terminated'
      );
    `);
    
    // Step 4: Update table column
    console.log('Step 4: Updating table column...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE deals 
        ALTER COLUMN "stage" DROP DEFAULT,
        ALTER COLUMN "stage" TYPE "DealStage" USING stage::text::"DealStage",
        ALTER COLUMN "stage" SET DEFAULT 'inbound';
    `);
    
    // Step 5: Drop old enum
    console.log('Step 5: Dropping old enum...');
    await prisma.$executeRawUnsafe(`DROP TYPE "DealStage_old";`);
    
    console.log('✅ Migration complete!');
    
    // Verify
    const enumResult = await prisma.$queryRawUnsafe(`SELECT enum_range(NULL::"DealStage") as values;`);
    console.log('New enum values:', enumResult[0].values);
    
    const countResult = await prisma.$queryRawUnsafe(`SELECT stage, COUNT(*) as count FROM deals GROUP BY stage;`);
    console.log('Deal counts by stage:', countResult);
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
