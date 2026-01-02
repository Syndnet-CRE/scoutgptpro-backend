/**
 * Download City of Austin zoning districts from ArcGIS MapServer
 * and import to database
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000, // 30 seconds
  idleTimeoutMillis: 30000,
  query_timeout: 60000 // 60 seconds per query
});

const MAPSERVER_URL = 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Zoning_1/MapServer/0';
const BATCH_SIZE = 1000; // ArcGIS default max

async function getFeatureCount() {
  console.log('Fetching feature count...');
  const url = `${MAPSERVER_URL}/query?where=1=1&returnCountOnly=true&f=json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch count: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(`MapServer error: ${JSON.stringify(data.error)}`);
  }
  return data.count || 0;
}

async function fetchFeatures(offset) {
  const url = `${MAPSERVER_URL}/query?where=1=1&outFields=*&outSR=4326&f=geojson&resultOffset=${offset}&resultRecordCount=${BATCH_SIZE}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch features: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(`MapServer error: ${JSON.stringify(data.error)}`);
  }
  return data.features || [];
}

async function insertFeatures(features) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Batch insert for better performance
    const values = [];
    const placeholders = [];
    let paramIndex = 1;
    
    for (const feature of features) {
      const props = feature.properties || {};
      const geom = feature.geometry;
      
      if (!geom) {
        console.warn('Skipping feature without geometry:', props);
        continue;
      }
      
      // Extract zoning code - MapServer uses ZONING_ZTYPE
      const zoningCode = props.ZONING_ZTYPE || 
                        props.ZONING || 
                        props.ZONE_CODE || 
                        props.ZONING_CODE ||
                        props.zoning || 
                        props.zone_code ||
                        null;
      
      const zoningDesc = props.ZONING_BASE || 
                         props.ZONING_DESC || 
                         props.DESCRIPTION || 
                         props.ZONE_DESC || 
                         props.DESC ||
                         props.zoning_desc ||
                         '';
      
      const overlay = props.OVERLAY || 
                     props.ZONING_OVERLAY || 
                     props.OVERLAY_CODE ||
                     props.overlay ||
                     '';
      
      // Prepare values for batch insert
      values.push(
        zoningCode,
        zoningDesc || null,
        overlay || null,
        JSON.stringify(geom),
        JSON.stringify(props)
      );
      
      placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, ST_SetSRID(ST_GeomFromGeoJSON($${paramIndex + 3}::jsonb), 4326), $${paramIndex + 4}::jsonb)`);
      paramIndex += 5;
    }
    
    if (values.length > 0) {
      // Batch insert all features at once
      await client.query(`
        INSERT INTO zoning_districts (zoning_code, zoning_desc, overlay, geometry, raw_attributes)
        VALUES ${placeholders.join(', ')}
      `, values);
    }
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    console.log('🗺️  Importing City of Austin Zoning Districts\n');
    
    // Check if we already have data and can resume
    const existing = await pool.query('SELECT COUNT(*) as count FROM zoning_districts');
    const existingCount = parseInt(existing.rows[0].count);
    
    if (existingCount > 0) {
      console.log(`📊 Found ${existingCount} existing records. Checking if we can resume...\n`);
    }
    
    // Get total count
    const totalCount = await getFeatureCount();
    console.log(`Total zoning features: ${totalCount}\n`);
    
    if (totalCount === 0) {
      console.log('⚠️  No features found. Check MapServer URL.');
      return;
    }
    
    // Start from existing count if resuming
    let offset = existingCount;
    let imported = existingCount;
    
    if (offset > 0) {
      console.log(`🔄 Resuming from offset ${offset} (${((offset/totalCount)*100).toFixed(1)}%)\n`);
    }
    
    while (offset < totalCount) {
      const endOffset = Math.min(offset + BATCH_SIZE, totalCount);
      console.log(`📥 Fetching features ${offset} - ${endOffset}...`);
      
      const features = await fetchFeatures(offset);
      
      if (features.length === 0) {
        console.log('No more features to fetch');
        break;
      }
      
      console.log(`   Processing ${features.length} features...`);
      await insertFeatures(features);
      
      imported += features.length;
      console.log(`   ✅ Imported: ${imported}/${totalCount} (${((imported/totalCount)*100).toFixed(1)}%)\n`);
      
      offset += BATCH_SIZE;
      
      // Small delay to avoid rate limiting and give DB time to process
      if (offset < totalCount) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Release connection periodically to avoid timeouts
      if (offset % 5000 === 0) {
        await pool.end();
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Recreate pool
        Object.assign(pool, new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 30000,
          idleTimeoutMillis: 30000
        }));
      }
    }
    
    // Verify results
    console.log('📊 Verifying import...\n');
    const result = await pool.query(`
      SELECT 
        COUNT(*) as count, 
        COUNT(DISTINCT zoning_code) as codes,
        COUNT(DISTINCT overlay) as overlays
      FROM zoning_districts
    `);
    
    console.log('Import Summary:');
    console.log(`   Total districts: ${result.rows[0].count}`);
    console.log(`   Unique zoning codes: ${result.rows[0].codes}`);
    console.log(`   Unique overlays: ${result.rows[0].overlays}\n`);
    
    // Show top zoning codes
    const sample = await pool.query(`
      SELECT 
        zoning_code, 
        zoning_desc,
        COUNT(*) as count
      FROM zoning_districts 
      GROUP BY zoning_code, zoning_desc 
      ORDER BY COUNT(*) DESC 
      LIMIT 15
    `);
    
    console.log('Top 15 Zoning Codes:');
    console.table(sample.rows);
    
    console.log('\n✅ Import complete!');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });

