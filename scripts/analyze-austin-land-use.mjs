/**
 * Analyze austin_land_use table for zoning data linkage
 * READ-ONLY analysis
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function analyzeAustinLandUse() {
  try {
    console.log('🔍 Analyzing austin_land_use table...\n');

    // 1. Check structure
    console.log('1. Columns in austin_land_use:');
    const columns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'austin_land_use'
      ORDER BY ordinal_position;
    `);
    console.table(columns.rows);

    // 2. Sample data
    console.log('\n2. Sample data (first 5 rows):');
    const sample = await pool.query(`
      SELECT * FROM austin_land_use LIMIT 5;
    `);
    console.table(sample.rows);

    // 3. Check for zoning-related columns
    console.log('\n3. Checking for zoning-related data:');
    
    // Check if zoning column exists
    const hasZoning = columns.rows.some(c => c.column_name.toLowerCase() === 'zoning');
    if (hasZoning) {
      const zoningDistinct = await pool.query(`
        SELECT DISTINCT zoning FROM austin_land_use WHERE zoning IS NOT NULL LIMIT 20;
      `);
      console.log('   Distinct zoning values:', zoningDistinct.rows.map(r => r.zoning));
    } else {
      console.log('   No "zoning" column found');
    }

    // Check land_use distinct values
    const landUseCodes = await pool.query(`
      SELECT DISTINCT land_use FROM austin_land_use 
      WHERE land_use IS NOT NULL 
      ORDER BY land_use 
      LIMIT 20;
    `);
    console.log('   Distinct land_use values:', landUseCodes.rows.map(r => r.land_use));

    // Check general_land_use distinct values
    const generalLandUse = await pool.query(`
      SELECT DISTINCT general_land_use FROM austin_land_use 
      WHERE general_land_use IS NOT NULL 
      ORDER BY general_land_use 
      LIMIT 20;
    `);
    console.log('   Distinct general_land_use values:', generalLandUse.rows.map(r => r.general_land_use));

    // 4. Check join keys
    console.log('\n4. Potential join keys:');
    const joinKeys = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'austin_land_use' 
      AND (
        column_name ILIKE '%parcel%' 
        OR column_name ILIKE '%apn%' 
        OR column_name ILIKE '%prop%' 
        OR column_name ILIKE '%geo%'
        OR column_name ILIKE '%id%'
      )
      ORDER BY column_name;
    `);
    console.table(joinKeys.rows);

    // 5. Check for geometry
    console.log('\n5. Geometry columns:');
    const geometryCols = await pool.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns 
      WHERE table_name = 'austin_land_use' 
      AND (data_type IN ('geometry', 'geography', 'USER-DEFINED') 
           OR udt_name IN ('geometry', 'geography'));
    `);
    console.table(geometryCols.rows);

    // 6. Count records with usable data
    console.log('\n6. Data completeness:');
    const completeness = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(land_use) as has_land_use,
        COUNT(general_land_use) as has_general_land_use
      FROM austin_land_use;
    `);
    console.table(completeness.rows);

    // 7. Test join strategies
    console.log('\n7. Testing join strategies:');
    
    // Strategy A: property_id -> parcelId
    try {
      const matchA = await pool.query(`
        SELECT COUNT(*) as matches
        FROM properties p
        INNER JOIN austin_land_use a ON p."parcelId" = a.property_id
        WHERE a.land_use IS NOT NULL;
      `);
      console.log(`   Strategy A (parcelId = property_id): ${matchA.rows[0].matches} matches`);
    } catch (e) {
      console.log(`   Strategy A (parcelId = property_id): Error - ${e.message}`);
    }

    // Strategy B: property_id -> apn
    try {
      const matchB = await pool.query(`
        SELECT COUNT(*) as matches
        FROM properties p
        INNER JOIN austin_land_use a ON p.apn = a.property_id
        WHERE a.land_use IS NOT NULL;
      `);
      console.log(`   Strategy B (apn = property_id): ${matchB.rows[0].matches} matches`);
    } catch (e) {
      console.log(`   Strategy B (apn = property_id): Error - ${e.message}`);
    }

    // Strategy C: Spatial join (if geometry exists)
    if (geometryCols.rows.length > 0) {
      try {
        const geomCol = geometryCols.rows[0].column_name;
        const matchC = await pool.query(`
          SELECT COUNT(*) as matches
          FROM properties p
          INNER JOIN austin_land_use a ON ST_Intersects(
            ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326),
            a.${geomCol}
          )
          WHERE a.land_use IS NOT NULL
          AND p.latitude IS NOT NULL 
          AND p.longitude IS NOT NULL;
        `);
        console.log(`   Strategy C (spatial join): ${matchC.rows[0].matches} matches`);
      } catch (e) {
        console.log(`   Strategy C (spatial join): Error - ${e.message}`);
      }
    } else {
      console.log('   Strategy C (spatial join): No geometry column found');
    }

    // 8. Sample of what would be linked
    console.log('\n8. Sample of data that would be linked (first 3 rows):');
    try {
      const sampleLink = await pool.query(`
        SELECT 
          p."parcelId" as property_parcel_id,
          p.id as property_id,
          p.zoning as current_zoning,
          a.property_id as austin_property_id,
          a.land_use,
          a.general_land_use
        FROM properties p
        INNER JOIN austin_land_use a ON p."parcelId" = a.property_id
        WHERE a.land_use IS NOT NULL
        LIMIT 3;
      `);
      console.table(sampleLink.rows);
    } catch (e) {
      console.log(`   Error getting sample: ${e.message}`);
    }

    // 9. Check land_use code distribution
    console.log('\n9. Land use code distribution:');
    const codeDistribution = await pool.query(`
      SELECT 
        land_use,
        COUNT(*) as count
      FROM austin_land_use
      WHERE land_use IS NOT NULL
      GROUP BY land_use
      ORDER BY count DESC
      LIMIT 20;
    `);
    console.table(codeDistribution.rows);

    // 10. Check general_land_use distribution
    console.log('\n10. General land use distribution:');
    const generalDistribution = await pool.query(`
      SELECT 
        general_land_use,
        COUNT(*) as count
      FROM austin_land_use
      WHERE general_land_use IS NOT NULL
      GROUP BY general_land_use
      ORDER BY count DESC
      LIMIT 20;
    `);
    console.table(generalDistribution.rows);

  } catch (error) {
    console.error('❌ Analysis failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

analyzeAustinLandUse()
  .then(() => {
    console.log('\n✅ Analysis complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });

