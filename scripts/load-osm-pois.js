/**
 * Load OSM POIs into Neon database
 * Usage: node scripts/load-osm-pois.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Travis County bounding box (approximate)
const TRAVIS_COUNTY_BBOX = {
  south: 30.0,
  west: -98.2,
  north: 30.7,
  east: -97.3
};

// Overpass API query for self storage
const OVERPASS_QUERY = `
[out:json][timeout:60];
(
  // Self storage tagged explicitly
  node["self_storage"="yes"](${TRAVIS_COUNTY_BBOX.south},${TRAVIS_COUNTY_BBOX.west},${TRAVIS_COUNTY_BBOX.north},${TRAVIS_COUNTY_BBOX.east});
  way["self_storage"="yes"](${TRAVIS_COUNTY_BBOX.south},${TRAVIS_COUNTY_BBOX.west},${TRAVIS_COUNTY_BBOX.north},${TRAVIS_COUNTY_BBOX.east});
  
  // Storage rental
  node["amenity"="storage_rental"](${TRAVIS_COUNTY_BBOX.south},${TRAVIS_COUNTY_BBOX.west},${TRAVIS_COUNTY_BBOX.north},${TRAVIS_COUNTY_BBOX.east});
  way["amenity"="storage_rental"](${TRAVIS_COUNTY_BBOX.south},${TRAVIS_COUNTY_BBOX.west},${TRAVIS_COUNTY_BBOX.north},${TRAVIS_COUNTY_BBOX.east});
  
  // Industrial storage
  node["landuse"="industrial"]["name"~"storage|Storage|STORAGE"](${TRAVIS_COUNTY_BBOX.south},${TRAVIS_COUNTY_BBOX.west},${TRAVIS_COUNTY_BBOX.north},${TRAVIS_COUNTY_BBOX.east});
  way["landuse"="industrial"]["name"~"storage|Storage|STORAGE"](${TRAVIS_COUNTY_BBOX.south},${TRAVIS_COUNTY_BBOX.west},${TRAVIS_COUNTY_BBOX.north},${TRAVIS_COUNTY_BBOX.east});
  
  // Name-based search for self storage
  node["name"~"self storage|Self Storage|mini storage|Mini Storage|U-Haul|Public Storage|Extra Space|CubeSmart|Life Storage",i](${TRAVIS_COUNTY_BBOX.south},${TRAVIS_COUNTY_BBOX.west},${TRAVIS_COUNTY_BBOX.north},${TRAVIS_COUNTY_BBOX.east});
  way["name"~"self storage|Self Storage|mini storage|Mini Storage|U-Haul|Public Storage|Extra Space|CubeSmart|Life Storage",i](${TRAVIS_COUNTY_BBOX.south},${TRAVIS_COUNTY_BBOX.west},${TRAVIS_COUNTY_BBOX.north},${TRAVIS_COUNTY_BBOX.east});
);
out center;
`;

async function fetchOSMData() {
  console.log('Fetching self storage facilities from OSM Overpass API...');
  
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(OVERPASS_QUERY)}`
  });
  
  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status}`);
  }
  
  const data = await response.json();
  console.log(`Found ${data.elements.length} elements from OSM`);
  return data.elements;
}

function parseOSMElement(element) {
  // Get coordinates (center for ways, direct for nodes)
  const lat = element.lat || element.center?.lat;
  const lon = element.lon || element.center?.lon;
  
  if (!lat || !lon) return null;
  
  const tags = element.tags || {};
  
  return {
    osm_id: element.id,
    name: tags.name || tags['brand'] || 'Unknown Self Storage',
    category: 'self_storage',
    subcategory: tags.brand || 'independent',
    latitude: lat,
    longitude: lon,
    address: [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ') || null,
    city: tags['addr:city'] || 'Austin',
    state: tags['addr:state'] || 'TX',
    zip: tags['addr:postcode'] || null,
    phone: tags.phone || tags['contact:phone'] || null,
    website: tags.website || tags['contact:website'] || null,
    tags: tags
  };
}

async function insertPOIs(pois) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    let inserted = 0;
    let skipped = 0;
    
    for (const poi of pois) {
      if (!poi) {
        skipped++;
        continue;
      }
      
      try {
        await client.query(`
          INSERT INTO osm_pois_travis (osm_id, name, category, subcategory, latitude, longitude, address, city, state, zip, phone, website, tags, geom)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, ST_SetSRID(ST_MakePoint($6, $5), 4326))
          ON CONFLICT (osm_id) DO UPDATE SET
            name = EXCLUDED.name,
            category = EXCLUDED.category,
            subcategory = EXCLUDED.subcategory,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            address = EXCLUDED.address,
            city = EXCLUDED.city,
            state = EXCLUDED.state,
            zip = EXCLUDED.zip,
            phone = EXCLUDED.phone,
            website = EXCLUDED.website,
            tags = EXCLUDED.tags,
            geom = EXCLUDED.geom,
            updated_at = NOW()
        `, [
          poi.osm_id,
          poi.name,
          poi.category,
          poi.subcategory,
          poi.latitude,
          poi.longitude,
          poi.address,
          poi.city,
          poi.state,
          poi.zip,
          poi.phone,
          poi.website,
          JSON.stringify(poi.tags)
        ]);
        inserted++;
      } catch (err) {
        console.error(`Error inserting POI ${poi.osm_id}:`, err.message);
        skipped++;
      }
    }
    
    await client.query('COMMIT');
    console.log(`Inserted/updated: ${inserted}, Skipped: ${skipped}`);
    return inserted;
    
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    console.log('=== OSM POI Loader: Self Storage ===\n');
    
    // Fetch from OSM
    const elements = await fetchOSMData();
    
    // Parse elements
    const pois = elements.map(parseOSMElement).filter(Boolean);
    console.log(`Parsed ${pois.length} valid POIs`);
    
    // Insert into database
    const count = await insertPOIs(pois);
    
    console.log(`\n✅ Successfully loaded ${count} self storage facilities into osm_pois_travis`);
    
    // Verify
    const result = await pool.query('SELECT COUNT(*) FROM osm_pois_travis WHERE category = $1', ['self_storage']);
    console.log(`Total self storage facilities in database: ${result.rows[0].count}`);
    
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

