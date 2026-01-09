/**
 * Phase 0 ETL Master Script
 * 
 * Runs batch updates for asset_class and owner_segment
 * 
 * Usage:
 *   node scripts/run-phase0-etl.js
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Run a script and wait for it to complete
 */
function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Running: ${scriptPath}`);
    console.log('='.repeat(80));
    
    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      cwd: join(__dirname, '..')
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Show final verification
 */
async function showVerification() {
  const pg = await import('pg');
  const dotenv = await import('dotenv');
  dotenv.default.config();
  
  const { Pool } = pg.default;
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  
  try {
    console.log('\n' + '='.repeat(80));
    console.log('FINAL VERIFICATION');
    console.log('='.repeat(80));
    
    // asset_class distribution
    console.log('\n--- asset_class Distribution ---');
    const assetClassResult = await pool.query(`
      SELECT 
        asset_class,
        COUNT(*) as count,
        ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct
      FROM parcel_features_travis
      GROUP BY asset_class
      ORDER BY count DESC
    `);
    assetClassResult.rows.forEach(row => {
      console.log(`  ${row.asset_class || 'NULL'}: ${row.count.toLocaleString()} (${row.pct}%)`);
    });
    
    // owner_segment distribution
    console.log('\n--- owner_segment Distribution ---');
    const ownerSegmentResult = await pool.query(`
      SELECT 
        owner_segment,
        COUNT(*) as count,
        ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct
      FROM parcel_features_travis
      GROUP BY owner_segment
      ORDER BY count DESC
    `);
    ownerSegmentResult.rows.forEach(row => {
      console.log(`  ${row.owner_segment || 'NULL'}: ${row.count.toLocaleString()} (${row.pct}%)`);
    });
    
    // Data quality check
    console.log('\n--- Data Quality Check ---');
    const qualityResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN asset_class IS NOT NULL AND asset_class != 'unknown' THEN 1 END) as has_asset_class,
        COUNT(CASE WHEN owner_segment IS NOT NULL AND owner_segment != 'unknown' THEN 1 END) as has_owner_segment,
        COUNT(CASE WHEN asset_class IS NOT NULL AND asset_class != 'unknown' 
                   AND owner_segment IS NOT NULL AND owner_segment != 'unknown' THEN 1 END) as fully_populated
      FROM parcel_features_travis
    `);
    const quality = qualityResult.rows[0];
    console.log(`  Total parcels: ${quality.total.toLocaleString()}`);
    console.log(`  Has asset_class: ${quality.has_asset_class.toLocaleString()} (${(100 * quality.has_asset_class / quality.total).toFixed(2)}%)`);
    console.log(`  Has owner_segment: ${quality.has_owner_segment.toLocaleString()} (${(100 * quality.has_owner_segment / quality.total).toFixed(2)}%)`);
    console.log(`  Fully populated: ${quality.fully_populated.toLocaleString()} (${(100 * quality.fully_populated / quality.total).toFixed(2)}%)`);
    
  } finally {
    await pool.end();
  }
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();
  
  console.log('='.repeat(80));
  console.log('PHASE 0 ETL - Batch Updates');
  console.log('='.repeat(80));
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('');
  
  try {
    // Step 1: Update asset_class
    await runScript(join(__dirname, 'batch-update-asset-class.js'));
    
    // Step 2: Update owner_segment
    await runScript(join(__dirname, 'batch-update-owner-segment.js'));
    
    // Step 3: Show final verification
    await showVerification();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n' + '='.repeat(80));
    console.log('ETL COMPLETE');
    console.log('='.repeat(80));
    console.log(`Duration: ${duration} seconds`);
    console.log(`Completed: ${new Date().toISOString()}`);
    console.log('');
    
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('ETL FAILED');
    console.error('='.repeat(80));
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
