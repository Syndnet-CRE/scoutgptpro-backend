/**
 * Load Travis County Parcels from StratMap Shapefile into PostGIS
 * 
 * ⚠️  DEPRECATED: This Node.js loader has CRS issues and produces incorrect coordinates.
 * 
 * Use ogr2ogr-based reload instead:
 *   npm run reload:parcels:travis:ogr
 * 
 * This script will refuse to run unless --forceNode=true is passed.
 * 
 * Original mapping (BROKEN):
 * - Prop_ID → parcel_id (TEXT)
 * - Geometry: SRID 2276 → 4326, promoted to MultiPolygon
 * 
 * Usage (DEPRECATED):
 *   npm run load:parcels:travis -- --forceNode=true
 *   npm run load:parcels:travis -- --forceNode=true --batchSize=500 --limit=1000 --dryRun=true
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import shapefile from 'shapefile';

// Load environment variables (same logic as export script)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env');
const envLocalPath = join(__dirname, '../.env.local');

// Initialize database URL with smart env detection
async function initDbUrl() {
  // Load .env first (production/fallback)
  dotenv.config({ path: envPath });
  const prodDbUrl = process.env.DATABASE_URL;

  // Try .env.local if it exists
  if (existsSync(envLocalPath)) {
    console.log('📁 Found .env.local, checking if parcels_travis table exists...');
    dotenv.config({ path: envLocalPath, override: true });
    const localDbUrl = process.env.DATABASE_URL;
    
    if (localDbUrl) {
      try {
        const testPool = new Pool({ connectionString: localDbUrl, max: 1 });
        const tableCheck = await testPool.query(`
          SELECT 1 FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'parcels_travis'
          LIMIT 1
        `);
        await testPool.end();
        
        if (tableCheck.rows.length > 0) {
          console.log('✅ parcels_travis table found in .env.local database');
          return { dbUrl: localDbUrl, envSource: '.env.local' };
        } else {
          console.log('⚠️  parcels_travis table not found in .env.local database, using .env');
          dotenv.config({ path: envPath, override: true });
          return { dbUrl: prodDbUrl, envSource: '.env' };
        }
      } catch (err) {
        console.log(`⚠️  Error checking .env.local database: ${err.message}, using .env`);
        dotenv.config({ path: envPath, override: true });
        return { dbUrl: prodDbUrl, envSource: '.env' };
      }
    } else {
      dotenv.config({ path: envPath, override: true });
      return { dbUrl: prodDbUrl, envSource: '.env' };
    }
  } else {
    console.log('📁 Loading environment from .env (no .env.local found)');
    return { dbUrl: prodDbUrl, envSource: '.env' };
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name, defaultValue) => {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : defaultValue;
};

const FORCE_NODE = getArg('forceNode', 'false') === 'true';
const TRUNCATE_FIRST = getArg('truncateFirst', 'false') === 'true';
const VERIFY = getArg('verify', 'true') === 'true';
const BATCH_SIZE = parseInt(getArg('batchSize', '1000'), 10);
const LIMIT = getArg('limit') ? parseInt(getArg('limit'), 10) : null;
const DRY_RUN = getArg('dryRun', 'false') === 'true';

// Check if user explicitly forced Node.js loader
if (!FORCE_NODE) {
  console.error('');
  console.error('⚠️  ⚠️  ⚠️  DEPRECATED LOADER ⚠️  ⚠️  ⚠️');
  console.error('');
  console.error('This Node.js loader has CRS issues and produces incorrect coordinates.');
  console.error('The shapefile .prj is not properly respected, resulting in wrong coordinates.');
  console.error('');
  console.error('✅ RECOMMENDED: Use ogr2ogr-based reload instead:');
  console.error('   npm run reload:parcels:travis:ogr');
  console.error('');
  console.error('If you must use this loader (not recommended), pass:');
  console.error('   npm run load:parcels:travis -- --forceNode=true');
  console.error('');
  process.exit(1);
}

console.warn('');
console.warn('⚠️  WARNING: Using deprecated Node.js loader with known CRS issues.');
console.warn('   Coordinates may be incorrect. Use ogr2ogr reload instead.');
console.warn('');

const SHAPEFILE_PATH = join(__dirname, '../data/shapefiles/land_parcels/stratmap24-landparcels_48453_travis_202404.shp');
const REPORT_PATH = join(__dirname, '../dist/parcels-travis-load-report.json');

// Stats tracking
const stats = {
  totalRead: 0,
  inserted: 0,
  skipped: 0,
  invalid: 0,
  nullParcelId: 0,
  errors: [],
  startTime: Date.now(),
  batches: []
};

// Check if ogr2ogr is available
function checkOgr2ogr() {
  try {
    execSync('which ogr2ogr', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

// Option B: Load using Node.js + shapefile (primary implementation)
async function loadWithNodeJs(dbUrl, envSource) {
  console.log('🚀 Using Node.js shapefile reader for controlled load...\n');
  
  if (!existsSync(SHAPEFILE_PATH)) {
    throw new Error(`Shapefile not found: ${SHAPEFILE_PATH}`);
  }
  
  const pool = new Pool({
    connectionString: dbUrl,
    max: 10
  });
  
  try {
    // Verify table exists
    const tableCheck = await pool.query(`
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'parcels_travis'
      LIMIT 1
    `);
    
    if (tableCheck.rows.length === 0) {
      throw new Error('parcels_travis table does not exist. Run migration first.');
    }
    
    // Truncate if requested
    if (TRUNCATE_FIRST && !DRY_RUN) {
      console.log('⚠️  TRUNCATING parcels_travis (truncateFirst=true)...');
      await pool.query('TRUNCATE TABLE parcels_travis');
      console.log('✅ Truncated\n');
    }
    
    console.log(`📂 Reading shapefile: ${SHAPEFILE_PATH}`);
    console.log(`⚙️  Batch size: ${BATCH_SIZE}`);
    console.log(`⚙️  Limit: ${LIMIT || 'none (all records)'}`);
    console.log(`⚙️  Dry run: ${DRY_RUN ? 'YES (no inserts)' : 'NO (will insert)'}`);
    console.log(`⚙️  Truncate first: ${TRUNCATE_FIRST}`);
    console.log(`⚙️  Verify: ${VERIFY}`);
    console.log(`⚙️  CRS: EPSG:3857 (Web Mercator) → EPSG:4326 (WGS84)\n`);
    
    const source = await shapefile.open(SHAPEFILE_PATH);
    let batch = [];
    let batchNum = 0;
    const sampleParcelIds = [];
    
    while (true) {
      const result = await source.read();
      if (result.done) break;
      
      const feature = result.value;
      const props = feature.properties || {};
      const parcelId = props.Prop_ID || props.PROP_ID;
      
      // Skip if no parcel ID
      if (!parcelId) {
        stats.nullParcelId++;
        continue;
      }
      
      // Convert to string
      const parcelIdStr = String(parcelId).trim();
      if (!parcelIdStr) {
        stats.nullParcelId++;
        continue;
      }
      
      stats.totalRead++;
      
      // Convert geometry to GeoJSON
      const geomJson = feature.geometry;
      if (!geomJson || !geomJson.coordinates) {
        stats.invalid++;
        continue;
      }
      
      batch.push({
        parcel_id: parcelIdStr,
        geometry: JSON.stringify(geomJson)
      });
      
      // Collect sample parcel IDs
      if (sampleParcelIds.length < 5) {
        sampleParcelIds.push(parcelIdStr);
      }
      
      // Process batch when full
      if (batch.length >= BATCH_SIZE) {
        await processBatch(pool, batch, batchNum++);
        batch = [];
      }
      
      // Check limit
      if (LIMIT && stats.totalRead >= LIMIT) {
        console.log(`\n⚠️  Reached limit of ${LIMIT} records`);
        break;
      }
    }
    
    // Process remaining batch
    if (batch.length > 0) {
      await processBatch(pool, batch, batchNum++);
    }
    
    // Print final stats
    printFinalStats(sampleParcelIds);
    
    // Write report
    writeReport(envSource);
    
    // Run verification if requested
    if (VERIFY && !DRY_RUN && stats.inserted > 0) {
      await verifyCoordinates(pool);
    }
    
  } finally {
    await pool.end();
  }
}

// Process a batch of features
async function processBatch(pool, batch, batchNum) {
  const batchStart = Date.now();
  let batchInserted = 0;
  let batchSkipped = 0;
  let batchInvalid = 0;
  
  if (DRY_RUN) {
    console.log(`[Batch ${batchNum + 1}] DRY RUN: Would insert ${batch.length} features`);
    stats.inserted += batch.length; // Count as would-be inserts
    return;
  }
  
  // Build batch insert query
  const values = [];
  const params = [];
  let paramIndex = 1;
  
  for (const feature of batch) {
    // Transform: GeoJSON -> Geometry (SRID 3857 Web Mercator) -> Transform to 4326 -> Make Valid -> Ensure MultiPolygon
    values.push(`($${paramIndex}, ST_Multi(ST_MakeValid(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($${paramIndex + 1}::jsonb), 3857), 4326))))`);
    params.push(feature.parcel_id, feature.geometry);
    paramIndex += 2;
  }
  
  const query = `
    INSERT INTO parcels_travis (parcel_id, geom)
    VALUES ${values.join(', ')}
    ON CONFLICT (parcel_id) DO NOTHING
    RETURNING parcel_id;
  `;
  
  // Log SQL for debugging (first batch only, redacted)
  if (batchNum === 0 && !DRY_RUN) {
    // Show first value clause with placeholders
    const firstValue = values[0] || '';
    console.log(`[DEBUG] First VALUES clause: ${firstValue.substring(0, 200)}...`);
    console.log(`[DEBUG] Total VALUES clauses: ${values.length}`);
    console.log(`[DEBUG] Total params: ${params.length}`);
  }
  
  try {
    const result = await pool.query(query, params);
    batchInserted = result.rows.length;
    batchSkipped = batch.length - batchInserted;
    
    stats.inserted += batchInserted;
    stats.skipped += batchSkipped;
    
    const elapsed = ((Date.now() - batchStart) / 1000).toFixed(2);
    const rate = batchInserted > 0 ? (batchInserted / (elapsed / 60)).toFixed(0) : 0;
    
    console.log(
      `[Batch ${batchNum + 1}] Inserted: ${batchInserted}, Skipped: ${batchSkipped}, ` +
      `Elapsed: ${elapsed}s, Rate: ${rate} rows/min`
    );
    
    stats.batches.push({
      batchNum: batchNum + 1,
      inserted: batchInserted,
      skipped: batchSkipped,
      elapsed: parseFloat(elapsed),
      rate: parseFloat(rate)
    });
    
  } catch (error) {
    console.error(`\n❌ Error in batch ${batchNum + 1}:`, error.message);
    stats.errors.push({
      batch: batchNum + 1,
      error: error.message,
      count: batch.length
    });
    
    // Try individual inserts to identify problematic records
    console.log(`   Attempting individual inserts for batch ${batchNum + 1}...`);
    for (const feature of batch) {
      try {
        const result = await pool.query(`
          INSERT INTO parcels_travis (parcel_id, geom)
          VALUES ($1, ST_Multi(ST_MakeValid(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($2::jsonb), 3857), 4326))))
          ON CONFLICT (parcel_id) DO NOTHING
          RETURNING parcel_id;
        `, [feature.parcel_id, feature.geometry]);
        
        if (result.rows.length > 0) {
          batchInserted++;
          stats.inserted++;
        } else {
          batchSkipped++;
          stats.skipped++;
        }
      } catch (e) {
        batchInvalid++;
        stats.invalid++;
        console.error(`   ⚠️  Failed to insert parcel_id ${feature.parcel_id}: ${e.message}`);
      }
    }
  }
}

// Print final statistics
function printFinalStats(sampleParcelIds) {
  const totalTime = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(2);
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 LOAD SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total features read:     ${stats.totalRead.toLocaleString()}`);
  console.log(`Inserted:                ${stats.inserted.toLocaleString()}`);
  console.log(`Skipped (already exist): ${stats.skipped.toLocaleString()}`);
  console.log(`Invalid geometries:      ${stats.invalid.toLocaleString()}`);
  console.log(`Null parcel IDs:         ${stats.nullParcelId.toLocaleString()}`);
  console.log(`Errors:                  ${stats.errors.length}`);
  console.log(`Total time:              ${totalTime} minutes`);
  
  if (sampleParcelIds.length > 0) {
    console.log(`\nSample parcel_ids inserted:`);
    sampleParcelIds.forEach((id, i) => {
      console.log(`  ${i + 1}. ${id} (length: ${id.length})`);
    });
  }
  
  if (stats.errors.length > 0) {
    console.log(`\n⚠️  Errors encountered:`);
    stats.errors.forEach((err, i) => {
      console.log(`  ${i + 1}. Batch ${err.batch}: ${err.error}`);
    });
  }
  
  console.log('='.repeat(60));
}

// Write load report
function writeReport(envSource) {
  const reportDir = dirname(REPORT_PATH);
  mkdirSync(reportDir, { recursive: true });
  
  const report = {
    timestamp: new Date().toISOString(),
    shapefile: SHAPEFILE_PATH,
    database: envSource,
    dryRun: DRY_RUN,
    batchSize: BATCH_SIZE,
    limit: LIMIT,
    stats: {
      ...stats,
      totalTimeMinutes: ((Date.now() - stats.startTime) / 1000 / 60).toFixed(2)
    }
  };
  
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n📄 Report written to: ${REPORT_PATH}`);
}

// Verify coordinates are correct (Travis County range)
async function verifyCoordinates(pool) {
  console.log('\n' + '='.repeat(60));
  console.log('✅ VERIFICATION');
  console.log('='.repeat(60));
  
  // Count
  const countResult = await pool.query('SELECT COUNT(*) as cnt FROM parcels_travis');
  const count = parseInt(countResult.rows[0].cnt, 10);
  console.log(`Total parcels: ${count.toLocaleString()}`);
  
  if (count < 300000) {
    console.error(`\n❌ FAIL: Count too low (< 300,000): ${count}`);
    process.exit(1);
  }
  console.log('✅ Count check passed');
  console.log('');
  
  // Bbox
  const bboxResult = await pool.query(`
    SELECT 
      round(ST_XMin(e)::numeric, 6) AS west,
      round(ST_YMin(e)::numeric, 6) AS south,
      round(ST_XMax(e)::numeric, 6) AS east,
      round(ST_YMax(e)::numeric, 6) AS north
    FROM (SELECT ST_Extent(geom) AS e FROM parcels_travis) t;
  `);
  
  const bbox = bboxResult.rows[0];
  console.log('Bounding box:');
  console.log(`  west=${bbox.west}, south=${bbox.south}, east=${bbox.east}, north=${bbox.north}`);
  
  // Check bbox ranges
  const westOk = bbox.west >= -99 && bbox.west <= -96;
  const eastOk = bbox.east >= -99 && bbox.east <= -96;
  const southOk = bbox.south >= 29 && bbox.south <= 32;
  const northOk = bbox.north >= 29 && bbox.north <= 32;
  
  if (!westOk || !eastOk || !southOk || !northOk) {
    console.error('\n❌ FAIL: Bbox not in Travis County range');
    console.error(`  Expected: lon between -99 and -96, lat between 29 and 32`);
    console.error(`  Got: west=${bbox.west}, east=${bbox.east}, south=${bbox.south}, north=${bbox.north}`);
    process.exit(1);
  }
  console.log('✅ Bbox check passed (Travis County range)');
  console.log('');
  
  // Sample centroids
  const centroidResult = await pool.query(`
    SELECT 
      parcel_id,
      round(ST_X(ST_PointOnSurface(geom))::numeric, 6) as lon,
      round(ST_Y(ST_PointOnSurface(geom))::numeric, 6) as lat
    FROM parcels_travis 
    LIMIT 5;
  `);
  
  console.log('Sample centroids (first 5):');
  let validCentroids = 0;
  for (const row of centroidResult.rows) {
    const lonOk = row.lon >= -99 && row.lon <= -96;
    const latOk = row.lat >= 29 && row.lat <= 32;
    const status = (lonOk && latOk) ? '✅' : '❌';
    console.log(`  ${status} ${row.parcel_id}: lon=${row.lon}, lat=${row.lat}`);
    if (lonOk && latOk) validCentroids++;
  }
  
  if (validCentroids < 3) {
    console.error(`\n❌ FAIL: Only ${validCentroids} out of 5 centroids in correct range`);
    console.error(`  Expected: lon between -99 and -96, lat between 29 and 32`);
    process.exit(1);
  }
  console.log(`✅ Centroid check passed (${validCentroids}/5 in Travis County range)`);
  console.log('='.repeat(60));
  console.log('✅ All verification checks passed!');
  console.log('='.repeat(60));
  console.log('');
}

// Main execution
async function main() {
  console.log('🚀 Travis Parcel Loader\n');
  
  // Initialize database URL
  const dbConfig = await initDbUrl();
  
  if (!dbConfig.dbUrl) {
    console.error('❌ ERROR: DATABASE_URL not found in environment');
    process.exit(1);
  }
  
  console.log(`🔗 Database: ${dbConfig.envSource}`);
  
  // Check for ogr2ogr, but use Node.js for better control
  const hasOgr2ogr = checkOgr2ogr();
  if (hasOgr2ogr) {
    console.log('✅ ogr2ogr detected, but using Node.js for better error handling\n');
  }
  
  // Always use Node.js implementation for better control and error handling
  await loadWithNodeJs(dbConfig.dbUrl, dbConfig.envSource);
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
