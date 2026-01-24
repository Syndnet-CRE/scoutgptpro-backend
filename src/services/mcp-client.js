/**
 * MCP Client Integration Service
 * Provides a unified interface for calling MCP servers (Property, SQL, GIS)
 *
 * This service wraps MCP tool calls and provides fallback to direct database queries
 * when MCP servers are unavailable.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import pg from 'pg';
import { interpretZoning, getParcelConstraints } from './zoning/interpreter.js';

// MCP Server Configuration
const MCP_SERVERS = {
  property: {
    command: 'node',
    args: ['~/scoutgpt-ops/mcp-servers/property-mcp/src/index.js'],
    enabled: process.env.MCP_PROPERTY_ENABLED !== 'false'
  },
  sql: {
    command: 'node',
    args: ['~/scoutgpt-ops/mcp-servers/sql-mcp/src/index.js'],
    enabled: process.env.MCP_SQL_ENABLED !== 'false'
  },
  gis: {
    command: 'node',
    args: ['~/scoutgpt-ops/mcp-servers/gis-mcp/src/index.js'],
    enabled: process.env.MCP_GIS_ENABLED !== 'false'
  }
};

// Connection pool for fallback queries
let pool = null;
function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10
    });
  }
  return pool;
}

/**
 * MCP Client Manager
 * Manages connections to MCP servers with automatic reconnection
 */
class MCPClientManager {
  constructor() {
    this.clients = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    console.log('[MCP] Initializing MCP clients...');

    for (const [name, config] of Object.entries(MCP_SERVERS)) {
      if (!config.enabled) {
        console.log(`[MCP] ${name} server disabled`);
        continue;
      }

      try {
        // For now, we use direct database fallback
        // MCP stdio transport requires spawning processes
        console.log(`[MCP] ${name} server configured (using fallback mode)`);
      } catch (error) {
        console.error(`[MCP] Failed to connect to ${name}:`, error.message);
      }
    }

    this.initialized = true;
    console.log('[MCP] Initialization complete');
  }

  async callTool(server, toolName, args) {
    // For now, use fallback mode - direct database queries
    // This provides the same functionality without requiring MCP server processes
    return this.fallbackCall(server, toolName, args);
  }

  async fallbackCall(server, toolName, args) {
    const pool = getPool();

    switch (`${server}:${toolName}`) {
      // Property MCP tools
      case 'property:get_property':
        return this.getProperty(pool, args);
      case 'property:search_properties':
        return this.searchProperties(pool, args);
      case 'property:get_property_enrichment':
        return this.getPropertyEnrichment(pool, args);
      case 'property:get_property_stats':
        return this.getPropertyStats(pool, args);

      // SQL MCP tools
      case 'sql:execute_query':
        return this.executeQuery(pool, args);
      case 'sql:get_table_schema':
        return this.getTableSchema(pool, args);
      case 'sql:spatial_query':
        return this.spatialQuery(pool, args);
      case 'sql:list_tables':
        return this.listTables(pool);

      // GIS MCP tools
      case 'gis:spatial_query':
        return this.gisSpatialQuery(pool, args);
      case 'gis:buffer_geometry':
        return this.bufferGeometry(pool, args);
      case 'gis:get_zoning':
        return this.getZoning(pool, args);
      case 'gis:interpret_zoning':
        return this.interpretZoning(pool, args);
      case 'gis:get_layer_features':
        return this.getLayerFeatures(pool, args);
      case 'gis:resolve_geography':
        return this.resolveGeography(args);

      default:
        throw new Error(`Unknown MCP tool: ${server}:${toolName}`);
    }
  }

  // Property MCP implementations
  async getProperty(pool, { parcelId }) {
    const result = await pool.query(`
      SELECT * FROM parcel_features_travis WHERE parcel_id = $1
    `, [parcelId]);
    return result.rows[0] || null;
  }

  async searchProperties(pool, args) {
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (args.zip) {
      conditions.push(`mail_zip = $${paramIndex++}`);
      values.push(args.zip);
    }
    if (args.minAcres !== undefined) {
      conditions.push(`acres_calc >= $${paramIndex++}`);
      values.push(args.minAcres);
    }
    if (args.maxAcres !== undefined) {
      conditions.push(`acres_calc <= $${paramIndex++}`);
      values.push(args.maxAcres);
    }
    if (args.isVacant !== undefined) {
      conditions.push(`asset_class = $${paramIndex++}`);
      values.push('land');
    }
    if (args.minValue !== undefined) {
      conditions.push(`market_value >= $${paramIndex++}`);
      values.push(args.minValue);
    }
    if (args.maxValue !== undefined) {
      conditions.push(`market_value <= $${paramIndex++}`);
      values.push(args.maxValue);
    }
    if (args.ownerName) {
      conditions.push(`owner_name_raw ILIKE $${paramIndex++}`);
      values.push(`%${args.ownerName}%`);
    }

    const limit = args.limit || 100;
    values.push(limit);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT
        parcel_id, situs_address, owner_name_raw, owner_entity_type,
        owner_segment, acres_calc, asset_class, market_value,
        tax_delinquent_flag, county_fips,
        ST_AsGeoJSON(geom_centroid)::json as geom
      FROM parcel_features_travis
      ${whereClause}
      ORDER BY market_value DESC
      LIMIT $${paramIndex}
    `, values);

    return { count: result.rowCount, properties: result.rows };
  }

  async getPropertyEnrichment(pool, { parcelId }) {
    const result = await pool.query(`
      SELECT * FROM parcels_travis_enrichment WHERE parcel_id = $1
    `, [parcelId]);
    return result.rows[0] || null;
  }

  async getPropertyStats(pool, args) {
    const groupField = args.groupBy || 'mail_zip';
    let query = `
      SELECT
        ${groupField},
        COUNT(*) as count,
        AVG(market_value) as avg_value,
        SUM(acres_calc) as total_acres
      FROM parcel_features_travis
      ${args.zip ? `WHERE mail_zip = $1` : ''}
      GROUP BY ${groupField}
      ORDER BY count DESC
      LIMIT 20
    `;

    const values = args.zip ? [args.zip] : [];
    const result = await pool.query(query, values);
    return result.rows;
  }

  // SQL MCP implementations
  async executeQuery(pool, { query, params }) {
    // Safety check - only allow SELECT
    const upperQuery = query.toUpperCase().trim();
    if (!upperQuery.startsWith('SELECT')) {
      throw new Error('Only SELECT queries allowed');
    }

    const blocked = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'TRUNCATE', 'CREATE'];
    for (const keyword of blocked) {
      if (upperQuery.includes(keyword)) {
        throw new Error(`Blocked: ${keyword} operations not allowed`);
      }
    }

    const result = await pool.query(query, params || []);
    return { rowCount: result.rowCount, rows: result.rows.slice(0, 1000) };
  }

  async getTableSchema(pool, { tableName }) {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);
    return { table: tableName, columns: result.rows };
  }

  async spatialQuery(pool, { geometry, table, operation, distance, limit }) {
    let spatialClause;
    switch (operation) {
      case 'intersects':
        spatialClause = `ST_Intersects(geom, ST_GeomFromGeoJSON($1))`;
        break;
      case 'within':
        spatialClause = `ST_Within(geom, ST_GeomFromGeoJSON($1))`;
        break;
      case 'contains':
        spatialClause = `ST_Contains(geom, ST_GeomFromGeoJSON($1))`;
        break;
      case 'dwithin':
        spatialClause = `ST_DWithin(geom::geography, ST_GeomFromGeoJSON($1)::geography, ${distance || 1000})`;
        break;
      default:
        throw new Error(`Unknown spatial operation: ${operation}`);
    }

    const result = await pool.query(`
      SELECT parcel_id, ST_AsGeoJSON(geom) as geometry
      FROM ${table}
      WHERE ${spatialClause}
      LIMIT ${limit || 100}
    `, [geometry]);

    return { count: result.rowCount, parcels: result.rows };
  }

  async listTables(pool) {
    const allowedTables = [
      'parcel_features_travis', 'parcels_travis', 'parcels_travis_enrichment',
      'parcels_williamson', 'parcels_hays', 'parcels_bastrop',
      'map_server_registry', 'listings', 'deals', 'zoning_districts'
    ];

    const counts = [];
    for (const table of allowedTables) {
      try {
        const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        counts.push({ table, count: parseInt(result.rows[0].count) });
      } catch (e) {
        counts.push({ table, count: 'N/A', error: e.message });
      }
    }
    return counts;
  }

  // GIS MCP implementations
  async gisSpatialQuery(pool, { geometry, operation, distance, county, limit }) {
    const table = `parcels_${county || 'travis'}`;
    const enrichmentTable = `parcels_${county || 'travis'}_enrichment`;

    let spatialClause;
    switch (operation) {
      case 'intersects':
        spatialClause = `ST_Intersects(p.geom, ST_GeomFromGeoJSON($1))`;
        break;
      case 'within':
        spatialClause = `ST_Within(p.geom, ST_GeomFromGeoJSON($1))`;
        break;
      case 'dwithin':
        spatialClause = `ST_DWithin(p.geom::geography, ST_GeomFromGeoJSON($1)::geography, ${distance || 1000})`;
        break;
      default:
        spatialClause = `ST_Intersects(p.geom, ST_GeomFromGeoJSON($1))`;
    }

    const result = await pool.query(`
      SELECT
        p.parcel_id,
        ST_AsGeoJSON(ST_Centroid(p.geom))::json as centroid,
        e.owner_name, e.situs_address, e.market_value,
        COALESCE(e.acres, e.acreage) as acres
      FROM ${table} p
      LEFT JOIN ${enrichmentTable} e ON p.parcel_id = e.parcel_id
      WHERE ${spatialClause}
      LIMIT ${limit || 100}
    `, [geometry]);

    return { count: result.rowCount, parcels: result.rows };
  }

  async bufferGeometry(pool, { geometry, distance }) {
    const result = await pool.query(`
      SELECT ST_AsGeoJSON(
        ST_Buffer(ST_GeomFromGeoJSON($1)::geography, $2)::geometry
      ) as buffered_geometry
    `, [geometry, distance]);

    return {
      original: JSON.parse(geometry),
      buffered: JSON.parse(result.rows[0].buffered_geometry),
      distance_meters: distance
    };
  }

  async getZoning(pool, { parcelId, lat, lng }) {
    let whereClause;
    let params = [];

    if (parcelId) {
      const parcelResult = await pool.query(`
        SELECT ST_Centroid(geom) as centroid FROM parcels_travis WHERE parcel_id = $1
      `, [parcelId]);

      if (parcelResult.rows.length === 0) {
        return { found: false, error: `Parcel not found: ${parcelId}` };
      }

      whereClause = `ST_Intersects(geometry, $1)`;
      params = [parcelResult.rows[0].centroid];
    } else if (lat && lng) {
      whereClause = `ST_Intersects(geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))`;
      params = [lng, lat];
    } else {
      throw new Error('Either parcelId or lat/lng required');
    }

    const result = await pool.query(`
      SELECT zoning_code, zoning_desc, overlay
      FROM zoning_districts
      WHERE ${whereClause}
      LIMIT 1
    `, params);

    return {
      found: result.rows.length > 0,
      zoning: result.rows[0] || null
    };
  }

  async interpretZoning(pool, { zoningCode, parcelId }) {
    if (parcelId) {
      return getParcelConstraints(parcelId, pool);
    }
    if (zoningCode) {
      return interpretZoning(zoningCode);
    }
    throw new Error('Either zoningCode or parcelId required');
  }

  async getLayerFeatures(pool, { layer, bbox, limit }) {
    const [minLng, minLat, maxLng, maxLat] = bbox;

    if (layer === 'zoning_districts') {
      const result = await pool.query(`
        SELECT zoning_code, zoning_desc, overlay, ST_AsGeoJSON(geometry)::json as geometry
        FROM zoning_districts
        WHERE ST_Intersects(geometry, ST_MakeEnvelope($1, $2, $3, $4, 4326))
        LIMIT ${limit || 100}
      `, [minLng, minLat, maxLng, maxLat]);

      return { layer, count: result.rowCount, features: result.rows };
    }

    if (layer === 'parcels_travis') {
      const result = await pool.query(`
        SELECT parcel_id, ST_AsGeoJSON(geom)::json as geometry
        FROM parcels_travis
        WHERE ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))
        LIMIT ${limit || 100}
      `, [minLng, minLat, maxLng, maxLat]);

      return { layer, count: result.rowCount, features: result.rows };
    }

    throw new Error(`Unknown layer: ${layer}`);
  }

  resolveGeography({ query }) {
    // ZIP code lookup
    const zipBboxes = {
      '78701': [-97.752, 30.262, -97.732, 30.282],
      '78702': [-97.726, 30.252, -97.696, 30.282],
      '78704': [-97.782, 30.232, -97.732, 30.262],
      '78745': [-97.832, 30.182, -97.752, 30.232],
      '78758': [-97.722, 30.372, -97.662, 30.432],
      '78759': [-97.782, 30.382, -97.722, 30.432]
    };

    const zipMatch = query.match(/^\d{5}$/);
    if (zipMatch && zipBboxes[query]) {
      const bbox = zipBboxes[query];
      return {
        query,
        type: 'zip_code',
        bbox,
        center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
      };
    }

    // County lookup
    const countyBboxes = {
      'travis': [-98.17, 29.91, -97.37, 30.63],
      'williamson': [-98.05, 30.27, -97.16, 30.92],
      'hays': [-98.30, 29.75, -97.65, 30.28]
    };

    const countyMatch = query.toLowerCase().match(/(\w+)\s*county/);
    if (countyMatch && countyBboxes[countyMatch[1]]) {
      const county = countyMatch[1];
      const bbox = countyBboxes[county];
      return {
        query,
        type: 'county',
        county,
        bbox,
        center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
      };
    }

    return {
      query,
      type: 'unknown',
      resolved: false,
      default_bbox: [-97.95, 30.10, -97.55, 30.50]
    };
  }
}

// Singleton instance
const mcpManager = new MCPClientManager();

// Export convenience functions
export const initializeMCP = () => mcpManager.initialize();

export const callPropertyMCP = (toolName, args) =>
  mcpManager.callTool('property', toolName, args);

export const callSQLMCP = (toolName, args) =>
  mcpManager.callTool('sql', toolName, args);

export const callGISMCP = (toolName, args) =>
  mcpManager.callTool('gis', toolName, args);

export default mcpManager;
