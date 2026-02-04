#!/usr/bin/env node
/**
 * Script to verify which GIS layer tables exist in the database
 * and get their row counts and structure
 */

import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file
dotenv.config({ path: join(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const GIS_TABLES_TO_CHECK = [
  'zoning_districts',
  'flood_zones',
  'utility_sewer',
  'utility_water',
  'building_footprints',
  'wetlands',
  'building_permits',
  'census_tracts'
];

async function checkTableExists(tableName) {
  const result = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    ) as exists
  `, [tableName]);
  return result.rows[0].exists;
}

async function getTableColumns(tableName) {
  const result = await pool.query(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns 
    WHERE table_name = $1
    AND table_schema = 'public'
    ORDER BY ordinal_position
  `, [tableName]);
  return result.rows;
}

async function getTableRowCount(tableName) {
  try {
    const result = await pool.query(`SELECT count(*) as count FROM ${tableName}`);
    return parseInt(result.rows[0].count, 10);
  } catch (err) {
    return null;
  }
}

async function main() {
  console.log('🔍 Checking GIS layer tables in database...\n');
  
  const results = {
    existing: [],
    missing: []
  };

  for (const tableName of GIS_TABLES_TO_CHECK) {
    const exists = await checkTableExists(tableName);
    
    if (exists) {
      const columns = await getTableColumns(tableName);
      const rowCount = await getTableRowCount(tableName);
      
      // Find geometry column
      const geomColumn = columns.find(col => 
        col.data_type === 'USER-DEFINED' && col.udt_name === 'geometry'
      ) || columns.find(col => col.column_name.includes('geom'));
      
      results.existing.push({
        table: tableName,
        rowCount,
        columns: columns.map(c => ({ name: c.column_name, type: c.data_type, udt: c.udt_name })),
        geometryColumn: geomColumn?.column_name || 'unknown'
      });
      
      console.log(`✅ ${tableName}: ${rowCount?.toLocaleString() || 'N/A'} rows, geom column: ${geomColumn?.column_name || 'not found'}`);
    } else {
      results.missing.push(tableName);
      console.log(`❌ ${tableName}: Table does not exist`);
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Existing tables: ${results.existing.length}`);
  console.log(`   Missing tables: ${results.missing.length}`);

  await pool.end();
  
  return results;
}

main()
  .then(results => {
    // Output JSON for programmatic use
    console.log('\n📄 Results JSON:');
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
