// src/tools/handlers.js
// Tool execution handlers - wraps existing services

import { PrismaClient } from '@prisma/client';
import { analyzeDevelopmentFeasibility } from '../services/enrichment/orchestrator.js';
import { webSearch } from '../services/webSearch/index.js';
import { createArtifact } from '../services/artifacts/index.js';
import { intelligentPropertySearch } from '../services/query-orchestrator/index.js';
import { getDemographicsForLocation } from '../services/census/index.js';

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
      parcel_id,
      situs_address,
      owner_name_raw,
      acres_calc,
      asset_class,
      market_value,
      tax_delinquent_flag,
      homestead_exemption_flag,
      mail_zip,
      ST_AsGeoJSON(geom_centroid)::json as geometry
    FROM parcel_features_travis
    WHERE ${conditions.join(' AND ')}
    ORDER BY acres_calc DESC
    LIMIT $${paramIndex}
  `;

  const result = await prisma.$queryRawUnsafe(query, ...values);
  
  // Convert to GeoJSON FeatureCollection
  const features = result.map(row => ({
    type: 'Feature',
    geometry: row.geometry,
    properties: {
      parcel_id: row.parcel_id,
      address: row.situs_address,
      owner: row.owner_name_raw,
      acres: row.acres_calc,
      asset_class: row.asset_class,
      market_value: row.market_value,
      tax_delinquent: row.tax_delinquent_flag,
      homestead: row.homestead_exemption_flag,
      zip: row.mail_zip
    }
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
      pf.*,
      ST_Y(pf.geom_centroid) as latitude,
      ST_X(pf.geom_centroid) as longitude,
      ST_AsGeoJSON(pf.geom_centroid)::json as centroid_geom,
      ST_AsGeoJSON(pt.geom)::json as parcel_geom
    FROM parcel_features_travis pf
    LEFT JOIN parcels_travis pt ON pf.parcel_id = pt.parcel_id
    WHERE pf.parcel_id = $1
  `, parcel_id);

  if (result.length === 0) {
    return { error: 'Property not found', parcel_id };
  }

  const row = result[0];
  return {
    parcel_id: row.parcel_id,
    address: row.situs_address,
    owner: row.owner_name_raw,
    owner_type: row.owner_entity_type,
    acres: row.acres_calc,
    asset_class: row.asset_class,
    year_built: row.year_built,
    building_sqft: row.building_sqft,
    market_value: row.market_value,
    land_value: row.land_value,
    improvement_value: row.improvement_value,
    tax_delinquent: row.tax_delinquent_flag,
    homestead: row.homestead_exemption_flag,
    zoning_code: row.zoning_code,
    flood_zone: row.flood_zone,
    land_use: row.land_use_desc,
    last_sale_date: row.last_sale_date,
    last_sale_price: row.last_sale_price,
    latitude: row.latitude,
    longitude: row.longitude,
    geometry: row.parcel_geom || row.centroid_geom
  };
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

async function getGisLayers({ layer_id, bbox, parcel_id }) {
  console.log('[get_gis_layers] Called with:', { layer_id, bbox, parcel_id });

  /**
   * Map layer_id to actual database table
   *
   * LOCAL DATA AVAILABLE (all use 'geometry' column):
   * - zoning_districts: ✅ 22,488 rows
   * - parcels_travis: ✅ parcel boundaries (uses 'geom' column)
   * - gis_floodplain_austin: ✅ Austin floodplain data
   * - gis_water_ccn: ✅ Water CCN boundaries
   * - gis_sewer_ccn: ✅ Sewer CCN boundaries
   * - gis_wetlands_cef: ✅ CEF wetlands
   * - gis_contours_austin: ✅ Elevation contours
   * - gis_cef_buffers: ✅ CEF biological buffers
   * - gis_water_districts: ✅ Water/wastewater districts
   */
  const layerMap = {
    // LOCAL DATA LAYERS
    'zoning_districts': {
      table: 'zoning_districts',
      geomCol: 'geometry',
      available: true,
      source: 'local',
      fallbackArcgis: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Zoning_1/MapServer/0'
    },
    'parcels_boundaries': {
      table: 'parcels_travis',
      geomCol: 'geom',
      available: true,
      source: 'local'
    },
    'floodplain': {
      table: 'gis_floodplain_austin',
      geomCol: 'geometry',
      available: true,
      source: 'local'
    },
    'water_mains': {
      table: 'gis_water_ccn',
      geomCol: 'geometry',
      available: true,
      source: 'local'
    },
    'sewer_mains': {
      table: 'gis_sewer_ccn',
      geomCol: 'geometry',
      available: true,
      source: 'local'
    },
    'wetlands': {
      table: 'gis_wetlands_cef',
      geomCol: 'geometry',
      available: true,
      source: 'local'
    },
    'contours': {
      table: 'gis_contours_austin',
      geomCol: 'geometry',
      available: true,
      source: 'local'
    },
    'cef_buffers': {
      table: 'gis_cef_buffers',
      geomCol: 'geometry',
      available: true,
      source: 'local'
    },
    'water_districts': {
      table: 'gis_water_districts',
      geomCol: 'geometry',
      available: true,
      source: 'local'
    },

    // NOT YET LOADED (return informative message)
    'fema_flood_zones': {
      available: false,
      source: 'not_loaded',
      message: 'FEMA flood data not yet imported. Use floodplain layer for local Austin flood data.'
    },
    'building_permits': {
      available: false,
      source: 'not_loaded',
      message: 'Building permits not yet imported.'
    },
    'gas_mains': {
      available: false,
      source: 'not_loaded',
      message: 'Gas infrastructure not yet imported.'
    }
  };

  const layer = layerMap[layer_id];
  if (!layer) {
    const availableLayers = Object.keys(layerMap).filter(id => layerMap[id].available);
    console.error('[get_gis_layers] Unknown layer_id:', layer_id);
    return {
      error: `Unknown layer: ${layer_id}. Available layers: ${availableLayers.join(', ')}`,
      available_layers: availableLayers,
      layer_id
    };
  }

  // Handle not-yet-loaded layers
  if (layer.source === 'not_loaded') {
    console.log(`[get_gis_layers] Layer not loaded: ${layer_id}`);
    return {
      layer_id,
      source: 'not_loaded',
      message: layer.message
    };
  }

  // LOCAL DATABASE QUERY
  // Verify table still exists
  try {
    const tableCheck = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = $1
      ) as exists
    `, layer.table);

    if (!tableCheck[0].exists) {
      // Fallback to ArcGIS if available
      if (layer.fallbackArcgis) {
        console.log(`[get_gis_layers] Local table missing, using fallback: ${layer.fallbackArcgis}`);
        return {
          layer_id,
          source: 'arcgis_fallback',
          arcgisUrl: layer.fallbackArcgis,
          message: 'Local table not available, use ArcGIS endpoint'
        };
      }
      return {
        error: `GIS layer "${layer_id}" is not available`,
        layer_id
      };
    }
  } catch (checkErr) {
    console.error('[get_gis_layers] Error checking table:', checkErr.message);
    if (layer.fallbackArcgis) {
      return {
        layer_id,
        source: 'arcgis_fallback',
        arcgisUrl: layer.fallbackArcgis,
        message: 'Local query failed, use ArcGIS endpoint'
      };
    }
    return { error: `Failed to verify table: ${checkErr.message}`, layer_id };
  }

  // Validate required parameters
  if (!bbox && !parcel_id) {
    console.error('[get_gis_layers] Missing required parameter: bbox or parcel_id');
    return { error: 'Either bbox or parcel_id required' };
  }

  if (bbox && (!Array.isArray(bbox) || bbox.length !== 4)) {
    console.error('[get_gis_layers] Invalid bbox format:', bbox);
    return { error: 'bbox must be an array of 4 numbers [minLng, minLat, maxLng, maxLat]' };
  }

  let query;
  let values = [];

  try {
    if (parcel_id) {
      query = `
        SELECT
          l.*,
          ST_AsGeoJSON(l.${layer.geomCol})::json as geometry
        FROM ${layer.table} l
        JOIN parcels_travis p ON ST_Intersects(l.${layer.geomCol}, p.geom)
        WHERE p.parcel_id = $1
        LIMIT 100
      `;
      values = [parcel_id];
      console.log('[get_gis_layers] Querying LOCAL by parcel_id:', parcel_id);
    } else if (bbox && bbox.length === 4) {
      query = `
        SELECT
          *,
          ST_AsGeoJSON(${layer.geomCol})::json as geometry
        FROM ${layer.table}
        WHERE ST_Intersects(${layer.geomCol}, ST_MakeEnvelope($1, $2, $3, $4, 4326))
        LIMIT 500
      `;
      values = bbox;
      console.log('[get_gis_layers] Querying LOCAL by bbox:', bbox);
    }

    const result = await prisma.$queryRawUnsafe(query, ...values);
    console.log(`[get_gis_layers] LOCAL query success: ${result.length} features`);

    return {
      type: 'FeatureCollection',
      layer_id,
      source: 'local',
      features: result.map(row => ({
        type: 'Feature',
        geometry: row.geometry,
        properties: Object.fromEntries(
          Object.entries(row).filter(([k]) => k !== 'geometry' && !k.includes('geom'))
        )
      }))
    };
  } catch (err) {
    console.error('[get_gis_layers] Query error:', err.message);
    // Fallback to ArcGIS on error
    if (layer.fallbackArcgis) {
      return {
        layer_id,
        source: 'arcgis_fallback',
        arcgisUrl: layer.fallbackArcgis,
        message: 'Local query failed, use ArcGIS endpoint',
        error: err.message
      };
    }
    return {
      error: `Failed to query GIS layer: ${err.message}`,
      layer_id,
      table: layer.table
    };
  }
}

async function generateArtifact({ type, parcel_ids, title }) {
  // Get property data for the artifact
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
