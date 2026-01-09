/**
 * Batch Update asset_class
 * 
 * Updates asset_class in parcel_features_travis from properties.asset_class
 * Processes in batches of 5000 to avoid Neon timeout
 * 
 * Usage:
 *   node scripts/batch-update-asset-class.js
 */

import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const BATCH_SIZE = 5000;

/**
 * Map properties.asset_class to standard asset_class values
 */
function mapAssetClass(propertyAssetClass) {
  if (!propertyAssetClass) return null;
  
  const assetClass = propertyAssetClass.toLowerCase();
  
  if (['residential', 'multifamily', 'mobile_home_park'].includes(assetClass)) {
    return 'residential';
  }
  
  if (['commercial', 'retail', 'office', 'industrial', 'hospitality', 'self_storage'].includes(assetClass)) {
    return 'commercial';
  }
  
  if (assetClass === 'land') {
    return 'land';
  }
  
  // other, infrastructure, civic → unknown
  return 'unknown';
}

/**
 * Update one batch
 */
async function updateBatch() {
  const client = await pool.connect();
  
  try {
    // Use CTE to get batch of parcels to update
    const updateQuery = `
      WITH to_update AS (
        SELECT 
          pft.parcel_id, 
          CASE
            WHEN p.asset_class IN ('residential', 'multifamily', 'mobile_home_park') THEN 'residential'
            WHEN p.asset_class IN ('commercial', 'retail', 'office', 'industrial', 'hospitality', 'self_storage') THEN 'commercial'
            WHEN p.asset_class = 'land' THEN 'land'
            ELSE 'unknown'
          END as new_class
        FROM parcel_features_travis pft
        INNER JOIN properties p ON p."parcelId" = pft.parcel_id
        WHERE p.asset_class IS NOT NULL 
          AND p.asset_class NOT IN ('unknown', 'land')
          AND (pft.asset_class IN ('land', 'unknown', 'test') OR pft.asset_class IS NULL)
        LIMIT $1
      )
      UPDATE parcel_features_travis pft
      SET asset_class = to_update.new_class,
          updated_at = NOW()
      FROM to_update
      WHERE pft.parcel_id = to_update.parcel_id
      RETURNING pft.parcel_id
    `;
    
    const result = await client.query(updateQuery, [BATCH_SIZE]);
    return result.rowCount;
    
  } finally {
    client.release();
  }
}

/**
 * Get current distribution
 */
async function getDistribution() {
  const client = await pool.connect();
  
  try {
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
  } finally {
    client.release();
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('='.repeat(80));
  console.log('BATCH UPDATE: asset_class');
  console.log('='.repeat(80));
  console.log(`Batch Size: ${BATCH_SIZE}`);
  console.log('');
  
  // Show initial distribution
  console.log('--- Initial Distribution ---');
  const initialDist = await getDistribution();
  initialDist.forEach(row => {
    console.log(`  ${row.asset_class || 'NULL'}: ${row.count.toLocaleString()} (${row.pct}%)`);
  });
  console.log('');
  
  // Process batches
  let totalUpdated = 0;
  let batchNum = 0;
  
  console.log('--- Processing Batches ---');
  
  while (true) {
    batchNum++;
    
    try {
      const rowCount = await updateBatch();
      
      if (rowCount === 0) {
        console.log(`  Batch ${batchNum}: No more rows to update. Stopping.`);
        break;
      }
      
      totalUpdated += rowCount;
      console.log(`  Batch ${batchNum}: Updated ${rowCount.toLocaleString()} rows (Total: ${totalUpdated.toLocaleString()})`);
      
      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`  ❌ Error in batch ${batchNum}:`, error.message);
      throw error;
    }
  }
  
  console.log('');
  console.log(`Total updated: ${totalUpdated.toLocaleString()}`);
  console.log('');
  
  // Show final distribution
  console.log('--- Final Distribution ---');
  const finalDist = await getDistribution();
  finalDist.forEach(row => {
    console.log(`  ${row.asset_class || 'NULL'}: ${row.count.toLocaleString()} (${row.pct}%)`);
  });
  console.log('');
  
  console.log('✅ asset_class batch update complete');
}

main()
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
