/**
 * Upload flood zones GeoJSON to Mapbox as a tileset
 * Uses Mapbox Tilesets API
 * 
 * Prerequisites:
 * 1. Install Mapbox CLI: npm install -g @mapbox/mapbox-cli
 * 2. Set MAPBOX_ACCESS_TOKEN in .env
 * 3. Run: mapbox upload bradyirwin.flood-zones-travis flood-zones-travis.geojson
 * 
 * OR use Mapbox Studio:
 * 1. Go to https://studio.mapbox.com/tilesets/
 * 2. Click "New tileset"
 * 3. Upload flood-zones-travis.geojson
 * 4. Note the tileset ID
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEOJSON_FILE = path.join(__dirname, '../flood-zones-travis.geojson');

console.log('📋 Mapbox Tileset Upload Instructions\n');
console.log('The GeoJSON file is ready for upload to Mapbox.\n');

if (!fs.existsSync(GEOJSON_FILE)) {
  console.error(`❌ GeoJSON file not found: ${GEOJSON_FILE}`);
  console.error('   Run download-flood-zones.mjs first');
  process.exit(1);
}

const fileSizeMB = (fs.statSync(GEOJSON_FILE).size / 1024 / 1024).toFixed(2);
console.log(`✅ GeoJSON file ready:`);
console.log(`   File: ${GEOJSON_FILE}`);
console.log(`   Size: ${fileSizeMB} MB\n`);

console.log('📤 Upload Options:\n');

console.log('Option 1: Mapbox CLI (Recommended)');
console.log('  1. Install: npm install -g @mapbox/mapbox-cli');
console.log('  2. Login: mapbox login');
console.log('  3. Upload: mapbox upload bradyirwin.flood-zones-travis flood-zones-travis.geojson');
console.log('  4. Wait for processing (check status in Mapbox Studio)\n');

console.log('Option 2: Mapbox Studio (Web UI)');
console.log('  1. Go to: https://studio.mapbox.com/tilesets/');
console.log('  2. Click "New tileset"');
console.log('  3. Upload: flood-zones-travis.geojson');
console.log('  4. Name it: flood-zones-travis');
console.log('  5. Note the tileset ID (e.g., bradyirwin.flood-zones-travis)\n');

console.log('Option 3: Mapbox Tilesets API (Programmatic)');
console.log('  See: https://docs.mapbox.com/api/maps/tilesets/');
console.log('  Requires: POST to /uploads/v1/{username}');
console.log('  Then: POST to /tilesets/v1/{username}.{tileset_id}\n');

console.log('💡 After upload, update mapboxConfig in src/config/mapbox.js:');
console.log('   Add: VITE_FLOOD_ZONES_TILESET_ID=bradyirwin.flood-zones-travis\n');
