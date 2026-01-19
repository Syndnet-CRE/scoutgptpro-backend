#!/usr/bin/env node
// scripts/load-osm-highways.mjs
// ETL script to load highway geometries from OpenStreetMap data

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Highway definitions with OSM references and aliases
const HIGHWAYS = [
  { name: 'I-35', osm_ref: 'I 35', aliases: ['Interstate 35', 'IH-35', 'I35', 'Interstate35'] },
  { name: 'US-183', osm_ref: 'US 183', aliases: ['Highway 183', 'Research Blvd', 'Research Boulevard'] },
  { name: 'US-290', osm_ref: 'US 290', aliases: ['Highway 290', 'Ben White Blvd', 'Ben White Boulevard'] },
  { name: 'SH-130', osm_ref: 'SH 130', aliases: ['State Highway 130', 'Toll 130', '130 Toll'] },
  { name: 'SH-45', osm_ref: 'SH 45', aliases: ['State Highway 45', '45 Toll'] },
  { name: 'Loop 1', osm_ref: 'Loop 1', aliases: ['Mopac', 'MoPac Expressway', 'Mo-Pac'] },
  { name: 'US-71', osm_ref: 'US 71', aliases: ['Highway 71', 'Ben White Blvd East'] },
  { name: 'SH-71', osm_ref: 'SH 71', aliases: ['State Highway 71'] }
];

// Travis County approximate bounding box
const TRAVIS_BBOX = [-98.1, 30.0, -97.3, 30.6];

async function loadHighways() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('=== Loading Highway Reference Geometries ===');
    console.log('');

    // Check if OSM data file exists
    const geojsonPath = path.join(__dirname, '../data/texas-highways.geojson');

    if (fs.existsSync(geojsonPath)) {
      console.log('Found GeoJSON file:', geojsonPath);
      const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));

      for (const highway of HIGHWAYS) {
        // Find matching features
        const features = geojson.features.filter(f =>
          f.properties.ref === highway.osm_ref ||
          f.properties.name?.includes(highway.name)
        );

        if (features.length === 0) {
          console.warn(`  No features found for ${highway.name}`);
          continue;
        }

        // Merge into single geometry
        const merged = {
          type: 'MultiLineString',
          coordinates: features.flatMap(f =>
            f.geometry.type === 'LineString'
              ? [f.geometry.coordinates]
              : f.geometry.coordinates
          )
        };

        await pool.query(`
          INSERT INTO reference_geometries (name, feature_type, geometry, aliases, source, metadata)
          VALUES ($1, 'highway', ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), $3, 'OSM', $4)
          ON CONFLICT ON CONSTRAINT reference_geometries_name_type_unique DO UPDATE SET
            geometry = EXCLUDED.geometry,
            aliases = EXCLUDED.aliases,
            updated_at = NOW()
        `, [
          highway.name,
          JSON.stringify(merged),
          highway.aliases,
          JSON.stringify({ osm_ref: highway.osm_ref, feature_count: features.length })
        ]);

        console.log(`  Loaded ${highway.name}: ${features.length} features`);
      }
    } else {
      // No GeoJSON file - create placeholder geometries using Overpass API or fallback
      console.log('No GeoJSON file found. Creating placeholder highway lines for Travis County...');
      console.log('');
      console.log('To get real highway data:');
      console.log('1. Download Texas OSM extract: https://download.geofabrik.de/north-america/us/texas.html');
      console.log('2. Extract highways: osmium tags-filter texas-latest.osm.pbf w/highway=motorway,trunk,primary -o texas-highways.osm.pbf');
      console.log('3. Convert to GeoJSON: osmium export texas-highways.osm.pbf -o data/texas-highways.geojson');
      console.log('');

      // Create approximate placeholder geometries for major highways through Travis County
      const placeholderHighways = [
        {
          name: 'I-35',
          aliases: ['Interstate 35', 'IH-35', 'I35'],
          // I-35 runs roughly north-south through Austin
          geometry: {
            type: 'LineString',
            coordinates: [
              [-97.7337, 30.1500], // South (near Buda)
              [-97.7400, 30.2500],
              [-97.7450, 30.3500],
              [-97.7500, 30.4500],
              [-97.7400, 30.5500]  // North (near Round Rock)
            ]
          }
        },
        {
          name: 'US-183',
          aliases: ['Highway 183', 'Research Blvd'],
          geometry: {
            type: 'LineString',
            coordinates: [
              [-97.9000, 30.4000], // West
              [-97.7500, 30.3500],
              [-97.6500, 30.3000],
              [-97.5500, 30.2000]  // East (near airport)
            ]
          }
        },
        {
          name: 'US-290',
          aliases: ['Highway 290', 'Ben White Blvd'],
          geometry: {
            type: 'LineString',
            coordinates: [
              [-97.9500, 30.2500], // West (Oak Hill)
              [-97.8500, 30.2200],
              [-97.7500, 30.2000],
              [-97.6500, 30.2000],
              [-97.5500, 30.2500]  // East
            ]
          }
        },
        {
          name: 'Loop 1',
          aliases: ['Mopac', 'MoPac Expressway'],
          geometry: {
            type: 'LineString',
            coordinates: [
              [-97.8000, 30.1800], // South
              [-97.8000, 30.2500],
              [-97.7800, 30.3200],
              [-97.7500, 30.4000],
              [-97.7200, 30.4500]  // North
            ]
          }
        },
        {
          name: 'SH-130',
          aliases: ['State Highway 130', 'Toll 130'],
          geometry: {
            type: 'LineString',
            coordinates: [
              [-97.6000, 30.1000], // South
              [-97.5500, 30.2500],
              [-97.5000, 30.4000],
              [-97.4800, 30.5000]  // North
            ]
          }
        }
      ];

      for (const highway of placeholderHighways) {
        await pool.query(`
          INSERT INTO reference_geometries (name, feature_type, geometry, aliases, source, metadata)
          VALUES ($1, 'highway', ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), $3, 'placeholder', $4)
          ON CONFLICT ON CONSTRAINT reference_geometries_name_type_unique DO UPDATE SET
            geometry = EXCLUDED.geometry,
            aliases = EXCLUDED.aliases,
            updated_at = NOW()
        `, [
          highway.name,
          JSON.stringify(highway.geometry),
          highway.aliases,
          JSON.stringify({ note: 'Placeholder geometry - replace with OSM data for production' })
        ]);

        console.log(`  Loaded placeholder: ${highway.name}`);
      }
    }

    // Verify loaded data
    console.log('');
    console.log('=== Verification ===');
    const result = await pool.query(`
      SELECT name, feature_type, source, ST_NPoints(geometry) as points
      FROM reference_geometries
      WHERE feature_type = 'highway'
      ORDER BY name
    `);

    console.log('');
    console.log('Loaded highways:');
    for (const row of result.rows) {
      console.log(`  ${row.name}: ${row.points} points (source: ${row.source})`);
    }

    console.log('');
    console.log('=== Highway loading complete ===');

  } catch (error) {
    console.error('Error loading highways:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
loadHighways().catch(err => {
  console.error(err);
  process.exit(1);
});

export { loadHighways, HIGHWAYS };
