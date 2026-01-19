/**
 * SQLCoder Service - Text-to-SQL generation via Replicate API
 * 
 * Uses Defog's SQLCoder-7b-2 model for complex SQL queries that Claude
 * struggles with: aggregations, JOINs, GROUP BY, subqueries.
 * 
 * Model: nateraw/defog-sqlcoder-7b-2
 * Docs: https://replicate.com/nateraw/defog-sqlcoder-7b-2
 */

// Using direct HTTP API instead of Replicate SDK

// Database schema for parcel_features_travis (DDL format for SQLCoder)
const PARCEL_FEATURES_SCHEMA = `
CREATE TABLE parcel_features_travis (
  parcel_id TEXT PRIMARY KEY,
  county_fips TEXT DEFAULT '48453',
  
  -- Property characteristics
  acres_calc NUMERIC(10,4),
  market_value NUMERIC(15,2),
  assessed_value NUMERIC(15,2),
  land_value NUMERIC(15,2),
  improvement_value NUMERIC(15,2),
  
  -- Classification (all lowercase values)
  asset_class TEXT, -- values: 'residential', 'commercial', 'land', 'unknown'
  owner_entity_type TEXT, -- values: 'person', 'llc', 'corp', 'trust_estate'
  owner_segment TEXT, -- values: 'mom_pop', 'small_operator', 'institutional', 'local_owner', 'absentee', 'unknown'
  
  -- Owner info
  owner_name_raw TEXT,
  
  -- Location
  situs_address TEXT,
  situs_city TEXT,
  situs_zip TEXT,
  mail_zip TEXT,      -- owner mailing ZIP (useful for grouping)
  zoning_code TEXT,
  
  -- Flags
  tax_delinquent_flag BOOLEAN,
  homestead_exemption_flag BOOLEAN,
  
  -- Geometry (PostGIS)
  geom_centroid GEOMETRY(Point, 4326)
);

-- Indexes for common queries
-- idx_pft_asset_class ON parcel_features_travis(asset_class)
-- idx_pft_owner_entity_type ON parcel_features_travis(owner_entity_type)
-- idx_pft_owner_segment ON parcel_features_travis(owner_segment)
-- idx_pft_situs_zip ON parcel_features_travis(situs_zip)
-- idx_pft_acres_calc ON parcel_features_travis(acres_calc)
-- idx_pft_market_value ON parcel_features_travis(market_value)

-- Sample values for reference:
-- asset_class: 'residential' (~300k rows), 'commercial' (~10k rows), 'land' (~50k rows), 'industrial' (~2k), 'mixed' (~1k), 'unknown' (~10k rows)
-- owner_entity_type: 'person' (~250k rows), 'llc' (~25k rows), 'corp' (~5k rows), 'trust_estate' (~10k rows), 'unknown' (~5k)
-- owner_segment: 'mom_pop' (~200k rows), 'small_operator' (~50k rows), 'institutional' (~5k rows), 'local_owner' (~80k), 'absentee' (~30k rows), 'unknown' (~10k)
`;

/**
 * Generate SQL query from natural language using SQLCoder
 * 
 * @param {string} question - Natural language question
 * @param {string} customSchema - Optional custom schema (defaults to parcel_features_travis)
 * @returns {Promise<{sql: string, success: boolean, error?: string}>}
 */
export async function generateSQL(question, customSchema = null) {
  const schema = customSchema || PARCEL_FEATURES_SCHEMA;
  
  console.log('[SQLCoder] Generating SQL for:', question);
  
  try {
    // Use direct HTTP API instead of SDK
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait'
      },
      body: JSON.stringify({
        version: "ced935b577fb52644d933f77e2ff8902744e4c58a2f50023b3a1db80b7a75806",
        input: {
          question: question,
          table_metadata: schema,
          max_new_tokens: 300,
          temperature: 0.0
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Replicate API error: ${response.status} - ${error}`);
    }
    
    const prediction = await response.json();
    
    // Debug logging
    console.log('[SQLCoder] Prediction status:', prediction.status);
    console.log('[SQLCoder] Prediction output:', JSON.stringify(prediction.output));
    
    if (prediction.status === 'failed') {
      throw new Error(`Prediction failed: ${prediction.error}`);
    }
    
    // Handle different output formats
    let sql = prediction.output;
    
    if (!sql) {
      // Check if still processing
      if (prediction.status === 'processing' || prediction.status === 'starting') {
        throw new Error('Model still processing - try again in a few seconds');
      }
      throw new Error('No SQL generated - empty output from model');
    }
    
    if (Array.isArray(sql)) {
      sql = sql.join('');
    }
    
    // If output is an object, try to extract text
    if (typeof sql === 'object') {
      sql = JSON.stringify(sql);
    }
    
    sql = cleanSQL(sql);
    
    if (!sql || sql === ';') {
      throw new Error('Generated SQL was empty after cleaning');
    }
    
    console.log('[SQLCoder] Generated SQL:', sql);
    
    return {
      success: true,
      sql: sql,
    };
  } catch (error) {
    console.error('[SQLCoder] Error:', error.message);
    return {
      success: false,
      sql: null,
      error: error.message,
    };
  }
}

/**
 * Clean and validate generated SQL
 */
function cleanSQL(sql) {
  if (!sql) return null;
  
  // Remove markdown code blocks if present
  sql = sql.replace(/```sql\n?/gi, '').replace(/```\n?/g, '');
  
  // Remove leading/trailing whitespace
  sql = sql.trim();
  
  // Take only the first statement (before first semicolon)
  sql = sql.split(';')[0].trim();
  
  // Add semicolon back
  if (!sql.endsWith(';')) {
    sql += ';';
  }
  
  return sql;
}

/**
 * Check if a query is "complex" and should use SQLCoder
 * Complex queries include: aggregations, GROUP BY, JOINs, subqueries, comparisons
 * 
 * @param {string} query - Natural language query
 * @returns {boolean}
 */
export function isComplexQuery(query) {
  const lowerQuery = query.toLowerCase();
  
  const complexPatterns = [
    // Aggregations
    /how many/i,
    /count of/i,
    /total number/i,
    /average|avg /i,
    /sum of/i,
    /minimum|min /i,
    /maximum|max /i,
    
    // Grouping
    /by (zip|city|type|class|segment|owner)/i,
    /per (zip|city|type|class|segment)/i,
    /group by/i,
    /breakdown/i,
    /distribution/i,
    
    // Comparisons
    /compare/i,
    /difference between/i,
    /more than.*or/i,
    /versus|vs\.?/i,
    
    // Rankings
    /top \d+/i,
    /bottom \d+/i,
    /rank/i,
    /highest/i,
    /lowest/i,
    
    // Subqueries / complex conditions
    /where.*and.*or/i,
    /properties whose owner/i,
    /owners? (who|that) have/i,
    /more properties than/i,
  ];
  
  return complexPatterns.some(pattern => pattern.test(lowerQuery));
}

/**
 * Get the schema string (for external use)
 */
export function getSchema() {
  return PARCEL_FEATURES_SCHEMA;
}

// Export default object for convenience
export default {
  generateSQL,
  isComplexQuery,
  getSchema,
  PARCEL_FEATURES_SCHEMA,
};
