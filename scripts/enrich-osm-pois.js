/**
 * Enrich OSM POIs with nearest property data
 * Links each POI to the nearest property within 50 meters
 * 
 * Usage: node scripts/enrich-osm-pois.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function enrichPOIs() {
  const client = await pool.connect();
  
  try {
    console.log('=== OSM POI Enrichment Script ===\n');
    
    // Get all POIs without property_id
    const poisResult = await client.query(`
      SELECT id, osm_id, name, latitude, longitude 
      FROM osm_pois_travis 
      WHERE property_id IS NULL
    `);
    
    console.log(`Found ${poisResult.rows.length} POIs to enrich\n`);
    
    let linked = 0;
    let notFound = 0;
    
    for (const poi of poisResult.rows) {
      // Find nearest property within 50 meters using latitude/longitude
      const propertyResult = await client.query(`
        SELECT 
          id,
          "siteAddress",
          ST_Distance(
            ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) as distance_meters
        FROM properties
        WHERE latitude IS NOT NULL 
          AND longitude IS NOT NULL
          AND ST_DWithin(
            ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            50
          )
        ORDER BY distance_meters
        LIMIT 1
      `, [poi.longitude, poi.latitude]);
      
      if (propertyResult.rows.length > 0) {
        const property = propertyResult.rows[0];
        
        // Update POI with property_id
        await client.query(`
          UPDATE osm_pois_travis 
          SET property_id = $1, updated_at = NOW()
          WHERE id = $2
        `, [property.id, poi.id]);
        
        linked++;
        console.log(`✅ ${poi.name} → ${property.siteAddress} (${Math.round(property.distance_meters)}m)`);
      } else {
        notFound++;
        console.log(`❌ ${poi.name} - no property within 50m`);
      }
    }
    
    console.log(`\n=== Summary ===`);
    console.log(`Linked: ${linked}`);
    console.log(`Not found: ${notFound}`);
    console.log(`Total: ${poisResult.rows.length}`);
    
    // Show stats
    const statsResult = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(property_id) as linked,
        COUNT(*) - COUNT(property_id) as unlinked
      FROM osm_pois_travis
    `);
    
    console.log(`\nDatabase stats:`, statsResult.rows[0]);
    
  } catch (err) {
    console.error('Error:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

enrichPOIs();

