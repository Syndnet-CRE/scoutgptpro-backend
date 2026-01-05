#!/usr/bin/env node
/**
 * Fix invalid Point coordinates in NDJSON file
 * 
 * Removes features with invalid coordinates and writes clean NDJSON.
 * 
 * Usage:
 *   node scripts/mts/fix-centroids-ndjson.mjs
 *   node scripts/mts/fix-centroids-ndjson.mjs --input=path/to/input.ndjson --output=path/to/output.ndjson
 */

import { createReadStream, createWriteStream, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

// Parse CLI args
const args = process.argv.slice(2);
const getArg = (name, defaultValue) => {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : defaultValue;
};

const INPUT_FILE = getArg('input', join(REPO_ROOT, 'dist/mts/parcels_travis_v1.centroids.ndjson'));
const OUTPUT_FILE = getArg('output', join(REPO_ROOT, 'dist/mts/parcels_travis_v1.centroids.fixed.ndjson'));

// Validate coordinates for Point geometry
function isValidPointCoordinates(coords) {
  // Must be an array
  if (!Array.isArray(coords)) {
    return false;
  }
  
  // Must have length 2 or 3
  if (coords.length !== 2 && coords.length !== 3) {
    return false;
  }
  
  // All elements must be finite numbers
  for (let i = 0; i < coords.length; i++) {
    const val = coords[i];
    if (typeof val !== 'number' || !isFinite(val)) {
      return false;
    }
  }
  
  return true;
}

// Validate feature
function isValidFeature(feature) {
  // Must have geometry
  if (!feature.geometry) {
    return { valid: false, reason: 'missing geometry' };
  }
  
  // Must be Point type
  if (feature.geometry.type !== 'Point') {
    return { valid: false, reason: `invalid geometry type: ${feature.geometry.type}` };
  }
  
  // Validate coordinates
  if (!isValidPointCoordinates(feature.geometry.coordinates)) {
    return { valid: false, reason: 'invalid coordinates (must be array of 2 or 3 finite numbers)' };
  }
  
  return { valid: true };
}

// Process file
async function fixNdjson(inputPath, outputPath) {
  console.log(`\n🔧 Fixing NDJSON file`);
  console.log(`   Input:  ${inputPath}`);
  console.log(`   Output: ${outputPath}\n`);
  
  if (!existsSync(inputPath)) {
    console.error(`❌ Input file not found: ${inputPath}`);
    process.exit(1);
  }
  
  // Ensure output directory exists
  mkdirSync(dirname(outputPath), { recursive: true });
  
  // Create write stream
  const writeStream = createWriteStream(outputPath, { encoding: 'utf-8' });
  
  let totalRead = 0;
  let totalKept = 0;
  let totalDropped = 0;
  let firstInvalidLine = null;
  let firstInvalidReason = null;
  
  // Create readline interface for streaming
  const fileStream = createReadStream(inputPath, { encoding: 'utf-8' });
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  return new Promise((resolve, reject) => {
    rl.on('line', (line) => {
      totalRead++;
      
      if (!line.trim()) {
        // Skip empty lines
        return;
      }
      
      try {
        const feature = JSON.parse(line);
        const validation = isValidFeature(feature);
        
        if (validation.valid) {
          // Write valid feature
          writeStream.write(line + '\n');
          totalKept++;
        } else {
          // Track first invalid
          if (firstInvalidLine === null) {
            firstInvalidLine = totalRead;
            firstInvalidReason = validation.reason;
          }
          totalDropped++;
        }
        
        // Progress indicator every 50k lines
        if (totalRead % 50000 === 0) {
          console.log(`  Processed ${totalRead.toLocaleString()} lines... (kept: ${totalKept.toLocaleString()}, dropped: ${totalDropped.toLocaleString()})`);
        }
      } catch (e) {
        // Invalid JSON
        if (firstInvalidLine === null) {
          firstInvalidLine = totalRead;
          firstInvalidReason = `JSON parse error: ${e.message}`;
        }
        totalDropped++;
      }
    });
    
    rl.on('close', () => {
      writeStream.end();
      
      writeStream.on('finish', () => {
        console.log('\n' + '='.repeat(60));
        console.log('✅ PROCESSING COMPLETE');
        console.log('='.repeat(60));
        console.log(`Total lines read:  ${totalRead.toLocaleString()}`);
        console.log(`Total kept:        ${totalKept.toLocaleString()}`);
        console.log(`Total dropped:     ${totalDropped.toLocaleString()}`);
        
        if (firstInvalidLine !== null) {
          console.log(`\nFirst invalid line: ${firstInvalidLine}`);
          console.log(`Reason:            ${firstInvalidReason}`);
        }
        
        console.log('='.repeat(60));
        console.log(`\n✅ Clean file written: ${outputPath}\n`);
        
        resolve({ totalRead, totalKept, totalDropped, firstInvalidLine, firstInvalidReason });
      });
      
      writeStream.on('error', (err) => {
        console.error(`❌ Write error: ${err.message}`);
        reject(err);
      });
    });
    
    rl.on('error', (err) => {
      console.error(`❌ Read error: ${err.message}`);
      reject(err);
    });
  });
}

// Main execution
async function main() {
  try {
    await fixNdjson(INPUT_FILE, OUTPUT_FILE);
  } catch (error) {
    console.error(`\n❌ Failed: ${error.message}`);
    process.exit(1);
  }
}

main();



