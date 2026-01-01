/**
 * Audit properties table specifically
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function auditProperties() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    PROPERTIES TABLE AUDIT                                     ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Get columns
    const columns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'properties'
      ORDER BY ordinal_position;
    `);

    console.log(`📋 Columns (${columns.length} total):\n`);
    columns.forEach((col, i) => {
      const length = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
      console.log(`   ${i + 1}. ${col.column_name.padEnd(30)} - ${col.data_type}${length}`);
    });

    // Get row count
    const countResult = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM properties;`);
    const rowCount = Number(countResult[0].count);
    console.log(`\n   Total rows: ${rowCount.toLocaleString()}\n`);

    // Sample 20 rows (excluding geometry)
    const samples = await prisma.$queryRawUnsafe(`
      SELECT 
        "parcelId", owner, "ownerName", address, city, state, 
        "propertyType", "asset_class", acres, "mktValue", "landValue", 
        "yearBuilt", latitude, longitude, "isAbsentee"
      FROM properties 
      LIMIT 20;
    `);

    console.log('📊 Sample Rows (first 20):\n');
    console.log('Row | parcelId  | owner (first 25)      | propertyType    | asset_class | acres   | mktValue');
    console.log('────┼───────────┼────────────────────────┼─────────────────┼─────────────┼─────────┼──────────');
    
    samples.forEach((row, idx) => {
      const parcelId = String(row.parcelId || '').substring(0, 9).padEnd(9);
      const owner = String(row.owner || '').substring(0, 23).padEnd(23);
      const propType = String(row.propertyType || '').substring(0, 15).padEnd(15);
      const assetClass = String(row.asset_class || 'NULL').substring(0, 11).padEnd(11);
      const acres = String(row.acres || '').substring(0, 7).padStart(7);
      const mktValue = String(row.mktValue || '').substring(0, 8).padStart(8);
      console.log(`${String(idx + 1).padStart(3)} | ${parcelId} | ${owner} | ${propType} | ${assetClass} | ${acres} | ${mktValue}`);
    });

    // Show distribution
    console.log(`\n\n📊 Asset Class Distribution:\n`);
    const assetDist = await prisma.$queryRawUnsafe(`
      SELECT asset_class, COUNT(*) as count
      FROM properties
      GROUP BY asset_class
      ORDER BY COUNT(*) DESC;
    `);
    console.table(assetDist);

    console.log(`\n\n📊 Property Type Distribution (top 20):\n`);
    const propTypeDist = await prisma.$queryRawUnsafe(`
      SELECT "propertyType", COUNT(*) as count
      FROM properties
      WHERE "propertyType" IS NOT NULL
      GROUP BY "propertyType"
      ORDER BY COUNT(*) DESC
      LIMIT 20;
    `);
    console.table(propTypeDist);

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

auditProperties()
  .then(() => {
    console.log('\n✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });


