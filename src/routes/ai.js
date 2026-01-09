import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { searchMapServers } from '../services/mapserver-service.js';
import { extractCategories } from '../services/category-mapper.js';
import { queryProperties, needsPropertyData } from '../services/property-service.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { preprocessToolInput, isValidBbox } from '../services/zipCodeResolver.js';
import { validateIntent } from '../validators/intentSchema.js';
import { assertAcresFilter, assertAssetClassFilter, assertOwnerSegmentFilter, assertMarketValueFilter, assertOwnerEntityTypeFilter, assertTaxDelinquentFilter } from '../utils/filterAssertions.js';
import { queryLogger } from '../middleware/queryLogger.js';

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
          description: 'Bounding box [minLng, minLat, maxLng, maxLat] for spatial filtering'
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
          type: 'string',
          enum: ['residential', 'commercial', 'land', 'industrial', 'mixed'],
          description: 'Property asset classification'
        },
        owner_entity_type: {
          type: 'string',
          enum: ['person', 'llc', 'corp', 'trust_estate'],
          description: 'Type of owner entity'
        },
        owner_segment: {
          type: 'string',
          enum: ['mom_pop', 'small_operator', 'institutional', 'local_owner', 'absentee'],
          description: 'Owner segment classification'
        },
        tax_delinquent: {
          type: 'boolean',
          description: 'Filter for tax delinquent properties'
        },
        market_value_min: {
          type: 'number',
          description: 'Minimum market value in dollars'
        },
        market_value_max: {
          type: 'number',
          description: 'Maximum market value in dollars'
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
      asset_class: input.asset_class || null,
      owner_entity_type: input.owner_entity_type || null,
      owner_segment: input.owner_segment || null,
      tax_delinquent: input.tax_delinquent ?? null,
      market_value_min: input.market_value_min ?? null,
      market_value_max: input.market_value_max ?? null
    },
    limit: Math.min(Math.max(input.limit || 50, 1), 200)
  };
  
  // Validate intent
  const { valid, errors, sanitized } = validateIntent(rawIntent);
  if (!valid) {
    console.warn('[AI Query] Intent validation errors:', errors);
  }
  const intent = sanitized;
  
  // Use existing buildParcelQuery function
  const { query: sqlQuery, values } = buildParcelQuery(intent);
  
  try {
    const result = await pool.query(sqlQuery, values);
    const properties = result.rows.map(row => ({
      parcel_id: row.parcel_id,
      situs_address: row.situs_address,
      owner_name_raw: row.owner_name_raw,
      owner_entity_type: row.owner_entity_type,
      owner_segment: row.owner_segment,
      acres_calc: parseFloat(row.acres_calc),
      asset_class: row.asset_class,
      market_value: row.market_value ? parseFloat(row.market_value) : null,
      tax_delinquent_flag: row.tax_delinquent_flag === true,
      geom: row.geom  // Already JSON from ST_AsGeoJSON
    }));
    
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
    
    const property = {
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
 * Execute a tool by name
 */
async function executeTool(toolName, toolInput, pool) {
  switch (toolName) {
    case 'search_properties':
      return await executeSearchProperties(toolInput, pool);
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
    insights: null
  };
  
  // Process each content block
  for (const block of response.content) {
    if (block.type === 'text') {
      results.textResponse = block.text;
      results.insights = block.text;
    } else if (block.type === 'tool_use') {
      console.log(`🔧 Claude called tool: ${block.name}`);
      
      const toolResult = await executeTool(block.name, block.input, pool);
      results.toolCalls.push({
        tool: block.name,
        input: block.input,
        result: toolResult
      });
      
      // Aggregate results by type
      if (block.name === 'search_properties' && toolResult.properties) {
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

AVAILABLE FILTERS:
- asset_class: residential, commercial, land, industrial, mixed (DO NOT use 'unknown')
- owner_segment: mom_pop, small_operator, institutional, absentee, trust_estate
- owner_entity_type: person, llc, corp, trust_estate
- acres_min, acres_max: numeric values for acreage range
- market_value_min, market_value_max: numeric values for price range
- tax_delinquent: true/false
- county_fips: "48453" for Travis County

FILTER EXAMPLES:
- "commercial properties" → asset_class: "commercial"
- "vacant land" → asset_class: "land"
- "residential properties" → asset_class: "residential"
- "mom and pop owners" → owner_segment: "mom_pop"
- "LLC owned" → owner_entity_type: "llc"
- "institutional investors" → owner_segment: "institutional"
- "out of state owners" OR "absentee" → owner_segment: "absentee"
- "small operators" → owner_segment: "small_operator"
- "2-4 acres" → acres_min: 2, acres_max: 4
- "over 5 acres" → acres_min: 5
- "under 10 acres" → acres_max: 10
- "under $500k" → market_value_max: 500000
- "over $1M" → market_value_min: 1000000
- "tax delinquent" → tax_delinquent: true

IMPORTANT: 
- Always use snake_case for filter names
- Don't make up filter values - only use the ones listed above
- If unsure about a filter, omit it rather than guessing
- For combined queries (e.g., "commercial properties over 2 acres"), apply all relevant filters

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
    "asset_class": "residential" | "commercial" | "land" | "industrial" | "mixed" | null,
    "owner_entity_type": "person" | "llc" | "corp" | "trust_estate" | null,
    "owner_segment": "mom_pop" | "small_operator" | "institutional" | "local_owner" | "absentee" | null,
    "tax_delinquent": true | false | null,
    "market_value_min": number | null,
    "market_value_max": number | null
  },
  "limit": number  // default 50, max 200
}

MAPPING RULES:
- "2 to 4 acres", "2-4 acres", "between 2 and 4 acres" → acres_min: 2, acres_max: 4
- "at least 5 acres", "over 5 acres", "more than 5 acres" → acres_min: 5
- "under 10 acres", "less than 10 acres" → acres_max: 10
- "Travis County", "in Travis" → county_fips: "48453"
- "tax delinquent", "back taxes", "tax lien" → tax_delinquent: true
- "LLC owned", "owned by LLC" → owner_entity_type: "llc"
- "mom and pop", "mom & pop", "small owner" → owner_segment: "mom_pop"
- "commercial property" → asset_class: "commercial"
- "vacant land", "land" → asset_class: "land"
- "under $500k", "below $500000" → market_value_max: 500000
- "over $1M", "above $1000000" → market_value_min: 1000000

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
    const intent = JSON.parse(jsonText);
    
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
      limit: Math.min(Math.max(intent.limit || 50, 1), 200)
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
  
  // Filter: asset_class
  if (intent.filters?.asset_class) {
    conditions.push(`asset_class = $${paramIndex}`);
    values.push(intent.filters.asset_class);
    paramIndex++;
  }
  
  // Filter: owner_entity_type
  if (intent.filters?.owner_entity_type) {
    conditions.push(`owner_entity_type = $${paramIndex}`);
    values.push(intent.filters.owner_entity_type);
    paramIndex++;
  }
  
  // Filter: owner_segment
  if (intent.filters?.owner_segment) {
    conditions.push(`owner_segment = $${paramIndex}`);
    values.push(intent.filters.owner_segment);
    paramIndex++;
  }
  
  // Filter: tax_delinquent
  if (intent.filters?.tax_delinquent === true) {
    conditions.push(`tax_delinquent_flag = $${paramIndex}`);
    values.push(true);
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
  
  // Limit
  const limit = Math.min(Math.max(intent.limit || 50, 1), 200);
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
  const { county, minAcres, maxAcres, minMarketValue, limit = 25 } = params;
  
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
    const { mode, query, bounds, subject } = req.body;
    const debug = req.query.debug === '1';
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    console.log(`🤖 AI Query [${mode}]: "${query}"`);
    
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
    
    // Get database pool
    const pool = await getDbPool();
    
    try {
      // Process the response (handles both tool_use and text responses)
      const processed = await processClaudeResponse(response, pool);
      
      console.log('📊 Processed response type:', processed.type);
      console.log('📊 Tool calls:', processed.toolCalls.length);
      console.log('📊 Properties:', processed.properties.length);
      
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
    res.status(500).json({ 
      error: 'AI query failed',
      message: error.message 
    });
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
