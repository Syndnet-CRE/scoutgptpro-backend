#!/usr/bin/env node
// scripts/load-opportunity-zones.mjs
// ETL script to load HUD Qualified Opportunity Zones

import pg from 'pg';

// HUD ArcGIS REST API for Opportunity Zones
const HUD_QOZ_URL = 'https://hudgis-hud.opendata.arcgis.com/datasets/HUD::opportunity-zones/FeatureServer/0/query';

// Travis County FIPS prefix
const TRAVIS_FIPS = '48453';

async function loadOpportunityZones() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('=== Loading Opportunity Zones ===');
    console.log('');
    console.log('Fetching Texas Opportunity Zones from HUD...');

    // Query HUD ArcGIS REST API for Texas opportunity zones
    const params = new URLSearchParams({
      where: "STATE = 'TX'",
      outFields: '*',
      f: 'geojson',
      outSR: '4326'
    });

    let geojson = null;

    try {
      const response = await fetch(`${HUD_QOZ_URL}?${params}`, {
        headers: { 'User-Agent': 'ScoutGPT/1.0' }
      });

      if (response.ok) {
        geojson = await response.json();
      } else {
        console.log(`HUD API returned ${response.status} - using sample data`);
      }
    } catch (fetchError) {
      console.log(`Could not reach HUD API: ${fetchError.message}`);
      console.log('Using sample opportunity zone data instead.');
    }

    console.log(`Fetched ${geojson?.features?.length || 0} Texas opportunity zones`);
    console.log('');

    if (!geojson || !geojson.features || geojson.features.length === 0) {
      console.log('No opportunity zones found. Creating sample data for testing...');

      // Create sample opportunity zones for Travis County (these are approximations)
      const sampleZones = [
        {
          geoid: '48453001100',
          name: 'Census Tract 11 - East Austin',
          geometry: {
            type: 'MultiPolygon',
            coordinates: [[[[
              [-97.7200, 30.2600],
              [-97.7000, 30.2600],
              [-97.7000, 30.2800],
              [-97.7200, 30.2800],
              [-97.7200, 30.2600]
            ]]]]
          }
        },
        {
          geoid: '48453001803',
          name: 'Census Tract 18.03 - Downtown East',
          geometry: {
            type: 'MultiPolygon',
            coordinates: [[[[
              [-97.7400, 30.2500],
              [-97.7200, 30.2500],
              [-97.7200, 30.2700],
              [-97.7400, 30.2700],
              [-97.7400, 30.2500]
            ]]]]
          }
        },
        {
          geoid: '48453002311',
          name: 'Census Tract 23.11 - North Austin',
          geometry: {
            type: 'MultiPolygon',
            coordinates: [[[[
              [-97.7300, 30.3700],
              [-97.7000, 30.3700],
              [-97.7000, 30.4000],
              [-97.7300, 30.4000],
              [-97.7300, 30.3700]
            ]]]]
          }
        }
      ];

      for (const zone of sampleZones) {
        await pool.query(`
          INSERT INTO opportunity_zones (geoid, name, designation_date, geometry, metadata)
          VALUES ($1, $2, $3, ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)), $5)
          ON CONFLICT (geoid) DO UPDATE SET
            name = EXCLUDED.name,
            geometry = ST_Force2D(EXCLUDED.geometry)
        `, [
          zone.geoid,
          zone.name,
          new Date('2018-06-14'), // Original QOZ designation date
          JSON.stringify(zone.geometry),
          JSON.stringify({ source: 'sample', note: 'Sample data for testing' })
        ]);

        console.log(`  Loaded sample: ${zone.name}`);
      }
    } else {
      // Filter to Travis County zones
      let travisCount = 0;
      let otherCount = 0;

      for (const feature of geojson.features) {
        const geoid = feature.properties.GEOID || feature.properties.geoid;
        const name = feature.properties.NAME || feature.properties.NAMELSAD || `Tract ${geoid}`;
        const designated = feature.properties.DESIGNATED || feature.properties.designated;

        // Filter to Travis County (FIPS 48453)
        if (!geoid?.startsWith(TRAVIS_FIPS)) {
          otherCount++;
          continue;
        }

        travisCount++;

        await pool.query(`
          INSERT INTO opportunity_zones (geoid, name, designation_date, geometry, metadata)
          VALUES ($1, $2, $3, ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)), $5)
          ON CONFLICT (geoid) DO UPDATE SET
            name = EXCLUDED.name,
            geometry = ST_Force2D(EXCLUDED.geometry),
            metadata = EXCLUDED.metadata
        `, [
          geoid,
          name,
          designated ? new Date(designated) : null,
          JSON.stringify(feature.geometry),
          JSON.stringify(feature.properties)
        ]);
      }

      console.log(`  Loaded ${travisCount} Travis County opportunity zones`);
      console.log(`  Skipped ${otherCount} zones from other counties`);
    }

    // Verify loaded data
    console.log('');
    console.log('=== Verification ===');

    const countResult = await pool.query('SELECT COUNT(*) as count FROM opportunity_zones');
    console.log(`Total opportunity zones in database: ${countResult.rows[0].count}`);

    const sampleResult = await pool.query(`
      SELECT geoid, name, ST_Area(geometry::geography) / 1000000 as area_km2
      FROM opportunity_zones
      ORDER BY name
      LIMIT 10
    `);

    console.log('');
    console.log('Sample zones:');
    for (const row of sampleResult.rows) {
      console.log(`  ${row.geoid}: ${row.name} (${row.area_km2?.toFixed(2) || '?'} km²)`);
    }

    // Test spatial query
    console.log('');
    console.log('=== Testing Spatial Query ===');

    const spatialTest = await pool.query(`
      SELECT COUNT(*) as count
      FROM parcel_features_travis pft
      WHERE EXISTS (
        SELECT 1 FROM opportunity_zones oz
        WHERE ST_Intersects(pft.geom_centroid, oz.geometry)
      )
    `);

    console.log(`Parcels in opportunity zones: ${spatialTest.rows[0].count}`);

    console.log('');
    console.log('=== Opportunity Zone loading complete ===');

  } catch (error) {
    console.error('Error loading opportunity zones:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
loadOpportunityZones().catch(err => {
  console.error(err);
  process.exit(1);
});

export { loadOpportunityZones };
