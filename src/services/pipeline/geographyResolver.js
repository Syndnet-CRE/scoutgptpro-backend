// src/services/pipeline/geographyResolver.js
// Step 5: Resolve geography to bounding box or polygon

import pg from 'pg';

// ZIP code bounding boxes for Travis County area
// In production, these would come from a database lookup
const ZIP_BBOXES = {
  '78701': [-97.7500, 30.2600, -97.7300, 30.2800],
  '78702': [-97.7300, 30.2500, -97.7000, 30.2800],
  '78703': [-97.7800, 30.2800, -97.7400, 30.3100],
  '78704': [-97.7700, 30.2200, -97.7300, 30.2600],
  '78705': [-97.7500, 30.2800, -97.7200, 30.3100],
  '78731': [-97.7800, 30.3400, -97.7200, 30.4000],
  '78745': [-97.8200, 30.1800, -97.7400, 30.2300],
  '78746': [-97.8400, 30.2600, -97.7800, 30.3200],
  '78748': [-97.8600, 30.1400, -97.7800, 30.2000],
  '78749': [-97.8800, 30.2000, -97.8200, 30.2600],
  '78750': [-97.8000, 30.4000, -97.7200, 30.4600],
  '78751': [-97.7300, 30.3000, -97.7000, 30.3300],
  '78752': [-97.7100, 30.3200, -97.6800, 30.3500],
  '78753': [-97.7000, 30.3500, -97.6400, 30.4200],
  '78754': [-97.6600, 30.3200, -97.6000, 30.3800],
  '78756': [-97.7400, 30.3100, -97.7100, 30.3400],
  '78757': [-97.7400, 30.3400, -97.7000, 30.3800],
  '78758': [-97.7200, 30.3700, -97.6600, 30.4200],
  '78759': [-97.7800, 30.3800, -97.7200, 30.4400]
};

// County FIPS to bounding box
const COUNTY_BBOXES = {
  '48453': [-98.1730, 30.0240, -97.3690, 30.6280], // Travis County
  '48491': [-98.0520, 30.3580, -97.3550, 30.8890], // Williamson County
  '48209': [-98.3060, 29.8130, -97.7900, 30.2850]  // Hays County
};

/**
 * Get database pool
 */
function getDbPool() {
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3
  });
}

/**
 * Resolve geography to a bounding box or geometry
 *
 * @param {object} geography - Geography from intent
 * @returns {Promise<object>} - Resolved geography with bbox or geometry
 */
export async function resolveGeography(geography) {
  if (!geography) return null;

  const resolved = { ...geography, resolved: true };

  switch (geography.type) {
    case 'zip':
      resolved.bbox = await resolveZipCode(geography.value);
      if (!resolved.displayName) {
        resolved.displayName = `ZIP ${geography.value}`;
      }
      break;

    case 'county':
      resolved.bbox = resolveCountyFips(geography.value);
      if (!resolved.displayName) {
        resolved.displayName = getCountyName(geography.value);
      }
      break;

    case 'city':
      resolved.bbox = await resolveCityName(geography.value);
      if (!resolved.displayName) {
        resolved.displayName = geography.value;
      }
      break;

    case 'bbox':
      // Already a bounding box
      resolved.bbox = geography.value;
      break;

    case 'drawn':
      // Already has geometry
      resolved.geometry = geography.value;
      break;

    default:
      console.warn(`[geographyResolver] Unknown geography type: ${geography.type}`);
  }

  return resolved;
}

/**
 * Resolve ZIP code to bounding box
 */
async function resolveZipCode(zip) {
  const zipStr = String(zip);

  // Check static lookup first
  if (ZIP_BBOXES[zipStr]) {
    return ZIP_BBOXES[zipStr];
  }

  // Fall back to database lookup
  const pool = getDbPool();
  try {
    const result = await pool.query(`
      SELECT
        ST_XMin(ST_Extent(geometry)) as min_lng,
        ST_YMin(ST_Extent(geometry)) as min_lat,
        ST_XMax(ST_Extent(geometry)) as max_lng,
        ST_YMax(ST_Extent(geometry)) as max_lat
      FROM zip_boundaries
      WHERE zip_code = $1
    `, [zipStr]);

    if (result.rows.length > 0 && result.rows[0].min_lng) {
      const row = result.rows[0];
      return [row.min_lng, row.min_lat, row.max_lng, row.max_lat];
    }
  } catch (error) {
    console.warn(`[geographyResolver] ZIP lookup failed: ${error.message}`);
  } finally {
    await pool.end();
  }

  // Return null if not found
  console.warn(`[geographyResolver] ZIP code not found: ${zipStr}`);
  return null;
}

/**
 * Resolve county FIPS to bounding box
 */
function resolveCountyFips(fips) {
  const fipsStr = String(fips);
  return COUNTY_BBOXES[fipsStr] || null;
}

/**
 * Resolve city/neighborhood name to bounding box
 */
async function resolveCityName(cityName) {
  const pool = getDbPool();
  try {
    const result = await pool.query(`
      SELECT
        ST_XMin(ST_Extent(geometry)) as min_lng,
        ST_YMin(ST_Extent(geometry)) as min_lat,
        ST_XMax(ST_Extent(geometry)) as max_lng,
        ST_YMax(ST_Extent(geometry)) as max_lat
      FROM reference_geometries
      WHERE feature_type = 'boundary'
        AND (name ILIKE $1 OR $1 = ANY(aliases))
    `, [`%${cityName}%`]);

    if (result.rows.length > 0 && result.rows[0].min_lng) {
      const row = result.rows[0];
      return [row.min_lng, row.min_lat, row.max_lng, row.max_lat];
    }
  } catch (error) {
    console.warn(`[geographyResolver] City lookup failed: ${error.message}`);
  } finally {
    await pool.end();
  }

  return null;
}

/**
 * Get county name from FIPS code
 */
function getCountyName(fips) {
  const names = {
    '48453': 'Travis County',
    '48491': 'Williamson County',
    '48209': 'Hays County',
    '48021': 'Bastrop County',
    '48055': 'Caldwell County'
  };
  return names[String(fips)] || `County ${fips}`;
}

/**
 * Convert bounding box to PostGIS envelope
 */
export function bboxToEnvelope(bbox) {
  if (!bbox || bbox.length !== 4) return null;
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return `ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)`;
}

export default {
  resolveGeography,
  bboxToEnvelope,
  ZIP_BBOXES,
  COUNTY_BBOXES
};
