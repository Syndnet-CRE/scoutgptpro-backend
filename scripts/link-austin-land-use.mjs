/**
 * Link austin_land_use data to properties table
 * Bulk UPDATE operation
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function linkAustinLandUse() {
  const client = await pool.connect();
  
  try {
    console.log('🔗 Linking austin_land_use data to properties table...\n');

    // STEP 1: Add columns if not exist
    console.log('STEP 1: Adding columns...');
    await client.query(`
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS land_use VARCHAR(20);
    `);
    await client.query(`
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS general_land_use VARCHAR(20);
    `);
    console.log('   ✅ Columns added (or already exist)\n');

    // STEP 2: Bulk UPDATE
    console.log('STEP 2: Updating properties with land use data...');
    const updateResult = await client.query(`
      UPDATE properties p
      SET 
        land_use = a.land_use,
        general_land_use = a.general_land_use
      FROM austin_land_use a
      WHERE p."parcelId" = a.property_id
      AND a.land_use IS NOT NULL;
    `);
    console.log(`   ✅ Updated ${updateResult.rowCount} properties\n`);

    // STEP 3: Verify results
    console.log('STEP 3: Verifying results...');
    const verification = await client.query(`
      SELECT 
        COUNT(*) as total_properties,
        COUNT(land_use) as has_land_use,
        ROUND(COUNT(land_use)::numeric / COUNT(*) * 100, 1) as land_use_pct
      FROM properties;
    `);
    console.table(verification.rows);

    const distribution = await client.query(`
      SELECT 
        land_use,
        general_land_use,
        COUNT(*) as count
      FROM properties
      WHERE land_use IS NOT NULL
      GROUP BY land_use, general_land_use
      ORDER BY count DESC
      LIMIT 10;
    `);
    console.log('\n   Top 10 land use code distributions:');
    console.table(distribution.rows);

    // STEP 4: Create lookup table
    console.log('\nSTEP 4: Creating land_use_codes lookup table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS land_use_codes (
        code VARCHAR(20) PRIMARY KEY,
        description VARCHAR(100),
        category VARCHAR(50)
      );
    `);

    await client.query(`
      INSERT INTO land_use_codes (code, description, category) VALUES
      ('100', 'Single Family Residential', 'Residential'),
      ('113', 'Single Family Residential (Condominium)', 'Residential'),
      ('150', 'Mobile Home', 'Residential'),
      ('160', 'Duplex', 'Residential'),
      ('170', 'Triplex', 'Residential'),
      ('180', 'Fourplex', 'Residential'),
      ('200', 'Multi-Family (5+)', 'Residential'),
      ('210', 'Apartment Complex', 'Residential'),
      ('220', 'Condominium Complex', 'Residential'),
      ('230', 'Townhouse', 'Residential'),
      ('240', 'Cooperative', 'Residential'),
      ('300', 'Vacant Residential', 'Vacant'),
      ('330', 'Vacant Residential (Subdivided)', 'Vacant'),
      ('400', 'Commercial Improved', 'Commercial'),
      ('500', 'Industrial', 'Industrial'),
      ('510', 'Light Industrial', 'Industrial'),
      ('520', 'Heavy Industrial', 'Industrial'),
      ('530', 'Warehouse/Distribution', 'Industrial'),
      ('560', 'Manufacturing', 'Industrial'),
      ('570', 'Research & Development', 'Industrial'),
      ('600', 'Farm/Ranch', 'Agricultural'),
      ('610', 'Farm/Ranch Improved', 'Agricultural'),
      ('620', 'Farm/Ranch Vacant', 'Agricultural'),
      ('630', 'Timberland', 'Agricultural'),
      ('640', 'Agricultural Exempt', 'Agricultural'),
      ('650', 'Open Space', 'Agricultural'),
      ('700', 'Vacant Commercial', 'Vacant'),
      ('710', 'Vacant Commercial (Subdivided)', 'Vacant'),
      ('740', 'Office Building', 'Commercial'),
      ('750', 'Retail Building', 'Commercial'),
      ('800', 'Vacant Industrial', 'Vacant'),
      ('850', 'Vacant Industrial (Subdivided)', 'Vacant'),
      ('860', 'Exempt Property (Government)', 'Exempt'),
      ('870', 'Exempt Property (Non-Profit)', 'Exempt'),
      ('900', 'Exempt Property', 'Exempt'),
      ('910', 'Exempt Property (Religious)', 'Exempt'),
      ('940', 'Exempt Property (Educational)', 'Exempt'),
      ('950', 'Utilities', 'Utilities'),
      ('999', 'Other/Unknown', 'Other')
      ON CONFLICT (code) DO NOTHING;
    `);

    const lookupCount = await client.query(`
      SELECT COUNT(*) as count FROM land_use_codes;
    `);
    console.log(`   ✅ Created lookup table with ${lookupCount.rows[0].count} codes\n`);

    // Final summary
    console.log('✅ LINKING COMPLETE\n');
    console.log('Summary:');
    console.log(`   - Total properties: ${verification.rows[0].total_properties}`);
    console.log(`   - Properties with land_use: ${verification.rows[0].has_land_use}`);
    console.log(`   - Coverage: ${verification.rows[0].land_use_pct}%`);
    console.log(`   - Lookup codes: ${lookupCount.rows[0].count}`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

linkAustinLandUse()
  .then(() => {
    console.log('\n✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });

