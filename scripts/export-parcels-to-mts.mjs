/**
 * Export Travis County Parcels to Mapbox Tiling Service (MTS) Format
 * 
 * This script exports parcels_travis table to NDJSON format for MTS upload.
 * 
 * Outputs:
 * - dist/mts/parcels_travis_v1.polygons.ndjson
 * - dist/mts/parcels_travis_v1.centroids.ndjson
 * - dist/mts/manifest.json
 * 
 * Feature properties (ONLY these 3 fields):
 * - parcelId: string (from parcels_travis.parcel_id)
 * - hasProperty: boolean (EXISTS check on properties table)
 * - motivationScore: number | null (from properties.motivationScore)
 * 
 * Usage:
 *   npm run export:parcels:travis
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

// Load environment variables
// Strategy: Try .env.local first, but verify parcels_travis table exists.
// If table doesn't exist, fall back to .env (production)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env');
const envLocalPath = join(__dirname, '../.env.local');
const { existsSync } = await import('fs');

let dbUrl = null;
let envSource = '';

// Load .env first (production/fallback)
dotenv.config({ path: envPath });
const prodDbUrl = process.env.DATABASE_URL;

// Try .env.local if it exists
if (existsSync(envLocalPath)) {
  console.log('📁 Found .env.local, checking if parcels_travis table exists...');
  dotenv.config({ path: envLocalPath, override: true });
  const localDbUrl = process.env.DATABASE_URL;
  
  // Verify table exists in .env.local database
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
        dbUrl = localDbUrl;
        envSource = '.env.local';
      } else {
        console.log('⚠️  parcels_travis table not found in .env.local database, using .env');
        // Restore .env values
        dotenv.config({ path: envPath, override: true });
        dbUrl = prodDbUrl;
        envSource = '.env';
      }
    } catch (err) {
      console.log(`⚠️  Error checking .env.local database: ${err.message}, using .env`);
      // Restore .env values
      dotenv.config({ path: envPath, override: true });
      dbUrl = prodDbUrl;
      envSource = '.env';
    }
  } else {
    // No DATABASE_URL in .env.local, use .env
    dotenv.config({ path: envPath, override: true });
    dbUrl = prodDbUrl;
    envSource = '.env';
  }
} else {
  console.log('📁 Loading environment from .env (no .env.local found)');
  dbUrl = prodDbUrl;
  envSource = '.env';
}

// Log DATABASE_URL info (redacted)
if (dbUrl) {
  const url = dbUrl;
  const hostMatch = url.match(/@([^:]+):/);
  const dbMatch = url.match(/\/([^?]+)/);
  const hasQuery = url.includes('?');
  console.log(`🔗 DATABASE_URL (from ${envSource}): host=${hostMatch?.[1] || 'unknown'}, database=${dbMatch?.[1] || 'unknown'}, hasQueryParams=${hasQuery}`);
} else {
  console.error('❌ ERROR: DATABASE_URL not found in environment');
  process.exit(1);
}

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: dbUrl,
  max: 5
});

// Output directory
const OUTPUT_DIR = join(__dirname, '../dist/mts');
const VERSION = 'v1';

// Ensure output directory exists
mkdirSync(OUTPUT_DIR, { recursive: true });

// Get git SHA for manifest
function getGitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch (e) {
    return 'unknown';
  }
}

// Convert PostGIS geometry to GeoJSON
function geomToGeoJSON(geom) {
  if (!geom) return null;
  
  // Prisma returns PostGIS geometry as hex WKB or GeoJSON string
  // Use ST_AsGeoJSON to convert
  return JSON.parse(geom);
}

async function exportParcels() {
  console.log('🚀 Starting MTS Parcel Export...\n');
  console.log(`📁 Output directory: ${OUTPUT_DIR}\n`);

  const startTime = Date.now();
  const manifest = {
    version: {
      timestampIso: new Date().toISOString(),
      gitShaShort: getGitSha()
    },
    srid: 4326,
    bbox: null,
    counts: {
      polygons_total: 0,
      centroids_total: 0,
      polygons_written: 0,
      centroids_written: 0,
      null_parcelId: 0,
      invalid_geom: 0
    },
    schema: {
      properties: ['parcelId', 'hasProperty', 'motivationScore'],
      layers: ['parcels', 'parcel_centroids']
    },
    notes: []
  };

  try {
    // Step 1: Get total count and bbox
    console.log('📊 Querying parcels_travis table...');
    const countResult = await pool.query(`
      SELECT 
        COUNT(*)::int as total,
        ST_XMin(ST_Extent(geom)) as minx,
        ST_YMin(ST_Extent(geom)) as miny,
        ST_XMax(ST_Extent(geom)) as maxx,
        ST_YMax(ST_Extent(geom)) as maxy
      FROM parcels_travis
      WHERE geom IS NOT NULL;
    `);
    
    const stats = countResult.rows[0];
    manifest.counts.polygons_total = stats.total || 0;
    manifest.bbox = stats.minx !== null ? [
      parseFloat(stats.minx),
      parseFloat(stats.miny),
      parseFloat(stats.maxx),
      parseFloat(stats.maxy)
    ] : null;

    console.log(`✅ Found ${manifest.counts.polygons_total} parcels`);
    console.log(`📦 Bbox: ${manifest.bbox ? JSON.stringify(manifest.bbox) : 'N/A'}\n`);

    // Step 2: Check if motivationScore exists in properties table
    const motivationScoreCheck = await pool.query(`
      SELECT COUNT(*)::int as count
      FROM properties
      WHERE "motivationScore" IS NOT NULL
      LIMIT 1;
    `);
    const hasMotivationScore = (motivationScoreCheck.rows[0]?.count || 0) > 0;
    
    if (!hasMotivationScore) {
      manifest.notes.push('motivationScore defaulted to 0 because no source column found in properties table');
    }

    // Step 3: Export polygons with properties join
    console.log('📝 Exporting polygons to NDJSON...');
    const polygonsPath = join(OUTPUT_DIR, `parcels_travis_${VERSION}.polygons.ndjson`);
    // Clear file if exists
    writeFileSync(polygonsPath, '', 'utf8');
    let polygonsWritten = 0;
    let nullParcelIdCount = 0;
    let invalidGeomCount = 0;

    // Query in batches to avoid memory issues
    const BATCH_SIZE = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await pool.query(`
        SELECT 
          pt.parcel_id::text as "parcelId",
          ST_AsGeoJSON(pt.geom)::jsonb as geometry,
          EXISTS(
            SELECT 1 FROM properties p WHERE p."parcelId" = pt.parcel_id::text
          ) as "hasProperty",
          COALESCE(p."motivationScore", 0)::int as "motivationScore"
        FROM parcels_travis pt
        LEFT JOIN properties p ON p."parcelId" = pt.parcel_id::text
        WHERE pt.geom IS NOT NULL
        ORDER BY pt.parcel_id
        LIMIT $1 OFFSET $2;
      `, [BATCH_SIZE, offset]);

      const batch = result.rows;

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      const lines = [];
      for (const row of batch) {
        // Column names are preserved from query aliases
        const parcelId = row.parcelId;
        const geometry = row.geometry;
        const hasProperty = row.hasProperty;
        const motivationScore = row.motivationScore;

        if (!parcelId) {
          nullParcelIdCount++;
          continue;
        }

        if (!geometry) {
          invalidGeomCount++;
          continue;
        }

        const feature = {
          type: 'Feature',
          geometry: geometry,
          properties: {
            parcelId: String(parcelId),
            hasProperty: Boolean(hasProperty),
            motivationScore: motivationScore !== null ? parseInt(motivationScore) : null
          }
        };

        lines.push(JSON.stringify(feature));
        polygonsWritten++;
      }

      // Append to file
      if (lines.length > 0) {
        const content = lines.join('\n') + '\n';
        appendFileSync(polygonsPath, content, 'utf8');
      }

      offset += BATCH_SIZE;
      hasMore = batch.length === BATCH_SIZE;
      
      if (offset % 10000 === 0) {
        console.log(`  Processed ${offset} parcels...`);
      }
    }

    manifest.counts.polygons_written = polygonsWritten;
    manifest.counts.null_parcelId = nullParcelIdCount;
    manifest.counts.invalid_geom = invalidGeomCount;

    console.log(`✅ Wrote ${polygonsWritten} polygon features\n`);

    // Step 4: Export centroids
    console.log('📝 Exporting centroids to NDJSON...');
    const centroidsPath = join(OUTPUT_DIR, `parcels_travis_${VERSION}.centroids.ndjson`);
    // Clear file if exists
    writeFileSync(centroidsPath, '', 'utf8');
    let centroidsWritten = 0;

    offset = 0;
    hasMore = true;

    while (hasMore) {
      const result = await pool.query(`
        SELECT 
          pt.parcel_id::text as "parcelId",
          ST_AsGeoJSON(ST_PointOnSurface(pt.geom))::jsonb as geometry,
          EXISTS(
            SELECT 1 FROM properties p WHERE p."parcelId" = pt.parcel_id::text
          ) as "hasProperty",
          COALESCE(p."motivationScore", 0)::int as "motivationScore"
        FROM parcels_travis pt
        LEFT JOIN properties p ON p."parcelId" = pt.parcel_id::text
        WHERE pt.geom IS NOT NULL
        ORDER BY pt.parcel_id
        LIMIT $1 OFFSET $2;
      `, [BATCH_SIZE, offset]);

      const batch = result.rows;

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      const lines = [];
      for (const row of batch) {
        // Column names are preserved from query aliases
        const parcelId = row.parcelId;
        const geometry = row.geometry;
        const hasProperty = row.hasProperty;
        const motivationScore = row.motivationScore;

        if (!parcelId || !geometry) {
          continue;
        }

        const feature = {
          type: 'Feature',
          geometry: geometry,
          properties: {
            parcelId: String(parcelId),
            hasProperty: Boolean(hasProperty),
            motivationScore: motivationScore !== null ? parseInt(motivationScore) : null
          }
        };

        lines.push(JSON.stringify(feature));
        centroidsWritten++;
      }

      if (lines.length > 0) {
        const content = lines.join('\n') + '\n';
        appendFileSync(centroidsPath, content, 'utf8');
      }

      offset += BATCH_SIZE;
      hasMore = batch.length === BATCH_SIZE;
      
      if (offset % 10000 === 0) {
        console.log(`  Processed ${offset} centroids...`);
      }
    }

    manifest.counts.centroids_total = centroidsWritten;
    manifest.counts.centroids_written = centroidsWritten;

    console.log(`✅ Wrote ${centroidsWritten} centroid features\n`);

    // Step 5: Write manifest
    const manifestPath = join(OUTPUT_DIR, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`✅ Wrote manifest to ${manifestPath}\n`);

    // Step 6: Print summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('📊 Export Summary:');
    console.log(`  Duration: ${duration}s`);
    console.log(`  Polygons: ${manifest.counts.polygons_written} / ${manifest.counts.polygons_total}`);
    console.log(`  Centroids: ${manifest.counts.centroids_written} / ${manifest.counts.centroids_total}`);
    console.log(`  Null parcelId: ${manifest.counts.null_parcelId}`);
    console.log(`  Invalid geom: ${manifest.counts.invalid_geom}`);
    console.log(`  Bbox: ${manifest.bbox ? JSON.stringify(manifest.bbox) : 'N/A'}`);
    console.log(`  Notes: ${manifest.notes.length > 0 ? manifest.notes.join('; ') : 'None'}\n`);

    console.log('✅ Export complete!\n');

  } catch (error) {
    console.error('❌ Export failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run export
exportParcels().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

