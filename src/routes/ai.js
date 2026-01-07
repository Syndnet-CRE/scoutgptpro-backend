import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { searchMapServers } from '../services/mapserver-service.js';
import { extractCategories } from '../services/category-mapper.js';
import { queryProperties, needsPropertyData } from '../services/property-service.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();
const anthropic = new Anthropic({ 
  apiKey: process.env.CLAUDE_API_KEY 
});

// ============================================================================
// NEW: Intent Extraction System
// ============================================================================

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
      max_tokens: 1024,
      system: INTENT_EXTRACTION_SYSTEM_PROMPT,
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
router.post('/query', rateLimiter({ max: 30, windowMs: 15 * 60 * 1000 }), async (req, res) => {
  try {
    const { mode, query, bounds, subject } = req.body;
    const debug = req.query.debug === '1';
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    console.log(`🤖 AI Query [${mode}]: "${query}"`);
    
    // STEP 1: Extract intent from query using Claude
    let intent;
    try {
      intent = await extractIntentFromQuery(query, bounds);
    } catch (error) {
      console.error('❌ Intent extraction failed:', error);
      return res.status(500).json({ 
        error: 'Intent extraction failed',
        message: error.message 
      });
    }
    
    // STEP 2: Build deterministic SQL query
    const { query: sqlQuery, values, sql: sqlDebug } = buildParcelQuery(intent);
    console.log('📝 Generated SQL:', sqlDebug);
    
    // STEP 3: Execute query against parcel_features_travis
    const pg = await import('pg');
    const pool = new pg.default.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5
    });
    
    let results = [];
    try {
      const result = await pool.query(sqlQuery, values);
      results = result.rows.map(row => ({
        parcel_id: row.parcel_id,
        situs_address: row.situs_address,
        owner_name_raw: row.owner_name_raw,
        owner_entity_type: row.owner_entity_type,
        acres_calc: parseFloat(row.acres_calc),
        asset_class: row.asset_class,
        market_value: row.market_value ? parseFloat(row.market_value) : null,
        tax_delinquent_flag: row.tax_delinquent_flag === true,
        geom: row.geom  // Already JSON from ST_AsGeoJSON
      }));
      
      console.log(`✅ Query returned ${results.length} results`);
    } catch (dbError) {
      console.error('❌ Database query failed:', dbError);
      await pool.end();
      return res.status(500).json({ 
        error: 'Database query failed',
        message: dbError.message 
      });
    } finally {
      await pool.end();
    }
    
    // STEP 4: Verify filter correctness
    try {
      verifyFilterCorrectness(intent, results);
    } catch (verifyError) {
      console.error('❌ Filter verification failed:', verifyError);
      // Continue anyway, but log the error
    }
    
    // STEP 5: Generate summary message
    const summaryText = generateSummaryMessage(intent, results.length);
    
    // STEP 6: Build response with both old and new fields
    const response = {
      success: true,
      // NEW fields
      intent: intent,
      results: results,
      count: results.length,
      // OLD fields (for backward compatibility)
      messages: [{ 
        role: 'assistant', 
        text: summaryText
      }],
      properties: results,  // alias to results
      totalCount: results.length,
      overlays: [],
      pins: results.slice(0, 25).map(row => ({
        id: row.parcel_id,
        parcelId: row.parcel_id,
        lat: row.geom?.coordinates?.[1] || null,
        lng: row.geom?.coordinates?.[0] || null,
        address: row.situs_address,
        propertyType: row.asset_class || 'unknown',
        motivationScore: row.tax_delinquent_flag ? 80 : 50
      })),
      insights: results.length > 0 ? [
        `Found ${results.length} parcels`,
        `Average acres: ${results.length > 0 ? (results.reduce((a, b) => a + b.acres_calc, 0) / results.length).toFixed(2) : 0}`,
        `Asset classes: ${[...new Set(results.map(r => r.asset_class).filter(Boolean))].join(', ') || 'N/A'}`
      ] : []
    };
    
    // Add query_sql only if debug=1
    if (debug) {
      response.query_sql = sqlDebug;
    }
    
    console.log(`✅ Response ready (${response.count} results)`);
    res.json(response);
    
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
