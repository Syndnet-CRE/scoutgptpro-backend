// src/services/referenceResolver.js
// Service for resolving reference names to geometries

import pg from 'pg';

// Static aliases for common references
const REFERENCE_ALIASES = {
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
 * Get database pool connection
 */
function getDbPool() {
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5
  });
}

/**
 * Resolve a reference name to its geometry
 * @param {string} referenceName - Name of the reference (e.g., "I-35", "US-183")
 * @returns {Promise<object|null>} - Reference geometry object or null if not found
 */
export async function resolveReferenceToGeometry(referenceName) {
  const pool = getDbPool();
  const normalizedName = referenceName.toLowerCase().trim();

  try {
    // Check static aliases first
    let searchTerms = [normalizedName];
    for (const [canonical, aliases] of Object.entries(REFERENCE_ALIASES)) {
      if (normalizedName === canonical || aliases.includes(normalizedName)) {
        searchTerms = [canonical, ...aliases];
        break;
      }
    }

    // Query reference_geometries
    const result = await pool.query(`
      SELECT name, feature_type, geometry, metadata
      FROM reference_geometries
      WHERE name ILIKE ANY($1::text[])
         OR EXISTS (
           SELECT 1 FROM unnest(aliases) AS alias
           WHERE alias ILIKE ANY($1::text[])
         )
      LIMIT 1
    `, [searchTerms.map(t => `%${t}%`)]);

    if (result.rows.length === 0) {
      console.log(`[referenceResolver] No match found for: ${referenceName}`);
      return null;
    }

    console.log(`[referenceResolver] Found reference: ${result.rows[0].name}`);
    return result.rows[0];
  } catch (error) {
    console.error('[referenceResolver] Error:', error.message);
    return null;
  } finally {
    await pool.end();
  }
}

/**
 * List all available reference geometries
 * @param {string|null} featureType - Optional filter by feature type
 * @returns {Promise<array>} - Array of reference objects
 */
export async function listAvailableReferences(featureType = null) {
  const pool = getDbPool();

  try {
    let query = `
      SELECT name, feature_type, aliases
      FROM reference_geometries
    `;

    if (featureType) {
      query += ` WHERE feature_type = $1`;
      const result = await pool.query(query, [featureType]);
      return result.rows;
    }

    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('[referenceResolver] Error listing references:', error.message);
    return [];
  } finally {
    await pool.end();
  }
}

/**
 * Get reference geometry as GeoJSON
 * @param {string} referenceName - Name of the reference
 * @returns {Promise<object|null>} - GeoJSON object or null
 */
export async function getReferenceGeoJSON(referenceName) {
  const pool = getDbPool();
  const normalizedName = referenceName.toLowerCase().trim();

  try {
    let searchTerms = [normalizedName];
    for (const [canonical, aliases] of Object.entries(REFERENCE_ALIASES)) {
      if (normalizedName === canonical || aliases.includes(normalizedName)) {
        searchTerms = [canonical, ...aliases];
        break;
      }
    }

    const result = await pool.query(`
      SELECT
        name,
        feature_type,
        ST_AsGeoJSON(geometry)::json as geometry,
        metadata
      FROM reference_geometries
      WHERE name ILIKE ANY($1::text[])
         OR EXISTS (
           SELECT 1 FROM unnest(aliases) AS alias
           WHERE alias ILIKE ANY($1::text[])
         )
      LIMIT 1
    `, [searchTerms.map(t => `%${t}%`)]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      type: 'Feature',
      properties: {
        name: row.name,
        feature_type: row.feature_type,
        metadata: row.metadata
      },
      geometry: row.geometry
    };
  } catch (error) {
    console.error('[referenceResolver] Error getting GeoJSON:', error.message);
    return null;
  } finally {
    await pool.end();
  }
}

export default {
  resolveReferenceToGeometry,
  listAvailableReferences,
  getReferenceGeoJSON
};
