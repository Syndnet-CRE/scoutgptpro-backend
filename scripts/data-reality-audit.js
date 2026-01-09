import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function audit() {
  const client = await pool.connect();
  
  try {
    console.log('='.repeat(80));
    console.log('PARCEL_FEATURES_TRAVIS DATA REALITY AUDIT');
    console.log('='.repeat(80));
    console.log('');
    
    // 1. Total row count
    const totalCount = await client.query('SELECT COUNT(*) FROM parcel_features_travis');
    console.log('TOTAL PARCELS:', totalCount.rows[0].count);
    console.log('');
    
    // 2. Asset class distribution
    console.log('--- ASSET_CLASS VALUES ---');
    const assetClass = await client.query(`
      SELECT asset_class, COUNT(*) as count 
      FROM parcel_features_travis 
      GROUP BY asset_class 
      ORDER BY count DESC
    `);
    assetClass.rows.forEach(r => console.log(`  ${r.asset_class || 'NULL'}: ${r.count}`));
    console.log('');
    
    // 3. Owner entity type distribution
    console.log('--- OWNER_ENTITY_TYPE VALUES ---');
    const ownerType = await client.query(`
      SELECT owner_entity_type, COUNT(*) as count 
      FROM parcel_features_travis 
      GROUP BY owner_entity_type 
      ORDER BY count DESC
    `);
    ownerType.rows.forEach(r => console.log(`  ${r.owner_entity_type || 'NULL'}: ${r.count}`));
    console.log('');
    
    // 4. Owner segment distribution
    console.log('--- OWNER_SEGMENT VALUES ---');
    const ownerSeg = await client.query(`
      SELECT owner_segment, COUNT(*) as count 
      FROM parcel_features_travis 
      GROUP BY owner_segment 
      ORDER BY count DESC
    `);
    ownerSeg.rows.forEach(r => console.log(`  ${r.owner_segment || 'NULL'}: ${r.count}`));
    console.log('');
    
    // 5. Tax delinquent distribution
    console.log('--- TAX_DELINQUENT_FLAG VALUES ---');
    const taxDel = await client.query(`
      SELECT tax_delinquent_flag, COUNT(*) as count 
      FROM parcel_features_travis 
      GROUP BY tax_delinquent_flag 
      ORDER BY count DESC
    `);
    taxDel.rows.forEach(r => console.log(`  ${r.tax_delinquent_flag}: ${r.count}`));
    console.log('');
    
    // 6. Acreage distribution
    console.log('--- ACRES_CALC DISTRIBUTION ---');
    const acresStats = await client.query(`
      SELECT 
        MIN(acres_calc) as min,
        MAX(acres_calc) as max,
        AVG(acres_calc)::numeric(10,2) as avg,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY acres_calc) as median
      FROM parcel_features_travis
      WHERE acres_calc IS NOT NULL
    `);
    console.log(`  Min: ${acresStats.rows[0].min}`);
    console.log(`  Max: ${acresStats.rows[0].max}`);
    console.log(`  Avg: ${acresStats.rows[0].avg}`);
    console.log(`  Median: ${acresStats.rows[0].median}`);
    
    const acresBuckets = await client.query(`
      SELECT 
        CASE 
          WHEN acres_calc < 0.5 THEN 'Under 0.5 acres'
          WHEN acres_calc < 1 THEN '0.5-1 acres'
          WHEN acres_calc < 2 THEN '1-2 acres'
          WHEN acres_calc < 5 THEN '2-5 acres'
          WHEN acres_calc < 10 THEN '5-10 acres'
          WHEN acres_calc < 50 THEN '10-50 acres'
          ELSE '50+ acres'
        END as bucket,
        COUNT(*) as count
      FROM parcel_features_travis
      WHERE acres_calc IS NOT NULL
      GROUP BY 1
      ORDER BY MIN(acres_calc)
    `);
    console.log('  Buckets:');
    acresBuckets.rows.forEach(r => console.log(`    ${r.bucket}: ${r.count}`));
    console.log('');
    
    // 7. Market value distribution
    console.log('--- MARKET_VALUE DISTRIBUTION ---');
    const valueStats = await client.query(`
      SELECT 
        MIN(market_value) as min,
        MAX(market_value) as max,
        AVG(market_value)::numeric(12,0) as avg,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY market_value) as median
      FROM parcel_features_travis
      WHERE market_value IS NOT NULL AND market_value > 0
    `);
    console.log(`  Min: $${valueStats.rows[0].min}`);
    console.log(`  Max: $${valueStats.rows[0].max}`);
    console.log(`  Avg: $${valueStats.rows[0].avg}`);
    console.log(`  Median: $${valueStats.rows[0].median}`);
    console.log('');
    
    // 8. Land use codes
    console.log('--- LAND_USE_CODE VALUES (top 20) ---');
    const landUse = await client.query(`
      SELECT land_use_code, land_use_desc, COUNT(*) as count 
      FROM parcel_features_travis 
      WHERE land_use_code IS NOT NULL
      GROUP BY land_use_code, land_use_desc
      ORDER BY count DESC
      LIMIT 20
    `);
    landUse.rows.forEach(r => console.log(`  ${r.land_use_code}: ${r.land_use_desc || 'N/A'} (${r.count})`));
    console.log('');
    
    // 9. Zoning codes
    console.log('--- ZONING_CODE VALUES (top 20) ---');
    const zoning = await client.query(`
      SELECT zoning_code, COUNT(*) as count 
      FROM parcel_features_travis 
      WHERE zoning_code IS NOT NULL
      GROUP BY zoning_code
      ORDER BY count DESC
      LIMIT 20
    `);
    zoning.rows.forEach(r => console.log(`  ${r.zoning_code}: ${r.count}`));
    console.log('');
    
    // 10. Sample queries to verify data exists
    console.log('--- SAMPLE QUERY TESTS ---');
    
    // Test: Commercial land owned by LLC
    const test1 = await client.query(`
      SELECT COUNT(*) FROM parcel_features_travis 
      WHERE asset_class = 'commercial' 
      AND owner_entity_type = 'llc'
    `);
    console.log(`  Commercial + LLC: ${test1.rows[0].count}`);
    
    // Test: Commercial land owned by LLC AND tax delinquent
    const test2 = await client.query(`
      SELECT COUNT(*) FROM parcel_features_travis 
      WHERE asset_class = 'commercial' 
      AND owner_entity_type = 'llc'
      AND tax_delinquent_flag = true
    `);
    console.log(`  Commercial + LLC + Tax Delinquent: ${test2.rows[0].count}`);
    
    // Test: Land (asset_class)
    const test3 = await client.query(`
      SELECT COUNT(*) FROM parcel_features_travis 
      WHERE asset_class = 'land'
    `);
    console.log(`  Asset class = 'land': ${test3.rows[0].count}`);
    
    // Test: Land + LLC
    const test4 = await client.query(`
      SELECT COUNT(*) FROM parcel_features_travis 
      WHERE asset_class = 'land' 
      AND owner_entity_type = 'llc'
    `);
    console.log(`  Land + LLC: ${test4.rows[0].count}`);
    
    // Test: Land + LLC + Tax Delinquent
    const test5 = await client.query(`
      SELECT COUNT(*) FROM parcel_features_travis 
      WHERE asset_class = 'land' 
      AND owner_entity_type = 'llc'
      AND tax_delinquent_flag = true
    `);
    console.log(`  Land + LLC + Tax Delinquent: ${test5.rows[0].count}`);
    
    // Test: Tax delinquent total
    const test6 = await client.query(`
      SELECT COUNT(*) FROM parcel_features_travis 
      WHERE tax_delinquent_flag = true
    `);
    console.log(`  Tax Delinquent (any): ${test6.rows[0].count}`);
    
    // Test: 2-4 acres
    const test7 = await client.query(`
      SELECT COUNT(*) FROM parcel_features_travis 
      WHERE acres_calc >= 2 AND acres_calc <= 4
    `);
    console.log(`  2-4 acres: ${test7.rows[0].count}`);
    console.log('');
    
    // 11. Check for NULL values in key fields
    console.log('--- NULL VALUE COUNTS ---');
    const nullChecks = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE asset_class IS NULL) as asset_class_null,
        COUNT(*) FILTER (WHERE owner_entity_type IS NULL) as owner_entity_type_null,
        COUNT(*) FILTER (WHERE owner_segment IS NULL) as owner_segment_null,
        COUNT(*) FILTER (WHERE tax_delinquent_flag IS NULL) as tax_delinquent_null,
        COUNT(*) FILTER (WHERE acres_calc IS NULL) as acres_calc_null,
        COUNT(*) FILTER (WHERE market_value IS NULL) as market_value_null,
        COUNT(*) FILTER (WHERE geom_centroid IS NULL) as geom_centroid_null
      FROM parcel_features_travis
    `);
    const nc = nullChecks.rows[0];
    console.log(`  asset_class NULL: ${nc.asset_class_null}`);
    console.log(`  owner_entity_type NULL: ${nc.owner_entity_type_null}`);
    console.log(`  owner_segment NULL: ${nc.owner_segment_null}`);
    console.log(`  tax_delinquent_flag NULL: ${nc.tax_delinquent_null}`);
    console.log(`  acres_calc NULL: ${nc.acres_calc_null}`);
    console.log(`  market_value NULL: ${nc.market_value_null}`);
    console.log(`  geom_centroid NULL: ${nc.geom_centroid_null}`);
    console.log('');
    
    // 12. Sample rows for "commercial land owned by LLC tax delinquent"
    console.log('--- SAMPLE: Commercial + LLC + Tax Delinquent ---');
    const sample1 = await client.query(`
      SELECT parcel_id, acres_calc, asset_class, owner_entity_type, owner_name_raw, tax_delinquent_flag, situs_address
      FROM parcel_features_travis 
      WHERE asset_class = 'commercial' 
      AND owner_entity_type = 'llc'
      AND tax_delinquent_flag = true
      LIMIT 5
    `);
    if (sample1.rows.length === 0) {
      console.log('  No results found!');
    } else {
      sample1.rows.forEach(r => {
        console.log(`  ${r.parcel_id} | ${r.acres_calc} acres | ${r.asset_class} | ${r.owner_entity_type} | ${r.owner_name_raw?.substring(0,30)} | ${r.situs_address}`);
      });
    }
    console.log('');
    
    // 13. Sample rows for "land + LLC + tax delinquent"
    console.log('--- SAMPLE: Land + LLC + Tax Delinquent ---');
    const sample2 = await client.query(`
      SELECT parcel_id, acres_calc, asset_class, owner_entity_type, owner_name_raw, tax_delinquent_flag, situs_address
      FROM parcel_features_travis 
      WHERE asset_class = 'land' 
      AND owner_entity_type = 'llc'
      AND tax_delinquent_flag = true
      LIMIT 5
    `);
    if (sample2.rows.length === 0) {
      console.log('  No results found!');
    } else {
      sample2.rows.forEach(r => {
        console.log(`  ${r.parcel_id} | ${r.acres_calc} acres | ${r.asset_class} | ${r.owner_entity_type} | ${r.owner_name_raw?.substring(0,30)} | ${r.situs_address}`);
      });
    }
    
    console.log('');
    console.log('='.repeat(80));
    console.log('END OF AUDIT');
    console.log('='.repeat(80));
    
  } finally {
    client.release();
    await pool.end();
  }
}

audit().catch(console.error);
