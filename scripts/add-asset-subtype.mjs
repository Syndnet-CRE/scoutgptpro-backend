/**
 * Add asset_subtype column to properties based on land_use_code
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addAssetSubtype() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    ADDING ASSET_SUBTYPE TO PROPERTIES                       ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Step 1: Add column
    console.log('Step 1: Adding asset_subtype column...\n');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS asset_subtype VARCHAR(50);
    `);
    console.log('✅ Column added\n');

    // Step 2: Update with detailed subtypes
    console.log('Step 2: Updating asset_subtype based on land_use_code...\n');
    await prisma.$executeRawUnsafe(`
      UPDATE properties
      SET asset_subtype = CASE
        WHEN land_use_code = '100' THEN 'single_family'
        WHEN land_use_code = '113' THEN 'mobile_home'
        WHEN land_use_code = '150' THEN 'duplex'
        WHEN land_use_code = '160' THEN 'large_lot_sf'
        WHEN land_use_code = '210' THEN 'triplex_fourplex'
        WHEN land_use_code = '220' THEN 'apartment'
        WHEN land_use_code = '230' THEN 'group_quarters'
        WHEN land_use_code = '240' THEN 'senior_living'
        WHEN land_use_code = '300' THEN 'retail'
        WHEN land_use_code = '330' THEN 'mixed_use'
        WHEN land_use_code = '400' THEN 'office'
        WHEN land_use_code = '510' THEN 'manufacturing'
        WHEN land_use_code = '520' THEN 'warehouse'
        WHEN land_use_code = '530' THEN 'flex_industrial'
        WHEN land_use_code = '560' THEN 'mining'
        WHEN land_use_code = '570' THEN 'landfill'
        WHEN land_use_code = '610' THEN 'transitional_housing'
        WHEN land_use_code = '620' THEN 'hospital'
        WHEN land_use_code = '630' THEN 'government'
        WHEN land_use_code = '640' THEN 'school'
        WHEN land_use_code = '650' THEN 'religious'
        WHEN land_use_code = '670' THEN 'cemetery'
        WHEN land_use_code = '680' THEN 'museum_library'
        WHEN land_use_code = '710' THEN 'park'
        WHEN land_use_code = '720' THEN 'golf_course'
        WHEN land_use_code = '730' THEN 'campground'
        WHEN land_use_code = '740' THEN 'common_area'
        WHEN land_use_code = '750' THEN 'preserve'
        WHEN land_use_code = '810' THEN 'railroad'
        WHEN land_use_code = '820' THEN 'transit'
        WHEN land_use_code = '830' THEN 'airport'
        WHEN land_use_code = '840' THEN 'marina'
        WHEN land_use_code = '850' THEN 'parking'
        WHEN land_use_code = '860' THEN 'row'
        WHEN land_use_code = '870' THEN 'utilities'
        WHEN land_use_code = '900' THEN 'vacant'
        WHEN land_use_code = '910' THEN 'agricultural'
        WHEN land_use_code = '940' THEN 'water'
        WHEN land_use_code = '999' THEN 'unknown'
        ELSE NULL
      END
      WHERE land_use_code IS NOT NULL;
    `);
    console.log('✅ Asset subtypes updated\n');

    // Step 3: Validation
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    VALIDATION RESULTS                                       ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    const validation = await prisma.$queryRawUnsafe(`
      SELECT asset_subtype, COUNT(*) as count
      FROM properties
      WHERE asset_subtype IS NOT NULL
      GROUP BY asset_subtype
      ORDER BY count DESC;
    `);

    console.log('   Asset Subtype              | Count');
    console.log('   ───────────────────────────┼─────────────');
    validation.forEach(row => {
      const subtype = String(row.asset_subtype || 'NULL').substring(0, 28).padEnd(28);
      const count = Number(row.count).toLocaleString().padStart(12);
      console.log(`   ${subtype} | ${count}`);
    });

    // Additional: Check coverage
    const totalWithSubtype = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM properties WHERE asset_subtype IS NOT NULL;
    `);
    const totalWithLandUse = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM properties WHERE land_use_code IS NOT NULL;
    `);
    const totalProps = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM properties;
    `);

    const withSubtype = Number(totalWithSubtype[0].count);
    const withLandUse = Number(totalWithLandUse[0].count);
    const total = Number(totalProps[0].count);

    console.log('\n\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    SUMMARY                                                  ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    console.log(`   Total properties: ${total.toLocaleString()}`);
    console.log(`   Properties with land_use_code: ${withLandUse.toLocaleString()}`);
    console.log(`   Properties with asset_subtype: ${withSubtype.toLocaleString()}`);
    console.log(`   Coverage: ${((withSubtype / total) * 100).toFixed(2)}%\n`);

    // Check for unmapped land_use_codes
    const unmapped = await prisma.$queryRawUnsafe(`
      SELECT land_use_code, COUNT(*) as count
      FROM properties
      WHERE land_use_code IS NOT NULL
      AND asset_subtype IS NULL
      GROUP BY land_use_code
      ORDER BY count DESC;
    `);

    if (unmapped.length > 0) {
      console.log('⚠️  Unmapped land_use_codes (asset_subtype is NULL):\n');
      console.log('   land_use_code | Count');
      console.log('   ──────────────┼─────────────');
      unmapped.forEach(row => {
        const code = String(row.land_use_code || 'NULL').padEnd(14);
        const count = Number(row.count).toLocaleString().padStart(12);
        console.log(`   ${code} | ${count}`);
      });
    } else {
      console.log('✅ All land_use_codes have been mapped to asset_subtype\n');
    }

    console.log('✅ Asset subtype enrichment complete!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addAssetSubtype()
  .then(() => {
    console.log('✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });



