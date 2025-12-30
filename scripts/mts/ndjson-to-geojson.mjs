#!/usr/bin/env node
/**
 * Convert NDJSON parcel exports to GeoJSON FeatureCollection for Mapbox Studio
 * 
 * Reads NDJSON files and converts them to GeoJSON FeatureCollection format
 * suitable for drag-and-drop upload to Mapbox Studio.
 * 
 * Usage:
 *   npm run mts:travis:studio
 * 
 * Outputs:
 *   - dist/mts/parcels_travis_v1.polygons.geojson
 *   - dist/mts/parcels_travis_v1.centroids.geojson
 */

import { createReadStream, createWriteStream, existsSync } from 'fs';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

const POLYGONS_NDJSON = join(REPO_ROOT, 'dist/mts/parcels_travis_v1.polygons.ndjson');
const CENTROIDS_NDJSON = join(REPO_ROOT, 'dist/mts/parcels_travis_v1.centroids.ndjson');
const POLYGONS_GEOJSON = join(REPO_ROOT, 'dist/mts/parcels_travis_v1.polygons.geojson');
const CENTROIDS_GEOJSON = join(REPO_ROOT, 'dist/mts/parcels_travis_v1.centroids.geojson');

// Colors
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function log(message, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

function error(message) {
  log(`❌ ${message}`, RED);
  process.exit(1);
}

function success(message) {
  log(`✅ ${message}`, GREEN);
}

function info(message) {
  log(`ℹ️  ${message}`, BLUE);
}

function warn(message) {
  log(`⚠️  ${message}`, YELLOW);
}

// Convert NDJSON to GeoJSON FeatureCollection
async function convertNdjsonToGeojson(inputPath, outputPath, type) {
  log(`\n📋 Converting ${type}...`, BLUE);
  
  if (!existsSync(inputPath)) {
    error(`Input file not found: ${inputPath}`);
  }
  
  // Create write stream
  const writeStream = createWriteStream(outputPath, { encoding: 'utf-8' });
  
  // Write FeatureCollection header
  writeStream.write('{\n  "type": "FeatureCollection",\n  "features": [\n');
  
  let featureCount = 0;
  let firstFeature = true;
  let hasGeometry = false;
  let hasParcelId = false;
  let lastError = null;
  
  // Create readline interface for streaming
  const fileStream = createReadStream(inputPath, { encoding: 'utf-8' });
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  return new Promise((resolve, reject) => {
    rl.on('line', (line) => {
      if (!line.trim()) return; // Skip empty lines
      
      try {
        const feature = JSON.parse(line);
        
        // Validate feature structure
        if (!feature.type || feature.type !== 'Feature') {
          warn(`Skipping invalid feature (missing type): ${line.substring(0, 100)}...`);
          return;
        }
        
        // Validate geometry
        if (!feature.geometry || !feature.geometry.type) {
          warn(`Skipping feature without geometry`);
          return;
        }
        hasGeometry = true;
        
        // Validate parcelId property
        if (!feature.properties || !feature.properties.parcelId) {
          warn(`Skipping feature without parcelId property`);
          return;
        }
        hasParcelId = true;
        
        // Write feature (with comma separator except for first)
        if (!firstFeature) {
          writeStream.write(',\n');
        }
        firstFeature = false;
        
        // Write feature with 4-space indent
        const featureJson = JSON.stringify(feature, null, 2)
          .split('\n')
          .map(line => `    ${line}`)
          .join('\n');
        writeStream.write(featureJson);
        
        featureCount++;
        
        // Progress indicator every 50k features
        if (featureCount % 50000 === 0) {
          info(`  Processed ${featureCount.toLocaleString()} features...`);
        }
      } catch (e) {
        lastError = e;
        warn(`Failed to parse line ${featureCount + 1}: ${e.message}`);
        // Continue processing other lines
      }
    });
    
    rl.on('close', () => {
      // Close FeatureCollection
      writeStream.write('\n  ]\n}\n');
      writeStream.end();
      
      writeStream.on('finish', () => {
        // Validate results
        if (featureCount < 300000) {
          warn(`Feature count (${featureCount.toLocaleString()}) is less than expected (300,000)`);
        }
        
        if (!hasGeometry) {
          error('No features with valid geometry found');
        }
        
        if (!hasParcelId) {
          error('No features with parcelId property found');
        }
        
        if (lastError && featureCount === 0) {
          error(`Failed to parse any features: ${lastError.message}`);
        }
        
        success(`${type}: ${featureCount.toLocaleString()} features converted`);
        resolve({ featureCount, hasGeometry, hasParcelId });
      });
      
      writeStream.on('error', (err) => {
        error(`Write error: ${err.message}`);
        reject(err);
      });
    });
    
    rl.on('error', (err) => {
      error(`Read error: ${err.message}`);
      reject(err);
    });
  });
}

// Main execution
async function main() {
  try {
    log('\n🚀 Converting NDJSON to GeoJSON for Mapbox Studio\n', BLUE);
    
    // Convert polygons
    const polygonsResult = await convertNdjsonToGeojson(
      POLYGONS_NDJSON,
      POLYGONS_GEOJSON,
      'Polygons'
    );
    
    // Convert centroids
    const centroidsResult = await convertNdjsonToGeojson(
      CENTROIDS_NDJSON,
      CENTROIDS_GEOJSON,
      'Centroids'
    );
    
    // Print summary
    log('\n' + '='.repeat(60), GREEN);
    log('✅ CONVERSION COMPLETE', GREEN);
    log('='.repeat(60), GREEN);
    log(`Polygons: ${polygonsResult.featureCount.toLocaleString()} features`, GREEN);
    log(`Centroids: ${centroidsResult.featureCount.toLocaleString()} features`, GREEN);
    log('='.repeat(60), GREEN);
    
    // Print instructions
    const outputDir = join(REPO_ROOT, 'dist/mts');
    const outputDirAbsolute = outputDir; // Already absolute via REPO_ROOT
    log('\n' + '='.repeat(60), BLUE);
    log('📋 MAPBOX STUDIO UPLOAD INSTRUCTIONS', BLUE);
    log('='.repeat(60), BLUE);
    log('');
    log('1. Open Mapbox Studio:', BLUE);
    log('   https://studio.mapbox.com/', BLUE);
    log('');
    log('2. Navigate to:', BLUE);
    log('   Data → Tilesets → New tileset', BLUE);
    log('');
    log('3. Upload polygons:', BLUE);
    log(`   Drag and drop: ${POLYGONS_GEOJSON}`, BLUE);
    log('   Wait for upload to complete', BLUE);
    log('');
    log('4. Upload centroids:', BLUE);
    log(`   Drag and drop: ${CENTROIDS_GEOJSON}`, BLUE);
    log('   Wait for upload to complete', BLUE);
    log('');
    log('5. Add to style:', BLUE);
    log('   - Open your style in Mapbox Studio', BLUE);
    log('   - Click "Add layer"', BLUE);
    log('   - Select the uploaded tilesets as sources', BLUE);
    log('   - Configure layers:', BLUE);
    log('     * parcels (from polygons) - source-layer: parcels', BLUE);
    log('     * parcel_centroids (from centroids) - source-layer: parcel_centroids', BLUE);
    log('');
    warn('⚠️  Note: Studio uploads may take several minutes for large files.');
    warn('⚠️  File sizes:');
    
    // Get file sizes
    try {
      const polygonsStats = readFileSync(POLYGONS_GEOJSON, { encoding: 'utf-8' });
      const centroidsStats = readFileSync(CENTROIDS_GEOJSON, { encoding: 'utf-8' });
      const polygonsSizeMB = (polygonsStats.length / 1024 / 1024).toFixed(1);
      const centroidsSizeMB = (centroidsStats.length / 1024 / 1024).toFixed(1);
      warn(`   - Polygons: ~${polygonsSizeMB} MB`);
      warn(`   - Centroids: ~${centroidsSizeMB} MB`);
    } catch (e) {
      // Ignore size check errors
    }
    
    log('');
    log('Output folder:', BLUE);
    log(`  ${outputDir}`, BLUE);
    log('');
    log('='.repeat(60), BLUE);
    log('');
    
  } catch (error) {
    log(`\n❌ Pipeline failed: ${error.message}`, RED);
    process.exit(1);
  }
}

main();

