/**
 * Populate owner_segment field in parcel_features_travis
 * 
 * Calculates owner_segment based on:
 * - institutional: 50+ properties OR REIT/institutional name patterns
 * - absentee: mail_state != 'TX'
 * - tired_landlord: absentee + hold_years >= 15 + building age >= 30
 * - small_operator: LLC/Corp entity type with 1-10 properties
 * - mom_pop: Person entity type with 1-3 properties, held 10+ years
 * - local_owner: In-state owner, same city/zip as property
 * 
 * Usage:
 *   node scripts/populate-owner-segment.js
 *   node scripts/populate-owner-segment.js --dry-run
 *   node scripts/populate-owner-segment.js --batch-size=10000
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
 * Check if owner name matches institutional patterns
 */
function isInstitutionalName(ownerName) {
  if (!ownerName) return false;
  
  const name = ownerName.toUpperCase();
  const patterns = [
    /REIT/,
    /REAL ESTATE INVESTMENT TRUST/,
    /INSTITUTIONAL/,
    /INVESTMENT TRUST/,
    /PENSION/,
    /RETIREMENT/,
    /ENDOWMENT/,
    /FOUNDATION/,
    /HOLDINGS LLC/,
    /CAPITAL LLC/,
    /PROPERTIES LLC/,
    /MANAGEMENT LLC/,
    /INVESTMENTS LLC/,
    /FUND/,
    /PARTNERS LP/,
    /LIMITED PARTNERSHIP/
  ];
  
  return patterns.some(pattern => pattern.test(name));
}

/**
 * Determine owner segment from property data
 */
function determineOwnerSegment(row) {
  const portfolioCount = parseInt(row.owner_portfolio_count_travis) || 0;
  const entityType = (row.owner_entity_type || '').toLowerCase();
  const mailState = (row.mail_state || '').toUpperCase();
  const ownerName = row.owner_name_raw || '';
  const situsCity = (row.situs_city || '').toLowerCase();
  const mailCity = (row.mail_city || '').toLowerCase();
  const situsZip = row.situs_zip || '';
  const mailZip = row.mail_zip || '';
  
  // Institutional: 50+ properties OR institutional name pattern
  if (portfolioCount >= 50 || isInstitutionalName(ownerName)) {
    return 'institutional';
  }
  
  // Absentee: Out of state
  const isAbsentee = mailState && mailState !== 'TX' && mailState.length === 2;
  
  // Tired landlord: Absentee + long hold + old building
  // Note: We don't have hold_years or building age in parcel_features_travis
  // This would require joins to other tables or enrichment
  // For now, we'll use absentee + high portfolio count as proxy
  if (isAbsentee && portfolioCount >= 5) {
    // Could be tired landlord, but we'll classify as absentee for now
    // TODO: Add hold_years and building age to determine tired_landlord
  }
  
  // Absentee: Out of state owner
  if (isAbsentee) {
    return 'absentee';
  }
  
  // Small operator: LLC/Corp with 1-10 properties
  if ((entityType === 'llc' || entityType === 'corp' || entityType === 'inc' || entityType === 'lp') && 
      portfolioCount >= 1 && portfolioCount <= 10) {
    return 'small_operator';
  }
  
  // Mom & pop: Person entity type with 1-3 properties
  if (entityType === 'person' && portfolioCount >= 1 && portfolioCount <= 3) {
    return 'mom_pop';
  }
  
  // Local owner: In-state, same city/zip
  if (mailState === 'TX') {
    const sameCity = situsCity && mailCity && situsCity === mailCity;
    const sameZip = situsZip && mailZip && situsZip === mailZip;
    
    if (sameCity || sameZip) {
      return 'local_owner';
    }
  }
  
  // Default: local_owner if in-state, otherwise unknown
  if (mailState === 'TX') {
    return 'local_owner';
  }
  
  return 'unknown';
}

/**
 * Get distribution of owner_segment before update
 */
async function getDistribution(client) {
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
}

/**
 * Process batch of parcels
 */
async function processBatch(client, offset, limit) {
  const result = await client.query(`
    SELECT 
      parcel_id,
      owner_portfolio_count_travis,
      owner_entity_type,
      owner_name_raw,
      mail_state,
      mail_city,
      situs_city,
      situs_zip,
      mail_zip,
      owner_segment
    FROM parcel_features_travis
    ORDER BY parcel_id
    LIMIT $1 OFFSET $2
  `, [limit, offset]);
  
  const updates = [];
  
  for (const row of result.rows) {
    // Skip if already classified (unless we want to reclassify)
    if (row.owner_segment && row.owner_segment !== 'unknown') {
      continue;
    }
    
    const ownerSegment = determineOwnerSegment(row);
    
    if (ownerSegment !== row.owner_segment) {
      updates.push({
        parcel_id: row.parcel_id,
        owner_segment: ownerSegment
      });
    }
  }
  
  if (updates.length > 0 && !DRY_RUN) {
    // Batch update
    const updatePromises = updates.map(update => 
      client.query(
        'UPDATE parcel_features_travis SET owner_segment = $1 WHERE parcel_id = $2',
        [update.owner_segment, update.parcel_id]
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
    console.log('POPULATE OWNER_SEGMENT');
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
      console.log(`  ${row.owner_segment || 'NULL'}: ${row.count} (${row.pct}%)`);
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
        console.log(`  ${row.owner_segment || 'NULL'}: ${row.count} (${row.pct}%)`);
      });
      console.log('');
    }
    
    if (DRY_RUN) {
      console.log('⚠️  DRY RUN - No changes made');
    } else {
      console.log('✅ Owner segment population complete');
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
