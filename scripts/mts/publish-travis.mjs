#!/usr/bin/env node
/**
 * One-Command MTS Publish Pipeline for Travis Parcels
 * 
 * Exports → Fixes Centroids → Uploads → Publishes → Verifies
 * 
 * Usage:
 *   npm run mts:travis:publish
 * 
 * Requires:
 *   - MAPBOX_ACCESS_TOKEN (must start with sk. or sk_)
 *   - MAPBOX_USERNAME (or will attempt to derive from token)
 *   - tilesets CLI (detected automatically)
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createReadStream, createWriteStream } from 'fs';
import { createInterface } from 'readline';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

// Load environment
dotenv.config({ path: join(REPO_ROOT, '.env') });
if (existsSync(join(REPO_ROOT, '.env.local'))) {
  dotenv.config({ path: join(REPO_ROOT, '.env.local'), override: true });
}

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;
const MAPBOX_USERNAME = process.env.MAPBOX_USERNAME;
const TILESET_ID_OVERRIDE = process.env.TILESET_ID; // Optional override (e.g., "parcels_travis_v2")
const POLYGONS_FILE = join(REPO_ROOT, 'dist/mts/parcels_travis_v1.polygons.ndjson');
const CENTROIDS_FILE = join(REPO_ROOT, 'dist/mts/parcels_travis_v1.centroids.ndjson');
const CENTROIDS_FIXED_FILE = join(REPO_ROOT, 'dist/mts/parcels_travis_v1.centroids.fixed.ndjson');
const RECIPE_FILE = join(REPO_ROOT, 'scripts/mts/travis.tileset.json');

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

// Get file size in MB
function getFileSizeMB(filePath) {
  try {
    const stats = statSync(filePath);
    return (stats.size / 1024 / 1024).toFixed(1);
  } catch (e) {
    return 'N/A';
  }
}

// Get line count
function getLineCount(filePath) {
  try {
    const count = execSync(`wc -l < "${filePath}"`, { encoding: 'utf-8' }).trim();
    return parseInt(count, 10);
  } catch (e) {
    return 0;
  }
}

// Find tilesets CLI
function findTilesetsCLI() {
  try {
    const which = execSync('command -v tilesets', { encoding: 'utf-8', stdio: 'pipe' }).trim();
    if (which) {
      return which;
    }
  } catch (e) {
    // Try which as fallback
    try {
      const which = execSync('which tilesets', { encoding: 'utf-8', stdio: 'pipe' }).trim();
      if (which) {
        return which;
      }
    } catch (e2) {
      // Not found
    }
  }
  return null;
}

// Step 1: Validate environment
function validateEnv() {
  log('\n📋 Step 1: Validating environment...', BLUE);
  
  if (!MAPBOX_TOKEN) {
    error('MAPBOX_ACCESS_TOKEN not found in environment');
  }
  
  if (!MAPBOX_TOKEN.startsWith('sk.') && !MAPBOX_TOKEN.startsWith('sk_')) {
    error('MAPBOX_ACCESS_TOKEN must start with "sk." or "sk_" (secret token required)');
  }
  
  success('Token validated');
  
  // AUDIT: Log token info
  const tokenPrefix = MAPBOX_TOKEN ? MAPBOX_TOKEN.substring(0, 6) + '...' : 'MISSING';
  log(`\n🔍 AUDIT: Token info:`, YELLOW);
  log(`   Token prefix: ${tokenPrefix}`, YELLOW);
  log(`   MAPBOX_USERNAME env var: ${MAPBOX_USERNAME || 'NOT SET'}`, YELLOW);
  
  // Get username
  let username = MAPBOX_USERNAME;
  let usernameSource = 'env_var';
  
  if (!username) {
    log(`   Attempting to derive username from API...`, YELLOW);
    // Try to derive from API
    try {
      const response = execSync(
        `curl -s "https://api.mapbox.com/tokens/v2?access_token=${MAPBOX_TOKEN}"`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );
      const data = JSON.parse(response);
      if (data.username) {
        username = data.username;
        usernameSource = 'api_tokens_v2';
        log(`   ✅ Derived username from tokens/v2 API: ${username}`, GREEN);
      }
    } catch (e) {
      log(`   ⚠️  tokens/v2 API failed: ${e.message}`, YELLOW);
      // Try alternative API
      try {
        const response = execSync(
          `curl -s "https://api.mapbox.com/accounts/v1/me?access_token=${MAPBOX_TOKEN}"`,
          { encoding: 'utf-8', stdio: 'pipe' }
        );
        const data = JSON.parse(response);
        if (data.username) {
          username = data.username;
          usernameSource = 'api_accounts_v1';
          log(`   ✅ Derived username from accounts/v1 API: ${username}`, GREEN);
        }
      } catch (e2) {
        log(`   ⚠️  accounts/v1 API failed: ${e2.message}`, YELLOW);
        // Failed to derive
      }
    }
  }
  
  if (!username) {
    log(`\n🔍 AUDIT: Username derivation failed`, RED);
    error('Set MAPBOX_USERNAME env var');
  }
  
  success(`Username: ${username} (source: ${usernameSource})`);
  log(`\n🔍 AUDIT: Final username: ${username}`, YELLOW);
  return username;
}

// Step 2: Preflight checks
function preflightChecks(username) {
  log('\n📋 Step 2: Preflight checks...', BLUE);
  
  // Find tilesets CLI
  const tilesetsPath = findTilesetsCLI();
  if (tilesetsPath) {
    success(`Tilesets CLI: ${tilesetsPath}`);
  } else {
    error('tilesets CLI not found. Install with: pip install mapbox-tilesets');
  }
  
  // Check files
  if (!existsSync(POLYGONS_FILE)) {
    error(`Polygons file not found: ${POLYGONS_FILE}`);
  }
  
  if (!existsSync(CENTROIDS_FILE)) {
    error(`Centroids file not found: ${CENTROIDS_FILE}`);
  }
  
  const polygonsSize = getFileSizeMB(POLYGONS_FILE);
  const polygonsCount = getLineCount(POLYGONS_FILE);
  
  info(`Polygons: ${polygonsSize} MB, ${polygonsCount.toLocaleString()} features`);
  
  // Check if fixed centroids exists
  if (existsSync(CENTROIDS_FIXED_FILE)) {
    const centroidsFixedSize = getFileSizeMB(CENTROIDS_FIXED_FILE);
    const centroidsFixedCount = getLineCount(CENTROIDS_FIXED_FILE);
    info(`Fixed centroids: ${centroidsFixedSize} MB, ${centroidsFixedCount.toLocaleString()} features (exists, will reuse)`);
  } else {
    const centroidsSize = getFileSizeMB(CENTROIDS_FILE);
    const centroidsCount = getLineCount(CENTROIDS_FILE);
    info(`Centroids: ${centroidsSize} MB, ${centroidsCount.toLocaleString()} features (will fix)`);
  }
}

// Step 3: Fix centroids
function isValidPointCoordinates(coords) {
  if (!Array.isArray(coords)) return false;
  if (coords.length !== 2 && coords.length !== 3) return false;
  for (let i = 0; i < coords.length; i++) {
    const val = coords[i];
    if (typeof val !== 'number' || !isFinite(val)) return false;
  }
  return true;
}

function isValidFeature(feature) {
  if (!feature.geometry) return { valid: false, reason: 'missing geometry' };
  if (feature.geometry.type !== 'Point') return { valid: false, reason: `invalid geometry type: ${feature.geometry.type}` };
  if (!isValidPointCoordinates(feature.geometry.coordinates)) {
    return { valid: false, reason: 'invalid coordinates (must be array of 2 or 3 finite numbers)' };
  }
  return { valid: true };
}

async function fixCentroids() {
  log('\n📋 Step 3: Fixing centroids file...', BLUE);
  
  // Check if fixed file exists and has reasonable count
  if (existsSync(CENTROIDS_FIXED_FILE)) {
    const existingCount = getLineCount(CENTROIDS_FIXED_FILE);
    if (existingCount > 300000) {
      success(`Fixed centroids file exists with ${existingCount.toLocaleString()} features, reusing`);
      return { totalKept: existingCount, totalDropped: 0 };
    } else {
      warn('Fixed centroids file exists but count is low, regenerating...');
    }
  }
  
  const writeStream = createWriteStream(CENTROIDS_FIXED_FILE, { encoding: 'utf-8' });
  
  let totalRead = 0;
  let totalKept = 0;
  let totalDropped = 0;
  
  const fileStream = createReadStream(CENTROIDS_FILE, { encoding: 'utf-8' });
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  return new Promise((resolve, reject) => {
    rl.on('line', (line) => {
      totalRead++;
      
      if (!line.trim()) return;
      
      try {
        const feature = JSON.parse(line);
        const validation = isValidFeature(feature);
        
        if (validation.valid) {
          writeStream.write(line + '\n');
          totalKept++;
        } else {
          totalDropped++;
        }
        
        if (totalRead % 50000 === 0) {
          info(`  Processed ${totalRead.toLocaleString()} lines... (kept: ${totalKept.toLocaleString()}, dropped: ${totalDropped.toLocaleString()})`);
        }
      } catch (e) {
        totalDropped++;
      }
    });
    
    rl.on('close', () => {
      writeStream.end();
      
      writeStream.on('finish', () => {
        success(`Fixed centroids: ${totalKept.toLocaleString()} kept, ${totalDropped.toLocaleString()} dropped`);
        resolve({ totalKept, totalDropped });
      });
      
      writeStream.on('error', reject);
    });
    
    rl.on('error', reject);
  });
}

// Step 4: Generate unique source IDs
// Mapbox requirement: Source IDs must be <= 32 chars and only [A-Za-z0-9_-]
function generateSourceIds() {
  const now = new Date();
  // Format: YYMMDDHHMM (10 chars) + 2 random alphanumeric chars for uniqueness within same minute
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  // Use seconds + 1 random char for uniqueness (ensures uniqueness even if rerun in same minute)
  const randomChar = Math.random().toString(36).substring(2, 3).toUpperCase();
  const runSuffix = `${year}${month}${day}${hour}${minute}${seconds}${randomChar}`; // 13 chars
  
  // Format: ptv1p_YYMMDDHHMMSSX (6 + 13 = 19 chars) - well under 32 char limit
  // Format: ptv1c_YYMMDDHHMMSSX (6 + 13 = 19 chars)
  return {
    polygons: `ptv1p_${runSuffix}`,      // 19 chars
    centroids: `ptv1c_${runSuffix}`       // 19 chars
  };
}

// Step 5: Upload source with error handling
function uploadSource(username, sourceName, filePath) {
  log(`\n📋 Uploading ${sourceName}...`, BLUE);
  
  // AUDIT: Log upload details
  const tokenPrefix = MAPBOX_TOKEN ? MAPBOX_TOKEN.substring(0, 6) + '...' : 'MISSING';
  log(`\n🔍 AUDIT: Upload source details:`, YELLOW);
  log(`   Username: ${username}`, YELLOW);
  log(`   Source ID: ${sourceName} (${sourceName.length} chars)`, YELLOW);
  log(`   File: ${filePath}`, YELLOW);
  log(`   Command: tilesets upload-source ${username} ${sourceName} "${filePath}" --token "${tokenPrefix}"`, YELLOW);
  
  try {
    const output = execSync(
      `tilesets upload-source ${username} ${sourceName} "${filePath}" --token "${MAPBOX_TOKEN}"`,
      { 
        encoding: 'utf-8',
        stdio: 'pipe',
        env: { ...process.env, MAPBOX_ACCESS_TOKEN: MAPBOX_TOKEN }
      }
    );
    
    // Check for scope errors
    if (output.includes('tilesets:write') || output.includes('scope') || output.toLowerCase().includes('permission')) {
      log(`\n🔍 AUDIT: Upload failed with scope error`, RED);
      error('Create a new Mapbox Access Token with Tilesets:Write scope (tilesets:write), export it as MAPBOX_ACCESS_TOKEN, then rerun npm run mts:travis:publish.');
    }
    
    success(`${sourceName} uploaded`);
    log(`\n🔍 AUDIT: Upload succeeded for ${sourceName}`, GREEN);
  } catch (e) {
    const errorMsg = e.message || e.stdout || e.stderr || String(e);
    
    log(`\n🔍 AUDIT: Upload failed for ${sourceName}: ${errorMsg}`, RED);
    
    // Check for scope errors
    if (errorMsg.includes('tilesets:write') || errorMsg.includes('scope') || errorMsg.toLowerCase().includes('permission')) {
      error('Create a new Mapbox Access Token with Tilesets:Write scope (tilesets:write), export it as MAPBOX_ACCESS_TOKEN, then rerun npm run mts:travis:publish.');
    }
    
    // Check for source ID length/format errors
    if (errorMsg.includes('32') || errorMsg.includes('invalid') || errorMsg.includes('characters') || errorMsg.includes('format')) {
      error(`Source ID validation error: ${errorMsg}\nSource ID "${sourceName}" may be invalid. Check length (<=32) and format ([A-Za-z0-9_-] only).`);
    }
    
    error(`Failed to upload ${sourceName}: ${errorMsg}`);
  }
}

// Step 6: Create recipe
function createRecipe(username, sourceIds) {
  log('\n📋 Step 6: Creating tileset recipe...', BLUE);
  
  const recipe = {
    version: 1,
    layers: {
      parcels: {
        source: `mapbox://tileset-source/${username}/${sourceIds.polygons}`,
        minzoom: 0,
        maxzoom: 16
      },
      parcel_centroids: {
        source: `mapbox://tileset-source/${username}/${sourceIds.centroids}`,
        minzoom: 15,
        maxzoom: 16
      },
      parcel_centroids_clustered: {
        source: `mapbox://tileset-source/${username}/${sourceIds.centroids}`,
        minzoom: 0,
        maxzoom: 14,
        features: {
          attributes: {
            set: {
              point_count: 1
            }
          }
        },
        tiles: {
          'tiles.union': [
            {
              group_by: [],
              cluster: true,
              region_count: 64,
              aggregate: {
                point_count: 'sum'
              }
            }
          ]
        }
      }
    }
  };
  
  mkdirSync(dirname(RECIPE_FILE), { recursive: true });
  writeFileSync(RECIPE_FILE, JSON.stringify(recipe, null, 2), 'utf-8');
  success(`Recipe created: ${RECIPE_FILE}`);
}

// Step 7: Create or update tileset
function createOrUpdateTileset(username) {
  log('\n📋 Step 7: Creating/updating tileset...', BLUE);
  
  // Use TILESET_ID override if provided, otherwise default to v1
  const tilesetSuffix = TILESET_ID_OVERRIDE || 'parcels_travis_v1';
  const tilesetId = `${username}.${tilesetSuffix}`;
  
  // Derive tileset name from suffix (v1 -> "v1", v2 -> "v2", etc.)
  const versionMatch = tilesetSuffix.match(/v(\d+)$/);
  const version = versionMatch ? versionMatch[1] : '1';
  const tilesetName = `Travis County Parcels v${version}`;
  
  // AUDIT: Log before tileset command
  const tokenPrefix = MAPBOX_TOKEN ? MAPBOX_TOKEN.substring(0, 6) + '...' : 'MISSING';
  log(`\n🔍 AUDIT: Pre-tileset-command logging:`, YELLOW);
  log(`   Token prefix: ${tokenPrefix}`, YELLOW);
  log(`   Username: ${username}`, YELLOW);
  log(`   Tileset suffix: ${tilesetSuffix}`, YELLOW);
  log(`   Computed tileset ID: ${tilesetId}`, YELLOW);
  log(`   Action: CREATE (will fallback to UPDATE if exists)`, YELLOW);
  log(`   Command: tilesets create ${tilesetId} --recipe "${RECIPE_FILE}" --name "${tilesetName}" --token "${tokenPrefix}"`, YELLOW);
  
  let createSucceeded = false;
  let updateSucceeded = false;
  
  try {
    // Try to create
    const createOutput = execSync(
      `tilesets create ${tilesetId} --recipe "${RECIPE_FILE}" --name "${tilesetName}" --token "${MAPBOX_TOKEN}"`,
      { 
        encoding: 'utf-8',
        stdio: 'pipe',
        env: { ...process.env, MAPBOX_ACCESS_TOKEN: MAPBOX_TOKEN }
      }
    );
    
    // Check for recipe validation errors
    const outputLower = createOutput.toLowerCase();
    if (outputLower.includes('recipe is invalid') || outputLower.includes('invalid recipe') || outputLower.includes('recipe validation')) {
      log(`\n🔍 AUDIT: CREATE failed - Recipe is invalid`, RED);
      log(`Output: ${createOutput}`, RED);
      error(`Recipe validation failed. Check recipe file: ${RECIPE_FILE}`);
    }
    
    // If we got here, creation succeeded
    console.log(createOutput); // Print output for user visibility
    success(`Tileset created: ${tilesetId}`);
    createSucceeded = true;
    log(`\n🔍 AUDIT: CREATE succeeded for ${tilesetId}`, GREEN);
  } catch (e) {
    const errorMsg = e.message || e.stdout || e.stderr || String(e);
    const errorMsgLower = errorMsg.toLowerCase();
    
    // Check for recipe validation errors FIRST (before other error checks)
    if (errorMsgLower.includes('recipe is invalid') || errorMsgLower.includes('invalid recipe') || errorMsgLower.includes('recipe validation')) {
      log(`\n🔍 AUDIT: CREATE failed - Recipe is invalid`, RED);
      log(`Error: ${errorMsg}`, RED);
      error(`Recipe validation failed. Check recipe file: ${RECIPE_FILE}`);
    }
    
    // Check for scope errors
    if (errorMsg.includes('tilesets:write') || errorMsg.includes('scope') || errorMsg.toLowerCase().includes('permission')) {
      log(`\n🔍 AUDIT: CREATE failed with scope error`, RED);
      error('Create a new Mapbox Access Token with Tilesets:Write scope (tilesets:write), export it as MAPBOX_ACCESS_TOKEN, then rerun npm run mts:travis:publish.');
    }
    
    // If exists, update recipe
    if (errorMsg.includes('already exists') || errorMsg.includes('exists')) {
      warn('Tileset exists, updating recipe...');
      log(`\n🔍 AUDIT: CREATE failed (tileset exists), attempting UPDATE`, YELLOW);
      log(`   Command: tilesets update-recipe ${tilesetId} --recipe "${RECIPE_FILE}" --token "${tokenPrefix}"`, YELLOW);
      
      try {
        const updateOutput = execSync(
          `tilesets update-recipe ${tilesetId} --recipe "${RECIPE_FILE}" --token "${MAPBOX_TOKEN}"`,
          { 
            encoding: 'utf-8',
            stdio: 'pipe',
            env: { ...process.env, MAPBOX_ACCESS_TOKEN: MAPBOX_TOKEN }
          }
        );
        
        // Check for recipe validation errors
        const updateOutputLower = updateOutput.toLowerCase();
        if (updateOutputLower.includes('recipe is invalid') || updateOutputLower.includes('invalid recipe') || updateOutputLower.includes('recipe validation')) {
          log(`\n🔍 AUDIT: UPDATE failed - Recipe is invalid`, RED);
          log(`Output: ${updateOutput}`, RED);
          error(`Recipe validation failed. Check recipe file: ${RECIPE_FILE}`);
        }
        
        // If we got here, update succeeded
        console.log(updateOutput); // Print output for user visibility
        success(`Tileset recipe updated: ${tilesetId}`);
        updateSucceeded = true;
        log(`\n🔍 AUDIT: UPDATE succeeded for ${tilesetId}`, GREEN);
      } catch (e2) {
        const errorMsg2 = e2.message || e2.stdout || e2.stderr || String(e2);
        const errorMsg2Lower = errorMsg2.toLowerCase();
        
        // Check for recipe validation errors FIRST
        if (errorMsg2Lower.includes('recipe is invalid') || errorMsg2Lower.includes('invalid recipe') || errorMsg2Lower.includes('recipe validation')) {
          log(`\n🔍 AUDIT: UPDATE failed - Recipe is invalid`, RED);
          log(`Error: ${errorMsg2}`, RED);
          error(`Recipe validation failed. Check recipe file: ${RECIPE_FILE}`);
        }
        
        log(`\n🔍 AUDIT: UPDATE failed: ${errorMsg2}`, RED);
        if (errorMsg2.includes('tilesets:write') || errorMsg2.includes('scope') || errorMsg2.toLowerCase().includes('permission')) {
          error('Create a new Mapbox Access Token with Tilesets:Write scope (tilesets:write), export it as MAPBOX_ACCESS_TOKEN, then rerun npm run mts:travis:publish.');
        }
        error(`Failed to update tileset: ${errorMsg2}`);
      }
    } else {
      log(`\n🔍 AUDIT: CREATE failed with error: ${errorMsg}`, RED);
      error(`Failed to create tileset: ${errorMsg}`);
    }
  }
  
  // AUDIT: Verify operation succeeded
  if (!createSucceeded && !updateSucceeded) {
    log(`\n🔍 AUDIT: CRITICAL - Neither CREATE nor UPDATE succeeded!`, RED);
    error('Tileset creation/update failed silently. Check logs above.');
  }
  
  return tilesetId;
}

// Step 8: Publish tileset
function publishTileset(tilesetId) {
  log('\n📋 Step 8: Publishing tileset...', BLUE);
  
  try {
    execSync(
      `tilesets publish ${tilesetId} --token "${MAPBOX_TOKEN}"`,
      { 
        stdio: 'inherit',
        env: { ...process.env, MAPBOX_ACCESS_TOKEN: MAPBOX_TOKEN }
      }
    );
    success('Publish initiated');
  } catch (e) {
    const errorMsg = e.message || e.stdout || e.stderr || String(e);
    if (errorMsg.includes('tilesets:write') || errorMsg.includes('scope') || errorMsg.toLowerCase().includes('permission')) {
      error('Create a new Mapbox Access Token with Tilesets:Write scope (tilesets:write), export it as MAPBOX_ACCESS_TOKEN, then rerun npm run mts:travis:publish.');
    }
    error(`Failed to publish tileset: ${errorMsg}`);
  }
}

// Step 9: Poll until complete
function waitForComplete(tilesetId) {
  log('\n📋 Step 9: Waiting for tileset to complete...', BLUE);
  log('This may take 10-30 minutes...', YELLOW);
  
  const maxAttempts = 120; // 60 minutes max (30s intervals)
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      const output = execSync(
        `tilesets status ${tilesetId} --token "${MAPBOX_TOKEN}"`,
        { 
          encoding: 'utf-8',
          stdio: 'pipe',
          env: { ...process.env, MAPBOX_ACCESS_TOKEN: MAPBOX_TOKEN }
        }
      );
      
      const statusLower = output.toLowerCase();
      if (statusLower.includes('complete') || statusLower.includes('success') || statusLower.includes('published')) {
        success('Tileset is complete!');
        return true;
      }
      
      if (statusLower.includes('error') || statusLower.includes('failed')) {
        error('Tileset processing failed. Check Mapbox Studio for details.');
      }
      
      attempts++;
      if (attempts % 10 === 0) {
        const statusMatch = output.match(/status[:\s]+(\w+)/i) || output.match(/(processing|queued|complete|failed)/i);
        if (statusMatch) {
          info(`Current status: ${statusMatch[1]} (${attempts * 30}s elapsed)`);
        } else {
          info(`Still processing... (${attempts * 30}s elapsed)`);
        }
      }
      
      execSync('sleep 30', { stdio: 'ignore' });
    } catch (e) {
      attempts++;
      if (attempts % 10 === 0) {
        warn(`Status check failed (attempt ${attempts}), retrying...`);
      }
      execSync('sleep 30', { stdio: 'ignore' });
    }
  }
  
  error('Tileset did not complete within timeout. Check status manually.');
}

// Step 10: Verify tileset exists via tilesets list
function verifyTilesetExists(username, tilesetId) {
  log('\n📋 Step 10: Verifying tileset exists...', BLUE);
  
  try {
    const output = execSync(
      `tilesets list ${username} --token "${MAPBOX_TOKEN}"`,
      { 
        encoding: 'utf-8',
        stdio: 'pipe',
        env: { ...process.env, MAPBOX_ACCESS_TOKEN: MAPBOX_TOKEN }
      }
    );
    
    log(`\n🔍 AUDIT: Tilesets list output:`, YELLOW);
    log(output, YELLOW);
    
    // Parse output to find tileset IDs
    const lines = output.split('\n').filter(line => line.trim());
    const tilesetIds = [];
    
    // Look for tileset IDs in format: username.tileset_name
    for (const line of lines) {
      // Try to match tileset ID pattern (v1 or v2)
      const match = line.match(/([a-zA-Z0-9_-]+\.parcels_travis_v[12])/);
      if (match) {
        tilesetIds.push(match[1]);
      }
      // Also check for full mapbox:// URLs
      const urlMatch = line.match(/mapbox:\/\/([a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/);
      if (urlMatch) {
        tilesetIds.push(urlMatch[1]);
      }
    }
    
    if (tilesetIds.length === 0) {
      // Try parsing JSON if output is JSON
      try {
        const json = JSON.parse(output);
        if (Array.isArray(json)) {
          json.forEach(item => {
            if (item.id) tilesetIds.push(item.id);
            if (item.tileset_id) tilesetIds.push(item.tileset_id);
          });
        } else if (json.tilesets) {
          json.tilesets.forEach(item => {
            if (item.id) tilesetIds.push(item.id);
            if (item.tileset_id) tilesetIds.push(item.tileset_id);
          });
        }
      } catch (e) {
        // Not JSON, continue with text parsing
      }
    }
    
    log(`\n🔍 AUDIT: Found ${tilesetIds.length} tileset(s) in list:`, YELLOW);
    tilesetIds.forEach(id => log(`   - ${id}`, YELLOW));
    
    if (tilesetIds.length === 0) {
      log(`\n🔍 AUDIT: NO TILESETS ACCESSIBLE BY THIS TOKEN`, RED);
      log(`   Token prefix: ${MAPBOX_TOKEN ? MAPBOX_TOKEN.substring(0, 6) + '...' : 'MISSING'}`, RED);
      log(`   Username: ${username}`, RED);
      log(`   Expected tileset: ${tilesetId}`, RED);
      return false;
    }
    
    // Check if our tileset exists
    const found = tilesetIds.some(id => id === tilesetId || id.endsWith(`.${tilesetId.split('.')[1]}`));
    
    if (found) {
      log(`\n🔍 AUDIT: ✅ VERIFIED - Tileset ${tilesetId} exists in list`, GREEN);
      return true;
    } else {
      log(`\n🔍 AUDIT: ⚠️  WARNING - Tileset ${tilesetId} NOT found in list`, YELLOW);
      log(`   Found tilesets: ${tilesetIds.join(', ')}`, YELLOW);
      log(`   Expected: ${tilesetId}`, YELLOW);
      return false;
    }
  } catch (e) {
    const errorMsg = e.message || e.stdout || e.stderr || String(e);
    log(`\n🔍 AUDIT: Failed to list tilesets: ${errorMsg}`, RED);
    log(`   Token prefix: ${MAPBOX_TOKEN ? MAPBOX_TOKEN.substring(0, 6) + '...' : 'MISSING'}`, RED);
    log(`   Username: ${username}`, RED);
    return false;
  }
}

// Step 11: Print final result
function printSuccess(username, tilesetId, verified) {
  log('\n' + '-'.repeat(50), GREEN);
  log('MAPBOX TILESET READY', GREEN);
  log(`Tileset ID: mapbox://${tilesetId}`, GREEN);
  log('Layers:', GREEN);
  log('- parcels', GREEN);
  log('- parcel_centroids', GREEN);
  log('- parcel_centroids_clustered', GREEN);
  log('Status: complete', GREEN);
  log('-'.repeat(50), GREEN);
  log('');
  
  // AUDIT: Final verification output
  if (verified) {
    log(`VERIFIED_TILESET_ID=${tilesetId}`, GREEN);
  } else {
    // Publish succeeded and job completed, but verification failed
    // Print warning instead of NO_TILESET_CREATED
    warn(`⚠️  Verification warning: Could not confirm tileset exists in list`);
    warn(`   Tileset ${tilesetId} was published successfully, but tilesets list failed or did not return expected result.`);
    warn(`   Check Mapbox Studio to confirm: https://studio.mapbox.com/tilesets/`);
    log(`TILESET_ID=${tilesetId}`, YELLOW);
  }
}

// Main execution
async function main() {
  try {
    log('\n🚀 Starting MTS Publish Pipeline for Travis Parcels\n', BLUE);
    
    // Step 1: Validate environment
    const username = validateEnv();
    
    // Step 2: Preflight checks
    preflightChecks(username);
    
    // Step 3: Fix centroids automatically
    await fixCentroids();
    
    // Step 4: Generate unique source IDs (avoids delete confirmations)
    const sourceIds = generateSourceIds();
    log('\n📋 Step 4: Generated unique source IDs...', BLUE);
    info(`Polygons source: ${sourceIds.polygons} (${sourceIds.polygons.length} chars)`);
    info(`Centroids source: ${sourceIds.centroids} (${sourceIds.centroids.length} chars)`);
    
    // AUDIT: Verify source ID format compliance
    log(`\n🔍 AUDIT: Source ID validation:`, YELLOW);
    const polygonsValid = sourceIds.polygons.length <= 32 && /^[A-Za-z0-9_-]+$/.test(sourceIds.polygons);
    const centroidsValid = sourceIds.centroids.length <= 32 && /^[A-Za-z0-9_-]+$/.test(sourceIds.centroids);
    log(`   Polygons ID valid: ${polygonsValid ? '✅' : '❌'} (length: ${sourceIds.polygons.length}, format: ${/^[A-Za-z0-9_-]+$/.test(sourceIds.polygons) ? 'valid' : 'invalid'})`, polygonsValid ? GREEN : RED);
    log(`   Centroids ID valid: ${centroidsValid ? '✅' : '❌'} (length: ${sourceIds.centroids.length}, format: ${/^[A-Za-z0-9_-]+$/.test(sourceIds.centroids) ? 'valid' : 'invalid'})`, centroidsValid ? GREEN : RED);
    
    if (!polygonsValid || !centroidsValid) {
      error('Source ID validation failed. IDs must be <= 32 chars and only contain [A-Za-z0-9_-]');
    }
    
    // Step 5: Upload sources
    log('\n📋 Step 5: Uploading sources...', BLUE);
    uploadSource(username, sourceIds.polygons, POLYGONS_FILE);
    uploadSource(username, sourceIds.centroids, CENTROIDS_FIXED_FILE);
    
    // Step 6: Create recipe
    createRecipe(username, sourceIds);
    
    // Step 7: Create or update tileset
    const tilesetId = createOrUpdateTileset(username);
    
    // Step 8: Publish
    publishTileset(tilesetId);
    
    // Step 9: Wait for completion
    waitForComplete(tilesetId);
    
    // Step 10: Verify tileset exists
    const verified = verifyTilesetExists(username, tilesetId);
    
    // Step 11: Print success
    printSuccess(username, tilesetId, verified);
    
  } catch (error) {
    log(`\n❌ Pipeline failed: ${error.message}`, RED);
    process.exit(1);
  }
}

main();
