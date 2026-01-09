/**
 * Batch Update owner_segment (v2)
 * 
 * Updates owner_segment in parcel_features_travis based on:
 * - Owner name patterns (institutional)
 * - mail_state (absentee)
 * - owner_entity_type (small_operator, mom_pop, trust_estate)
 * 
 * Processes in batches of 5000 to avoid Neon timeout
 * Only updates rows where owner_segment = 'unknown'
 * Returns NULL for truly unknown cases to avoid infinite loops
 * 
 * Usage:
 *   node scripts/batch-update-owner-segment-v2.js
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
 * Sync mail_state from enrichment table (run once before batch updates)
 */
async function syncMailState() {
  const client = await pool.connect();
  
  try {
    console.log('  Syncing mail_state from parcels_travis_enrichment...');
    
    const syncQuery = `
      UPDATE parcel_features_travis pft
      SET mail_state = pte.raw->>'MAIL_STAT',
          updated_at = NOW()
      FROM parcels_travis_enrichment pte
      WHERE pte.parcel_id = pft.parcel_id
        AND pte.raw->>'MAIL_STAT' IS NOT NULL
        AND pte.raw->>'MAIL_STAT' != ''
        AND pft.mail_state IS NULL
    `;
    
    const result = await client.query(syncQuery);
    console.log(`  ✅ Synced mail_state for ${result.rowCount.toLocaleString()} parcels`);
    return result.rowCount;
    
  } finally {
    client.release();
  }
}

/**
 * Update one batch
 */
async function updateBatch() {
  const client = await pool.connect();
  
  try {
    // Use CTE to calculate new_segment for batch
    // Returns NULL for truly unknown cases so they don't get re-processed
    const updateQuery = `
      WITH to_update AS (
        SELECT parcel_id,
          CASE
            WHEN owner_name_raw ILIKE '%REIT%' OR owner_name_raw ILIKE '%FUND%' 
              OR owner_name_raw ILIKE '%CAPITAL%' OR owner_name_raw ILIKE '%INVESTORS%'
              OR owner_name_raw ILIKE '%HOLDINGS%' THEN 'institutional'
            WHEN mail_state IS NOT NULL AND mail_state != 'TX' THEN 'absentee'
            WHEN owner_entity_type IN ('llc', 'corp') THEN 'small_operator'
            WHEN owner_entity_type = 'trust_estate' THEN 'trust_estate'
            WHEN owner_entity_type = 'person' THEN 'mom_pop'
            ELSE NULL
          END as new_segment
        FROM parcel_features_travis
        WHERE owner_segment = 'unknown'
        LIMIT $1
      )
      UPDATE parcel_features_travis pft
      SET owner_segment = to_update.new_segment,
          updated_at = NOW()
      FROM to_update
      WHERE pft.parcel_id = to_update.parcel_id
        AND to_update.new_segment IS NOT NULL
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
        owner_segment,
        COUNT(*) as count,
        ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct
      FROM parcel_features_travis
      GROUP BY owner_segment
      ORDER BY count DESC
    `);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get count of remaining 'unknown' rows
 */
async function getUnknownCount() {
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT COUNT(*) as count
      FROM parcel_features_travis
      WHERE owner_segment = 'unknown'
    `);
    return parseInt(result.rows[0].count);
  } finally {
    client.release();
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('='.repeat(80));
  console.log('BATCH UPDATE: owner_segment (v2)');
  console.log('='.repeat(80));
  console.log(`Batch Size: ${BATCH_SIZE}`);
  console.log('');
  
  // Sync mail_state first
  await syncMailState();
  console.log('');
  
  // Show initial distribution
  console.log('--- Initial Distribution ---');
  const initialDist = await getDistribution();
  initialDist.forEach(row => {
    console.log(`  ${row.owner_segment || 'NULL'}: ${row.count.toLocaleString()} (${row.pct}%)`);
  });
  
  const initialUnknown = await getUnknownCount();
  console.log(`\n  Remaining 'unknown': ${initialUnknown.toLocaleString()}`);
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
      const remainingUnknown = await getUnknownCount();
      console.log(`  Batch ${batchNum}: Updated ${rowCount.toLocaleString()} rows (Total: ${totalUpdated.toLocaleString()}, Remaining unknown: ${remainingUnknown.toLocaleString()})`);
      
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
    console.log(`  ${row.owner_segment || 'NULL'}: ${row.count.toLocaleString()} (${row.pct}%)`);
  });
  
  const finalUnknown = await getUnknownCount();
  console.log(`\n  Remaining 'unknown': ${finalUnknown.toLocaleString()}`);
  console.log('');
  
  console.log('✅ owner_segment batch update complete');
}

main()
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
