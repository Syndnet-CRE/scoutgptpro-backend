import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { searchMapServers } from '../services/mapserver-service.js';
import { extractCategories } from '../services/category-mapper.js';
import { queryProperties, needsPropertyData } from '../services/property-service.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { preprocessToolInput, isValidBbox } from '../services/zipCodeResolver.js';
import { validateIntent } from '../validators/intentSchema.js';
import { validateAiQueryRequest } from '../validators/aiQuerySchema.js';
import { sendError } from '../utils/apiResponse.js';
import { assertAcresFilter, assertAssetClassFilter, assertOwnerSegmentFilter, assertMarketValueFilter, assertOwnerEntityTypeFilter, assertTaxDelinquentFilter } from '../utils/filterAssertions.js';
import { queryLogger } from '../middleware/queryLogger.js';
import { normalizeProperty, normalizeProperties } from '../utils/normalizeProperty.js';

// Import Boris's 12-step pipeline
import { executeQuery as executePipelineQuery, continueWithClarification } from '../services/pipeline/index.js';

const router = express.Router();
const anthropic = new Anthropic({ 
  apiKey: process.env.CLAUDE_API_KEY 
});

// ============================================================================
// Tool Definitions for Claude
// ============================================================================

const AI_TOOLS = [
  {
    name: 'search_properties',
    description: 'Search for properties in the database based on filters. Use this to find properties matching criteria like acreage, asset class, owner type, price range, tax status, etc.',
    input_schema: {
      type: 'object',
      properties: {
        county_fips: {
          type: 'string',
          description: 'County FIPS code. Use "48453" for Travis County.'
        },
        bbox: {
          type: 'array',
          items: { type: 'number' },
          description: 'Bounding box [minLng, minLat, maxLng, maxLat] for spatial filtering. Do NOT pass ZIP codes here - use zip_code field instead.'
        },
        zip_code: {
          type: ['string', 'number'],
          description: '5-digit ZIP code (e.g., "78758" or 78758). System will resolve to bounding box automatically. PREFERRED over bbox for ZIP codes.'
        },
        acres_min: {
          type: 'number',
          description: 'Minimum acreage'
        },
        acres_max: {
          type: 'number',
          description: 'Maximum acreage'
        },
        asset_class: {
          oneOf: [
            { 
              type: 'string', 
              enum: ['residential', 'commercial', 'land', 'industrial', 'mixed', 'unknown'] 
            },
            { 
              type: 'array', 
              items: { 
                type: 'string', 
                enum: ['residential', 'commercial', 'land', 'industrial', 'mixed', 'unknown'] 
              },
              description: 'Multiple values for OR condition'
            }
          ],
          description: 'Property type filter. Single value or array for OR condition (e.g., ["residential", "commercial"]). MUST be lowercase.'
        },
        owner_entity_type: {
          oneOf: [
            { 
              type: 'string', 
              enum: ['person', 'llc', 'corp', 'trust_estate', 'unknown'] 
            },
            { 
              type: 'array', 
              items: { 
                type: 'string', 
                enum: ['person', 'llc', 'corp', 'trust_estate', 'unknown'] 
              },
              description: 'Multiple values for OR condition'
            }
          ],
          description: 'Owner entity type filter. Single value or array for OR condition'
        },
        owner_segment: {
          oneOf: [
            { 
              type: 'string', 
              enum: ['mom_pop', 'small_operator', 'institutional', 'local_owner', 'absentee', 'unknown'] 
            },
            { 
              type: 'array', 
              items: { 
                type: 'string', 
                enum: ['mom_pop', 'small_operator', 'institutional', 'local_owner', 'absentee', 'unknown'] 
              },
              description: 'Multiple values for OR condition'
            }
          ],
          description: 'Owner segment filter. Single value or array for OR condition'
        },
        tax_delinquent: {
          type: 'boolean',
          description: 'Filter for tax delinquent properties'
        },
        homestead_exemption: {
          type: 'boolean',
          description: 'Filter by homestead exemption status. true = owner-occupied, false = investment/rental property'
        },
        market_value_min: {
          type: 'number',
          description: 'Minimum market value in dollars'
        },
        market_value_max: {
          type: 'number',
          description: 'Maximum market value in dollars'
        },
        owner_name_search: {
          type: 'string',
          description: 'Search owner names containing this text (case-insensitive partial match). Example: "Smith" finds "SMITH JOHN", "Blacksmith LLC", etc.'
        },
        address_search: {
          type: 'string',
          description: 'Search property addresses containing this text (case-insensitive partial match). Example: "Congress" finds "100 CONGRESS AVE", "Congress St", etc.'
        },
        in_opportunity_zone: {
          type: 'boolean',
          description: 'Filter for properties located in Qualified Opportunity Zones (QOZ). Set to true to find only properties in opportunity zones.'
        },
        aggregation: {
          type: 'object',
          description: 'For queries asking for counts, averages, totals, or groupings',
          properties: {
            group_by: {
              type: 'array',
              items: { 
                type: 'string',
                enum: ['mail_zip', 'asset_class', 'owner_entity_type', 'owner_segment', 'tax_delinquent_flag', 'homestead_exemption_flag']
              },
              description: 'Columns to group results by'
            },
            metrics: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['count', 'sum', 'avg', 'min', 'max'] },
                  field: { type: 'string', enum: ['market_value', 'acres_calc', 'building_sqft', 'land_value'] },
                  alias: { type: 'string' }
                },
                required: ['type']
              }
            }
          }
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of results (default 50, max 200)'
        }
      },
      required: []
    }
  },
  {
    name: 'toggle_gis_layer',
    description: 'Toggle visibility of a GIS map layer. Use this when user wants to show, hide, or toggle map layers like zoning, flood zones, parcels, utilities, etc.',
    input_schema: {
      type: 'object',
      properties: {
        layer: {
          type: 'string',
          enum: ['zoning_districts', 'fema_flood_zones', 'parcel_boundaries', 'sewer_mains', 'sewer_manholes', 'water_mains', 'fire_hydrants', 'water_meters', 'wetland_types', 'building_permits', 'gas_mains'],
          description: 'The GIS layer to toggle'
        },
        action: {
          type: 'string',
          enum: ['show', 'hide', 'toggle'],
          description: 'Action to perform on the layer'
        }
      },
      required: ['layer', 'action']
    }
  },
  {
    name: 'search_pois',
    description: 'Search for points of interest (POIs) like self storage facilities, truck stops, RV parks, mobile home parks.',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['self_storage', 'truck_stop', 'rv_park', 'mobile_home_park'],
          description: 'POI category to search'
        },
        bbox: {
          type: 'array',
          items: { type: 'number' },
          description: 'Bounding box [minLng, minLat, maxLng, maxLat] for spatial filtering'
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of results (default 100)'
        }
      },
      required: ['category']
    }
  },
  {
    name: 'get_property',
    description: 'Get detailed information about a specific property by parcel ID.',
    input_schema: {
      type: 'object',
      properties: {
        parcel_id: {
          type: 'string',
          description: 'The parcel ID to look up'
        }
      },
      required: ['parcel_id']
    }
  },
  {
    name: 'search_near_reference',
    description: 'Search properties within a distance of a highway, boundary, or landmark. Use this when users say "near I-35", "along US-183", "within X miles of [reference]".',
    input_schema: {
      type: 'object',
      properties: {
        reference_name: {
          type: 'string',
          description: 'Name of the reference feature (e.g., "I-35", "US-183", "Travis County boundary", "Downtown Austin")'
        },
        distance_miles: {
          type: 'number',
          description: 'Distance in miles from the reference feature. Default 1 mile if not specified.'
        },
        acres_min: { type: 'number', description: 'Minimum acreage' },
        acres_max: { type: 'number', description: 'Maximum acreage' },
        asset_class: {
          oneOf: [
            { type: 'string', enum: ['residential', 'commercial', 'land', 'industrial', 'mixed', 'unknown'] },
            { type: 'array', items: { type: 'string', enum: ['residential', 'commercial', 'land', 'industrial', 'mixed', 'unknown'] } }
          ],
          description: 'Property type filter'
        },
        owner_entity_type: {
          oneOf: [
            { type: 'string', enum: ['person', 'llc', 'corp', 'trust_estate', 'unknown'] },
            { type: 'array', items: { type: 'string', enum: ['person', 'llc', 'corp', 'trust_estate', 'unknown'] } }
          ],
          description: 'Owner entity type filter'
        },
        owner_segment: {
          oneOf: [
            { type: 'string', enum: ['mom_pop', 'small_operator', 'institutional', 'local_owner', 'absentee', 'unknown'] },
            { type: 'array', items: { type: 'string', enum: ['mom_pop', 'small_operator', 'institutional', 'local_owner', 'absentee', 'unknown'] } }
          ],
          description: 'Owner segment filter'
        },
        tax_delinquent: { type: 'boolean', description: 'Filter for tax delinquent properties' },
        homestead_exemption: { type: 'boolean', description: 'Filter by homestead exemption status' },
        market_value_min: { type: 'number', description: 'Minimum market value in dollars' },
        market_value_max: { type: 'number', description: 'Maximum market value in dollars' },
        in_opportunity_zone: { type: 'boolean', description: 'Filter for properties in Qualified Opportunity Zones' },
        limit: { type: 'integer', description: 'Maximum number of results (default 50)', default: 50 }
      },
      required: ['reference_name']
    }
  }
];

// ============================================================================
// Tool Execution Functions
// ============================================================================

/**
 * Get a database pool connection
 */
async function getDbPool() {
  const pg = await import('pg');
  return new pg.default.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5
  });
}

/**
 * Execute search_properties tool
 */
async function executeSearchProperties(input, pool) {
  console.log('🔧 Executing search_properties:', input);
  
  // Preprocess tool input to resolve ZIP codes in bbox field
  const processedInput = preprocessToolInput(input);
  if (processedInput._bboxResolvedFrom) {
    console.log(`[AI Query] Resolved bbox from: ${processedInput._bboxResolvedFrom}`);
  }
  
  const rawIntent = {
    geo: {
      county_fips: processedInput.county_fips || null,
      bbox: processedInput.bbox || null
    },
    filters: {
      acres_min: input.acres_min ?? null,
      acres_max: input.acres_max ?? null,
      asset_class: input.asset_class ?? null,  // Can be string or array
      owner_entity_type: input.owner_entity_type ?? null,  // Can be string or array
      owner_segment: input.owner_segment ?? null,  // Can be string or array
      tax_delinquent: input.tax_delinquent ?? null,
      homestead_exemption: input.homestead_exemption ?? null,
      market_value_min: input.market_value_min ?? null,
      market_value_max: input.market_value_max ?? null,
      owner_name_search: input.owner_name_search ?? null,
      address_search: input.address_search ?? null
    },
    in_opportunity_zone: input.in_opportunity_zone ?? null,
    limit: Math.min(Math.max(input.limit || 50, 1), 200)
  };
  
  // Validate intent
  const { valid, errors, sanitized } = validateIntent(rawIntent);
  if (!valid) {
    console.warn('[AI Query] Intent validation errors:', errors);
  }
  const intent = sanitized;
  
  // Check for aggregation query
  if (input.aggregation && (input.aggregation.group_by?.length > 0 || input.aggregation.metrics?.length > 0)) {
    console.log('📊 Building aggregation query');
    // Add aggregation to intent
    intent.aggregation = input.aggregation;
    const queryResult = buildAggregationQuery(intent);
    console.log('SQL:', queryResult.query);
    const result = await pool.query(queryResult.query, queryResult.values);
    
    return {
      type: 'AGGREGATION',
      data: result.rows,
      count: result.rowCount,
      groupBy: queryResult.groupBy,
      metrics: queryResult.metrics
    };
  }
  
  // Use existing buildParcelQuery function
  const { query: sqlQuery, values } = buildParcelQuery(intent);
  
  // Debug logging
  console.log('[executeSearchProperties] Intent:', JSON.stringify(intent, null, 2));
  console.log('[executeSearchProperties] SQL Query:', sqlQuery.replace(/\$\d+/g, (match) => {
    const idx = parseInt(match.substring(1)) - 1;
    return JSON.stringify(values[idx]);
  }));
  
  try {
    const result = await pool.query(sqlQuery, values);
    console.log('[executeSearchProperties] Query returned', result.rows.length, 'rows');
    // Normalize properties to camelCase for frontend consistency
    const properties = normalizeProperties(result.rows.map(row => ({
      parcel_id: row.parcel_id,
      situs_address: row.situs_address,
      owner_name_raw: row.owner_name_raw,
      owner_entity_type: row.owner_entity_type,
      owner_segment: row.owner_segment,
      acres_calc: parseFloat(row.acres_calc),
      asset_class: row.asset_class,
      market_value: row.market_value ? parseFloat(row.market_value) : null,
      land_value: row.land_value ? parseFloat(row.land_value) : null,
      improvement_value: row.improvement_value ? parseFloat(row.improvement_value) : null,
      tax_delinquent_flag: row.tax_delinquent_flag === true,
      homestead_exemption_flag: row.homestead_exemption_flag === true,
      county_fips: row.county_fips,
      geom: row.geom  // Already JSON from ST_AsGeoJSON
    })));
    
    // Run filter assertions
    if (intent.filters?.acres_min || intent.filters?.acres_max) {
      assertAcresFilter(properties, intent.filters.acres_min, intent.filters.acres_max);
    }
    if (intent.filters?.asset_class) {
      assertAssetClassFilter(properties, intent.filters.asset_class);
    }
    if (intent.filters?.owner_segment) {
      assertOwnerSegmentFilter(properties, intent.filters.owner_segment);
    }
    if (intent.filters?.owner_entity_type) {
      assertOwnerEntityTypeFilter(properties, intent.filters.owner_entity_type);
    }
    if (intent.filters?.market_value_min || intent.filters?.market_value_max) {
      assertMarketValueFilter(properties, intent.filters.market_value_min, intent.filters.market_value_max);
    }
    if (intent.filters?.tax_delinquent === true) {
      assertTaxDelinquentFilter(properties, true);
    }
    
    console.log(`✅ search_properties returned ${properties.length} results`);
    return {
      success: true,
      count: properties.length,
      properties: properties,
      intent: intent,
      validationErrors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    console.error('❌ search_properties error:', error);
    return {
      success: false,
      error: error.message,
      properties: []
    };
  }
}

/**
 * Execute toggle_gis_layer tool
 */
function executeToggleGisLayer(input) {
  console.log('🔧 Executing toggle_gis_layer:', input);
  
  // Return layer toggle command for frontend to execute
  return {
    success: true,
    type: 'GIS_LAYER_TOGGLE',
    layer: input.layer,
    action: input.action
  };
}

/**
 * Execute search_pois tool
 */
async function executeSearchPois(input, pool) {
  console.log('🔧 Executing search_pois:', input);
  
  const { category, bbox, limit = 100 } = input;
  
  try {
    let sql = `
      SELECT id, osm_id, name, category, subcategory, 
             latitude, longitude, address, city, state, zip
      FROM osm_pois 
      WHERE category = $1
    `;
    const values = [category];
    let paramIndex = 2;
    
    if (bbox && Array.isArray(bbox) && bbox.length === 4) {
      sql += ` AND longitude >= $${paramIndex} AND latitude >= $${paramIndex + 1} 
               AND longitude <= $${paramIndex + 2} AND latitude <= $${paramIndex + 3}`;
      values.push(bbox[0], bbox[1], bbox[2], bbox[3]);
      paramIndex += 4;
    }
    
    sql += ` LIMIT $${paramIndex}`;
    values.push(limit);
    
    const result = await pool.query(sql, values);
    console.log(`✅ search_pois returned ${result.rows.length} results`);
    
    return {
      success: true,
      count: result.rows.length,
      pois: result.rows
    };
  } catch (error) {
    console.error('❌ search_pois error:', error);
    return {
      success: false,
      error: error.message,
      pois: []
    };
  }
}

/**
 * Execute get_property tool
 */
async function executeGetProperty(input, pool) {
  console.log('🔧 Executing get_property:', input);
  
  const { parcel_id } = input;
  
  try {
    const sql = `
      SELECT 
        parcel_id,
        situs_address,
        owner_name_raw,
        owner_entity_type,
        acres_calc,
        asset_class,
        market_value,
        tax_delinquent_flag,
        ST_AsGeoJSON(geom_centroid)::json as geom
      FROM parcel_features_travis 
      WHERE parcel_id = $1
      LIMIT 1
    `;
    const result = await pool.query(sql, [parcel_id]);
    
    if (result.rows.length === 0) {
      return {
        success: false,
        error: `Property not found: ${parcel_id}`,
        property: null
      };
    }
    
    // Normalize property to camelCase for frontend consistency
    const rawProperty = {
      parcel_id: result.rows[0].parcel_id,
      situs_address: result.rows[0].situs_address,
      owner_name_raw: result.rows[0].owner_name_raw,
      owner_entity_type: result.rows[0].owner_entity_type,
      acres_calc: parseFloat(result.rows[0].acres_calc),
      asset_class: result.rows[0].asset_class,
      market_value: result.rows[0].market_value ? parseFloat(result.rows[0].market_value) : null,
      tax_delinquent_flag: result.rows[0].tax_delinquent_flag === true,
      geom: result.rows[0].geom
    };
    const property = normalizeProperty(rawProperty);
    
    console.log(`✅ get_property found parcel ${parcel_id}`);
    return {
      success: true,
      property: property
    };
  } catch (error) {
    console.error('❌ get_property error:', error);
    return {
      success: false,
      error: error.message,
      property: null
    };
  }
}

/**
 * Execute search_near_reference tool
 * Searches for properties within a distance of a spatial reference (highway, boundary, etc.)
 */
async function executeSearchNearReference(toolInput, pool) {
  console.log('🔧 Executing search_near_reference:', toolInput);

  const {
    reference_name,
    distance_miles = 1,
    ...propertyFilters
  } = toolInput;

  // Build intent object that buildParcelQuery understands
  const intent = {
    geo: {
      county_fips: null,
      bbox: null
    },
    filters: {
      acres_min: propertyFilters.acres_min ?? null,
      acres_max: propertyFilters.acres_max ?? null,
      asset_class: propertyFilters.asset_class ?? null,
      owner_entity_type: propertyFilters.owner_entity_type ?? null,
      owner_segment: propertyFilters.owner_segment ?? null,
      tax_delinquent: propertyFilters.tax_delinquent ?? null,
      homestead_exemption: propertyFilters.homestead_exemption ?? null,
      market_value_min: propertyFilters.market_value_min ?? null,
      market_value_max: propertyFilters.market_value_max ?? null
    },
    near_reference: {
      reference_name,
      distance_miles
    },
    in_opportunity_zone: propertyFilters.in_opportunity_zone ?? null,
    limit: Math.min(propertyFilters.limit || 50, 200)
  };

  // Use existing buildParcelQuery - DO NOT DUPLICATE LOGIC
  const { query, values } = buildParcelQuery(intent);

  try {
    const result = await pool.query(query, values);

    // Normalize properties to camelCase for frontend consistency
    const properties = normalizeProperties(result.rows.map(row => ({
      parcel_id: row.parcel_id,
      situs_address: row.situs_address,
      owner_name_raw: row.owner_name_raw,
      owner_entity_type: row.owner_entity_type,
      owner_segment: row.owner_segment,
      acres_calc: parseFloat(row.acres_calc),
      asset_class: row.asset_class,
      market_value: row.market_value ? parseFloat(row.market_value) : null,
      land_value: row.land_value ? parseFloat(row.land_value) : null,
      improvement_value: row.improvement_value ? parseFloat(row.improvement_value) : null,
      tax_delinquent_flag: row.tax_delinquent_flag,
      homestead_exemption_flag: row.homestead_exemption_flag,
      county_fips: row.county_fips,
      geom: row.geom
    })));

    console.log(`✅ search_near_reference returned ${properties.length} results near ${reference_name}`);
    return {
      success: true,
      type: 'PROPERTY_SEARCH',
      count: properties.length,
      properties: properties,
      reference_used: reference_name,
      distance_miles
    };
  } catch (error) {
    console.error('❌ search_near_reference error:', error);
    return {
      success: false,
      error: error.message,
      reference_name,
      properties: []
    };
  }
}

/**
 * Execute a tool by name
 */
async function executeTool(toolName, toolInput, pool) {
  switch (toolName) {
    case 'search_properties':
      return await executeSearchProperties(toolInput, pool);
    case 'search_near_reference':
      return await executeSearchNearReference(toolInput, pool);
    case 'toggle_gis_layer':
      return executeToggleGisLayer(toolInput);
    case 'search_pois':
      return await executeSearchPois(toolInput, pool);
    case 'get_property':
      return await executeGetProperty(toolInput, pool);
    default:
      console.error(`❌ Unknown tool: ${toolName}`);
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

/**
 * Process Claude response with potential tool calls
 */
async function processClaudeResponse(response, pool) {
  const results = {
    type: null,
    toolCalls: [],
    textResponse: null,
    properties: [],
    layers: [],
    pois: [],
    aggregation: null,
    groupBy: null,
    metrics: null,
    insights: null
  };
  
  // Process each content block
  for (const block of response.content) {
    if (block.type === 'text') {
      results.textResponse = block.text;
      results.insights = block.text;
    } else if (block.type === 'tool_use') {
      console.log(`🔧 Claude called tool: ${block.name}`);
      console.log('CLAUDE_TOOL_OUTPUT:', JSON.stringify(block.input, null, 2));
      
      const toolResult = await executeTool(block.name, block.input, pool);
      results.toolCalls.push({
        tool: block.name,
        input: block.input,
        result: toolResult
      });
      
      // Aggregate results by type
      if (block.name === 'search_properties' && toolResult.type === 'AGGREGATION') {
        results.type = 'AGGREGATION';
        results.aggregation = toolResult.data;
        results.groupBy = toolResult.groupBy;
        results.metrics = toolResult.metrics;
      } else if (block.name === 'search_properties' && toolResult.properties) {
        results.type = 'PROPERTY_SEARCH';
        results.properties.push(...toolResult.properties);
      } else if (block.name === 'toggle_gis_layer') {
        results.type = results.type || 'GIS_LAYER_TOGGLE';
        results.layers.push({
          layer: block.input.layer,
          action: block.input.action
        });
      } else if (block.name === 'search_pois' && toolResult.pois) {
        results.type = results.type || 'POI_SEARCH';
        results.pois.push(...toolResult.pois);
      } else if (block.name === 'get_property' && toolResult.property) {
        results.type = results.type || 'PROPERTY_DETAIL';
        results.properties.push(toolResult.property);
      }
    }
  }
  
  // If no tools called, it might be a conversational response
  if (results.toolCalls.length === 0 && results.textResponse) {
    results.type = 'CONVERSATIONAL';
  }
  
  return results;
}

// ============================================================================
// NEW: Intent Extraction System
// ============================================================================

const UNIFIED_SYSTEM_PROMPT = `You are a real estate AI assistant. Your job is to help users find properties, analyze data, and interact with map layers.

You have access to these tools:
1. search_properties - Search for properties with filters (acres, asset class, owner type, price, tax status)
2. toggle_gis_layer - Show/hide map layers (zoning, flood zones, parcels, utilities)
3. search_pois - Find points of interest (self storage, truck stops, RV parks, mobile home parks)
4. get_property - Get details for a specific parcel by ID

WHEN TO USE EACH TOOL:
- Property searches (find, show me, search for properties, parcels, land) → use search_properties
- Layer commands (show zoning, hide flood, toggle parcels) → use toggle_gis_layer
- POI searches (find self storage, show truck stops) → use search_pois
- Specific property lookup (details for parcel 123456) → use get_property

GEOGRAPHY MAPPING:
- ZIP codes (5 digits like 78759) → Use zip_code field, NOT bbox field. System will resolve to bbox automatically.
- "Travis County" → county_fips: "48453"
- "Northwest Austin", "Downtown", etc. → Use zip_code or city name, system will resolve to bbox
- bbox field should ONLY contain [minLng, minLat, maxLng, maxLat] arrays, never ZIP codes or city names

CRITICAL: All filter values MUST be lowercase.
- asset_class: use "commercial" not "Commercial"
- owner_entity_type: use "llc" not "LLC"
- owner_segment: use "local_owner" not "Local_Owner"

AVAILABLE VALUES:
- asset_class: residential, commercial, land, industrial, mixed, unknown
- owner_entity_type: person, llc, corp, trust_estate, unknown
- owner_segment: mom_pop, small_operator, institutional, local_owner, absentee, unknown

AVAILABLE FILTERS:
- asset_class: residential, commercial, land, industrial, mixed, unknown
- owner_segment: mom_pop, small_operator, institutional, local_owner, absentee, unknown
- owner_entity_type: person, llc, corp, trust_estate, unknown
- acres_min, acres_max: numeric values for acreage range
- market_value_min, market_value_max: numeric values for price range
- tax_delinquent: true/false
- homestead_exemption: true (owner-occupied) / false (investment property)
- county_fips: "48453" for Travis County

FILTER EXAMPLES:
- "commercial properties" → asset_class: "commercial"
- "vacant land" → asset_class: "land"
- "residential properties" → asset_class: "residential"
- "mom and pop owners" → owner_segment: "mom_pop"
- "LLC owned" → owner_entity_type: "llc"
- "institutional investors" → owner_segment: "institutional"
- "out of state owners" OR "absentee" → owner_segment: "absentee"
- "local owners" OR "in-state owners" → owner_segment: "local_owner"
- "small operators" → owner_segment: "small_operator"
- "2-4 acres" → acres_min: 2, acres_max: 4
- "over 5 acres" → acres_min: 5
- "under 10 acres" → acres_max: 10
- "under $500k" → market_value_max: 500000
- "over $1M" → market_value_min: 1000000
- "tax delinquent" → tax_delinquent: true
- "investment properties" OR "non-homestead" → homestead_exemption: false
- "owner occupied" OR "homestead" → homestead_exemption: true

IMPORTANT: 
- Always use snake_case for filter names
- Always use lowercase for filter values (commercial, not Commercial)
- Don't make up filter values - only use the ones listed above
- If unsure about a filter, omit it rather than guessing
- For combined queries (e.g., "commercial properties over 2 acres"), apply all relevant filters

AGGREGATION QUERIES:
When users ask for counts, totals, averages, or distributions, use the aggregation field:

- "how many properties by ZIP code" → aggregation: { group_by: ['mail_zip'], metrics: [{ type: 'count' }] }
- "count by asset class" → aggregation: { group_by: ['asset_class'], metrics: [{ type: 'count' }] }
- "average value by owner type" → aggregation: { group_by: ['owner_entity_type'], metrics: [{ type: 'avg', field: 'market_value' }] }
- "total commercial value" → filters: { asset_class: 'commercial' }, aggregation: { metrics: [{ type: 'sum', field: 'market_value' }] }
- "property statistics" → aggregation: { metrics: [{ type: 'count' }, { type: 'avg', field: 'market_value' }, { type: 'min', field: 'market_value' }, { type: 'max', field: 'market_value' }] }

IMPORTANT: 
- "how many" or "count" → use aggregation with type: 'count'
- "average" → use aggregation with type: 'avg'  
- "total" or "sum" → use aggregation with type: 'sum'
- "by ZIP" or "by owner type" → use group_by
- Filters still apply to aggregations (e.g., "average commercial value" uses both)

SPATIAL REFERENCE QUERIES:
- When users ask about properties "near", "along", "within X miles of" a highway, road, or boundary, use search_near_reference
- Reference names include: I-35, US-183, US-290, SH-130, SH-45, Loop 1 (Mopac), Travis County boundary
- Default distance is 1 mile if not specified
- Example: "vacant land near I-35" → search_near_reference with reference_name="I-35", asset_class=["land"]
- Example: "commercial within 2 miles of US-183" → search_near_reference with reference_name="US-183", distance_miles=2, asset_class=["commercial"]

OPPORTUNITY ZONE QUERIES:
- When users ask about "opportunity zones", "QOZ", "qualified opportunity zones", add in_opportunity_zone=true to the filters
- Can combine with other filters: "tax delinquent land in opportunity zones"
- Example: "properties in opportunity zones" → search_near_reference with in_opportunity_zone=true (or search_properties with in_opportunity_zone if no reference needed)

Always use the appropriate tool to fulfill the user's request. If multiple tools are needed (e.g., "show zoning and find properties"), call each tool.`;

const INTENT_EXTRACTION_SYSTEM_PROMPT = `You are a real estate query intent extractor. Extract structured filters from natural language property search queries.

OUTPUT FORMAT (JSON only, no markdown, no explanation):
{
  "geo": {
    "county_fips": "48453" | null,  // '48453' = Travis County
    "bbox": [minLng, minLat, maxLng, maxLat] | null
  },
  "filters": {
    "acres_min": number | null,
    "acres_max": number | null,
    "asset_class": string | string[] | null,  // Single value or array for OR (e.g., ["residential", "commercial"])
    "owner_entity_type": string | string[] | null,  // Single value or array for OR
    "owner_segment": string | string[] | null,  // Single value or array for OR
    "tax_delinquent": true | false | null,
    "homestead_exemption": true | false | null,  // true = owner-occupied, false = investment
    "market_value_min": number | null,
    "market_value_max": number | null,
    "owner_name_search": string | null,  // Partial match on owner name
    "address_search": string | null  // Partial match on address
  },
  "limit": number  // default 50, max 200
}

MAPPING RULES:
- "2 to 4 acres", "2-4 acres", "between 2 and 4 acres" → acres_min: 2, acres_max: 4
- "at least 5 acres", "over 5 acres", "more than 5 acres" → acres_min: 5
- "under 10 acres", "less than 10 acres" → acres_max: 10
- "Travis County", "in Travis" → county_fips: "48453"
- "tax delinquent", "back taxes", "tax lien" → tax_delinquent: true
- "investment property", "non-homestead", "rental property" → homestead_exemption: false
- "owner occupied", "homestead", "primary residence" → homestead_exemption: true
- "LLC owned", "owned by LLC" → owner_entity_type: "llc"
- "mom and pop", "mom & pop", "small owner" → owner_segment: "mom_pop"
- "local owners", "in-state owners", "local investors" → owner_segment: "local_owner"
- "commercial property" → asset_class: "commercial"
- "vacant land", "land" → asset_class: "land"
- "under $500k", "below $500000" → market_value_max: 500000
- "over $1M", "above $1000000" → market_value_min: 1000000

OR CONDITIONS:
- "residential or commercial" → asset_class: ["residential", "commercial"]
- "LLC or corporation" → owner_entity_type: ["llc", "corp"]
- "mom and pop or small operators" → owner_segment: ["mom_pop", "small_operator"]
- "residential and commercial properties" → asset_class: ["residential", "commercial"]
- "LLCs and corporations" → owner_entity_type: ["llc", "corp"]

TEXT SEARCH:
- "owned by Smith" → owner_name_search: "Smith"
- "properties owned by Blackstone" → owner_name_search: "Blackstone"
- "on Congress Ave" → address_search: "Congress"
- "address contains Main Street" → address_search: "Main Street"
- "owner name includes Johnson" → owner_name_search: "Johnson"
- "properties on Congress" → address_search: "Congress"

Return ONLY valid JSON. No markdown code blocks, no explanations.`;

/**
 * Extract structured intent from natural language query using Claude
 */
async function extractIntentFromQuery(query, bounds) {
  try {
    console.log('🧠 Extracting intent from query...');
    
    // Build user prompt with query and optional bounds
    let userPrompt = `Query: "${query}"`;
    if (bounds) {
      userPrompt += `\n\nOptional bounds: ${JSON.stringify(bounds)}`;
    }
    userPrompt += `\n\nExtract intent JSON:`;
    
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: UNIFIED_SYSTEM_PROMPT,
      tools: AI_TOOLS,
      messages: [{
        role: 'user',
        content: userPrompt
      }]
    });
    
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }
    
    // Extract JSON from response (handle markdown code blocks)
    let jsonText = content.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }
    
    // Parse JSON
    let intent;
    try {
      intent = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse Claude intent response:', parseError.message);
      console.error('Raw response (truncated):', jsonText.substring(0, 500));
      throw new Error('Intent extraction failed: Invalid JSON response from Claude');
    }
    
    // Validate and normalize
    const normalized = {
      geo: {
        county_fips: intent.geo?.county_fips || null,
        bbox: intent.geo?.bbox || (bounds ? [bounds.west, bounds.south, bounds.east, bounds.north] : null)
      },
      filters: {
        acres_min: intent.filters?.acres_min ?? null,
        acres_max: intent.filters?.acres_max ?? null,
        asset_class: intent.filters?.asset_class || null,
        owner_entity_type: intent.filters?.owner_entity_type || null,
        owner_segment: intent.filters?.owner_segment || null,
        tax_delinquent: intent.filters?.tax_delinquent ?? null,
        market_value_min: intent.filters?.market_value_min ?? null,
        market_value_max: intent.filters?.market_value_max ?? null
      },
      limit: Math.min(intent.limit || 100, 500)
    };
    
    console.log('✅ Extracted intent:', JSON.stringify(normalized, null, 2));
    return normalized;
    
  } catch (error) {
    console.error('❌ Intent extraction failed:', error);
    throw error;
  }
}

/**
 * Build deterministic SQL query against parcel_features_travis
 */
function buildParcelQuery(intent) {
  // CASE NORMALIZATION - Database requires lowercase
  if (intent.filters?.asset_class) {
    if (Array.isArray(intent.filters.asset_class)) {
      intent.filters.asset_class = intent.filters.asset_class.map(v => v.toLowerCase());
    } else {
      intent.filters.asset_class = intent.filters.asset_class.toLowerCase();
    }
  }
  if (intent.filters?.owner_entity_type) {
    if (Array.isArray(intent.filters.owner_entity_type)) {
      intent.filters.owner_entity_type = intent.filters.owner_entity_type.map(v => v.toLowerCase());
    } else {
      intent.filters.owner_entity_type = intent.filters.owner_entity_type.toLowerCase();
    }
  }
  if (intent.filters?.owner_segment) {
    if (Array.isArray(intent.filters.owner_segment)) {
      intent.filters.owner_segment = intent.filters.owner_segment.map(v => v.toLowerCase());
    } else {
      intent.filters.owner_segment = intent.filters.owner_segment.toLowerCase();
    }
  }
  
  const conditions = [];
  const values = [];
  let paramIndex = 1;
  
  // County filter
  if (intent.geo?.county_fips) {
    conditions.push(`county_fips = $${paramIndex}`);
    values.push(intent.geo.county_fips);
    paramIndex++;
  }
  
  // Bbox spatial filter
  if (intent.geo?.bbox && Array.isArray(intent.geo.bbox) && intent.geo.bbox.length === 4) {
    const [minLng, minLat, maxLng, maxLat] = intent.geo.bbox;
    conditions.push(`ST_Intersects(geom_centroid, ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326))`);
    values.push(minLng, minLat, maxLng, maxLat);
    paramIndex += 4;
  }
  
  // Filter: acres_min
  if (intent.filters?.acres_min !== null && intent.filters?.acres_min !== undefined) {
    conditions.push(`acres_calc >= $${paramIndex}`);
    values.push(intent.filters.acres_min);
    paramIndex++;
  }
  
  // Filter: acres_max
  if (intent.filters?.acres_max !== null && intent.filters?.acres_max !== undefined) {
    conditions.push(`acres_calc <= $${paramIndex}`);
    values.push(intent.filters.acres_max);
    paramIndex++;
  }
  
  // Filter: asset_class - supports single value or array (OR)
  if (intent.filters?.asset_class) {
    if (Array.isArray(intent.filters.asset_class)) {
      // OR condition: asset_class IN ('residential', 'commercial')
      const placeholders = intent.filters.asset_class.map((_, i) => `$${paramIndex + i}`).join(', ');
      conditions.push(`asset_class IN (${placeholders})`);
      values.push(...intent.filters.asset_class);
      paramIndex += intent.filters.asset_class.length;
    } else {
      // Single value: asset_class = 'commercial'
      conditions.push(`asset_class = $${paramIndex}`);
      values.push(intent.filters.asset_class);
      paramIndex++;
    }
  }
  
  // Filter: owner_entity_type - supports single value or array (OR)
  if (intent.filters?.owner_entity_type) {
    if (Array.isArray(intent.filters.owner_entity_type)) {
      // OR condition: owner_entity_type IN ('llc', 'corp')
      const placeholders = intent.filters.owner_entity_type.map((_, i) => `$${paramIndex + i}`).join(', ');
      conditions.push(`owner_entity_type IN (${placeholders})`);
      values.push(...intent.filters.owner_entity_type);
      paramIndex += intent.filters.owner_entity_type.length;
    } else {
      // Single value: owner_entity_type = 'llc'
      conditions.push(`owner_entity_type = $${paramIndex}`);
      values.push(intent.filters.owner_entity_type);
      paramIndex++;
    }
  }
  
  // Filter: owner_segment - supports single value or array (OR)
  if (intent.filters?.owner_segment) {
    if (Array.isArray(intent.filters.owner_segment)) {
      // OR condition: owner_segment IN ('mom_pop', 'small_operator')
      const placeholders = intent.filters.owner_segment.map((_, i) => `$${paramIndex + i}`).join(', ');
      conditions.push(`owner_segment IN (${placeholders})`);
      values.push(...intent.filters.owner_segment);
      paramIndex += intent.filters.owner_segment.length;
    } else {
      // Single value: owner_segment = 'mom_pop'
      conditions.push(`owner_segment = $${paramIndex}`);
      values.push(intent.filters.owner_segment);
      paramIndex++;
    }
  }
  
  // Filter: tax_delinquent
  if (intent.filters?.tax_delinquent === true) {
    conditions.push(`tax_delinquent_flag = $${paramIndex}`);
    values.push(true);
    paramIndex++;
  }

  // Filter: homestead_exemption (true = owner-occupied, false = investment property)
  if (intent.filters?.homestead_exemption !== null && intent.filters?.homestead_exemption !== undefined) {
    conditions.push(`homestead_exemption_flag = $${paramIndex}`);
    values.push(intent.filters.homestead_exemption);
    paramIndex++;
  }

  // Filter: market_value_min
  if (intent.filters?.market_value_min !== null && intent.filters?.market_value_min !== undefined) {
    conditions.push(`market_value >= $${paramIndex}`);
    values.push(intent.filters.market_value_min);
    paramIndex++;
  }
  
  // Filter: market_value_max
  if (intent.filters?.market_value_max !== null && intent.filters?.market_value_max !== undefined) {
    conditions.push(`market_value <= $${paramIndex}`);
    values.push(intent.filters.market_value_max);
    paramIndex++;
  }
  
  // Text search: owner name (ILIKE for case-insensitive partial match)
  if (intent.filters?.owner_name_search) {
    conditions.push(`owner_name_raw ILIKE $${paramIndex}`);
    values.push(`%${intent.filters.owner_name_search}%`);
    paramIndex++;
  }
  
  // Text search: address (ILIKE for case-insensitive partial match)
  if (intent.filters?.address_search) {
    conditions.push(`situs_address ILIKE $${paramIndex}`);
    values.push(`%${intent.filters.address_search}%`);
    paramIndex++;
  }

  // NEW: Spatial reference filter (near highway, boundary, etc.)
  if (intent.near_reference) {
    const { reference_name, distance_miles } = intent.near_reference;
    const distanceMeters = distance_miles * 1609.34;

    // Subquery to get reference geometry and filter parcels within distance
    conditions.push(`
      ST_DWithin(
        geom_centroid::geography,
        (SELECT geometry::geography FROM reference_geometries
         WHERE name ILIKE $${paramIndex}
            OR $${paramIndex} = ANY(aliases)
         LIMIT 1),
        $${paramIndex + 1}
      )
    `);
    values.push(`%${reference_name}%`, distanceMeters);
    paramIndex += 2;
  }

  // NEW: Opportunity zone filter
  if (intent.in_opportunity_zone === true) {
    conditions.push(`
      EXISTS (
        SELECT 1 FROM opportunity_zones oz
        WHERE ST_Intersects(geom_centroid, oz.geometry)
      )
    `);
  }

  // NEW: Census tract filter
  if (intent.census_tract) {
    conditions.push(`
      EXISTS (
        SELECT 1 FROM census_tracts ct
        WHERE ct.geoid = $${paramIndex}
          AND ST_Intersects(geom_centroid, ct.geometry)
      )
    `);
    values.push(intent.census_tract);
    paramIndex++;
  }

  // Limit (default 100, max 500)
  const limit = Math.min(intent.limit || 100, 500);
  values.push(limit);
  
  // Build WHERE clause
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Build SQL
  const sql = `
    SELECT
      parcel_id,
      situs_address,
      owner_name_raw,
      owner_entity_type,
      owner_segment,
      acres_calc,
      asset_class,
      market_value,
      tax_delinquent_flag,
      homestead_exemption_flag,
      mail_zip,
      county_fips,
      ST_AsGeoJSON(geom_centroid)::json as geom
    FROM parcel_features_travis
    ${whereClause}
    ORDER BY acres_calc
    LIMIT $${paramIndex}
  `;
  
  // Build debug SQL (with values substituted)
  const sqlDebug = sql.replace(/\$\d+/g, (match) => {
    const idx = parseInt(match.substring(1)) - 1;
    return JSON.stringify(values[idx]);
  });
  
  return {
    query: sql,
    values: values,
    sql: sqlDebug
  };
}

/**
 * Build SQL query for aggregation (GROUP BY) queries
 */
function buildAggregationQuery(intent) {
  const conditions = [];
  const values = [];
  let paramIndex = 1;

  if (intent.geo?.county_fips) {
    conditions.push(`county_fips = $${paramIndex++}`);
    values.push(intent.geo.county_fips);
  }
  if (intent.geo?.bbox && Array.isArray(intent.geo.bbox)) {
    conditions.push(`ST_Intersects(geom_centroid, ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326))`);
    values.push(...intent.geo.bbox);
    paramIndex += 4;
  }
  if (intent.filters?.acres_min) {
    conditions.push(`acres_calc >= $${paramIndex++}`);
    values.push(intent.filters.acres_min);
  }
  if (intent.filters?.acres_max) {
    conditions.push(`acres_calc <= $${paramIndex++}`);
    values.push(intent.filters.acres_max);
  }
  // Filter: asset_class - supports single value or array (OR)
  if (intent.filters?.asset_class) {
    if (Array.isArray(intent.filters.asset_class)) {
      const normalized = intent.filters.asset_class.map(v => v.toLowerCase());
      const placeholders = normalized.map((_, i) => `$${paramIndex + i}`).join(', ');
      conditions.push(`asset_class IN (${placeholders})`);
      values.push(...normalized);
      paramIndex += normalized.length;
    } else {
      conditions.push(`asset_class = $${paramIndex++}`);
      values.push(intent.filters.asset_class.toLowerCase());
    }
  }
  // Filter: owner_entity_type - supports single value or array (OR)
  if (intent.filters?.owner_entity_type) {
    if (Array.isArray(intent.filters.owner_entity_type)) {
      const normalized = intent.filters.owner_entity_type.map(v => v.toLowerCase());
      const placeholders = normalized.map((_, i) => `$${paramIndex + i}`).join(', ');
      conditions.push(`owner_entity_type IN (${placeholders})`);
      values.push(...normalized);
      paramIndex += normalized.length;
    } else {
      conditions.push(`owner_entity_type = $${paramIndex++}`);
      values.push(intent.filters.owner_entity_type.toLowerCase());
    }
  }
  // Filter: owner_segment - supports single value or array (OR)
  if (intent.filters?.owner_segment) {
    if (Array.isArray(intent.filters.owner_segment)) {
      const normalized = intent.filters.owner_segment.map(v => v.toLowerCase());
      const placeholders = normalized.map((_, i) => `$${paramIndex + i}`).join(', ');
      conditions.push(`owner_segment IN (${placeholders})`);
      values.push(...normalized);
      paramIndex += normalized.length;
    } else {
      conditions.push(`owner_segment = $${paramIndex++}`);
      values.push(intent.filters.owner_segment.toLowerCase());
    }
  }
  if (intent.filters?.tax_delinquent !== undefined) {
    conditions.push(`tax_delinquent_flag = $${paramIndex++}`);
    values.push(intent.filters.tax_delinquent);
  }
  if (intent.filters?.market_value_min) {
    conditions.push(`market_value >= $${paramIndex++}`);
    values.push(intent.filters.market_value_min);
  }
  if (intent.filters?.market_value_max) {
    conditions.push(`market_value <= $${paramIndex++}`);
    values.push(intent.filters.market_value_max);
  }
  // Text search: owner name (ILIKE for case-insensitive partial match)
  if (intent.filters?.owner_name_search) {
    conditions.push(`owner_name_raw ILIKE $${paramIndex++}`);
    values.push(`%${intent.filters.owner_name_search}%`);
  }
  // Text search: address (ILIKE for case-insensitive partial match)
  if (intent.filters?.address_search) {
    conditions.push(`situs_address ILIKE $${paramIndex++}`);
    values.push(`%${intent.filters.address_search}%`);
  }

  const agg = intent.aggregation;
  const groupBy = agg.group_by || [];
  const metrics = agg.metrics || [{ type: 'count' }];

  const allowedGroupBy = ['mail_zip', 'asset_class', 'owner_entity_type', 'owner_segment', 'tax_delinquent_flag', 'homestead_exemption_flag'];
  const allowedFields = ['market_value', 'acres_calc', 'building_sqft', 'land_value'];

  const selectCols = [];
  
  groupBy.forEach(col => {
    if (allowedGroupBy.includes(col)) selectCols.push(col);
  });

  metrics.forEach((metric, idx) => {
    const alias = metric.alias || `metric_${idx}`;
    switch (metric.type) {
      case 'count':
        selectCols.push(`COUNT(*) as ${alias}`);
        break;
      case 'sum':
        if (allowedFields.includes(metric.field)) {
          selectCols.push(`SUM(${metric.field}) as ${alias}`);
        }
        break;
      case 'avg':
        if (allowedFields.includes(metric.field)) {
          selectCols.push(`ROUND(AVG(${metric.field})::numeric, 2) as ${alias}`);
        }
        break;
      case 'min':
        if (allowedFields.includes(metric.field)) {
          selectCols.push(`MIN(${metric.field}) as ${alias}`);
        }
        break;
      case 'max':
        if (allowedFields.includes(metric.field)) {
          selectCols.push(`MAX(${metric.field}) as ${alias}`);
        }
        break;
    }
  });

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const groupByClause = groupBy.length > 0 ? `GROUP BY ${groupBy.join(', ')}` : '';
  const orderByClause = groupBy.length > 0 ? `ORDER BY ${metrics[0]?.alias || 'metric_0'} DESC` : '';

  // Limit for aggregation queries (default 100, max 1000)
  const limit = Math.min(intent.limit || 100, 1000);
  values.push(limit);

  const sqlQuery = `SELECT ${selectCols.join(', ')} FROM parcel_features_travis ${whereClause} ${groupByClause} ${orderByClause} LIMIT $${paramIndex}`.trim();

  return { query: sqlQuery, values, isAggregate: true, groupBy, metrics };
}

/**
 * Execute SQL generated by SQLCoder with safety checks
 * 
 * @param {string} sql - The SQL query to execute
 * @param {object} pool - Database connection pool
 * @returns {Promise<{success: boolean, rows: array, error?: string}>}
 */
async function executeSQLCoderQuery(sql, pool) {
  console.log('[executeSQLCoderQuery] Executing:', sql);
  
  // Safety checks
  const upperSQL = sql.toUpperCase();
  
  // Block dangerous operations
  const blocked = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'TRUNCATE', 'CREATE', 'GRANT', 'REVOKE'];
  for (const keyword of blocked) {
    if (upperSQL.includes(keyword)) {
      console.error(`[executeSQLCoderQuery] Blocked dangerous keyword: ${keyword}`);
      return {
        success: false,
        rows: [],
        error: `Blocked: ${keyword} operations not allowed`,
      };
    }
  }
  
  // Must be a SELECT query
  if (!upperSQL.trim().startsWith('SELECT')) {
    console.error('[executeSQLCoderQuery] Only SELECT queries allowed');
    return {
      success: false,
      rows: [],
      error: 'Only SELECT queries are allowed',
    };
  }
  
  // Add LIMIT if not present (safety)
  if (!upperSQL.includes('LIMIT')) {
    sql = sql.replace(/;?\s*$/, ' LIMIT 500;');
  }
  
  try {
    const result = await pool.query(sql);
    console.log(`[executeSQLCoderQuery] Success: ${result.rows.length} rows`);
    return {
      success: true,
      rows: result.rows,
    };
  } catch (error) {
    console.error('[executeSQLCoderQuery] Query error:', error.message);
    return {
      success: false,
      rows: [],
      error: error.message,
    };
  }
}

/**
 * Handle complex queries using SQLCoder
 * 
 * @param {string} query - Natural language query
 * @param {object} pool - Database connection pool
 * @returns {Promise<object>} - Response object
 */
async function handleComplexQuery(query, pool) {
  console.log('[handleComplexQuery] Processing complex query:', query);
  
  // Generate SQL using SQLCoder
  const sqlResult = await generateSQL(query);
  
  if (!sqlResult.success) {
    return {
      success: false,
      type: 'COMPLEX_QUERY',
      error: `SQLCoder error: ${sqlResult.error}`,
      properties: [],
    };
  }
  
  // Execute the generated SQL
  const execResult = await executeSQLCoderQuery(sqlResult.sql, pool);
  
  if (!execResult.success) {
    return {
      success: false,
      type: 'COMPLEX_QUERY',
      error: `Query execution error: ${execResult.error}`,
      generatedSQL: sqlResult.sql,
      properties: [],
    };
  }
  
  return {
    success: true,
    type: 'COMPLEX_QUERY',
    generatedSQL: sqlResult.sql,
    results: execResult.rows,
    count: execResult.rows.length,
    insights: `Found ${execResult.rows.length} results using advanced SQL analysis.`,
  };
}

/**
 * Verify filter correctness - assert all results satisfy intent filters
 */
function verifyFilterCorrectness(intent, results) {
  const violations = [];
  
  // Verify acres_min
  if (intent.filters?.acres_min !== null && intent.filters?.acres_min !== undefined) {
    for (const row of results) {
      if (row.acres_calc < intent.filters.acres_min) {
        violations.push({
          parcel_id: row.parcel_id,
          filter: 'acres_min',
          expected: intent.filters.acres_min,
          actual: row.acres_calc
        });
      }
    }
  }
  
  // Verify acres_max
  if (intent.filters?.acres_max !== null && intent.filters?.acres_max !== undefined) {
    for (const row of results) {
      if (row.acres_calc > intent.filters.acres_max) {
        violations.push({
          parcel_id: row.parcel_id,
          filter: 'acres_max',
          expected: intent.filters.acres_max,
          actual: row.acres_calc
        });
      }
    }
  }
  
  // Log violations
  if (violations.length > 0) {
    console.error('❌ FILTER VIOLATIONS DETECTED:');
    violations.forEach(v => {
      console.error(`  Parcel ${v.parcel_id}: ${v.filter} violation (expected: ${v.expected}, actual: ${v.actual})`);
    });
    throw new Error(`Filter correctness violation: ${violations.length} parcels failed filter checks`);
  }
  
  console.log(`✅ Filter correctness verified: ${results.length} results satisfy all filters`);
}

/**
 * Generate summary message from intent and results
 */
function generateSummaryMessage(intent, count) {
  const parts = [];
  
  // Acres range
  if (intent.filters?.acres_min !== null && intent.filters?.acres_max !== null) {
    parts.push(`${intent.filters.acres_min}-${intent.filters.acres_max} acres`);
  } else if (intent.filters?.acres_min !== null) {
    parts.push(`at least ${intent.filters.acres_min} acres`);
  } else if (intent.filters?.acres_max !== null) {
    parts.push(`under ${intent.filters.acres_max} acres`);
  }
  
  // County
  if (intent.geo?.county_fips === '48453') {
    parts.push('in Travis County');
  }
  
  // Asset class
  if (intent.filters?.asset_class) {
    parts.push(`(${intent.filters.asset_class})`);
  }
  
  // Tax delinquent
  if (intent.filters?.tax_delinquent === true) {
    parts.push('(tax delinquent)');
  }
  
  const criteria = parts.length > 0 ? parts.join(' ') : 'your criteria';
  return `Found ${count} parcel${count !== 1 ? 's' : ''} matching ${criteria}.`;
}

// ============================================================================
// DEPRECATED: Old Functions (kept for backward compatibility)
// ============================================================================

/**
 * DEPRECATED: Query properties directly from database (bypassing MCP)
 * @deprecated Use buildParcelQuery() and query parcel_features_travis instead
 */
async function queryPropertiesDirect(params) {
  const { county, minAcres, maxAcres, minMarketValue, limit: rawLimit = 25 } = params;
  // Cap limit at 500 for safety (deprecated function)
  const limit = Math.min(rawLimit, 500);
  
  // Import pg pool
  const pg = await import('pg');
  const pool = new pg.default.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5
  });
  
  try {
    console.log(`🔍 Direct DB query: county=${county}, acres=${minAcres}-${maxAcres}, limit=${limit}`);
    
    // Map county name to table
    const countyTables = {
      'Travis': { table: 'parcels_travis', enrichment: 'parcels_travis_enrichment' },
      'Williamson': { table: 'parcels_williamson', enrichment: 'parcels_williamson_enrichment' },
      'Hays': { table: 'parcels_hays', enrichment: 'parcels_hays_enrichment' },
      'Bastrop': { table: 'parcels_bastrop', enrichment: 'parcels_bastrop_enrichment' },
      'Caldwell': { table: 'parcels_caldwell', enrichment: 'parcels_caldwell_enrichment' },
      'Burnet': { table: 'parcels_burnet', enrichment: 'parcels_burnet_enrichment' },
      'Blanco': { table: 'parcels_blanco', enrichment: 'parcels_blanco_enrichment' },
      'Lee': { table: 'parcels_lee', enrichment: 'parcels_lee_enrichment' },
      'Llano': { table: 'parcels_llano', enrichment: 'parcels_llano_enrichment' },
      'Comal': { table: 'parcels_comal', enrichment: 'parcels_comal_enrichment' },
      'Kendall': { table: 'parcels_kendall', enrichment: 'parcels_kendall_enrichment' },
      'Bell': { table: 'parcels_bell', enrichment: 'parcels_bell_enrichment' }
    };
    
    const tableInfo = countyTables[county];
    if (!tableInfo) {
      console.log(`❌ Unknown county: ${county}`);
      return [];
    }
    
    // Build query
    const conditions = [];
    const values = [];
    let paramIndex = 1;
    
    if (minAcres) {
      conditions.push(`COALESCE(e.acres, e.acreage, 0) >= $${paramIndex}`);
      values.push(minAcres);
      paramIndex++;
    }
    if (maxAcres) {
      conditions.push(`COALESCE(e.acres, e.acreage, 0) <= $${paramIndex}`);
      values.push(maxAcres);
      paramIndex++;
    }
    if (minMarketValue) {
      conditions.push(`e.market_value >= $${paramIndex}`);
      values.push(minMarketValue);
      paramIndex++;
    }
    
    values.push(limit);
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const query = `
      SELECT 
        p.parcel_id,
        ST_AsGeoJSON(ST_PointOnSurface(p.geom))::json as centroid,
        e.owner_name,
        e.situs_address,
        e.acres,
        e.acreage,
        e.market_value,
        e.assessed_value,
        e.land_use,
        e.land_use_desc,
        e.year_built,
        e.mail_city,
        e.mail_state,
        e.tax_delinquent_flag,
        e.homestead_exemption_flag
      FROM ${tableInfo.table} p
      LEFT JOIN ${tableInfo.enrichment} e ON p.parcel_id = e.parcel_id
      ${whereClause}
      LIMIT $${paramIndex}
    `;
    
    console.log(`📝 SQL Query:`, query);
    console.log(`📝 Values:`, values);
    
    const result = await pool.query(query, values);
    
    console.log(`✅ Direct DB returned ${result.rows.length} properties`);
    
    // Transform results
    return result.rows.map(row => {
      const centroid = row.centroid?.coordinates ? {
        lng: row.centroid.coordinates[0],
        lat: row.centroid.coordinates[1]
      } : null;
      
      const isAbsentee = row.mail_state && row.mail_state.toUpperCase() !== 'TX';
      
      return {
        parcelId: row.parcel_id,
        address: row.situs_address || 'No address',
        ownerName: row.owner_name || 'Unknown',
        acres: row.acres || row.acreage,
        marketValue: row.market_value,
        assessedValue: row.assessed_value,
        landUse: row.land_use || row.land_use_desc,
        yearBuilt: row.year_built,
        taxDelinquent: row.tax_delinquent_flag === true,
        isAbsenteeOwner: isAbsentee,
        homesteadExemption: row.homestead_exemption_flag === true,
        centroid,
        county
      };
    });
    
  } catch (error) {
    console.error('❌ Direct DB query error:', error.message);
    return [];
  } finally {
    await pool.end();
  }
}

/**
 * DEPRECATED: Extract county and filters from query for MCP search
 * @deprecated Use extractIntentFromQuery() instead
 */
function extractSearchParams(query) {
  const params = {};
  
  // Extract county
  const countyMatch = query.match(/\b(travis|williamson|hays|bastrop|caldwell|burnet|blanco|lee|llano|comal|kendall|bell)\s*(?:county)?\b/i);
  if (countyMatch) {
    params.county = countyMatch[1].charAt(0).toUpperCase() + countyMatch[1].slice(1).toLowerCase();
  }
  
  // Extract acre ranges
  const acreMatch = query.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*acres?/i);
  if (acreMatch) {
    params.minAcres = parseFloat(acreMatch[1]);
    params.maxAcres = parseFloat(acreMatch[2]);
  } else {
    const minAcreMatch = query.match(/(?:at least|over|more than|min(?:imum)?)\s*(\d+(?:\.\d+)?)\s*acres?/i);
    if (minAcreMatch) params.minAcres = parseFloat(minAcreMatch[1]);
    
    const maxAcreMatch = query.match(/(?:under|less than|max(?:imum)?)\s*(\d+(?:\.\d+)?)\s*acres?/i);
    if (maxAcreMatch) params.maxAcres = parseFloat(maxAcreMatch[1]);
  }
  
  return params;
}

/**
 * DEPRECATED: Build system prompt for Claude
 * @deprecated No longer used - Claude only extracts intent now
 */
function buildSystemPrompt(mode, mapData, propertyResults = []) {
  let prompt = `You are ScoutGPT, an AI-powered commercial real estate acquisition assistant. You help investors, developers, and brokers find and analyze properties.

Your role is to:
1. Analyze property data intelligently to find opportunities
2. Identify patterns that indicate motivated sellers or investment potential
3. Provide actionable insights for real estate professionals
4. Think like an experienced acquisition analyst

When analyzing properties, consider:
- Tax delinquency indicates financial distress (motivated seller)
- Absentee owners (mailing address ≠ property address) may be more willing to sell
- Vacant land with low tax values may be undervalued
- Long-term ownership without improvements suggests potential motivation
- Properties with multiple opportunity flags are higher priority targets

IMPORTANT: 
- Always reference specific properties from the data provided
- Rank properties by investment potential (motivation score)
- Highlight the BEST opportunities first
- Explain WHY each property is interesting
- Be specific with numbers (acres, tax values, scores)

You have access to property data tools via MCP:
- get_property(parcel_id): Get details for a specific parcel
- search_properties(county, min_acres, max_acres, min_value, max_value, owner_name, limit): Search properties with filters
- get_enrichment(parcel_id): Get enrichment data for a parcel
- bulk_properties(parcel_ids): Get multiple properties at once

Use these tools to answer questions about properties, owners, and values.

`;

  if (mapData?.servers) {
    prompt += `\n\nAvailable GIS Data for this query:`;
    mapData.servers.forEach(server => {
      prompt += `\n- ${server.category}: ${server.features.length} features found`;
    });
  }

  switch (mode) {
    case 'scout':
      prompt += `\n\nMode: Scout - Help find investment opportunities based on user criteria. Focus on identifying motivated sellers and undervalued properties.`;
      break;
    case 'zoning':
      prompt += `\n\nMode: Zoning - Analyze zoning regulations, permitted uses, and development potential.`;
      break;
    case 'comps':
      prompt += `\n\nMode: Comps - Find comparable sales and market analysis.`;
      break;
    case 'site':
      prompt += `\n\nMode: Site Analysis - Evaluate site characteristics, utilities, and development feasibility.`;
      break;
  }

  if (propertyResults.length > 0) {
    prompt += `\n\nYou have access to ${propertyResults.length} properties matching the query. Analyze them and present the best opportunities.`;
  }

  return prompt;
}

/**
 * DEPRECATED: Build user prompt for Claude
 * @deprecated No longer used - Claude only extracts intent now
 */
function buildUserPrompt(query, subject, mapData, propertyResults = []) {
  let prompt = query;
  
  if (subject) {
    prompt += `\n\nSubject Property:`;
    if (subject.address) prompt += `\nAddress: ${subject.address}`;
    if (subject.lat && subject.lng) {
      prompt += `\nCoordinates: ${subject.lat}, ${subject.lng}`;
    }
  }
  
  if (mapData?.servers) {
    prompt += `\n\nGIS Data Found:`;
    mapData.servers.forEach(server => {
      if (server.features.length > 0) {
        prompt += `\n\n${server.category}:`;
        prompt += `\n- ${server.features.length} features`;
        
        // Include sample data
        const sample = server.features[0];
        if (sample.properties) {
          const props = Object.entries(sample.properties).slice(0, 3);
          prompt += `\n- Sample attributes: ${props.map(([k, v]) => `${k}=${v}`).join(', ')}`;
        }
      }
    });
  }
  
  // Build property context for Claude
  if (propertyResults.length > 0) {
    prompt += `\n\n## PROPERTY DATA (${propertyResults.length} properties found)\n`;
    prompt += `Top opportunities ranked by motivation score:\n\n`;
    
    propertyResults.slice(0, 15).forEach((prop, i) => {
      prompt += `### ${i + 1}. ${prop.address}\n`;
      prompt += `- Owner: ${prop.owner}\n`;
      prompt += `- Type: ${prop.propertyType} | Acres: ${prop.acres || 'N/A'}\n`;
      prompt += `- Tax Value: $${(prop.taxValue || 0).toLocaleString()} | Market Value: $${(prop.marketValue || 0).toLocaleString()}\n`;
      prompt += `- Motivation Score: ${prop.motivationScore}/100\n`;
      if (prop.opportunityFlags && prop.opportunityFlags.length > 0) {
        prompt += `- Opportunity Flags: ${prop.opportunityFlags.join(', ')}\n`;
      }
      prompt += '\n';
    });
    
    if (propertyResults.length > 15) {
      prompt += `\n... and ${propertyResults.length - 15} more properties.\n`;
    }
    
    prompt += `\nProvide analysis highlighting the BEST opportunities and explain WHY they stand out.`;
  }
  
  return prompt;
}

// ============================================================================
// Main Endpoint: POST /api/ai/query
// ============================================================================

// POST /api/ai/query - Rate limited to 30 calls per 15 minutes
router.post('/query', rateLimiter({ max: 30, windowMs: 15 * 60 * 1000 }), queryLogger, async (req, res) => {
  try {
    // Validate request
    const validation = validateAiQueryRequest(req.body);
    if (!validation.valid) {
      return sendError(res, `Invalid request: ${validation.error}`, 400);
    }
    
    const { mode, query, bounds, subject } = validation.data;
    const debug = req.query.debug === '1';
    
    console.log(`🤖 AI Query [${mode}]: "${query}"`);
    
    // Get database pool early (needed for SQLCoder)
    const pool = await getDbPool();
    
    try {
      // Check if this is a complex query that should use SQLCoder
      
      // Build user prompt
      let userPrompt = query;
      if (bounds) {
        userPrompt += `\n\nBounds: ${JSON.stringify(bounds)}`;
      }
      if (subject) {
        userPrompt += `\n\nSubject Property: ${JSON.stringify(subject)}`;
      }
      
      // Call Claude with tools enabled
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: UNIFIED_SYSTEM_PROMPT,
        tools: AI_TOOLS,
        messages: [{
          role: 'user',
          content: userPrompt
        }]
      });
      
      console.log('🤖 Claude response stop_reason:', response.stop_reason);
      
      // Process the response (handles both tool_use and text responses)
      // Pool already created above for SQLCoder check
      const processed = await processClaudeResponse(response, pool);
      
      console.log('📊 Processed response type:', processed.type);
      console.log('📊 Tool calls:', processed.toolCalls.length);
      console.log('📊 Properties:', processed.properties.length);
      
      // Handle aggregation results
      if (processed.type === 'AGGREGATION') {
        return res.json({
          type: 'AGGREGATION',
          data: processed.aggregation,
          count: processed.aggregation?.length || 0,
          groupBy: processed.groupBy,
          metrics: processed.metrics,
          insights: [`Showing ${processed.aggregation?.length || 0} groups`],
          toolCalls: processed.toolCalls.map(tc => ({
            tool: tc.tool,
            input: tc.input
          }))
        });
      }
      
      // Build standardized response
      const apiResponse = {
        success: true,
        type: processed.type,
        properties: processed.properties,
        layers: processed.layers,
        pois: processed.pois,
        insights: processed.insights,
        toolCalls: processed.toolCalls.map(tc => ({
          tool: tc.tool,
          input: tc.input
        })),
        // Backward compatibility fields
        messages: processed.insights ? [{ 
          role: 'assistant', 
          text: processed.insights
        }] : [],
        results: processed.properties,
        count: processed.properties.length,
        totalCount: processed.properties.length,
        overlays: [],
        pins: processed.properties.slice(0, 25).map(prop => ({
          id: prop.parcel_id,
          parcelId: prop.parcel_id,
          lat: prop.geom?.coordinates?.[1] || null,
          lng: prop.geom?.coordinates?.[0] || null,
          address: prop.situs_address,
          propertyType: prop.asset_class || 'unknown',
          motivationScore: prop.tax_delinquent_flag ? 80 : 50
        })),
        debug: {
          stopReason: response.stop_reason,
          toolCallCount: processed.toolCalls.length,
          propertyCount: processed.properties.length
        }
      };
      
      // If no results found, provide helpful message
      if (processed.properties.length === 0 && processed.type === 'PROPERTY_SEARCH') {
        const filtersApplied = [];
        const searchToolCall = processed.toolCalls.find(tc => tc.tool === 'search_properties');
        if (searchToolCall && searchToolCall.input) {
          const input = searchToolCall.input;
          if (input.acres_min || input.acres_max) filtersApplied.push('acreage');
          if (input.asset_class) filtersApplied.push('property type');
          if (input.owner_segment) filtersApplied.push('owner type');
          if (input.owner_entity_type) filtersApplied.push('entity type');
          if (input.market_value_min || input.market_value_max) filtersApplied.push('price');
          if (input.tax_delinquent) filtersApplied.push('tax status');
        }
        
        apiResponse.message = `No properties found matching your criteria. Try broadening your search${filtersApplied.length > 0 ? ` (filters applied: ${filtersApplied.join(', ')})` : ''}.`;
        apiResponse.intent = searchToolCall?.input;
        apiResponse.debug.filtersApplied = filtersApplied;
      }
      
      // Add debug info if requested
      if (debug) {
        apiResponse.debug.claudeResponse = response;
        apiResponse.debug.processed = processed;
      }
      
      console.log(`✅ Response ready (${apiResponse.count} results)`);
      res.json(apiResponse);
    } finally {
      await pool.end();
    }
    
  } catch (error) {
    console.error('❌ AI query error:', error);
    return sendError(res, 'AI query failed', 500, error.message);
  }
});

// ============================================================================
// NEW: Pipeline-Based Query Endpoint (Boris's 12-Step Architecture)
// ============================================================================

/**
 * POST /api/ai/pipeline
 * Execute natural language query through the 12-step pipeline
 *
 * This endpoint uses Boris's architecture for:
 * - Session state management
 * - Intent extraction with confidence scoring
 * - Clarification handling
 * - Deterministic SQL generation
 * - Result formatting
 */
router.post('/pipeline', rateLimiter({ max: 60, windowMs: 15 * 60 * 1000 }), queryLogger, async (req, res) => {
  try {
    const { query, sessionId, context = {} } = req.body;

    if (!query) {
      return sendError(res, 'Query is required', 400);
    }

    if (!sessionId) {
      return sendError(res, 'Session ID is required', 400);
    }

    console.log(`🔄 [Pipeline] Query: "${query.substring(0, 50)}..." (session: ${sessionId})`);

    // Execute through the 12-step pipeline
    const response = await executePipelineQuery(query, sessionId, context);

    // Transform pipeline response to match frontend expectations
    const apiResponse = {
      success: response.success,
      type: response.type,
      message: response.message || response.summary,

      // Map results if present - normalize to camelCase for frontend
      properties: normalizeProperties(response.mapData?.geojson?.features?.map(f => ({
        parcel_id: f.properties.parcel_id,
        situs_address: f.properties.address || f.properties.situs_address,
        owner_name_raw: f.properties.owner || f.properties.owner_name_raw,
        owner_entity_type: f.properties.owner_type || f.properties.owner_entity_type,
        owner_segment: f.properties.owner_segment,
        acres_calc: f.properties.acres || f.properties.acres_calc,
        asset_class: f.properties.asset_class,
        market_value: f.properties.market_value,
        land_value: f.properties.land_value,
        improvement_value: f.properties.improvement_value,
        tax_delinquent_flag: f.properties.tax_delinquent,
        homestead_exemption_flag: f.properties.homestead,
        geom: f.geometry
      })) || response.properties || []),

      // Legacy compatibility
      results: response.mapData?.geojson?.features?.map(f => f.properties) || [],
      count: response.resultCount || 0,
      totalCount: response.resultCount || 0,

      // Map data for frontend
      mapData: response.mapData,
      pins: response.pins || [],

      // Clarification handling
      clarification: response.clarification,

      // Aggregation results
      data: response.data,
      stats: response.stats,

      // Metadata
      metadata: response.metadata,

      // Errors
      errors: response.errors
    };

    // If clarification needed, return 200 but with clarification data
    if (response.type === 'clarification_needed') {
      apiResponse.requiresUserInput = true;
    }

    console.log(`✅ [Pipeline] Response: ${response.type}, ${apiResponse.count} results`);
    res.json(apiResponse);

  } catch (error) {
    console.error('❌ [Pipeline] Error:', error);
    return sendError(res, 'Pipeline query failed', 500, error.message);
  }
});

/**
 * POST /api/ai/clarification
 * Continue a query after user provides clarification
 */
router.post('/clarification', rateLimiter({ max: 60, windowMs: 15 * 60 * 1000 }), async (req, res) => {
  try {
    const { sessionId, ruleId, response: clarificationResponse } = req.body;

    if (!sessionId || !ruleId || clarificationResponse === undefined) {
      return sendError(res, 'sessionId, ruleId, and response are required', 400);
    }

    console.log(`🔄 [Clarification] Continuing with: ${ruleId} (session: ${sessionId})`);

    // Continue pipeline with clarification
    const response = await continueWithClarification(sessionId, ruleId, clarificationResponse);

    // Transform response (same as pipeline endpoint)
    const apiResponse = {
      success: response.success,
      type: response.type,
      message: response.message || response.summary,
      properties: response.mapData?.geojson?.features?.map(f => ({
        parcel_id: f.properties.parcel_id,
        situs_address: f.properties.address,
        owner_name_raw: f.properties.owner,
        acres_calc: f.properties.acres,
        asset_class: f.properties.asset_class,
        market_value: f.properties.market_value,
        tax_delinquent_flag: f.properties.tax_delinquent,
        geom: f.geometry
      })) || [],
      count: response.resultCount || 0,
      mapData: response.mapData,
      pins: response.pins || [],
      metadata: response.metadata,
      errors: response.errors
    };

    console.log(`✅ [Clarification] Response: ${response.type}, ${apiResponse.count} results`);
    res.json(apiResponse);

  } catch (error) {
    console.error('❌ [Clarification] Error:', error);
    return sendError(res, 'Clarification failed', 500, error.message);
  }
});

/**
 * POST /api/ai/sql
 * Direct SQLCoder endpoint for complex analytical queries
 */
router.post('/sql', async (req, res) => {
  const { query } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }
  
  console.log('[POST /api/ai/sql] Query:', query);
  
  const pool = await getDbPool();
  
  try {
    const result = await handleComplexQuery(query, pool);
    return res.json(result);
  } catch (error) {
    console.error('[POST /api/ai/sql] Error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    await pool.end();
  }
});

// ============================================================================
// Helper Functions (still used)
// ============================================================================

function shouldFetchGIS(query, mode) {
  if (mode === 'zoning') return true;
  
  const gisKeywords = [
    'sewer', 'utility', 'utilities', 'flood', 'floodplain',
    'zoning', 'parcel', 'permit', 'water', 'wastewater',
    'infrastructure', 'easement', 'right of way'
  ];
  
  return gisKeywords.some(kw => query.toLowerCase().includes(kw));
}

function getStyleForCategory(category) {
  const styles = {
    'Sewer Utilities': { 
      'line-color': '#8B4513', 
      'line-width': 2 
    },
    'Floodplain': { 
      'fill-color': '#4682B4', 
      'fill-opacity': 0.4,
      'line-color': '#1E90FF',
      'line-width': 1
    },
    'Zoning': { 
      'fill-color': '#FFD700', 
      'fill-opacity': 0.3,
      'line-color': '#FFA500',
      'line-width': 2
    },
    'Water Utilities': {
      'line-color': '#1E90FF',
      'line-width': 2
    },
    'Parcels': {
      'fill-color': '#90EE90',
      'fill-opacity': 0.2,
      'line-color': '#228B22',
      'line-width': 1
    }
  };
  
  return styles[category] || { 
    'line-color': '#888888', 
    'line-width': 1 
  };
}

export default router;
