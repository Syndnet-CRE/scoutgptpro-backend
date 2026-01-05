/**
 * Check actual data in enrichment table zoning and land use fields
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkEnrichmentData() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    ENRICHMENT TABLE DATA CHECK                                 ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Check zoning_code
    const zoningCode = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT zoning_code, COUNT(*) as count
      FROM parcels_travis_enrichment 
      WHERE zoning_code IS NOT NULL 
      GROUP BY zoning_code
      ORDER BY COUNT(*) DESC
      LIMIT 20;
    `);
    console.log('PARCELS_TRAVIS_ENRICHMENT.zoning_code (distinct values with counts):');
    console.table(zoningCode);
    console.log(`Total distinct values: ${zoningCode.length}\n`);

    // Check land_use
    const landUse = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT land_use, COUNT(*) as count
      FROM parcels_travis_enrichment 
      WHERE land_use IS NOT NULL 
      GROUP BY land_use
      ORDER BY COUNT(*) DESC
      LIMIT 20;
    `);
    console.log('PARCELS_TRAVIS_ENRICHMENT.land_use (distinct values with counts):');
    console.table(landUse);
    console.log(`Total distinct values: ${landUse.length}\n`);

    // Check land_use_desc
    const landUseDesc = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT land_use_desc, COUNT(*) as count
      FROM parcels_travis_enrichment 
      WHERE land_use_desc IS NOT NULL 
      GROUP BY land_use_desc
      ORDER BY COUNT(*) DESC
      LIMIT 20;
    `);
    console.log('PARCELS_TRAVIS_ENRICHMENT.land_use_desc (distinct values with counts):');
    console.table(landUseDesc);
    console.log(`Total distinct values: ${landUseDesc.length}\n`);

    // Check total rows and non-null counts
    const stats = await prisma.$queryRawUnsafe(`
      SELECT 
        COUNT(*) as total_rows,
        COUNT(zoning_code) FILTER (WHERE zoning_code IS NOT NULL) as zoning_code_count,
        COUNT(land_use) FILTER (WHERE land_use IS NOT NULL) as land_use_count,
        COUNT(land_use_desc) FILTER (WHERE land_use_desc IS NOT NULL) as land_use_desc_count,
        COUNT(land_use_code) FILTER (WHERE land_use_code IS NOT NULL) as land_use_code_count,
        COUNT(land_use_description) FILTER (WHERE land_use_description IS NOT NULL) as land_use_description_count
      FROM parcels_travis_enrichment;
    `);
    console.log('ENRICHMENT TABLE STATISTICS:');
    console.table(stats);

    // Sample rows with all land use/zoning fields
    const samples = await prisma.$queryRawUnsafe(`
      SELECT 
        parcel_id,
        zoning_code,
        land_use,
        land_use_desc,
        land_use_code,
        land_use_description
      FROM parcels_travis_enrichment
      WHERE zoning_code IS NOT NULL 
         OR land_use IS NOT NULL 
         OR land_use_desc IS NOT NULL
      LIMIT 10;
    `);
    console.log('\nSAMPLE ROWS WITH ZONING/LAND USE DATA:');
    console.table(samples);

  } catch (error) {
    console.error('Error querying database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkEnrichmentData()
  .then(() => {
    console.log('\n✅ Query completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Query failed:', error);
    process.exit(1);
  });



