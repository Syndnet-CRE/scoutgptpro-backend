#!/usr/bin/env node
/**
 * System Audit Database Queries
 * Run queries to gather database statistics for audit report
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend root
dotenv.config({ path: join(__dirname, '..', '.env') });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function runQuery(query, params = []) {
  try {
    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    return { error: error.message };
  }
}

async function auditDatabase() {
  console.log('Starting database audit...\n');
  
  const results = {};
  
  // 1.1 List all tables
  console.log('1.1 Listing all tables...');
  const tables = await runQuery(`
    SELECT table_name, 
           (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
    FROM information_schema.tables t
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);
  results.tables = tables;
  
  // 1.2 Property tables
  console.log('1.2 Checking property tables...');
  
  // Check parcel_features_travis
  const pftExists = await runQuery(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'parcel_features_travis'
    ) as exists;
  `);
  
  if (pftExists[0]?.exists) {
    const pftStats = await runQuery(`
      SELECT COUNT(*) as total_parcels,
             COUNT(DISTINCT county_fips) as counties,
             array_agg(DISTINCT county_fips) as county_list
      FROM parcel_features_travis;
    `);
    results.parcel_features_travis = pftStats[0];
  }
  
  // Check properties table
  const propsExists = await runQuery(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'properties'
    ) as exists;
  `);
  
  if (propsExists[0]?.exists) {
    const propsStats = await runQuery(`
      SELECT COUNT(*) as total, 
             COUNT(DISTINCT county) as counties 
      FROM properties;
    `);
    results.properties = propsStats[0];
  }
  
  // 1.3 GIS Tables
  console.log('1.3 Checking GIS tables...');
  
  const gisTables = ['zoning_layers', 'zoning_districts', 'flood_zones', 'transit_stops', 'census_tracts'];
  results.gis_tables = {};
  
  for (const tableName of gisTables) {
    const exists = await runQuery(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = $1
      ) as exists;
    `, [tableName]);
    
    if (exists[0]?.exists) {
      const count = await runQuery(`SELECT COUNT(*) as count FROM ${tableName};`);
      results.gis_tables[tableName] = {
        exists: true,
        count: count[0]?.count || 0
      };
      
      // Sample data for zoning tables
      if (tableName.includes('zoning')) {
        const sample = await runQuery(`
          SELECT ${tableName.includes('districts') ? 'zoning_code' : 'zone_code'}, COUNT(*) as cnt 
          FROM ${tableName} 
          GROUP BY ${tableName.includes('districts') ? 'zoning_code' : 'zone_code'} 
          LIMIT 20;
        `);
        results.gis_tables[tableName].sample = sample;
      }
      
      // Sample for flood zones
      if (tableName === 'flood_zones') {
        const sample = await runQuery(`
          SELECT flood_zone, COUNT(*) as cnt 
          FROM flood_zones 
          GROUP BY flood_zone 
          LIMIT 20;
        `);
        results.gis_tables[tableName].sample = sample;
      }
    } else {
      results.gis_tables[tableName] = { exists: false };
    }
  }
  
  // 1.4 Transaction & Permit Data
  console.log('1.4 Checking transaction and permit tables...');
  
  const txExists = await runQuery(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'transactions'
    ) as exists;
  `);
  
  if (txExists[0]?.exists) {
    const txStats = await runQuery(`
      SELECT COUNT(*), MIN(sale_date) as min_date, MAX(sale_date) as max_date 
      FROM transactions;
    `);
    results.transactions = txStats[0];
  } else {
    results.transactions = { exists: false };
  }
  
  const permitsExists = await runQuery(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'permits'
    ) as exists;
  `);
  
  if (permitsExists[0]?.exists) {
    const permitsStats = await runQuery(`
      SELECT COUNT(*), MIN(issue_date) as min_date, MAX(issue_date) as max_date 
      FROM permits;
    `);
    results.permits = permitsStats[0];
  } else {
    results.permits = { exists: false };
  }
  
  // 1.5 Enrichment & OSM Data
  console.log('1.5 Checking enrichment and OSM data...');
  
  const enrichExists = await runQuery(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'parcels_travis_enrichment'
    ) as exists;
  `);
  
  if (enrichExists[0]?.exists) {
    const enrichCount = await runQuery(`SELECT COUNT(*) as count FROM parcels_travis_enrichment;`);
    const enrichCols = await runQuery(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'parcels_travis_enrichment'
      ORDER BY ordinal_position;
    `);
    results.parcels_travis_enrichment = {
      count: enrichCount[0]?.count || 0,
      columns: enrichCols.map(r => r.column_name)
    };
  }
  
  const osmExists = await runQuery(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'osm_pois_travis'
    ) as exists;
  `);
  
  if (osmExists[0]?.exists) {
    const osmStats = await runQuery(`
      SELECT COUNT(*) as total_pois,
             COUNT(DISTINCT category) as amenity_types
      FROM osm_pois_travis;
    `);
    results.osm_pois_travis = osmStats[0];
  }
  
  // 1.6 Claude Write-Back Tables
  console.log('1.6 Checking Claude write-back tables...');
  
  const claudeTables = ['claude_sessions', 'claude_messages', 'parcel_enrichments'];
  results.claude_tables = {};
  
  for (const tableName of claudeTables) {
    const exists = await runQuery(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = $1
      ) as exists;
    `, [tableName]);
    
    if (exists[0]?.exists) {
      const count = await runQuery(`SELECT COUNT(*) as count FROM ${tableName};`);
      results.claude_tables[tableName] = {
        exists: true,
        count: count[0]?.count || 0
      };
    } else {
      results.claude_tables[tableName] = { exists: false };
    }
  }
  
  // Output results
  console.log('\n=== AUDIT RESULTS ===\n');
  console.log(JSON.stringify(results, null, 2));
  
  await pool.end();
  return results;
}

auditDatabase().catch(console.error);
