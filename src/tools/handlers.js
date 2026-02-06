// src/tools/handlers.js
// Tool execution handlers - wraps existing services

import { PrismaClient } from '@prisma/client';
import { analyzeDevelopmentFeasibility } from '../services/enrichment/orchestrator.js';
import { webSearch } from '../services/webSearch/index.js';
import { createArtifact } from '../services/artifacts/index.js';
import { intelligentPropertySearch } from '../services/query-orchestrator/index.js';
import { getDemographicsForLocation } from '../services/census/index.js';
import { normalizeProperty, normalizeProperties } from '../utils/normalizeProperty.js';
import { LAYER_REGISTRY } from '../config/gis-layer-registry.js';

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
    case 'intelligent_property_search':
      return await handleIntelligentSearch(toolInput);
    case 'search_properties':
      return await searchProperties(toolInput);
    case 'get_property':
      return await getProperty(toolInput);
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
    case 'get_census_data':
      return await getCensusData(toolInput);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ============ TOOL IMPLEMENTATIONS ============

async function searchProperties({ filters = {}, limit = 50, bbox }) {
  try {
    const conditions = ['1=1'];
    const values = [];
    let paramIndex = 1;

  // Build WHERE conditions from filters
  // Note: mail_city and mail_zip are NULL in database - use situs_address parsing instead
  if (filters.zip_code) {
    conditions.push(`situs_address LIKE '%' || $${paramIndex++} || '%'`);
    values.push(filters.zip_code);
  }
  if (filters.city) {
    conditions.push(`situs_address ILIKE '%' || $${paramIndex++} || '%'`);
    values.push(filters.city);
  }
  if (filters.zoning_code) {
    conditions.push(`zoning_code = $${paramIndex++}`);
    values.push(filters.zoning_code);
  }
  if (filters.min_acres !== undefined) {
    conditions.push(`acres_calc >= $${paramIndex++}`);
    values.push(filters.min_acres);
  }
  if (filters.max_acres !== undefined) {
    conditions.push(`acres_calc <= $${paramIndex++}`);
    values.push(filters.max_acres);
  }
  if (filters.min_value !== undefined) {
    conditions.push(`market_value >= $${paramIndex++}`);
    values.push(filters.min_value);
  }
  if (filters.max_value !== undefined) {
    conditions.push(`market_value <= $${paramIndex++}`);
    values.push(filters.max_value);
  }
  if (filters.asset_class) {
    conditions.push(`LOWER(asset_class) = LOWER($${paramIndex++})`);
    values.push(filters.asset_class);
  }
  if (filters.has_homestead !== undefined) {
    conditions.push(`homestead_exemption_flag = $${paramIndex++}`);
    values.push(filters.has_homestead);
  }
  if (filters.is_tax_delinquent !== undefined) {
    conditions.push(`tax_delinquent_flag = $${paramIndex++}`);
    values.push(filters.is_tax_delinquent);
  }
  if (bbox && bbox.length === 4) {
    conditions.push(`ST_Intersects(geom_centroid, ST_MakeEnvelope($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 4326))`);
    values.push(...bbox);
  }

  const safeLimit = Math.min(limit, 500);
  values.push(safeLimit);

  const query = `
    SELECT 
      pft.parcel_id,
      pft.situs_address,
      pft.owner_name_raw,
      pft.owner_entity_type,
      pft.owner_segment,
      pft.acres_calc,
      pft.asset_class,
      pft.market_value,
      pft.assessed_total_value,
      pft.tax_delinquent_flag,
      pft.homestead_exemption_flag,
      pft.mail_zip,
      pft.land_use_code,
      pft.land_use_desc,
      -- Enrichment fields
      e.land_value,
      e.improvement_value,
      e.year_built,
      e.zoning_code,
      e.flood_zone,
      e.last_sale_date,
      e.last_sale_price,
      -- Geometry
      ST_AsGeoJSON(pft.geom_centroid)::json as geometry
    FROM parcel_features_travis pft
    LEFT JOIN parcels_travis_enrichment e 
      ON pft.parcel_id = e.parcel_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY pft.acres_calc DESC
    LIMIT $${paramIndex}
  `;

  const result = await prisma.$queryRawUnsafe(query, ...values);
  
  // Compute derived metrics for each row
  const rowsWithMetrics = result.map(row => {
    const acres = parseFloat(row.acres_calc) || 0;
    const marketVal = parseFloat(row.market_value) || 0;
    const improvVal = parseFloat(row.improvement_value) || 0;
    
    return {
      ...row,
      value_per_acre: acres > 0 ? Math.round(marketVal / acres) : null,
      value_per_sqft: acres > 0 ? Math.round(marketVal / (acres * 43560) * 100) / 100 : null,
      improvement_ratio: marketVal > 0 ? Math.round((improvVal / marketVal) * 100) / 100 : null,
    };
  });
  
  // Convert to GeoJSON FeatureCollection with normalized properties
  const features = rowsWithMetrics.map(row => ({
    type: 'Feature',
    geometry: row.geometry,
    properties: normalizeProperty({
      ...row,
      // Map additional fields that might not be in normalizeProperty
      last_sale_date: row.last_sale_date,
      last_sale_price: row.last_sale_price,
      land_use_code: row.land_use_code,
      land_use_desc: row.land_use_desc,
      owner_segment: row.owner_segment,
      zip: row.mail_zip
    })
  }));

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        count: features.length,
        query_filters: filters
      }
    };
  } catch (error) {
    console.error('[searchProperties] Error:', error.message);
    return {
      type: 'FeatureCollection',
      features: [],
      metadata: {
        error: error.message,
        count: 0
      }
    };
  }
}

async function getProperty({ parcel_id }) {
  try {
    const result = await prisma.$queryRawUnsafe(`
    SELECT 
      pft.parcel_id,
      pft.situs_address,
      pft.owner_name_raw,
      pft.owner_entity_type,
      pft.owner_segment,
      pft.acres_calc,
      pft.asset_class,
      pft.market_value,
      pft.assessed_total_value,
      pft.tax_delinquent_flag,
      pft.homestead_exemption_flag,
      pft.mail_zip,
      pft.land_use_code,
      pft.land_use_desc,
      -- Enrichment fields
      e.land_value,
      e.improvement_value,
      e.year_built,
      e.zoning_code,
      e.flood_zone,
      e.last_sale_date,
      e.last_sale_price,
      -- Geometry
      ST_Y(pft.geom_centroid) as latitude,
      ST_X(pft.geom_centroid) as longitude,
      ST_AsGeoJSON(pft.geom_centroid)::json as centroid_geom,
      ST_AsGeoJSON(pt.geom)::json as parcel_geom
    FROM parcel_features_travis pft
    LEFT JOIN parcels_travis_enrichment e 
      ON pft.parcel_id = e.parcel_id
    LEFT JOIN parcels_travis pt 
      ON pft.parcel_id = pt.parcel_id
    WHERE pft.parcel_id = $1
  `, parcel_id);

  if (result.length === 0) {
    return { error: 'Property not found', parcel_id };
  }

  const row = result[0];
  
  // Return normalized property object
  return normalizeProperty({
    ...row,
    // Map additional fields that might not be in normalizeProperty
    last_sale_date: row.last_sale_date,
    last_sale_price: row.last_sale_price,
    land_use: row.land_use_desc,
    land_use_code: row.land_use_code,
    owner_segment: row.owner_segment,
    latitude: row.latitude,
    longitude: row.longitude,
    geometry: row.parcel_geom || row.centroid_geom
  });
  } catch (error) {
    console.error('[getProperty] Error:', error.message);
    return { error: error.message, parcel_id };
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

async function handleIntelligentSearch(params) {
  console.log('[IntelligentSearch] Called with:', JSON.stringify(params, null, 2));
  try {
    const result = await intelligentPropertySearch(params);
    console.log(`[IntelligentSearch] Returning ${result.features?.length || 0} results`);
    return result;
  } catch (error) {
    console.error('[IntelligentSearch] Error:', error);
    return {
      type: 'FeatureCollection',
      query_summary: { error: error.message },
      features: [],
      summary: `Search failed: ${error.message}`
    };
  }
}

async function getCensusData({ latitude, longitude }) {
  if (!latitude || !longitude) {
    return { error: 'latitude and longitude are required' };
  }

  try {
    const result = await getDemographicsForLocation(latitude, longitude);
    return result;
  } catch (error) {
    console.error('[Census Tool] Error:', error);
    return { error: error.message };
  }
}

function generateSummary(analysis) {
  if (!analysis || analysis.error) return 'Analysis unavailable';
  const prop = analysis.property || {};
  return `${prop.address || 'Property'} - ${prop.acres || 0} acres. ${analysis.recommendation?.summary || ''}`;
}

export default { executeTool };
