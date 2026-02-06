/**
 * Import GIS layers from various sources (ArcGIS, Socrata) to PostGIS
 * 
 * Usage:
 *   node scripts/gis-import/import-gis-layers.mjs --layer=water_ccn
 *   node scripts/gis-import/import-gis-layers.mjs --layer=sewer_ccn
 *   node scripts/gis-import/import-gis-layers.mjs --layer=floodplain_austin
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
  query_timeout: 60000
});

const BATCH_SIZE = 1000;

// Layer configurations with discovered working URLs
const LAYER_CONFIGS = {
  floodplain_austin: {
    tableName: 'gis_floodplain_austin',
    sourceType: 'arcgis',
    url: 'https://maps.austintexas.gov/arcgis/rest/services/FloodPro/FloodPro/MapServer/8',
    bbox: '-97.94,30.07,-97.40,30.63', // Travis County bbox
    extractFields: (props) => ({
      zone_code: (props.FLOOD_ZONE || props.FLD_ZONE || props.ZONE_CODE || '').toString().substring(0, 20),
      zone_desc: (props.FLOODWAY || props.FLD_ZONE_DESC || props.DESCRIPTION || props.FIRM_PANEL || '').toString().substring(0, 255)
    })
  },
  water_ccn: {
    tableName: 'gis_water_ccn',
    sourceType: 'arcgis',
    url: 'https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/PUC_CCNs_in_Travis_County/MapServer/1',
    extractFields: (props) => ({
      ccn_no: props.CCN_NO || props.CCN || props.ccn_no || null,
      utility: props.UTILITY || props.UTILITY_NAME || props.utility || null,
      county: props.COUNTY || props.county || 'Travis',
      type: props.TYPE || props.type || null
    })
  },
  sewer_ccn: {
    tableName: 'gis_sewer_ccn',
    sourceType: 'arcgis',
    url: 'https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/PUC_CCNs_in_Travis_County/MapServer/0',
    extractFields: (props) => ({
      ccn_no: props.CCN_NO || props.CCN || props.ccn_no || null,
      utility: props.UTILITY || props.UTILITY_NAME || props.utility || null,
      county: props.COUNTY || props.county || 'Travis',
      type: props.TYPE || props.type || null
    })
  },
  contours_austin: {
    tableName: 'gis_contours_austin',
    sourceType: 'arcgis',
    url: 'https://maps.austintexas.gov/arcgis/rest/services/FloodPro/FloodPro/MapServer/3',
    bbox: '-97.94,30.07,-97.40,30.63', // Travis County bbox
    maxFeatures: 10000, // Limit contours to prevent overwhelming dataset
    extractFields: (props) => ({
      elevation: props.ELEVATION || props.CONTOUR || props.ELEV || null,
      contour_type: props.CONTOUR_TYPE || props.TYPE || 'standard'
    })
  },
  wetlands_cef: {
    tableName: 'gis_wetlands_cef',
    sourceType: 'arcgis',
    url: 'https://fwsprimary.wim.usgs.gov/server/rest/services/Test/Wetlands_gdb_split/MapServer/0',
    bbox: '-97.94,30.07,-97.40,30.63', // Travis County bbox
    maxFeatures: 5000, // Limit to prevent timeout
    extractFields: (props) => ({
      wetland_type: props.WETLAND_TYPE || props.ATTRIBUTE || props.WETTYPE || null
    })
  },
  water_districts: {
    tableName: 'gis_water_districts',
    sourceType: 'socrata',
    url: 'https://data.austintexas.gov/resource/uyrh-i4dq.geojson', // Austin Open Data - water districts
    extractFields: (props) => ({
      district_name: props.NAME || props.DISTRICT_NAME || props.district_name || null,
      district_type: props.TYPE || props.DISTRICT_TYPE || props.district_type || 'water_district'
    })
  },
  cef_buffers: {
    tableName: 'gis_cef_buffers',
    sourceType: 'socrata',
    url: 'https://data.austintexas.gov/resource/n7cy-835m.geojson', // Austin Open Data - CEF buffers
    extractFields: (props) => ({
      buffer_type: props.BUFFER_TYPE || props.TYPE || props.buffer_type || 'cef_buffer',
      buffer_distance: parseInt(props.BUFFER_DISTANCE || props.DISTANCE || props.buffer_distance || '0')
    })
  }
};

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name, defaultValue) => {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : defaultValue;
};

const LAYER_NAME = getArg('layer', null);
const TRUNCATE_FIRST = getArg('truncateFirst', 'false') === 'true';
const LIMIT = getArg('limit') ? parseInt(getArg('limit'), 10) : null;

if (!LAYER_NAME) {
  console.error('❌ Error: --layer argument required');
  console.error('\nUsage:');
  console.error('  node scripts/gis-import/import-gis-layers.mjs --layer=water_ccn');
  console.error('\nAvailable layers:');
  Object.keys(LAYER_CONFIGS).forEach(name => {
    console.error(`  - ${name}`);
  });
  process.exit(1);
}

const config = LAYER_CONFIGS[LAYER_NAME];
if (!config) {
  console.error(`❌ Error: Unknown layer "${LAYER_NAME}"`);
  console.error('Available layers:', Object.keys(LAYER_CONFIGS).join(', '));
  process.exit(1);
}

// ============================================================================
// ArcGIS MapServer Functions
// ============================================================================

async function getArcGISFeatureCount(url) {
  console.log('Fetching feature count from ArcGIS...');
  const queryUrl = `${url}/query?where=1=1&returnCountOnly=true&f=json`;
  const res = await fetch(queryUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch count: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(`MapServer error: ${JSON.stringify(data.error)}`);
  }
  return data.count || 0;
}

async function fetchArcGISFeatures(url, offset) {
  const queryUrl = `${url}/query?where=1=1&outFields=*&outSR=4326&f=geojson&resultOffset=${offset}&resultRecordCount=${BATCH_SIZE}`;
  const res = await fetch(queryUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch features: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(`MapServer error: ${JSON.stringify(data.error)}`);
  }
  return data.features || [];
}

// ============================================================================
// Socrata API Functions
// ============================================================================

async function getSocrataFeatureCount(url) {
  console.log('Fetching feature count from Socrata...');
  // Socrata doesn't have a count-only endpoint, so fetch first batch
  const queryUrl = `${url}?$limit=1&$select=count(*)`;
  try {
    const res = await fetch(queryUrl);
    if (!res.ok) {
      // Fallback: fetch all and count (may be slow)
      const data = await fetch(`${url}?$limit=50000`).then(r => r.json());
      return Array.isArray(data) ? data.length : (data.features?.length || 0);
    }
    const data = await res.json();
    // Socrata returns count in different formats
    return Array.isArray(data) ? data.length : (data[0]?.count || 0);
  } catch (error) {
    console.warn('Could not get count, will fetch all:', error.message);
    return null; // Unknown count
  }
}

async function fetchSocrataFeatures(url, offset) {
  const queryUrl = `${url}?$limit=${BATCH_SIZE}&$offset=${offset}`;
  const res = await fetch(queryUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch features: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  
  // Socrata may return GeoJSON FeatureCollection or array of features
  if (data.type === 'FeatureCollection') {
    return data.features || [];
  } else if (Array.isArray(data)) {
    // Convert array to features (assuming each item has geometry)
    return data.map((item, idx) => ({
      type: 'Feature',
      id: item.id || idx,
      geometry: item.geometry || item.the_geom,
      properties: item
    }));
  }
  
  return [];
}

// ============================================================================
// Database Functions
// ============================================================================

async function insertFeatures(features, config) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const values = [];
    const placeholders = [];
    let paramIndex = 1;
    let fieldNames = []; // Declare fieldNames in the proper scope
    
    for (const feature of features) {
      const props = feature.properties || {};
      const geom = feature.geometry;
      
      if (!geom) {
        console.warn('Skipping feature without geometry:', props);
        continue;
      }
      
      // Extract fields using layer-specific extractor
      const fields = config.extractFields(props);
      
      // Build values array based on table structure
      const fieldValues = [];
      
      // Initialize fieldNames on first iteration
      if (fieldNames.length === 0) {
        // Add extracted field names
        Object.keys(fields).forEach(key => {
          fieldNames.push(key);
        });
        
        // Add geometry and raw attributes
        fieldNames.push('geometry', 'raw_attributes');
      }
      
      // Add extracted field values
      Object.values(fields).forEach(value => {
        fieldValues.push(value);
      });
      
      // Add geometry and raw attributes values
      fieldValues.push(JSON.stringify(geom), JSON.stringify(props));
      
      // Build placeholder string
      const placeholdersForRow = fieldValues.map((_, i) => {
        const idx = paramIndex + i;
        if (i === fieldValues.length - 2) {
          // Geometry field
          return `ST_SetSRID(ST_GeomFromGeoJSON($${idx}::jsonb), 4326)`;
        }
        return `$${idx}`;
      });
      
      placeholders.push(`(${placeholdersForRow.join(', ')})`);
      values.push(...fieldValues);
      paramIndex += fieldValues.length;
    }
    
    if (values.length > 0 && fieldNames.length > 0) {
      const fieldNamesStr = fieldNames.join(', ');
      await client.query(`
        INSERT INTO ${config.tableName} (${fieldNamesStr})
        VALUES ${placeholders.join(', ')}
        ON CONFLICT DO NOTHING
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

// ============================================================================
// Main Import Function
// ============================================================================

async function main() {
  try {
    console.log(`🗺️  Importing ${LAYER_NAME}\n`);
    console.log(`Table: ${config.tableName}`);
    console.log(`Source: ${config.sourceType} - ${config.url}\n`);
    
    // Check if URL is placeholder
    if (config.url.includes('...') || config.url.includes('{id}')) {
      console.error('❌ Error: Layer URL not configured. Please update LAYER_CONFIGS with actual endpoint.');
      console.error(`Current URL: ${config.url}`);
      process.exit(1);
    }
    
    // Truncate if requested
    if (TRUNCATE_FIRST) {
      console.log('⚠️  Truncating table...');
      await pool.query(`TRUNCATE TABLE ${config.tableName}`);
      console.log('✅ Truncated\n');
    }
    
    // Check existing count
    const existing = await pool.query(`SELECT COUNT(*) as count FROM ${config.tableName}`);
    const existingCount = parseInt(existing.rows[0].count);
    
    if (existingCount > 0 && !TRUNCATE_FIRST) {
      console.log(`📊 Found ${existingCount} existing records. Use --truncateFirst=true to replace.\n`);
    }
    
    // Get total count
    let totalCount = null;
    if (config.sourceType === 'arcgis') {
      totalCount = await getArcGISFeatureCount(config.url);
    } else if (config.sourceType === 'socrata') {
      totalCount = await getSocrataFeatureCount(config.url);
    }
    
    if (totalCount !== null) {
      console.log(`Total features: ${totalCount}\n`);
    } else {
      console.log('Total features: Unknown (will fetch until empty)\n');
    }
    
    if (totalCount === 0) {
      console.log('⚠️  No features found. Check URL.');
      return;
    }
    
    // Import loop
    let offset = 0;
    let imported = existingCount;
    let batchNum = 0;
    
    while (true) {
      if (LIMIT && imported >= LIMIT) {
        console.log(`\n✅ Reached limit of ${LIMIT} features`);
        break;
      }
      
      const endOffset = totalCount ? Math.min(offset + BATCH_SIZE, totalCount) : offset + BATCH_SIZE;
      console.log(`📥 Fetching batch ${batchNum + 1} (offset ${offset}${totalCount ? ` - ${endOffset}` : ''})...`);
      
      let features;
      if (config.sourceType === 'arcgis') {
        features = await fetchArcGISFeatures(config.url, offset);
      } else if (config.sourceType === 'socrata') {
        features = await fetchSocrataFeatures(config.url, offset);
      } else {
        throw new Error(`Unknown source type: ${config.sourceType}`);
      }
      
      if (features.length === 0) {
        console.log('No more features to fetch');
        break;
      }
      
      console.log(`   Processing ${features.length} features...`);
      await insertFeatures(features, config);
      
      imported += features.length;
      if (totalCount) {
        console.log(`   ✅ Imported: ${imported}/${totalCount} (${((imported/totalCount)*100).toFixed(1)}%)\n`);
      } else {
        console.log(`   ✅ Imported: ${imported} total\n`);
      }
      
      offset += BATCH_SIZE;
      batchNum++;
      
      // Small delay to avoid rate limiting
      if (features.length === BATCH_SIZE) {
        await new Promise(resolve => setTimeout(resolve, 200));
      } else {
        break; // Last batch
      }
    }
    
    // Verify results
    console.log('📊 Verifying import...\n');
    const result = await pool.query(`
      SELECT 
        COUNT(*) as count,
        ST_Extent(geometry) as bbox
      FROM ${config.tableName}
    `);
    
    console.log('Import Summary:');
    console.log(`   Total features: ${result.rows[0].count}`);
    if (result.rows[0].bbox) {
      console.log(`   Bounding box: ${result.rows[0].bbox}`);
    }
    
    // Show sample
    const sample = await pool.query(`
      SELECT * FROM ${config.tableName} LIMIT 3
    `);
    
    if (sample.rows.length > 0) {
      console.log('\nSample records:');
      sample.rows.forEach((row, i) => {
        console.log(`\n   ${i + 1}. ID: ${row.id}`);
        Object.keys(row).forEach(key => {
          if (key !== 'geometry' && key !== 'raw_attributes') {
            console.log(`      ${key}: ${row[key]}`);
          }
        });
      });
    }
    
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
