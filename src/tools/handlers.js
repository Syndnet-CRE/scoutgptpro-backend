// src/tools/handlers.js
// Tool execution handlers - wraps existing services

import { PrismaClient } from '@prisma/client';
import { analyzeDevelopmentFeasibility } from '../services/enrichment/orchestrator.js';
import { webSearch } from '../services/webSearch/index.js';
import { createArtifact } from '../services/artifacts/index.js';
import { normalizeProperty, normalizeProperties } from '../utils/normalizeProperty.js';
import { LAYER_REGISTRY } from '../config/gis-layer-registry.js';
import pool from '../db/pool.js';
import { searchProperties as searchPropertiesService, getPropertyDetail } from '../services/propertyCard.js';

const prisma = new PrismaClient();

/**
 * Execute a tool by name with given input
 * @param {string} toolName - Name of the tool to execute
 * @param {object} toolInput - Input parameters for the tool
 * @returns {Promise<object>} - Tool execution result
 */
export async function executeTool(toolName, toolInput) {
  console.log(`[Tool] Executing: ${toolName}`, JSON.stringify(toolInput).slice(0, 200));
  
  switch (toolName) {
    case 'search_properties':
      return await searchProperties(toolInput);
    case 'get_property':
      return await getProperty(toolInput);
    case 'execute_sql':
      return await executeSqlTool(toolInput);
    case 'analyze_property':
      return await analyzeProperty(toolInput);
    case 'web_search':
      return await webSearchTool(toolInput);
    case 'get_osm_nearby':
      return await getOsmNearby(toolInput);
    case 'get_gis_layers':
      return await getGisLayers(toolInput);
    case 'generate_artifact':
      return await generateArtifact(toolInput);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ============ TOOL IMPLEMENTATIONS ============

async function searchProperties(input) {
  try {
    const { filters = {}, bbox, limit = 50 } = input;
    const result = await searchPropertiesService(filters, bbox, limit);
    return result;
  } catch (error) {
    console.error('[Handler] searchProperties error:', error.message);
    return {
      type: 'FeatureCollection',
      features: [],
      metadata: { count: 0, error: error.message }
    };
  }
}

async function getProperty(input) {
  try {
    const { parcel_id } = input;
    if (!parcel_id) return { error: 'parcel_id required' };
    
    const property = await getPropertyDetail(parcel_id);
    if (!property) return { error: 'Property not found', parcel_id };
    
    return property;
  } catch (error) {
    console.error('[Handler] getProperty error:', error.message);
    return { error: error.message };
  }
}

async function executeSqlTool(input) {
  try {
    const { sql, description } = input;
    
    if (!sql || typeof sql !== 'string') {
      return { error: 'sql parameter is required and must be a string' };
    }
    
    // Security: read-only enforcement
    const normalized = sql.trim().toUpperCase();
    const forbidden = ['INSERT ', 'UPDATE ', 'DELETE ', 'DROP ', 'ALTER ', 'CREATE ', 'TRUNCATE ', 'GRANT ', 'REVOKE '];
    for (const keyword of forbidden) {
      if (normalized.includes(keyword) && !normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
        return { error: `Query rejected: ${keyword.trim()} statements are not allowed. SELECT only.` };
      }
    }
    
    if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH') && !normalized.startsWith('EXPLAIN')) {
      return { error: 'Only SELECT, WITH (CTE), and EXPLAIN queries are allowed.' };
    }
    
    // Force LIMIT if not present
    if (!normalized.includes('LIMIT')) {
      return { error: 'Query must include a LIMIT clause to prevent runaway queries. Add LIMIT N.' };
    }
    
    console.log(`[execute_sql] ${description || 'No description'}`);
    console.log(`[execute_sql] Query: ${sql.slice(0, 500)}`);
    
    const startTime = Date.now();
    const result = await pool.query(sql);
    const duration = Date.now() - startTime;
    
    console.log(`[execute_sql] ${result.rows.length} rows in ${duration}ms`);
    
    return {
      rows: result.rows,
      rowCount: result.rows.length,
      duration_ms: duration,
      description: description || null
    };
    
  } catch (error) {
    console.error('[execute_sql] Error:', error.message);
    return { 
      error: error.message,
      hint: error.hint || null,
      detail: error.detail || null
    };
  }
}

async function analyzeProperty({ parcel_ids }) {
  // Wrap existing orchestrator service
  const analyses = [];
  
  for (const parcelId of parcel_ids.slice(0, 5)) { // Max 5 at a time
    try {
      const analysis = await analyzeDevelopmentFeasibility(parcelId);
      analyses.push({ parcel_id: parcelId, ...analysis });
    } catch (err) {
      analyses.push({ parcel_id: parcelId, error: err.message });
    }
  }
  
  return { analyses };
}

async function webSearchTool({ query, search_type = 'general', location }) {
  // Wrap existing web search service
  const fullQuery = location ? `${query} ${location}` : query;
  
  try {
    const results = await webSearch(fullQuery, { type: search_type });
    return results;
  } catch (err) {
    return { error: err.message, query };
  }
}

async function getOsmNearby({ lat, lng, radius_meters = 500, categories }) {
  try {
    // Query OSM via existing endpoint logic or Overpass API
    const categoryMap = {
      restaurant: 'amenity=restaurant',
      retail: 'shop',
      transit: 'public_transport',
      school: 'amenity=school',
      park: 'leisure=park',
      hospital: 'amenity=hospital',
      bank: 'amenity=bank',
      grocery: 'shop=supermarket'
    };

    // Query osm_pois_travis table
    let query;
    let values;

    if (categories && Array.isArray(categories) && categories.length > 0) {
      query = `
        SELECT 
          id,
          name,
          category,
          subcategory,
          latitude,
          longitude,
          address,
          ST_AsGeoJSON(geom)::json as geometry,
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) as distance_meters
        FROM osm_pois_travis
        WHERE ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
        AND category = ANY($4)
        ORDER BY distance_meters
        LIMIT 50
      `;
      values = [lng, lat, radius_meters, categories];
    } else {
      query = `
        SELECT 
          id,
          name,
          category,
          subcategory,
          latitude,
          longitude,
          address,
          ST_AsGeoJSON(geom)::json as geometry,
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) as distance_meters
        FROM osm_pois_travis
        WHERE ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
        ORDER BY distance_meters
        LIMIT 50
      `;
      values = [lng, lat, radius_meters];
    }

    const result = await prisma.$queryRawUnsafe(query, ...values);

    return {
      center: { lat, lng },
      radius_meters,
      pois: result.map(row => ({
        id: row.id,
        name: row.name,
        category: row.category,
        subcategory: row.subcategory,
        latitude: row.latitude,
        longitude: row.longitude,
        address: row.address,
        geometry: row.geometry,
        distance_meters: row.distance_meters
      }))
    };
  } catch (error) {
    console.error('[getOsmNearby] Error:', error.message);
    return {
      center: { lat, lng },
      radius_meters,
      pois: [],
      error: error.message
    };
  }
}

async function getGisLayers({ layer_id, bbox, parcel_id, action }) {
  console.log('[get_gis_layers] Called with:', { layer_id, bbox, parcel_id, action });

  // Look up layer in registry
  const layer = LAYER_REGISTRY[layer_id];
  if (!layer) {
    const availableLayers = Object.keys(LAYER_REGISTRY);
    console.error('[get_gis_layers] Unknown layer_id:', layer_id);
    return {
      action: 'layer_unavailable',
      layerId: layer_id,
      displayName: 'Unknown Layer',
      hasData: false,
      message: `Unknown layer: ${layer_id}. Available layers: ${availableLayers.join(', ')}`
    };
  }

  // Check if layer has data
  if (!layer.hasData) {
    console.log(`[get_gis_layers] Layer has no data: ${layer_id}`);
    return {
      action: 'layer_unavailable',
      layerId: layer.id,
      displayName: layer.displayName,
      hasData: false,
      message: `${layer.displayName} data has not been imported yet. This layer is planned for a future data sprint.`
    };
  }

  // Return layer toggle instruction for available layers
  const requestedAction = action || 'show';
  console.log(`[get_gis_layers] Layer available: ${layer.displayName}, action: ${requestedAction}`);
  
  return {
    action: requestedAction === 'hide' ? 'hide_layer' : 'show_layer',
    layerId: layer.id,
    displayName: layer.displayName,
    hasData: true,
    style: layer.style,
    message: requestedAction === 'hide' 
      ? `Hiding ${layer.displayName} from the map.`
      : `Showing ${layer.displayName} on the map.`
  };
}

async function generateArtifact({ type, parcel_ids, title }) {
  // Get property data for the artifact (already normalized by getProperty)
  const properties = await Promise.all(
    parcel_ids.slice(0, 10).map(id => getProperty({ parcel_id: id }))
  );

  let data = {};
  let reactComponent = '';

  switch (type) {
    case 'development_analysis': {
      const analyses = await analyzeProperty({ parcel_ids });
      data = {
        properties,
        analyses: analyses.analyses,
        summary: generateSummary(analyses.analyses[0])
      };
      reactComponent = 'DevelopmentAnalysisArtifact';
      break;
    }
    case 'acquisition_report': {
      data = {
        properties,
        summary: `Acquisition report for ${properties.length} properties`,
        generated_at: new Date().toISOString()
      };
      reactComponent = 'AcquisitionReportArtifact';
      break;
    }
    case 'property_comparison': {
      data = {
        properties,
        comparison_table: properties.map(p => ({
          parcel_id: p.parcel_id,
          address: p.address,
          acres: p.acres,
          market_value: p.market_value,
          asset_class: p.asset_class
        }))
      };
      reactComponent = 'PropertyComparisonArtifact';
      break;
    }
    case 'market_analysis': {
      const webResults = await webSearchTool({ 
        query: 'Austin real estate market trends', 
        search_type: 'market_news' 
      });
      data = {
        properties,
        market_data: webResults,
        summary: `Market analysis for ${properties.length} properties`
      };
      reactComponent = 'MarketAnalysisArtifact';
      break;
    }
  }

  // Generate artifact via existing artifact service
  let downloadUrl = null;
  let artifactId = null;
  try {
    // Map tool types to artifact service types
    const artifactTypeMap = {
      'development_analysis': 'development_analysis',
      'acquisition_report': 'acquisition_report',
      'property_comparison': 'comp_analysis',
      'market_analysis': 'site_analysis'
    };
    
    const artifactType = artifactTypeMap[type] || type;
    const artifact = await createArtifact({
      type: artifactType,
      parcelIds: parcel_ids,
      sessionId: 'artifact-gen',
      queryInput: { tool_type: type, title },
      options: data
    });
    artifactId = artifact.artifact_id;
    downloadUrl = `/api/artifacts/${artifact.artifact_id}/download`;
  } catch (err) {
    console.warn('[Artifact] Generation failed:', err.message);
  }

  return {
    type,
    title: title || `${type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
    reactComponent,
    data,
    artifact_id: artifactId,
    downloadUrl
  };
}


function generateSummary(analysis) {
  if (!analysis || analysis.error) return 'Analysis unavailable';
  const prop = analysis.property || {};
  return `${prop.address || 'Property'} - ${prop.acres || 0} acres. ${analysis.recommendation?.summary || ''}`;
}

export default { executeTool };
