/**
 * Verify parcel ID formats before land use enrichment
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyParcelIds() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    PARCEL ID FORMAT VERIFICATION                            ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Query 1: Sample parcel IDs from properties table
    console.log('Query 1: Sample parcel IDs from properties table\n');
    
    const sampleParcelIds = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT "apn", "parcelId"
      FROM properties 
      WHERE "apn" IS NOT NULL 
      LIMIT 10;
    `);

    console.log('Sample Records:');
    console.log('APN              | parcelId');
    console.log('─────────────────┼───────────────');
    sampleParcelIds.forEach(row => {
      const apn = String(row.apn || '').substring(0, 15).padEnd(15);
      const parcelId = String(row.parcelId || '').substring(0, 13);
      console.log(`${apn} | ${parcelId}`);
    });

    // Query 2: Column names that could be parcel IDs
    console.log('\n\nQuery 2: Column names that could be parcel IDs\n');
    
    const parcelColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'properties' 
      AND (column_name ILIKE '%parcel%' OR column_name ILIKE '%apn%' OR column_name ILIKE '%prop%id%')
      ORDER BY column_name;
    `);

    console.log('Potential Parcel ID Columns:');
    console.table(parcelColumns);

    // Additional analysis: Check formats
    console.log('\n\nAdditional Analysis:\n');
    
    // Check parcelId format
    const parcelIdAnalysis = await prisma.$queryRawUnsafe(`
      SELECT 
        "parcelId",
        LENGTH("parcelId") as len,
        SUBSTRING("parcelId", 1, 10) as first_10,
        SUBSTRING("parcelId", 1, 10) = LPAD(SUBSTRING("parcelId", 1, 10), 10, '0') as is_10_digit_format
      FROM properties
      WHERE "parcelId" IS NOT NULL
      LIMIT 10;
    `);

    console.log('parcelId Format Analysis:');
    console.log('parcelId      | Length | First 10 chars | Is 10-digit format');
    console.log('──────────────┼────────┼────────────────┼───────────────────');
    parcelIdAnalysis.forEach(row => {
      const parcelId = String(row.parcelId || '').substring(0, 12).padEnd(12);
      const len = String(row.len || '').padStart(6);
      const first10 = String(row.first_10 || '').padEnd(14);
      const is10Digit = row.is_10_digit_format ? 'Yes' : 'No';
      console.log(`${parcelId} | ${len} | ${first10} | ${is10Digit}`);
    });

    // Check APN format
    const apnAnalysis = await prisma.$queryRawUnsafe(`
      SELECT 
        "apn",
        LENGTH("apn") as len,
        SUBSTRING("apn", 1, 10) as first_10
      FROM properties
      WHERE "apn" IS NOT NULL
      LIMIT 10;
    `);

    console.log('\n\nAPN Format Analysis:');
    console.log('APN            | Length | First 10 chars');
    console.log('───────────────┼────────┼───────────────');
    apnAnalysis.forEach(row => {
      const apn = String(row.apn || '').substring(0, 13).padEnd(13);
      const len = String(row.len || '').padStart(6);
      const first10 = String(row.first_10 || '').padEnd(13);
      console.log(`${apn} | ${len} | ${first10}`);
    });

    // Compare with land use CSV format
    console.log('\n\nLand Use CSV Format (from file):');
    console.log('parcel_id_10 examples: 0125360116, R411947, 0266102111, 0139480320');
    console.log('Format: 10 characters (can include letters like "R")');

    // Check for potential matches
    console.log('\n\nPotential Matching Strategy:');
    console.log('1. Try: SUBSTRING(parcelId, 1, 10) = parcel_id_10');
    console.log('2. Try: LPAD(SUBSTRING(parcelId, 1, 10), 10, \'0\') = parcel_id_10');
    console.log('3. Try: apn = parcel_id_10 (if apn is 10 chars)');
    console.log('4. Try: property_id match (if available)');

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

verifyParcelIds()
  .then(() => {
    console.log('\n✅ Verification complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  });



