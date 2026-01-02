/**
 * Spatial join zoning districts to properties
 * Links properties to zoning codes based on lat/lng point-in-polygon
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function spatialJoinZoning() {
  const client = await pool.connect();
  
  try {
    console.log('🔗 Linking zoning districts to properties via spatial join...\n');
    
    // Check current state
    const before = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(zoning) as has_zoning,
        ROUND(COUNT(zoning)::numeric / COUNT(*) * 100, 1) as pct
      FROM properties;
    `);
    
    console.log('Before update:');
    console.table(before.rows);
    
    // Perform spatial join update
    console.log('\nUpdating properties with zoning codes...');
    const updateResult = await client.query(`
      UPDATE properties p
      SET zoning = z.zoning_code
      FROM zoning_districts z
      WHERE ST_Intersects(
        ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326),
        z.geometry
      )
      AND p.zoning IS NULL
      AND p.latitude IS NOT NULL
      AND p.longitude IS NOT NULL;
    `);
    
    console.log(`✅ Updated ${updateResult.rowCount} properties\n`);
    
    // Verify results
    const after = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(zoning) as has_zoning,
        ROUND(COUNT(zoning)::numeric / COUNT(*) * 100, 1) as pct
      FROM properties;
    `);
    
    console.log('After update:');
    console.table(after.rows);
    
    // Show zoning distribution
    const distribution = await client.query(`
      SELECT 
        zoning, 
        COUNT(*) as count
      FROM properties 
      WHERE zoning IS NOT NULL 
      GROUP BY zoning 
      ORDER BY COUNT(*) DESC 
      LIMIT 20;
    `);
    
    console.log('\nTop 20 Zoning Codes:');
    console.table(distribution.rows);
    
    // Check for properties that didn't get matched
    const unmatched = await client.query(`
      SELECT COUNT(*) as unmatched_count
      FROM properties
      WHERE zoning IS NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL;
    `);
    
    console.log(`\n⚠️  Properties without zoning: ${unmatched.rows[0].unmatched_count}`);
    console.log('   (May be outside Austin city limits or in unzoned areas)');
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

spatialJoinZoning()
  .then(() => {
    console.log('\n✅ Spatial join complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });

