// src/services/pipeline/spatialResolver.js
// Step 6: Resolve spatial references (highways, boundaries) to geometries

import pg from 'pg';

// Highway aliases for common references
const HIGHWAY_ALIASES = {
  'i-35': ['interstate 35', 'ih-35', 'i35', 'interstate35'],
  'us-183': ['highway 183', 'research blvd', 'research boulevard', '183'],
  'us-290': ['highway 290', 'ben white', 'ben white blvd', '290'],
  'mopac': ['loop 1', 'mo-pac', 'mopac expressway', 'loop1'],
  'sh-130': ['state highway 130', 'toll 130', '130 toll', '130'],
  'sh-45': ['state highway 45', '45 toll', '45'],
  'us-71': ['highway 71', '71'],
  'sh-71': ['state highway 71']
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
 * Normalize a reference name for matching
 */
function normalizeReference(name) {
  return name.toLowerCase()
    .replace(/[_\s-]+/g, '-')
    .replace(/interstate/g, 'i')
    .replace(/highway/g, '')
    .replace(/state\s*/g, 'sh-')
    .trim();
}

/**
 * Find canonical name for a reference
 */
function findCanonicalName(reference) {
  const normalized = normalizeReference(reference);

  // Check direct match
  if (HIGHWAY_ALIASES[normalized]) {
    return normalized.toUpperCase().replace('-', '-');
  }

  // Check aliases
  for (const [canonical, aliases] of Object.entries(HIGHWAY_ALIASES)) {
    for (const alias of aliases) {
      if (normalizeReference(alias) === normalized ||
          alias.toLowerCase().includes(normalized) ||
          normalized.includes(normalizeReference(alias))) {
        return canonical.toUpperCase().replace('-', '-');
      }
    }
  }

  // Return as-is if no match found
  return reference;
}

/**
 * Resolve a spatial operation to include the reference geometry
 *
 * @param {object} spatialOp - Spatial operation from intent
 * @returns {Promise<object>} - Resolved spatial operation with geometry
 */
export async function resolveSpatialReference(spatialOp) {
  if (!spatialOp || !spatialOp.reference) {
    return spatialOp;
  }

  const pool = getDbPool();
  const resolved = { ...spatialOp, resolved: true };

  try {
    const canonicalName = findCanonicalName(spatialOp.reference);

    // Query reference_geometries table
    const result = await pool.query(`
      SELECT
        name,
        feature_type,
        ST_AsGeoJSON(geometry)::json as geometry,
        metadata
      FROM reference_geometries
      WHERE name ILIKE $1
         OR $2 ILIKE ANY(aliases)
         OR name ILIKE $2
      LIMIT 1
    `, [`%${canonicalName}%`, `%${spatialOp.reference}%`]);

    if (result.rows.length > 0) {
      const ref = result.rows[0];
      resolved.resolvedName = ref.name;
      resolved.featureType = ref.feature_type;
      resolved.geometry = ref.geometry;
      resolved.displayName = ref.name;

      console.log(`[spatialResolver] Resolved "${spatialOp.reference}" to "${ref.name}"`);
    } else {
      console.warn(`[spatialResolver] Reference not found: ${spatialOp.reference}`);
      resolved.resolvedGeometry = null;
      resolved.error = `Reference not found: ${spatialOp.reference}`;
    }

    // Default distance if not specified
    if (!resolved.distance) {
      resolved.distance = 1;
      resolved.unit = 'miles';
    }

    // Convert distance to meters for ST_DWithin
    resolved.distanceMeters = convertToMeters(resolved.distance, resolved.unit || 'miles');

  } catch (error) {
    console.error(`[spatialResolver] Error: ${error.message}`);
    resolved.error = error.message;
  } finally {
    await pool.end();
  }

  return resolved;
}

/**
 * Convert distance to meters
 */
function convertToMeters(distance, unit) {
  switch (unit.toLowerCase()) {
    case 'miles':
    case 'mile':
    case 'mi':
      return distance * 1609.34;
    case 'feet':
    case 'foot':
    case 'ft':
      return distance * 0.3048;
    case 'kilometers':
    case 'km':
      return distance * 1000;
    case 'meters':
    case 'm':
    default:
      return distance;
  }
}

/**
 * Build SQL fragment for spatial filter
 *
 * @param {object} spatialOp - Resolved spatial operation
 * @param {string} parcelGeomColumn - Column name for parcel geometry
 * @returns {{ sql: string, values: any[] }}
 */
export function buildSpatialCondition(spatialOp, parcelGeomColumn = 'geom_centroid') {
  if (!spatialOp?.resolvedName || !spatialOp?.distanceMeters) {
    return null;
  }

  // Use ST_DWithin with geography cast for accurate distance
  const sql = `
    ST_DWithin(
      ${parcelGeomColumn}::geography,
      (SELECT geometry::geography FROM reference_geometries WHERE name = $PARAM$),
      $PARAM$
    )
  `;

  return {
    sql,
    values: [spatialOp.resolvedName, spatialOp.distanceMeters]
  };
}

/**
 * Get list of available spatial references
 */
export async function listAvailableReferences() {
  const pool = getDbPool();
  try {
    const result = await pool.query(`
      SELECT name, feature_type, aliases
      FROM reference_geometries
      ORDER BY feature_type, name
    `);
    return result.rows;
  } catch (error) {
    console.error(`[spatialResolver] Error listing references: ${error.message}`);
    return [];
  } finally {
    await pool.end();
  }
}

export default {
  resolveSpatialReference,
  buildSpatialCondition,
  listAvailableReferences,
  HIGHWAY_ALIASES
};
