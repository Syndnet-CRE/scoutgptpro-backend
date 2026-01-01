/**
 * Enrich properties table with land use data
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function enrichProperties() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    ENRICHING PROPERTIES WITH LAND USE DATA                  ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Step 1: Add columns
    console.log('Step 1: Adding columns to properties table...\n');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE properties 
      ADD COLUMN IF NOT EXISTS land_use_code VARCHAR(10),
      ADD COLUMN IF NOT EXISTS general_land_use_code VARCHAR(10);
    `);
    console.log('✅ Columns added\n');

    // Step 2: Update properties with land use codes
    console.log('Step 2: Updating properties with land use codes...\n');
    const updateResult = await prisma.$executeRawUnsafe(`
      UPDATE properties p
      SET 
        land_use_code = a.land_use,
        general_land_use_code = a.general_land_use
      FROM austin_land_use a
      WHERE p."parcelId" = a.property_id;
    `);
    console.log('✅ Updated properties with land use codes\n');

    // Step 3: Update asset_class based on land_use_code
    console.log('Step 3: Updating asset_class based on land_use_code mapping...\n');
    await prisma.$executeRawUnsafe(`
      UPDATE properties
      SET asset_class = CASE
        WHEN land_use_code IN ('100', '113', '150') THEN 'residential'
        WHEN land_use_code IN ('160', '200', '210', '220', '230', '240') THEN 'multifamily'
        WHEN land_use_code IN ('300', '330') THEN 'retail'
        WHEN land_use_code = '400' THEN 'office'
        WHEN land_use_code IN ('500', '510', '520', '530', '560', '570') THEN 'industrial'
        WHEN land_use_code IN ('600', '610', '620', '630', '640', '650', '670', '680') THEN 'civic'
        WHEN land_use_code IN ('700', '710', '720', '740', '750') THEN 'infrastructure'
        WHEN land_use_code IN ('800', '810', '820', '830', '840', '850', '860', '870') THEN 'land'
        WHEN land_use_code IN ('900', '910', '940') THEN 'land'
        WHEN land_use_code = '999' THEN 'other'
        ELSE asset_class
      END
      WHERE land_use_code IS NOT NULL;
    `);
    console.log('✅ Updated asset_class based on land_use_code\n');

    // Step 4: Validation
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    VALIDATION RESULTS                                       ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Validation 1: Asset class distribution
    console.log('1. Asset class distribution (enriched properties):\n');
    const assetClassDist = await prisma.$queryRawUnsafe(`
      SELECT 
        asset_class,
        COUNT(*) as count
      FROM properties
      WHERE land_use_code IS NOT NULL
      GROUP BY asset_class
      ORDER BY count DESC;
    `);

    console.log('   Asset Class    | Count');
    console.log('   ───────────────┼─────────────');
    assetClassDist.forEach(row => {
      const assetClass = String(row.asset_class || 'NULL').padEnd(15);
      const count = Number(row.count).toLocaleString().padStart(12);
      console.log(`   ${assetClass} | ${count}`);
    });

    // Validation 2: Total enriched
    console.log('\n\n2. Total enriched properties:\n');
    const totalEnriched = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as total_enriched
      FROM properties
      WHERE land_use_code IS NOT NULL;
    `);

    const enrichedCount = Number(totalEnriched[0].total_enriched);
    console.log(`   Total enriched: ${enrichedCount.toLocaleString()} properties\n`);

    // Additional: Show breakdown by land_use_code
    console.log('3. Top land_use_code values:\n');
    const landUseBreakdown = await prisma.$queryRawUnsafe(`
      SELECT 
        land_use_code,
        asset_class,
        COUNT(*) as count
      FROM properties
      WHERE land_use_code IS NOT NULL
      GROUP BY land_use_code, asset_class
      ORDER BY count DESC
      LIMIT 15;
    `);

    console.log('   land_use_code | asset_class    | Count');
    console.log('   ──────────────┼───────────────┼─────────────');
    landUseBreakdown.forEach(row => {
      const code = String(row.land_use_code || 'NULL').padEnd(14);
      const asset = String(row.asset_class || 'NULL').substring(0, 13).padEnd(13);
      const count = Number(row.count).toLocaleString().padStart(12);
      console.log(`   ${code} | ${asset} | ${count}`);
    });

    // Summary
    const totalProps = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM properties;`);
    const totalPropsNum = Number(totalProps[0].count);
    const enrichmentPct = ((enrichedCount / totalPropsNum) * 100).toFixed(2);

    console.log('\n\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    SUMMARY                                                  ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    console.log(`   Total properties: ${totalPropsNum.toLocaleString()}`);
    console.log(`   Enriched properties: ${enrichedCount.toLocaleString()}`);
    console.log(`   Enrichment coverage: ${enrichmentPct}%\n`);

    console.log('✅ Enrichment complete!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

enrichProperties()
  .then(() => {
    console.log('✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });


