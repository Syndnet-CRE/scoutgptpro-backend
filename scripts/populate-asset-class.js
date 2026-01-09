/**
 * Populate asset_class field in parcel_features_travis
 * 
 * Maps land_use_code and land_use_desc to asset_class values:
 * - residential, commercial, land, industrial, mixed
 * 
 * Usage:
 *   node scripts/populate-asset-class.js
 *   node scripts/populate-asset-class.js --dry-run
 *   node scripts/populate-asset-class.js --batch-size=10000
 */

import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '5000');

/**
 * Map land use code to asset class
 */
function mapLandUseCodeToAssetClass(landUseCode, landUseDesc) {
  if (!landUseCode && !landUseDesc) {
    return null;
  }
  
  const code = (landUseCode || '').toUpperCase();
  const desc = (landUseDesc || '').toLowerCase();
  
  // A* codes: Single Family Residential
  if (code.startsWith('A')) {
    return 'residential';
  }
  
  // B* codes: Multi-Family Residential
  if (code.startsWith('B')) {
    return 'residential';
  }
  
  // F* codes: Commercial
  if (code.startsWith('F')) {
    return 'commercial';
  }
  
  // L* codes: Commercial (Land/Commercial)
  if (code.startsWith('L')) {
    return 'commercial';
  }
  
  // M* codes: Industrial
  if (code.startsWith('M')) {
    return 'industrial';
  }
  
  // C*, D*, E*, G*, J* codes: Land/Vacant
  if (code.match(/^[CDEGJ]/)) {
    return 'land';
  }
  
  // X* codes: Mixed Use
  if (code.startsWith('X')) {
    return 'mixed';
  }
  
  // Check description for keywords
  if (desc) {
    if (desc.includes('residential') || desc.includes('single family') || desc.includes('multi family') || desc.includes('apartment')) {
      return 'residential';
    }
    if (desc.includes('commercial') || desc.includes('retail') || desc.includes('office') || desc.includes('shopping')) {
      return 'commercial';
    }
    if (desc.includes('industrial') || desc.includes('warehouse') || desc.includes('manufacturing')) {
      return 'industrial';
    }
    if (desc.includes('vacant') || desc.includes('land') || desc.includes('undeveloped') || desc.includes('unimproved')) {
      return 'land';
    }
    if (desc.includes('mixed') || desc.includes('multi-use')) {
      return 'mixed';
    }
  }
  
  return null;
}

/**
 * Determine asset class from property characteristics
 */
function determineAssetClassFromCharacteristics(row) {
  const buildingSqft = parseFloat(row.building_sqft) || 0;
  const improvementValue = parseFloat(row.improvement_value) || 0;
  
  // If no building and no improvements, it's land
  if (buildingSqft === 0 && improvementValue === 0) {
    return 'land';
  }
  
  // If we have building sqft or improvements, try to infer from other fields
  // This is a fallback - land use code should be primary
  return null; // Let land use code mapping handle it
}

/**
 * Get distribution of asset_class before update
 */
async function getDistribution(client) {
  const result = await client.query(`
    SELECT 
      asset_class,
      COUNT(*) as count,
      ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct
    FROM parcel_features_travis
    GROUP BY asset_class
    ORDER BY count DESC
  `);
  return result.rows;
}

/**
 * Process batch of parcels
 */
async function processBatch(client, offset, limit) {
  const result = await client.query(`
    SELECT 
      parcel_id,
      land_use_code,
      land_use_desc,
      building_sqft,
      improvement_value,
      asset_class
    FROM parcel_features_travis
    ORDER BY parcel_id
    LIMIT $1 OFFSET $2
  `, [limit, offset]);
  
  const updates = [];
  
  for (const row of result.rows) {
    // Skip if already classified (unless we want to reclassify)
    if (row.asset_class && row.asset_class !== 'unknown') {
      continue;
    }
    
    // Try land use code mapping first
    let assetClass = mapLandUseCodeToAssetClass(row.land_use_code, row.land_use_desc);
    
    // Fallback to characteristics if land use code doesn't help
    if (!assetClass) {
      assetClass = determineAssetClassFromCharacteristics(row);
    }
    
    // Default to 'unknown' if we can't determine
    if (!assetClass) {
      assetClass = 'unknown';
    }
    
    if (assetClass !== row.asset_class) {
      updates.push({
        parcel_id: row.parcel_id,
        asset_class: assetClass
      });
    }
  }
  
  if (updates.length > 0 && !DRY_RUN) {
    // Batch update
    const updatePromises = updates.map(update => 
      client.query(
        'UPDATE parcel_features_travis SET asset_class = $1 WHERE parcel_id = $2',
        [update.asset_class, update.parcel_id]
      )
    );
    
    await Promise.all(updatePromises);
  }
  
  return updates.length;
}

/**
 * Main execution
 */
async function main() {
  const client = await pool.connect();
  
  try {
    console.log('='.repeat(80));
    console.log('POPULATE ASSET_CLASS');
    console.log('='.repeat(80));
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE UPDATE'}`);
    console.log(`Batch Size: ${BATCH_SIZE}`);
    console.log('');
    
    // Get total count
    const totalResult = await client.query('SELECT COUNT(*) as count FROM parcel_features_travis');
    const totalCount = parseInt(totalResult.rows[0].count);
    console.log(`Total parcels: ${totalCount}`);
    console.log('');
    
    // Show distribution before
    console.log('--- DISTRIBUTION BEFORE ---');
    const beforeDist = await getDistribution(client);
    beforeDist.forEach(row => {
      console.log(`  ${row.asset_class || 'NULL'}: ${row.count} (${row.pct}%)`);
    });
    console.log('');
    
    // Process in batches
    let offset = 0;
    let totalUpdated = 0;
    let batchNum = 0;
    
    console.log('--- PROCESSING BATCHES ---');
    while (offset < totalCount) {
      batchNum++;
      const updated = await processBatch(client, offset, BATCH_SIZE);
      totalUpdated += updated;
      
      if (batchNum % 10 === 0 || updated > 0) {
        console.log(`  Batch ${batchNum}: Processed ${Math.min(offset + BATCH_SIZE, totalCount)}/${totalCount}, Updated: ${updated}`);
      }
      
      offset += BATCH_SIZE;
    }
    
    console.log('');
    console.log(`Total updated: ${totalUpdated}`);
    console.log('');
    
    // Show distribution after
    if (!DRY_RUN) {
      console.log('--- DISTRIBUTION AFTER ---');
      const afterDist = await getDistribution(client);
      afterDist.forEach(row => {
        console.log(`  ${row.asset_class || 'NULL'}: ${row.count} (${row.pct}%)`);
      });
      console.log('');
    }
    
    if (DRY_RUN) {
      console.log('⚠️  DRY RUN - No changes made');
    } else {
      console.log('✅ Asset class population complete');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
