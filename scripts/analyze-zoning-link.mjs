/**
 * Analyze zoning data linking between parcels_travis_enrichment and properties
 * READ-ONLY analysis only
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function analyzeZoningLink() {
  try {
    console.log('🔍 Analyzing zoning data structure...\n');

    // 1. Check parcels_travis_enrichment structure
    console.log('1. Columns in parcels_travis_enrichment:');
    const columns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'parcels_travis_enrichment'
      ORDER BY ordinal_position;
    `);
    console.table(columns.rows);

    // 2. Check for zoning-related fields
    console.log('\n2. Zoning-related columns:');
    const zoningCols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'parcels_travis_enrichment'
      AND (column_name ILIKE '%zoning%' OR column_name ILIKE '%zone%')
      ORDER BY column_name;
    `);
    console.table(zoningCols.rows);

    // 3. Sample zoning data
    console.log('\n3. Sample zoning data (first 5 rows with zoning):');
    const sampleZoning = await pool.query(`
      SELECT parcel_id, zoning_code, land_use_code, flood_zone
      FROM parcels_travis_enrichment 
      WHERE zoning_code IS NOT NULL 
      LIMIT 5;
    `);
    console.table(sampleZoning.rows);

    // 4. Check join keys in parcels_travis_enrichment
    console.log('\n4. Potential join keys in parcels_travis_enrichment:');
    const enrichmentKeys = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'parcels_travis_enrichment' 
      AND column_name IN ('parcel_id', 'apn', 'prop_id', 'property_id', 'attom_id', 'geo_id')
      ORDER BY column_name;
    `);
    console.table(enrichmentKeys.rows);

    // 5. Check join keys in properties
    console.log('\n5. Potential join keys in properties:');
    const propertyKeys = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'properties' 
      AND column_name IN ('parcelId', 'apn', 'prop_id', 'property_id', 'attomId', 'geo_id', 'id')
      ORDER BY column_name;
    `);
    console.table(propertyKeys.rows);

    // 6. Test different join strategies
    console.log('\n6. Testing join strategies:');
    
    // Try parcel_id -> parcelId
    try {
      const match1 = await pool.query(`
        SELECT COUNT(*) as matchable_count
        FROM properties p
        INNER JOIN parcels_travis_enrichment e ON p."parcelId" = e.parcel_id
        WHERE e.zoning_code IS NOT NULL;
      `);
      console.log(`   parcelId = parcel_id: ${match1.rows[0].matchable_count} matches`);
    } catch (e) {
      console.log(`   parcelId = parcel_id: Error - ${e.message}`);
    }

    // Try apn -> apn
    try {
      const match2 = await pool.query(`
        SELECT COUNT(*) as matchable_count
        FROM properties p
        INNER JOIN parcels_travis_enrichment e ON p.apn = e.apn
        WHERE e.zoning_code IS NOT NULL;
      `);
      console.log(`   apn = apn: ${match2.rows[0].matchable_count} matches`);
    } catch (e) {
      console.log(`   apn = apn: Error - ${e.message}`);
    }

    // 7. Check current zoning in properties
    console.log('\n7. Current zoning coverage in properties:');
    const currentZoning = await pool.query(`
      SELECT 
        COUNT(*) as total_properties,
        COUNT(zoning) as has_zoning,
        ROUND(COUNT(zoning)::numeric / COUNT(*) * 100, 1) as zoning_pct
      FROM properties;
    `);
    console.table(currentZoning.rows);

    // 8. Sample of what will be updated
    console.log('\n8. Sample of data that will be linked (first 3 rows):');
    const sampleLink = await pool.query(`
      SELECT 
        p."parcelId" as property_parcel_id,
        p.id as property_id,
        p.zoning as current_zoning,
        e.parcel_id as enrichment_parcel_id,
        e.zoning_code as new_zoning_code
      FROM properties p
      INNER JOIN parcels_travis_enrichment e ON p."parcelId" = e.parcel_id
      WHERE e.zoning_code IS NOT NULL
      LIMIT 3;
    `);
    console.table(sampleLink.rows);

  } catch (error) {
    console.error('❌ Analysis failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

analyzeZoningLink()
  .then(() => {
    console.log('\n✅ Analysis complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });

