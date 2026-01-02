/**
 * Check for existing zoning district data in database
 * READ-ONLY queries only
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkZoningData() {
  try {
    console.log('🔍 Checking for existing zoning data in database...\n');

    // 1. Check for zoning-related tables
    console.log('1. Zoning-related tables:');
    const zoningTables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name ILIKE '%zone%' OR table_name ILIKE '%zoning%')
      ORDER BY table_name;
    `);
    
    if (zoningTables.rows.length > 0) {
      console.table(zoningTables.rows);
      
      // Check row counts for each table
      for (const { table_name } of zoningTables.rows) {
        try {
          const count = await pool.query(`SELECT COUNT(*) as count FROM ${table_name}`);
          console.log(`   ${table_name}: ${count.rows[0].count} rows`);
        } catch (e) {
          console.log(`   ${table_name}: Error checking count - ${e.message}`);
        }
      }
    } else {
      console.log('   No zoning-related tables found\n');
    }

    // 2. Check for zoning columns in all tables
    console.log('\n2. Tables with zoning-related columns:');
    const zoningColumns = await pool.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND (column_name ILIKE '%zone%' OR column_name ILIKE '%zoning%')
      ORDER BY table_name, column_name;
    `);
    
    if (zoningColumns.rows.length > 0) {
      console.table(zoningColumns.rows);
      
      // Group by table and check for data
      const tablesWithZoning = [...new Set(zoningColumns.rows.map(r => r.table_name))];
      
      for (const tableName of tablesWithZoning) {
        const cols = zoningColumns.rows.filter(r => r.table_name === tableName);
        console.log(`\n   Checking ${tableName}:`);
        
        for (const col of cols) {
          try {
            // Handle camelCase column names
            const colName = col.column_name.includes('Zone') ? `"${col.column_name}"` : col.column_name;
            const dataCheck = await pool.query(`
              SELECT 
                COUNT(*) as total,
                COUNT(${colName}) as has_value,
                COUNT(DISTINCT ${colName}) as distinct_values
              FROM ${tableName}
              WHERE ${colName} IS NOT NULL;
            `);
            
            const result = dataCheck.rows[0];
            if (result.has_value > 0) {
              console.log(`     ${col.column_name}: ${result.has_value} non-null values, ${result.distinct_values} distinct values`);
              
              // Sample distinct values
              const sample = await pool.query(`
                SELECT DISTINCT ${colName} as value
                FROM ${tableName}
                WHERE ${colName} IS NOT NULL
                ORDER BY ${colName}
                LIMIT 10;
              `);
              console.log(`       Sample values: ${sample.rows.map(r => r.value).join(', ')}`);
            } else {
              console.log(`     ${col.column_name}: No data (all NULL)`);
            }
          } catch (e) {
            console.log(`     ${col.column_name}: Error - ${e.message}`);
          }
        }
      }
    } else {
      console.log('   No zoning-related columns found\n');
    }

    // 3. Check parcels_travis columns
    console.log('\n3. Columns in parcels_travis:');
    const parcelsColumns = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'parcels_travis'
      ORDER BY ordinal_position;
    `);
    
    const hasZoning = parcelsColumns.rows.some(c => 
      c.column_name.toLowerCase().includes('zon') || 
      c.column_name.toLowerCase().includes('zone')
    );
    
    if (hasZoning) {
      const zoningCols = parcelsColumns.rows.filter(c => 
        c.column_name.toLowerCase().includes('zon') || 
        c.column_name.toLowerCase().includes('zone')
      );
      console.log('   Zoning columns found:');
      console.table(zoningCols);
    } else {
      console.log('   No zoning columns in parcels_travis');
      console.log(`   Total columns: ${parcelsColumns.rows.length}`);
    }

    // 4. Check parcels table (if exists)
    console.log('\n4. Checking parcels table (if exists):');
    const parcelsExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'parcels'
      );
    `);
    
    if (parcelsExists.rows[0].exists) {
      const parcelsCols = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'parcels'
        ORDER BY ordinal_position;
      `);
      
      const hasZoningInParcels = parcelsCols.rows.some(c => 
        c.column_name.toLowerCase().includes('zon') || 
        c.column_name.toLowerCase().includes('zone')
      );
      
      if (hasZoningInParcels) {
        const zoningCols = parcelsCols.rows.filter(c => 
          c.column_name.toLowerCase().includes('zon') || 
          c.column_name.toLowerCase().includes('zone')
        );
        console.log('   Zoning columns found:');
        console.table(zoningCols);
      } else {
        console.log('   No zoning columns in parcels table');
      }
    } else {
      console.log('   parcels table does not exist');
    }

    // 5. Check map_server_registry for zoning layers
    console.log('\n5. Checking map_server_registry for zoning layers:');
    const zoningLayers = await pool.query(`
      SELECT id, url, category, "datasetType", "datasetCategory"
      FROM map_server_registry
      WHERE category ILIKE '%zone%' 
         OR category ILIKE '%zoning%'
         OR "datasetCategory" ILIKE '%zone%'
         OR "datasetCategory" ILIKE '%zoning%'
         OR url ILIKE '%zone%'
         OR url ILIKE '%zoning%'
      ORDER BY category;
    `);
    
    if (zoningLayers.rows.length > 0) {
      console.log(`   Found ${zoningLayers.rows.length} zoning-related map server entries:`);
      console.table(zoningLayers.rows);
    } else {
      console.log('   No zoning layers found in map_server_registry');
    }

    // 6. Check layer_sets for zoning
    console.log('\n6. Checking layer_sets for zoning:');
    const zoningLayerSets = await pool.query(`
      SELECT id, name, category, description
      FROM layer_sets
      WHERE category ILIKE '%zone%' 
         OR category ILIKE '%zoning%'
         OR name ILIKE '%zone%'
         OR name ILIKE '%zoning%'
         OR description ILIKE '%zone%'
         OR description ILIKE '%zoning%'
      ORDER BY category;
    `);
    
    if (zoningLayerSets.rows.length > 0) {
      console.log(`   Found ${zoningLayerSets.rows.length} zoning-related layer sets:`);
      console.table(zoningLayerSets.rows);
    } else {
      console.log('   No zoning layer sets found');
    }

    // 7. Summary
    console.log('\n📊 SUMMARY:');
    console.log(`   - Zoning tables: ${zoningTables.rows.length}`);
    console.log(`   - Tables with zoning columns: ${zoningColumns.rows.length > 0 ? [...new Set(zoningColumns.rows.map(r => r.table_name))].length : 0}`);
    console.log(`   - Zoning columns total: ${zoningColumns.rows.length}`);
    console.log(`   - Map server zoning layers: ${zoningLayers.rows.length}`);
    console.log(`   - Layer set zoning entries: ${zoningLayerSets.rows.length}`);

    // Check if we have actual zoning data (not just empty columns)
    const hasActualZoningData = zoningColumns.rows.length > 0 && 
      (zoningColumns.rows.some(r => r.table_name === 'properties' && r.column_name === 'zoning') ||
       zoningColumns.rows.some(r => r.table_name === 'parcels_travis_enrichment' && r.column_name === 'zoning_code'));
    
    if (hasActualZoningData) {
      console.log('\n   ⚠️  Found zoning columns but need to verify if they contain data');
    } else {
      console.log('\n   ❌ No zoning district data found in database');
      console.log('   💡 Recommendation: Download City of Austin zoning layer');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkZoningData()
  .then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });

