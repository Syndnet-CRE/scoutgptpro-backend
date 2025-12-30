/**
 * Ingest Travis County Parcel Enrichment from Texas ArcGIS REST API
 * 
 * This script enriches parcels_travis with attributes (no geometry) from:
 * https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer
 * 
 * Usage:
 *   node scripts/ingest-travis-enrichment.mjs
 *   node scripts/ingest-travis-enrichment.mjs --batchSize=1000 --truncateStage
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const ARCGIS_BASE_URL = process.env.ARCGIS_PARCELS_URL || 
  'https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer';
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batchSize='))?.split('=')[1] || '1000');
const TRUNCATE_STAGE = process.argv.includes('--truncateStage');
const DELAY_MS = 100;
const FETCH_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;

// Initialize database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5
});

/**
 * Fetch with retry logic and timeout
 */
async function fetchWithRetry(url, maxRetries = MAX_RETRIES) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (response.ok) return response;
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      const delay = 1000 * Math.pow(2, i);
      console.log(`⚠️  Retry ${i + 1}/${maxRetries} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Fetch layer metadata to detect fields and valid filters
 */
async function fetchLayerMetadata(layerId = 0) {
  const url = `${ARCGIS_BASE_URL}/${layerId}?f=json`;
  console.log(`📡 Fetching layer metadata from: ${url}`);
  
  const response = await fetchWithRetry(url);
  const data = await response.json();
  
  if (data.error) {
    throw new Error(`ArcGIS API error: ${JSON.stringify(data.error)}`);
  }
  
  return data;
}

/**
 * Detect parcel ID field from metadata
 */
function detectParcelIdField(fields) {
  const priorities = ['prop_id', 'PROP_ID', 'parcel_id', 'PARCEL_ID', 'geo_id', 'GEO_ID', 'APN', 'apn', 'OBJECTID', 'objectid'];
  
  for (const priority of priorities) {
    const field = fields.find(f => 
      f.name === priority || 
      f.name.toLowerCase() === priority.toLowerCase() ||
      f.alias?.toLowerCase().includes('parcel') ||
      f.alias?.toLowerCase().includes('property')
    );
    if (field) {
      return field.name;
    }
  }
  
  // Fallback to first text/number field
  const fallback = fields.find(f => ['esriFieldTypeString', 'esriFieldTypeInteger', 'esriFieldTypeDouble'].includes(f.type));
  return fallback?.name || 'OBJECTID';
}

/**
 * Detect Travis County filter field
 */
function detectTravisFilter(fields) {
  // Look for county-related fields
  const countyFields = fields.filter(f => 
    f.name.toLowerCase().includes('county') ||
    f.name.toLowerCase().includes('fips') ||
    f.alias?.toLowerCase().includes('county')
  );
  
  if (countyFields.length > 0) {
    const field = countyFields[0];
    // Try common Travis identifiers
    const travisValues = ['48453', 'Travis', 'TRAVIS', 'travis'];
    return { field: field.name, values: travisValues };
  }
  
  return null;
}

/**
 * Normalize parcel ID for matching
 */
function normalizeParcelId(id) {
  if (!id) return null;
  
  // Convert to string and strip whitespace
  let normalized = String(id).trim();
  
  // Remove common prefixes (e.g., "TX-", "48453-", etc.)
  normalized = normalized.replace(/^(TX|48453|48)[-_:]/i, '');
  
  // Extract numeric portion (6-digit Travis parcel IDs)
  const numericMatch = normalized.match(/\d{6}/);
  if (numericMatch) {
    return numericMatch[0];
  }
  
  // If we have a shorter numeric, pad to 6 digits
  const shortNumeric = normalized.match(/^\d+$/);
  if (shortNumeric) {
    return shortNumeric[0].padStart(6, '0');
  }
  
  // Return as-is if no numeric match
  return normalized;
}

/**
 * Fetch batch of parcels from ArcGIS REST API
 */
async function fetchParcelsBatch(layerId, whereClause, offset, batchSize) {
  const url = new URL(`${ARCGIS_BASE_URL}/${layerId}/query`);
  url.searchParams.set('where', whereClause);
  url.searchParams.set('outFields', '*');
  url.searchParams.set('returnGeometry', 'false');
  url.searchParams.set('resultOffset', String(offset));
  url.searchParams.set('resultRecordCount', String(batchSize));
  url.searchParams.set('f', 'json');
  
  console.log(`📡 Fetching batch: offset=${offset}, batchSize=${batchSize}`);
  
  const response = await fetchWithRetry(url.toString());
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
 * Insert batch into staging table
 */
async function insertIntoStage(features, parcelIdField) {
  if (features.length === 0) return 0;
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const values = [];
    const placeholders = [];
    
    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      const attrs = feature.attributes || {};
      const detectedId = normalizeParcelId(attrs[parcelIdField]);
      
      values.push(JSON.stringify(attrs), detectedId);
      placeholders.push(`($${i * 2 + 1}::jsonb, $${i * 2 + 2})`);
    }
    
    const query = `
      INSERT INTO parcels_travis_enrichment_stage (raw, detected_id)
      VALUES ${placeholders.join(', ')}
    `;
    
    await client.query(query, values);
    await client.query('COMMIT');
    
    return features.length;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Match staging records to parcel_id and upsert into enrichment table
 */
async function matchAndUpsert() {
  console.log('\n🔄 Matching staging records to parcel_id...');
  
  const client = await pool.connect();
  
  try {
    // Get all unique parcel_ids from parcels_travis
    const parcelIdsResult = await client.query('SELECT parcel_id FROM parcels_travis');
    const parcelIds = new Set(parcelIdsResult.rows.map(r => r.parcel_id));
    
    console.log(`📊 Total parcels_travis records: ${parcelIds.size}`);
    
    // Process staging in batches
    let offset = 0;
    let matched = 0;
    let unmatched = 0;
    
    while (true) {
      const result = await client.query(`
        SELECT id, raw, detected_id
        FROM parcels_travis_enrichment_stage
        ORDER BY id
        LIMIT 1000 OFFSET $1
      `, [offset]);
      
      if (result.rows.length === 0) break;
      
      for (const row of result.rows) {
        const raw = row.raw;
        const detectedId = row.detected_id;
        
        // Try to match detected_id to parcel_id
        let matchedParcelId = null;
        
        if (detectedId && parcelIds.has(detectedId)) {
          matchedParcelId = detectedId;
        } else if (detectedId) {
          // Try variations
          const variations = [
            detectedId,
            detectedId.padStart(6, '0'),
            detectedId.replace(/^0+/, ''),
            detectedId.match(/\d+/)?.[0]
          ].filter(Boolean);
          
          for (const variant of variations) {
            if (parcelIds.has(variant)) {
              matchedParcelId = variant;
              break;
            }
          }
        }
        
        if (matchedParcelId) {
          try {
            // Upsert into enrichment table
            await client.query(`
            INSERT INTO parcels_travis_enrichment (
              parcel_id, owner_name, owner2, mail_address1, mail_address2,
              mail_city, mail_state, mail_zip, situs_address, land_use,
              land_use_desc, legal_desc, year_built, acres, land_value,
              improvement_value, market_value, assessed_value, last_update,
              source_layer, raw, updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
              $16, $17, $18, $19, $20, $21, NOW()
            )
            ON CONFLICT (parcel_id) DO UPDATE SET
              owner_name = EXCLUDED.owner_name,
              owner2 = EXCLUDED.owner2,
              mail_address1 = EXCLUDED.mail_address1,
              mail_address2 = EXCLUDED.mail_address2,
              mail_city = EXCLUDED.mail_city,
              mail_state = EXCLUDED.mail_state,
              mail_zip = EXCLUDED.mail_zip,
              situs_address = EXCLUDED.situs_address,
              land_use = EXCLUDED.land_use,
              land_use_desc = EXCLUDED.land_use_desc,
              legal_desc = EXCLUDED.legal_desc,
              year_built = EXCLUDED.year_built,
              acres = EXCLUDED.acres,
              land_value = EXCLUDED.land_value,
              improvement_value = EXCLUDED.improvement_value,
              market_value = EXCLUDED.market_value,
              assessed_value = EXCLUDED.assessed_value,
              last_update = EXCLUDED.last_update,
              source_layer = EXCLUDED.source_layer,
              raw = EXCLUDED.raw,
              updated_at = NOW()
          `, [
            matchedParcelId,
            raw.owner_name || raw.OWNER_NAME || raw.owner || null,
            raw.owner2 || raw.OWNER2 || null,
            raw.mail_address1 || raw.MAIL_ADDRESS1 || raw.mail_addr1 || null,
            raw.mail_address2 || raw.MAIL_ADDRESS2 || raw.mail_addr2 || null,
            raw.mail_city || raw.MAIL_CITY || null,
            raw.mail_state || raw.MAIL_STATE || null,
            raw.mail_zip || raw.MAIL_ZIP || null,
            raw.situs_address || raw.SITUS_ADDRESS || raw.address || null,
            raw.land_use || raw.LAND_USE || null,
            raw.land_use_desc || raw.LAND_USE_DESC || null,
            raw.legal_desc || raw.LEGAL_DESC || null,
            raw.year_built || raw.YEAR_BUILT || null,
            raw.acres || raw.ACRES || null,
            raw.land_value || raw.LAND_VALUE || null,
            raw.improvement_value || raw.IMPROVEMENT_VALUE || null,
            raw.market_value || raw.MARKET_VALUE || null,
            raw.assessed_value || raw.ASSESSED_VALUE || null,
            raw.last_update || raw.LAST_UPDATE || null,
            'stratmap_land_parcels_48_most_recent',
            JSON.stringify(raw)
          ]);
          
          matched++;
        } catch (err) {
          console.error(`⚠️  Error upserting parcel ${matchedParcelId}: ${err.message}`);
          unmatched++;
        }
        } else {
          unmatched++;
        }
      }
      
      offset += result.rows.length;
    }
    
    return { matched, unmatched };
  } finally {
    client.release();
  }
}

/**
 * Main ingestion function
 */
async function ingestEnrichment() {
  try {
    console.log('🚀 Starting Travis County parcel enrichment ingestion...');
    console.log(`📊 Configuration: batchSize=${BATCH_SIZE}, delay=${DELAY_MS}ms`);
    
    // Verify tables exist
    const tableCheck = await pool.query(`
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'parcels_travis_enrichment_stage'
      LIMIT 1
    `);
    
    if (tableCheck.rows.length === 0) {
      throw new Error('parcels_travis_enrichment_stage table does not exist. Run migration first.');
    }
    
    // Truncate stage if requested
    if (TRUNCATE_STAGE) {
      console.log('⚠️  TRUNCATING staging table...');
      await pool.query('TRUNCATE TABLE parcels_travis_enrichment_stage');
      console.log('✅ Truncated staging table');
    }
    
    // Fetch layer metadata
    console.log('\n📋 STEP 1: Fetching layer metadata...');
    const metadata = await fetchLayerMetadata(0);
    
    const fields = metadata.fields || [];
    const parcelIdField = detectParcelIdField(fields);
    const travisFilter = detectTravisFilter(fields);
    
    console.log(`✅ Detected parcel ID field: ${parcelIdField}`);
    console.log(`✅ Travis filter: ${travisFilter ? `${travisFilter.field} IN (${travisFilter.values.join(',')})` : 'NONE (will fetch all and match)'}`);
    
    // Build where clause
    let whereClause = '1=1';
    if (travisFilter) {
      const values = travisFilter.values.map(v => `'${v}'`).join(',');
      whereClause = `${travisFilter.field} IN (${values})`;
    }
    
    console.log(`📝 Using where clause: ${whereClause}`);
    
    // Ingest batches into staging
    console.log('\n📥 STEP 2: Ingesting into staging table...');
    let offset = 0;
    let hasMore = true;
    let totalStaged = 0;
    let batchCount = 0;
    
    while (hasMore) {
      const { features, hasMore: hasMoreData } = await fetchParcelsBatch(0, whereClause, offset, BATCH_SIZE);
      
      if (features.length === 0) {
        hasMore = false;
        break;
      }
      
      const inserted = await insertIntoStage(features, parcelIdField);
      totalStaged += inserted;
      batchCount++;
      
      console.log(`  Batch ${batchCount}: staged ${inserted} records, total=${totalStaged}`);
      
      hasMore = hasMoreData;
      offset += features.length;
      
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }
    
    console.log(`✅ Staged ${totalStaged} records`);
    
    // Match and upsert
    console.log('\n🔄 STEP 3: Matching and upserting...');
    const { matched, unmatched } = await matchAndUpsert();
    
    // Coverage report
    const totalParcels = await pool.query('SELECT COUNT(*) as cnt FROM parcels_travis');
    const enrichedCount = await pool.query('SELECT COUNT(*) as cnt FROM parcels_travis_enrichment');
    const coverage = ((matched / totalParcels.rows[0].cnt) * 100).toFixed(2);
    
    console.log('\n📊 Coverage Report:');
    console.log(`   Total parcels_travis: ${totalParcels.rows[0].cnt}`);
    console.log(`   Matched: ${matched}`);
    console.log(`   Unmatched: ${unmatched}`);
    console.log(`   Enriched count: ${enrichedCount.rows[0].cnt}`);
    console.log(`   Coverage: ${coverage}%`);
    
    console.log('\n✅ Ingestion complete!');
    
  } catch (error) {
    console.error('❌ Ingestion error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run ingestion
ingestEnrichment();

