/**
 * Export zoning districts to GeoJSON for Mapbox Tileset upload
 * 
 * Exports all zoning districts from zoning_districts table
 * Output: zoning-districts-travis.geojson
 * 
 * Usage:
 *   node scripts/export-zoning-to-geojson.mjs
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const OUTPUT_FILE = path.join(__dirname, '../zoning-districts-travis.geojson');

async function main() {
  const client = await pool.connect();
  try {
    console.log('🗺️  Exporting zoning districts to GeoJSON\n');
    
    // Get count first
    const countResult = await client.query(`
      SELECT COUNT(*) as count 
      FROM zoning_districts 
      WHERE geometry IS NOT NULL
    `);
    const totalCount = parseInt(countResult.rows[0].count);
    console.log(`   Total zoning districts: ${totalCount.toLocaleString()}\n`);
    
    if (totalCount === 0) {
      console.log('⚠️  No zoning districts found with geometry');
      return;
    }
    
    // Export all zoning districts
    console.log('📥 Fetching zoning districts...');
    const result = await client.query(`
      SELECT 
        id,
        zoning_code,
        zoning_desc,
        overlay,
        ST_AsGeoJSON(geometry)::json as geometry
      FROM zoning_districts
      WHERE geometry IS NOT NULL
      ORDER BY id
    `);
    
    console.log(`   ✅ Fetched ${result.rows.length.toLocaleString()} features\n`);
    
    // Convert to GeoJSON features
    const features = result.rows.map(row => ({
      type: 'Feature',
      properties: {
        ZONING_CODE: row.zoning_code || null,
        ZONING_DESC: row.zoning_desc || null,
        OVERLAY: row.overlay || null,
        ID: row.id
      },
      geometry: row.geometry
    }));
    
    const geojson = {
      type: 'FeatureCollection',
      features: features
    };
    
    // Write to file
    console.log(`💾 Writing to ${OUTPUT_FILE}...`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(geojson, null, 2));
    
    const fileSizeMB = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2);
    console.log(`   ✅ Saved ${features.length.toLocaleString()} features`);
    console.log(`   📦 File size: ${fileSizeMB} MB\n`);
    
    // Show distribution
    const dist = {};
    features.forEach(f => {
      const code = f.properties.ZONING_CODE || 'NULL';
      dist[code] = (dist[code] || 0) + 1;
    });
    
    console.log('📊 Top 10 Zoning Codes:');
    const sorted = Object.entries(dist)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    console.table(sorted.map(([code, count]) => ({ code, count })));
    
    console.log(`\n✅ Export complete!`);
    console.log(`\nNext steps:`);
    console.log(`1. Simplify if needed: npx mapshaper zoning-districts-travis.geojson -simplify 30% keep-shapes -o zoning-districts-travis-simplified.geojson`);
    console.log(`2. Convert to NDJSON: node -e "const fs=require('fs');const g=JSON.parse(fs.readFileSync('zoning-districts-travis.geojson'));fs.writeFileSync('zoning-districts-travis.ndjson',g.features.map(f=>JSON.stringify(f)).join('\\n'));"`);
    console.log(`3. Upload to Mapbox Studio or use tilesets CLI`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main();


