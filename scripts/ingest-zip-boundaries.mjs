import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env from backend root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;

async function ingestZipBoundaries() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🚀 Starting ZIP boundary ingestion...');

    // Step 1: Create table
    console.log('📋 Creating zip_boundaries table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS zip_boundaries (
        zcta5 TEXT PRIMARY KEY,
        geom GEOMETRY(MultiPolygon, 4326),
        aland BIGINT,
        awater BIGINT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_zip_boundaries_geom ON zip_boundaries USING GIST(geom);
      CREATE INDEX IF NOT EXISTS idx_zip_boundaries_zcta5 ON zip_boundaries(zcta5);
    `);
    console.log('✅ Table created/verified');

    // Step 2: Load GeoJSON
    const geojsonPath = path.join(__dirname, 'data/texas_zcta.geojson');
    if (!fs.existsSync(geojsonPath)) {
      console.error('❌ GeoJSON file not found at:', geojsonPath);
      process.exit(1);
    }

    console.log('📂 Loading GeoJSON file...');
    const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
    console.log(`📊 Found ${geojson.features.length} ZIP boundaries`);

    // Step 3: Insert boundaries
    console.log('💾 Inserting ZIP boundaries...');
    let inserted = 0;
    let skipped = 0;

    for (const feature of geojson.features) {
      const zcta5 = feature.properties.ZCTA5CE20;
      
      if (!zcta5) {
        skipped++;
        continue;
      }

      try {
        await pool.query(`
          INSERT INTO zip_boundaries (zcta5, geom, aland, awater)
          VALUES (
            $1,
            ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)),
            $3,
            $4
          )
          ON CONFLICT (zcta5) DO UPDATE SET
            geom = EXCLUDED.geom,
            aland = EXCLUDED.aland,
            awater = EXCLUDED.awater
        `, [
          zcta5,
          JSON.stringify(feature.geometry),
          feature.properties.ALAND20 || 0,
          feature.properties.AWATER20 || 0
        ]);
        inserted++;
        
        if (inserted % 100 === 0) {
          console.log(`  Inserted ${inserted} boundaries...`);
        }
      } catch (err) {
        console.error(`  Error inserting ZIP ${zcta5}:`, err.message);
        skipped++;
      }
    }

    console.log(`\n✅ Ingestion complete!`);
    console.log(`   Inserted: ${inserted}`);
    console.log(`   Skipped: ${skipped}`);

    // Step 4: Verify
    const countResult = await pool.query('SELECT COUNT(*) FROM zip_boundaries');
    console.log(`\n📊 Total rows in zip_boundaries: ${countResult.rows[0].count}`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

ingestZipBoundaries().catch(console.error);
