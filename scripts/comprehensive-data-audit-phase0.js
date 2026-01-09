/**
 * Comprehensive Data Audit - Phase 0
 * 
 * Audits parcel_features_travis and related tables to understand:
 * - What data exists
 * - What's missing
 * - How to properly populate asset_class and owner_segment
 * 
 * Usage:
 *   node scripts/comprehensive-data-audit-phase0.js > audit-output.txt 2>&1
 */

import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const OUTPUT_FILE = 'DATA_AUDIT_REPORT.md';
let reportContent = '';

function addSection(title, level = 1) {
  const prefix = '#'.repeat(level);
  reportContent += `\n${prefix} ${title}\n\n`;
}

function addText(text) {
  reportContent += `${text}\n`;
}

function addCodeBlock(code, language = 'sql') {
  reportContent += `\`\`\`${language}\n${code}\n\`\`\`\n\n`;
}

function addTable(headers, rows) {
  if (rows.length === 0) {
    reportContent += '*No data*\n\n';
    return;
  }
  
  // Markdown table
  reportContent += '| ' + headers.join(' | ') + ' |\n';
  reportContent += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
  
  for (const row of rows) {
    const values = headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    });
    reportContent += '| ' + values.join(' | ') + ' |\n';
  }
  reportContent += '\n';
}

/**
 * Task 1: Audit parcel_features_travis columns
 */
async function auditParcelFeaturesTravis(client) {
  addSection('1. parcel_features_travis Table Audit', 1);
  
  // Get total count
  const totalResult = await client.query('SELECT COUNT(*) as count FROM parcel_features_travis');
  const totalCount = parseInt(totalResult.rows[0].count);
  addText(`**Total Rows:** ${totalCount.toLocaleString()}\n`);
  
  // Get column list
  const columnsResult = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'parcel_features_travis'
    ORDER BY ordinal_position
  `);
  
  addSection('1.1 Column Structure', 2);
  addTable(['Column Name', 'Data Type', 'Nullable'], columnsResult.rows);
  
  // Audit critical columns
  const criticalColumns = [
    'land_use_code',
    'land_use_desc',
    'asset_class',
    'owner_segment',
    'owner_entity_type',
    'owner_portfolio_count_travis',
    'building_sqft',
    'improvement_value',
    'market_value',
    'year_built',
    'tax_delinquent_flag',
    'mail_state',
    'last_sale_date',
    'geom_centroid'
  ];
  
  for (const col of criticalColumns) {
    addSection(`1.2 ${col}`, 2);
    
    // Check null vs non-null
    const nullCheck = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(${col}) as non_null,
        COUNT(*) - COUNT(${col}) as null_count,
        ROUND(100.0 * COUNT(${col}) / COUNT(*), 2) as pct_populated
      FROM parcel_features_travis
    `);
    
    const stats = nullCheck.rows[0];
    addText(`**Population:** ${stats.non_null.toLocaleString()} / ${stats.total.toLocaleString()} (${stats.pct_populated}%)\n`);
    
    if (parseInt(stats.non_null) === 0) {
      addText(`⚠️ **WARNING:** Column is 100% NULL\n`);
      continue;
    }
    
    // Get distinct values (top 20)
    try {
      const distinctResult = await client.query(`
        SELECT ${col}, COUNT(*) as count
        FROM parcel_features_travis
        WHERE ${col} IS NOT NULL
        GROUP BY ${col}
        ORDER BY count DESC
        LIMIT 20
      `);
      
      if (distinctResult.rows.length > 0) {
        addText('**Top Values:**\n');
        addTable([col, 'Count'], distinctResult.rows);
      }
    } catch (error) {
      addText(`Error querying distinct values: ${error.message}\n`);
    }
    
    // For numeric columns, get stats
    if (['building_sqft', 'improvement_value', 'market_value', 'year_built', 'owner_portfolio_count_travis'].includes(col)) {
      try {
        const statsResult = await client.query(`
          SELECT 
            MIN(${col}) as min_val,
            MAX(${col}) as max_val,
            AVG(${col})::numeric(15,2) as avg_val,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${col}) as median_val
          FROM parcel_features_travis
          WHERE ${col} IS NOT NULL
        `);
        
        if (statsResult.rows[0].min_val !== null) {
          addText('**Statistics:**\n');
          addText(`- Min: ${statsResult.rows[0].min_val}`);
          addText(`- Max: ${statsResult.rows[0].max_val}`);
          addText(`- Avg: ${statsResult.rows[0].avg_val}`);
          addText(`- Median: ${statsResult.rows[0].median_val}\n`);
        }
      } catch (error) {
        // Skip stats if error
      }
    }
  }
  
  // Check geom_centroid specifically
  addSection('1.3 Geometry Check', 2);
  const geomCheck = await client.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(geom_centroid) as has_geom,
      COUNT(*) - COUNT(geom_centroid) as no_geom,
      ROUND(100.0 * COUNT(geom_centroid) / COUNT(*), 2) as pct_has_geom
    FROM parcel_features_travis
  `);
  addTable(['Total', 'Has Geometry', 'No Geometry', '% Has Geometry'], geomCheck.rows);
}

/**
 * Task 2: Audit related tables
 */
async function auditRelatedTables(client) {
  addSection('2. Related Tables Audit', 1);
  
  // parcels_travis_enrichment
  addSection('2.1 parcels_travis_enrichment', 2);
  
  try {
    const countResult = await client.query('SELECT COUNT(*) as count FROM parcels_travis_enrichment');
    addText(`**Total Rows:** ${countResult.rows[0].count.toLocaleString()}\n`);
    
    const colsResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'parcels_travis_enrichment'
      ORDER BY ordinal_position
    `);
    addText('**Columns:**\n');
    addTable(['Column Name', 'Data Type'], colsResult.rows);
    
    // Sample rows
    const sampleResult = await client.query(`
      SELECT * FROM parcels_travis_enrichment LIMIT 5
    `);
    addText('**Sample Rows:**\n');
    if (sampleResult.rows.length > 0) {
      const sampleKeys = Object.keys(sampleResult.rows[0]);
      addTable(sampleKeys, sampleResult.rows.map(r => {
        const row = {};
        for (const key of sampleKeys) {
          const val = r[key];
          if (val && typeof val === 'object') {
            row[key] = JSON.stringify(val).substring(0, 100);
          } else {
            row[key] = val;
          }
        }
        return row;
      }));
    }
    
    // Check raw JSONB keys
    const rawCheck = await client.query(`
      SELECT DISTINCT jsonb_object_keys(raw) as key
      FROM parcels_travis_enrichment
      WHERE raw IS NOT NULL
      LIMIT 50
    `);
    if (rawCheck.rows.length > 0) {
      addText('**Keys in `raw` JSONB column:**\n');
      rawCheck.rows.forEach(row => {
        addText(`- ${row.key}`);
      });
      addText('');
    }
    
    // Sample raw values
    const rawSample = await client.query(`
      SELECT parcel_id, raw
      FROM parcels_travis_enrichment
      WHERE raw IS NOT NULL
      LIMIT 3
    `);
    if (rawSample.rows.length > 0) {
      addText('**Sample `raw` JSONB values:**\n');
      rawSample.rows.forEach(row => {
        addCodeBlock(JSON.stringify(row.raw, null, 2), 'json');
      });
    }
  } catch (error) {
    addText(`⚠️ Error accessing parcels_travis_enrichment: ${error.message}\n`);
  }
  
  // properties table
  addSection('2.2 properties Table', 2);
  
  try {
    const countResult = await client.query('SELECT COUNT(*) as count FROM properties');
    addText(`**Total Rows:** ${countResult.rows[0].count.toLocaleString()}\n`);
    
    // Check if properties can join to parcel_features_travis
    const joinCheck = await client.query(`
      SELECT COUNT(DISTINCT p."parcelId") as matched_count
      FROM properties p
      INNER JOIN parcel_features_travis pft ON p."parcelId" = pft.parcel_id
    `);
    addText(`**Matched to parcel_features_travis:** ${joinCheck.rows[0].matched_count.toLocaleString()}\n`);
    
    // Check asset_class and propertyType in properties
    const assetClassCheck = await client.query(`
      SELECT 
        asset_class,
        COUNT(*) as count
      FROM properties
      WHERE asset_class IS NOT NULL
      GROUP BY asset_class
      ORDER BY count DESC
      LIMIT 20
    `);
    if (assetClassCheck.rows.length > 0) {
      addText('**asset_class in properties table:**\n');
      addTable(['asset_class', 'Count'], assetClassCheck.rows);
    }
    
    const propertyTypeCheck = await client.query(`
      SELECT 
        "propertyType",
        COUNT(*) as count
      FROM properties
      WHERE "propertyType" IS NOT NULL
      GROUP BY "propertyType"
      ORDER BY count DESC
    `);
    if (propertyTypeCheck.rows.length > 0) {
      addText('**propertyType in properties table:**\n');
      addTable(['propertyType', 'Count'], propertyTypeCheck.rows);
    }
    
    // Sample rows that match parcel_features_travis
    const sampleResult = await client.query(`
      SELECT 
        p."parcelId",
        p."propertyType",
        p.asset_class,
        p.acres,
        p."mktValue",
        pft.asset_class as pft_asset_class,
        pft.land_use_code
      FROM properties p
      INNER JOIN parcel_features_travis pft ON p."parcelId" = pft.parcel_id
      LIMIT 5
    `);
    if (sampleResult.rows.length > 0) {
      addText('**Sample matched rows:**\n');
      addTable(Object.keys(sampleResult.rows[0]), sampleResult.rows);
    }
  } catch (error) {
    addText(`⚠️ Error accessing properties: ${error.message}\n`);
  }
  
  // owners and owner_features_tx
  addSection('2.3 owners and owner_features_tx Tables', 2);
  
  try {
    const ownersCount = await client.query('SELECT COUNT(*) as count FROM owners');
    addText(`**Total owners:** ${ownersCount.rows[0].count.toLocaleString()}\n`);
    
    const ownerFeaturesCount = await client.query('SELECT COUNT(*) as count FROM owner_features_tx');
    addText(`**Total owner_features_tx:** ${ownerFeaturesCount.rows[0].count.toLocaleString()}\n`);
    
    // Check if we can join owners to parcel_features_travis
    const ownerJoinCheck = await client.query(`
      SELECT COUNT(DISTINCT pft.parcel_id) as matched_count
      FROM parcel_features_travis pft
      INNER JOIN owner_properties op ON op.parcel_id = pft.parcel_id
      INNER JOIN owners o ON o.id = op."ownerId"
    `);
    addText(`**Parcels with owner data:** ${ownerJoinCheck.rows[0].matched_count.toLocaleString()}\n`);
    
    // Sample owner_features_tx
    const ownerFeaturesSample = await client.query(`
      SELECT 
        "parcelCountTx",
        "totalAssessedValueTx",
        "outOfState",
        "avgHoldYears"
      FROM owner_features_tx
      LIMIT 5
    `);
    if (ownerFeaturesSample.rows.length > 0) {
      addText('**Sample owner_features_tx:**\n');
      addTable(Object.keys(ownerFeaturesSample.rows[0]), ownerFeaturesSample.rows);
    }
  } catch (error) {
    addText(`⚠️ Error accessing owners/owner_features_tx: ${error.message}\n`);
  }
}

/**
 * Task 3: Find usable data sources
 */
async function findUsableDataSources(client) {
  addSection('3. Usable Data Sources Analysis', 1);
  
  // asset_class sources
  addSection('3.1 asset_class Data Sources', 2);
  
  // Check land_use_code values
  const landUseCodeCheck = await client.query(`
    SELECT 
      land_use_code,
      COUNT(*) as count
    FROM parcel_features_travis
    WHERE land_use_code IS NOT NULL
    GROUP BY land_use_code
    ORDER BY count DESC
    LIMIT 30
  `);
  
  if (landUseCodeCheck.rows.length > 0) {
    addText('**land_use_code values available:**\n');
    addTable(['land_use_code', 'Count'], landUseCodeCheck.rows);
  } else {
    addText('⚠️ **land_use_code is empty**\n');
  }
  
  // Check land_use_desc
  const landUseDescCheck = await client.query(`
    SELECT 
      land_use_desc,
      COUNT(*) as count
    FROM parcel_features_travis
    WHERE land_use_desc IS NOT NULL
    GROUP BY land_use_desc
    ORDER BY count DESC
    LIMIT 30
  `);
  
  if (landUseDescCheck.rows.length > 0) {
    addText('**land_use_desc values available:**\n');
    addTable(['land_use_desc', 'Count'], landUseDescCheck.rows);
  } else {
    addText('⚠️ **land_use_desc is empty**\n');
  }
  
  // Check if we can derive from building_sqft/improvement_value
  const buildingCheck = await client.query(`
    SELECT 
      CASE 
        WHEN building_sqft IS NULL OR building_sqft = 0 THEN 'no_building'
        WHEN building_sqft > 0 THEN 'has_building'
        ELSE 'unknown'
      END as building_status,
      CASE 
        WHEN improvement_value IS NULL OR improvement_value = 0 THEN 'no_improvements'
        WHEN improvement_value > 0 THEN 'has_improvements'
        ELSE 'unknown'
      END as improvement_status,
      COUNT(*) as count
    FROM parcel_features_travis
    GROUP BY 1, 2
    ORDER BY count DESC
  `);
  addText('**Building/Improvement Status:**\n');
  addTable(['Building Status', 'Improvement Status', 'Count'], buildingCheck.rows);
  
  // Check properties.asset_class as source
  const propertiesAssetClassCheck = await client.query(`
    SELECT 
      p.asset_class,
      COUNT(*) as count
    FROM properties p
    INNER JOIN parcel_features_travis pft ON p."parcelId" = pft.parcel_id
    WHERE p.asset_class IS NOT NULL
    GROUP BY p.asset_class
    ORDER BY count DESC
  `);
  if (propertiesAssetClassCheck.rows.length > 0) {
    addText('**asset_class from properties table (matched):**\n');
    addTable(['asset_class', 'Count'], propertiesAssetClassCheck.rows);
  }
  
  // owner_segment sources
  addSection('3.2 owner_segment Data Sources', 2);
  
  // Check owner_entity_type distribution
  const entityTypeCheck = await client.query(`
    SELECT 
      owner_entity_type,
      COUNT(*) as count
    FROM parcel_features_travis
    WHERE owner_entity_type IS NOT NULL
    GROUP BY owner_entity_type
    ORDER BY count DESC
  `);
  if (entityTypeCheck.rows.length > 0) {
    addText('**owner_entity_type values:**\n');
    addTable(['owner_entity_type', 'Count'], entityTypeCheck.rows);
  }
  
  // Check owner_portfolio_count_travis distribution
  const portfolioCountCheck = await client.query(`
    SELECT 
      CASE 
        WHEN owner_portfolio_count_travis IS NULL THEN 'NULL'
        WHEN owner_portfolio_count_travis = 0 THEN '0'
        WHEN owner_portfolio_count_travis BETWEEN 1 AND 3 THEN '1-3'
        WHEN owner_portfolio_count_travis BETWEEN 4 AND 10 THEN '4-10'
        WHEN owner_portfolio_count_travis BETWEEN 11 AND 49 THEN '11-49'
        WHEN owner_portfolio_count_travis >= 50 THEN '50+'
        ELSE 'other'
      END as portfolio_bucket,
      COUNT(*) as count
    FROM parcel_features_travis
    GROUP BY 1
    ORDER BY MIN(COALESCE(owner_portfolio_count_travis, -1))
  `);
  addText('**owner_portfolio_count_travis distribution:**\n');
  addTable(['Portfolio Bucket', 'Count'], portfolioCountCheck.rows);
  
  // Check mail_state for absentee detection
  const mailStateCheck = await client.query(`
    SELECT 
      mail_state,
      COUNT(*) as count
    FROM parcel_features_travis
    WHERE mail_state IS NOT NULL
    GROUP BY mail_state
    ORDER BY count DESC
    LIMIT 20
  `);
  if (mailStateCheck.rows.length > 0) {
    addText('**mail_state values (for absentee detection):**\n');
    addTable(['mail_state', 'Count'], mailStateCheck.rows);
  }
  
  // Check owner name patterns
  const ownerNamePatternCheck = await client.query(`
    SELECT 
      CASE 
        WHEN owner_name_raw ILIKE '%LLC%' THEN 'LLC'
        WHEN owner_name_raw ILIKE '%INC%' OR owner_name_raw ILIKE '%INCORPORATED%' THEN 'INC'
        WHEN owner_name_raw ILIKE '%LP%' OR owner_name_raw ILIKE '%LIMITED PARTNERSHIP%' THEN 'LP'
        WHEN owner_name_raw ILIKE '%TRUST%' THEN 'TRUST'
        WHEN owner_name_raw ILIKE '%REIT%' THEN 'REIT'
        WHEN owner_name_raw ILIKE '%HOLDINGS%' THEN 'HOLDINGS'
        ELSE 'OTHER'
      END as name_pattern,
      COUNT(*) as count
    FROM parcel_features_travis
    WHERE owner_name_raw IS NOT NULL
    GROUP BY 1
    ORDER BY count DESC
  `);
  addText('**Owner name patterns:**\n');
  addTable(['Pattern', 'Count'], ownerNamePatternCheck.rows);
}

/**
 * Task 4: Generate recommendations
 */
async function generateRecommendations(client) {
  addSection('4. Recommendations', 1);
  
  // Check what we can actually populate
  addSection('4.1 asset_class Population Strategy', 2);
  
  // Test: Can we use properties.asset_class?
  const propertiesAssetClassAvailable = await client.query(`
    SELECT COUNT(*) as count
    FROM parcel_features_travis pft
    INNER JOIN properties p ON p."parcelId" = pft.parcel_id
    WHERE p.asset_class IS NOT NULL AND p.asset_class != 'unknown'
  `);
  
  const propertiesAssetClassCount = parseInt(propertiesAssetClassAvailable.rows[0].count);
  addText(`**Properties table has asset_class for:** ${propertiesAssetClassCount.toLocaleString()} parcels\n`);
  
  if (propertiesAssetClassCount > 0) {
    addText('✅ **RECOMMENDATION:** Use properties.asset_class as primary source\n');
  }
  
  // Test: Can we use building_sqft/improvement_value?
  const canDeriveFromBuilding = await client.query(`
    SELECT COUNT(*) as count
    FROM parcel_features_travis
    WHERE (building_sqft IS NULL OR building_sqft = 0) 
      AND (improvement_value IS NULL OR improvement_value = 0)
  `);
  const landCount = parseInt(canDeriveFromBuilding.rows[0].count);
  addText(`**Can derive 'land' from building/improvements:** ${landCount.toLocaleString()} parcels\n`);
  
  if (landCount > 0) {
    addText('✅ **RECOMMENDATION:** Use building_sqft/improvement_value to identify land\n');
  }
  
  addSection('4.2 owner_segment Population Strategy', 2);
  
  // Test: Can we use owner_portfolio_count_travis?
  const portfolioCountAvailable = await client.query(`
    SELECT COUNT(*) as count
    FROM parcel_features_travis
    WHERE owner_portfolio_count_travis IS NOT NULL
  `);
  const portfolioCountPopulated = parseInt(portfolioCountAvailable.rows[0].count);
  addText(`**owner_portfolio_count_travis populated:** ${portfolioCountPopulated.toLocaleString()} parcels\n`);
  
  if (portfolioCountPopulated > 0) {
    addText('✅ **RECOMMENDATION:** Use owner_portfolio_count_travis for institutional/small_operator\n');
  }
  
  // Test: Can we use mail_state for absentee?
  const mailStateAvailable = await client.query(`
    SELECT COUNT(*) as count
    FROM parcel_features_travis
    WHERE mail_state IS NOT NULL AND mail_state != 'TX'
  `);
  const absenteeCount = parseInt(mailStateAvailable.rows[0].count);
  addText(`**Can identify absentee from mail_state:** ${absenteeCount.toLocaleString()} parcels\n`);
  
  if (absenteeCount > 0) {
    addText('✅ **RECOMMENDATION:** Use mail_state != \'TX\' for absentee detection\n');
  }
  
  // Test: Can we use owner_entity_type?
  const entityTypeAvailable = await client.query(`
    SELECT COUNT(*) as count
    FROM parcel_features_travis
    WHERE owner_entity_type IS NOT NULL
  `);
  const entityTypePopulated = parseInt(entityTypeAvailable.rows[0].count);
  addText(`**owner_entity_type populated:** ${entityTypePopulated.toLocaleString()} parcels\n`);
  
  if (entityTypePopulated > 0) {
    addText('✅ **RECOMMENDATION:** Use owner_entity_type for mom_pop vs small_operator\n');
  }
}

/**
 * Main execution
 */
async function main() {
  const client = await pool.connect();
  
  try {
    reportContent = '# Comprehensive Data Audit Report - Phase 0\n\n';
    reportContent += `**Generated:** ${new Date().toISOString()}\n`;
    reportContent += `**Purpose:** Understand actual data in parcel_features_travis and related tables\n\n`;
    
    addSection('Executive Summary', 1);
    addText('This audit examines the actual data distribution in `parcel_features_travis` and related tables to identify usable data sources for populating `asset_class` and `owner_segment`.\n');
    
    // Run audits
    await auditParcelFeaturesTravis(client);
    await auditRelatedTables(client);
    await findUsableDataSources(client);
    await generateRecommendations(client);
    
    // Write report
    fs.writeFileSync(OUTPUT_FILE, reportContent);
    console.log(`✅ Audit report written to ${OUTPUT_FILE}`);
    
    // Also print summary to console
    console.log('\n' + '='.repeat(80));
    console.log('AUDIT COMPLETE');
    console.log('='.repeat(80));
    console.log(`Report saved to: ${OUTPUT_FILE}`);
    
  } catch (error) {
    console.error('❌ Audit failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
