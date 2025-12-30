/**
 * Ingest Texas Parcels from ArcGIS REST API
 * 
 * Usage:
 *   node scripts/ingest-parcels-tx.mjs --countyFips=48453 --batchSize=1000
 *   node scripts/ingest-parcels-tx.mjs --countyFips=48453 --truncateFirst
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const ARCGIS_BASE_URL = 'https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer/0/query';
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batchSize='))?.split('=')[1] || '1000');
const COUNTY_FIPS = process.argv.find(a => a.startsWith('--countyFips='))?.split('=')[1];
const TRUNCATE_FIRST = process.argv.includes('--truncateFirst');
const DELAY_MS = 100;

// Initialize database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5
});

/**
 * Generate canonical parcel UID
 */
function generateParcelUid(attributes) {
  const stateFips = String(attributes.state_fips || attributes.STATE_FIPS || '48').padStart(2, '0');
  const countyFips = String(attributes.county_fips || attributes.COUNTY_FIPS || '').padStart(5, '0');
  
  // Prefer prop_id, fallback to geo_id, final fallback to OBJECTID
  const id = attributes.prop_id || attributes.PROP_ID || 
              attributes.geo_id || attributes.GEO_ID || 
              attributes.OBJECTID || attributes.objectid;
  
  if (!id) {
    throw new Error(`Cannot generate parcel_uid: missing prop_id, geo_id, and OBJECTID`);
  }
  
  return `${stateFips}${countyFips}${String(id)}`;
}

/**
 * Fetch batch of parcels from ArcGIS REST API
 */
async function fetchParcelsBatch(countyFips, offset, batchSize) {
  const whereClause = `county_fips='${countyFips}'`;
  
  const url = new URL(ARCGIS_BASE_URL);
  url.searchParams.set('where', whereClause);
  url.searchParams.set('outFields', '*');
  url.searchParams.set('returnGeometry', 'true');
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('resultOffset', String(offset));
  url.searchParams.set('resultRecordCount', String(batchSize));
  url.searchParams.set('f', 'json');
  
  console.log(`📡 Fetching batch: offset=${offset}, batchSize=${batchSize}, countyFips=${countyFips}`);
  
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`ArcGIS API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(`ArcGIS API error: ${JSON.stringify(data.error)}`);
  }
  
  return {
    features: data.features || [],
    hasMore: (data.features || []).length === batchSize
  };
}

/**
 * Insert batch of parcels into database
 */
async function insertParcelsBatch(features, sourceLayer) {
  if (features.length === 0) return { inserted: 0, skipped: 0 };
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    let inserted = 0;
    let skipped = 0;
    
    for (const feature of features) {
      try {
        const { attributes, geometry } = feature;
        
        // Generate parcel UID
        const parcelUid = generateParcelUid(attributes);
        
        // Convert geometry to PostGIS format
        const geomJson = JSON.stringify(geometry);
        
        // Insert with ST_MakeValid to fix invalid geometries
        const insertQuery = `
          INSERT INTO parcels_tx (parcel_uid, geom, state_fips, county_fips, prop_id, geo_id, source_layer)
          VALUES ($1, ST_MakeValid(ST_GeomFromGeoJSON($2)), $3, $4, $5, $6, $7)
          ON CONFLICT (parcel_uid) DO UPDATE SET
            geom = ST_MakeValid(ST_GeomFromGeoJSON($2)),
            updated_at = NOW()
        `;
        
        await client.query(insertQuery, [
          parcelUid,
          geomJson,
          String(attributes.state_fips || attributes.STATE_FIPS || '48'),
          String(attributes.county_fips || attributes.COUNTY_FIPS || ''),
          attributes.prop_id || attributes.PROP_ID || null,
          attributes.geo_id || attributes.GEO_ID || null,
          sourceLayer
        ]);
        
        inserted++;
      } catch (err) {
        console.error(`⚠️  Error inserting parcel: ${err.message}`);
        skipped++;
      }
    }
    
    await client.query('COMMIT');
    
    return { inserted, skipped };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Main ingestion function
 */
async function ingestParcels() {
  try {
    console.log('🚀 Starting Texas parcels ingestion...');
    console.log(`📊 Configuration: batchSize=${BATCH_SIZE}, delay=${DELAY_MS}ms`);
    
    if (!COUNTY_FIPS) {
      throw new Error('--countyFips parameter is required (e.g., --countyFips=48453)');
    }
    
    // Verify parcels_tx table exists
    const tableCheck = await pool.query(`
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'parcels_tx'
      LIMIT 1
    `);
    
    if (tableCheck.rows.length === 0) {
      throw new Error('parcels_tx table does not exist. Run migration first.');
    }
    
    // Truncate if requested
    if (TRUNCATE_FIRST) {
      console.log('⚠️  TRUNCATING parcels_tx table...');
      await pool.query('TRUNCATE TABLE parcels_tx');
      console.log('✅ Truncated parcels_tx');
    }
    
    console.log(`\n📍 Ingesting county: ${COUNTY_FIPS}`);
    
    let offset = 0;
    let hasMore = true;
    let totalInserted = 0;
    let totalSkipped = 0;
    let batchCount = 0;
    
    while (hasMore) {
      // Fetch batch
      const { features, hasMore: hasMoreData } = await fetchParcelsBatch(COUNTY_FIPS, offset, BATCH_SIZE);
      
      if (features.length === 0) {
        hasMore = false;
        break;
      }
      
      // Insert batch
      const { inserted, skipped } = await insertParcelsBatch(features, 'stratmap_land_parcels_48_most_recent');
      
      totalInserted += inserted;
      totalSkipped += skipped;
      batchCount++;
      
      console.log(`  Batch ${batchCount}: inserted=${inserted}, skipped=${skipped}, total=${totalInserted}`);
      
      // Check if more data available
      hasMore = hasMoreData;
      offset += features.length;
      
      // Delay between batches
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }
    
    console.log(`✅ County ${COUNTY_FIPS} complete: ${totalInserted} inserted, ${totalSkipped} skipped`);
    
    // Print final stats
    const stats = await pool.query('SELECT COUNT(*) as total, COUNT(DISTINCT county_fips) as counties FROM parcels_tx');
    console.log(`\n✅ Ingestion complete!`);
    console.log(`   Total parcels: ${stats.rows[0].total}`);
    console.log(`   Counties: ${stats.rows[0].counties}`);
    
  } catch (error) {
    console.error('❌ Ingestion error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run ingestion
ingestParcels();

