/**
 * Check property types and asset classes in the database
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPropertyTypes() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    PROPERTY TYPES IN DATABASE                                 ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Query 1: Distinct propertyType values
    const propertyTypes = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT "propertyType", COUNT(*) as count
      FROM properties 
      GROUP BY "propertyType" 
      ORDER BY COUNT(*) DESC 
      LIMIT 20;
    `);

    console.log('PROPERTY TYPES:');
    console.log('───────────────────────────────────────────────────────────────────────────────');
    console.table(propertyTypes);
    console.log(`\nTotal distinct property types: ${propertyTypes.length}\n`);

    // Query 2: Distinct asset_class values
    const assetClasses = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT asset_class, COUNT(*) as count
      FROM properties 
      WHERE asset_class IS NOT NULL 
      GROUP BY asset_class 
      ORDER BY COUNT(*) DESC;
    `);

    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    ASSET CLASSES IN DATABASE                                  ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    console.log('ASSET CLASSES:');
    console.log('───────────────────────────────────────────────────────────────────────────────');
    console.table(assetClasses);
    console.log(`\nTotal distinct asset classes: ${assetClasses.length}\n`);

    // Query 3: Check for self_storage specifically
    const selfStorageCheck = await prisma.$queryRawUnsafe(`
      SELECT 
        COUNT(*) FILTER (WHERE "propertyType" ILIKE '%storage%') as property_type_storage,
        COUNT(*) FILTER (WHERE asset_class = 'self_storage') as asset_class_self_storage,
        COUNT(*) as total_properties
      FROM properties;
    `);

    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    SELF STORAGE CHECK                                         ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    console.table(selfStorageCheck);

  } catch (error) {
    console.error('Error querying database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkPropertyTypes()
  .then(() => {
    console.log('\n✅ Query completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Query failed:', error);
    process.exit(1);
  });



