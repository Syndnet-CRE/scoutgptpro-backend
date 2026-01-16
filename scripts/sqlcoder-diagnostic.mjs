/**
 * SQLCoder Integration Diagnostic Script
 * 
 * Tests the entire pipeline:
 * 1. Replicate API connectivity
 * 2. Schema format validation
 * 3. SQL generation
 * 4. SQL execution against real database
 * 
 * Run: node scripts/sqlcoder-diagnostic.mjs
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// =============================================================================
// SCHEMA DEFINITIONS - Test different formats
// =============================================================================

const SCHEMA_V1_DDL = `
CREATE TABLE parcel_features_travis (
  parcel_id TEXT PRIMARY KEY,
  county_fips TEXT DEFAULT '48453',
  acres_calc NUMERIC(10,4),
  market_value NUMERIC(15,2),
  asset_class TEXT,
  owner_entity_type TEXT,
  owner_segment TEXT,
  owner_name_raw TEXT,
  situs_address TEXT,
  situs_city TEXT,
  situs_zip TEXT,
  tax_delinquent_flag BOOLEAN,
  homestead_exemption_flag BOOLEAN
);
`;

const SCHEMA_V2_SIMPLE = `
Table: parcel_features_travis
Columns:
- parcel_id (TEXT, PRIMARY KEY)
- county_fips (TEXT, default '48453')
- acres_calc (NUMERIC) - property acreage
- market_value (NUMERIC) - market value in dollars
- asset_class (TEXT) - values: 'residential', 'commercial', 'land', 'unknown'
- owner_entity_type (TEXT) - values: 'person', 'llc', 'corp', 'trust_estate'
- owner_segment (TEXT) - values: 'mom_pop', 'small_operator', 'institutional', 'absentee'
- owner_name_raw (TEXT) - owner name
- situs_address (TEXT) - property address
- situs_city (TEXT) - city name
- situs_zip (TEXT) - ZIP code
- tax_delinquent_flag (BOOLEAN) - true if tax delinquent
- homestead_exemption_flag (BOOLEAN) - true if homestead exempt
`;

const SCHEMA_V3_MINIMAL = `
parcel_features_travis(parcel_id, county_fips, acres_calc, market_value, asset_class, owner_entity_type, owner_segment, situs_zip, tax_delinquent_flag)
`;

// =============================================================================
// TEST QUERIES - Different complexity levels
// =============================================================================

const TEST_QUERIES = [
  // Simple aggregations
  { name: 'count_all', query: 'How many properties are there?' },
  { name: 'count_commercial', query: 'How many commercial properties are there?' },
  { name: 'count_by_type', query: 'How many properties are there by asset class?' },
  
  // Aggregations with filters
  { name: 'count_llc', query: 'How many properties are owned by LLCs?' },
  { name: 'sum_value', query: 'What is the total market value of all commercial properties?' },
  { name: 'avg_acres', query: 'What is the average acreage of land properties?' },
  
  // Group by queries
  { name: 'count_by_zip', query: 'How many properties are in each ZIP code?' },
  { name: 'value_by_segment', query: 'What is the total market value by owner segment?' },
  
  // Filtered queries
  { name: 'large_parcels', query: 'How many properties are over 5 acres?' },
  { name: 'tax_delinquent', query: 'How many properties are tax delinquent?' },
];

// =============================================================================
// REPLICATE API FUNCTIONS
// =============================================================================

async function callSQLCoder(question, schema) {
  const startTime = Date.now();
  
  try {
    // Create prediction
    const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
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
    
    if (!createResponse.ok) {
      const error = await createResponse.text();
      return { success: false, error: `API error: ${createResponse.status} - ${error}`, time: Date.now() - startTime };
    }
    
    let prediction = await createResponse.json();
    console.log(`  [Prediction ${prediction.id}] Status: ${prediction.status}`);
    
    // Poll for completion
    const maxAttempts = 60;
    const pollInterval = 2000;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (prediction.status === 'succeeded') break;
      if (prediction.status === 'failed' || prediction.status === 'canceled') {
        return { success: false, error: `Prediction ${prediction.status}: ${prediction.error}`, time: Date.now() - startTime };
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { 'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}` }
      });
      
      prediction = await pollResponse.json();
      
      if (attempt % 5 === 0) {
        console.log(`  [Polling] Status: ${prediction.status} (${attempt * 2}s elapsed)`);
      }
    }
    
    if (prediction.status !== 'succeeded') {
      return { success: false, error: `Timeout: ${prediction.status}`, time: Date.now() - startTime };
    }
    
    let sql = prediction.output;
    if (Array.isArray(sql)) sql = sql.join('');
    
    // Clean SQL
    sql = sql?.replace(/```sql\n?/gi, '').replace(/```\n?/g, '').trim();
    sql = sql?.split(';')[0]?.trim();
    if (sql && !sql.endsWith(';')) sql += ';';
    
    return { success: true, sql, time: Date.now() - startTime };
    
  } catch (error) {
    return { success: false, error: error.message, time: Date.now() - startTime };
  }
}

// =============================================================================
// DATABASE FUNCTIONS
// =============================================================================

async function executeSQL(sql) {
  try {
    // Safety check
    const upper = sql.toUpperCase();
    if (!upper.trim().startsWith('SELECT')) {
      return { success: false, error: 'Not a SELECT query' };
    }
    
    // Add LIMIT if missing
    if (!upper.includes('LIMIT')) {
      sql = sql.replace(/;?\s*$/, ' LIMIT 100;');
    }
    
    const result = await pool.query(sql);
    return { success: true, rows: result.rows, rowCount: result.rowCount };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getActualSchema() {
  const result = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'parcel_features_travis'
    ORDER BY ordinal_position;
  `);
  return result.rows;
}

async function getTableStats() {
  const stats = {};
  
  // Row count
  const countResult = await pool.query('SELECT COUNT(*) as count FROM parcel_features_travis');
  stats.totalRows = parseInt(countResult.rows[0].count);
  
  // Asset class distribution
  const assetResult = await pool.query(`
    SELECT asset_class, COUNT(*) as count 
    FROM parcel_features_travis 
    GROUP BY asset_class 
    ORDER BY count DESC
  `);
  stats.assetClassDistribution = assetResult.rows;
  
  // Owner entity type distribution
  const ownerResult = await pool.query(`
    SELECT owner_entity_type, COUNT(*) as count 
    FROM parcel_features_travis 
    GROUP BY owner_entity_type 
    ORDER BY count DESC
  `);
  stats.ownerEntityTypeDistribution = ownerResult.rows;
  
  // Sample values
  const sampleResult = await pool.query(`
    SELECT parcel_id, acres_calc, market_value, asset_class, owner_entity_type, situs_zip
    FROM parcel_features_travis
    WHERE asset_class IS NOT NULL AND market_value IS NOT NULL
    LIMIT 5
  `);
  stats.sampleRows = sampleResult.rows;
  
  return stats;
}

// =============================================================================
// MAIN DIAGNOSTIC
// =============================================================================

async function runDiagnostic() {
  console.log('='.repeat(80));
  console.log('SQLCODER INTEGRATION DIAGNOSTIC');
  console.log('='.repeat(80));
  console.log('Started at:', new Date().toISOString());
  console.log('');
  
  const results = {
    timestamp: new Date().toISOString(),
    environment: {},
    database: {},
    schemaTests: [],
    queryTests: [],
    summary: {}
  };
  
  // -------------------------------------------------------------------------
  // STEP 1: Environment Check
  // -------------------------------------------------------------------------
  console.log('STEP 1: Environment Check');
  console.log('-'.repeat(40));
  
  results.environment.hasReplicateToken = !!process.env.REPLICATE_API_TOKEN;
  results.environment.tokenPrefix = process.env.REPLICATE_API_TOKEN?.substring(0, 5) || 'MISSING';
  results.environment.hasDatabaseUrl = !!process.env.DATABASE_URL;
  
  console.log('  REPLICATE_API_TOKEN:', results.environment.hasReplicateToken ? `✓ (${results.environment.tokenPrefix}...)` : '✗ MISSING');
  console.log('  DATABASE_URL:', results.environment.hasDatabaseUrl ? '✓' : '✗ MISSING');
  console.log('');
  
  if (!results.environment.hasReplicateToken) {
    console.log('ERROR: REPLICATE_API_TOKEN not set. Exiting.');
    process.exit(1);
  }
  
  // -------------------------------------------------------------------------
  // STEP 2: Database Schema Check
  // -------------------------------------------------------------------------
  console.log('STEP 2: Database Schema Check');
  console.log('-'.repeat(40));
  
  try {
    const schema = await getActualSchema();
    results.database.columns = schema;
    console.log(`  Found ${schema.length} columns in parcel_features_travis`);
    console.log('  Columns:', schema.map(c => c.column_name).join(', '));
    
    const stats = await getTableStats();
    results.database.stats = stats;
    console.log(`  Total rows: ${stats.totalRows.toLocaleString()}`);
    console.log('  Asset class distribution:');
    stats.assetClassDistribution.forEach(r => {
      console.log(`    - ${r.asset_class || 'NULL'}: ${parseInt(r.count).toLocaleString()}`);
    });
    console.log('  Owner entity type distribution:');
    stats.ownerEntityTypeDistribution.forEach(r => {
      console.log(`    - ${r.owner_entity_type || 'NULL'}: ${parseInt(r.count).toLocaleString()}`);
    });
  } catch (error) {
    console.log('  ERROR:', error.message);
    results.database.error = error.message;
  }
  console.log('');
  
  // -------------------------------------------------------------------------
  // STEP 3: Schema Format Test
  // -------------------------------------------------------------------------
  console.log('STEP 3: Schema Format Test');
  console.log('-'.repeat(40));
  console.log('Testing which schema format works best with SQLCoder...');
  console.log('');
  
  const schemaFormats = [
    { name: 'DDL (CREATE TABLE)', schema: SCHEMA_V1_DDL },
    { name: 'Simple Description', schema: SCHEMA_V2_SIMPLE },
    { name: 'Minimal', schema: SCHEMA_V3_MINIMAL },
  ];
  
  const testQuestion = 'How many commercial properties are there?';
  
  for (const format of schemaFormats) {
    console.log(`  Testing: ${format.name}`);
    
    const result = await callSQLCoder(testQuestion, format.schema);
    
    const schemaTest = {
      name: format.name,
      question: testQuestion,
      ...result
    };
    
    if (result.success) {
      console.log(`    ✓ SQL generated (${result.time}ms): ${result.sql}`);
      
      // Try to execute
      const execResult = await executeSQL(result.sql);
      schemaTest.execution = execResult;
      
      if (execResult.success) {
        console.log(`    ✓ Executed successfully: ${JSON.stringify(execResult.rows[0])}`);
      } else {
        console.log(`    ✗ Execution failed: ${execResult.error}`);
      }
    } else {
      console.log(`    ✗ Generation failed: ${result.error}`);
    }
    
    results.schemaTests.push(schemaTest);
    console.log('');
  }
  
  // Determine best schema format
  const successfulSchemas = results.schemaTests.filter(t => t.success && t.execution?.success);
  if (successfulSchemas.length > 0) {
    results.summary.bestSchemaFormat = successfulSchemas[0].name;
    console.log(`  BEST FORMAT: ${results.summary.bestSchemaFormat}`);
  } else {
    results.summary.bestSchemaFormat = 'NONE WORKED';
    console.log('  WARNING: No schema format produced executable SQL');
  }
  console.log('');
  
  // -------------------------------------------------------------------------
  // STEP 4: Query Matrix Test
  // -------------------------------------------------------------------------
  console.log('STEP 4: Query Matrix Test');
  console.log('-'.repeat(40));
  
  // Use the best schema format, or fall back to DDL
  const bestSchema = successfulSchemas.length > 0 
    ? schemaFormats.find(f => f.name === successfulSchemas[0].name).schema 
    : SCHEMA_V1_DDL;
  
  console.log(`Using schema format: ${results.summary.bestSchemaFormat || 'DDL (fallback)'}`);
  console.log('');
  
  for (const test of TEST_QUERIES) {
    console.log(`  [${test.name}] "${test.query}"`);
    
    const queryResult = {
      name: test.name,
      question: test.query,
      generation: null,
      execution: null
    };
    
    const genResult = await callSQLCoder(test.query, bestSchema);
    queryResult.generation = genResult;
    
    if (genResult.success) {
      console.log(`    Generated (${genResult.time}ms): ${genResult.sql}`);
      
      const execResult = await executeSQL(genResult.sql);
      queryResult.execution = execResult;
      
      if (execResult.success) {
        const preview = JSON.stringify(execResult.rows.slice(0, 2));
        console.log(`    ✓ Success (${execResult.rowCount} rows): ${preview.substring(0, 100)}...`);
      } else {
        console.log(`    ✗ Execution failed: ${execResult.error}`);
      }
    } else {
      console.log(`    ✗ Generation failed: ${genResult.error}`);
    }
    
    results.queryTests.push(queryResult);
    console.log('');
  }
  
  // -------------------------------------------------------------------------
  // STEP 5: Summary
  // -------------------------------------------------------------------------
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  
  const genSuccess = results.queryTests.filter(t => t.generation?.success).length;
  const execSuccess = results.queryTests.filter(t => t.execution?.success).length;
  const totalTests = results.queryTests.length;
  
  results.summary.totalTests = totalTests;
  results.summary.generationSuccess = genSuccess;
  results.summary.executionSuccess = execSuccess;
  results.summary.generationRate = `${Math.round(genSuccess / totalTests * 100)}%`;
  results.summary.executionRate = `${Math.round(execSuccess / totalTests * 100)}%`;
  
  console.log(`Generation Success: ${genSuccess}/${totalTests} (${results.summary.generationRate})`);
  console.log(`Execution Success:  ${execSuccess}/${totalTests} (${results.summary.executionRate})`);
  console.log('');
  
  // Failed queries
  const failedGen = results.queryTests.filter(t => !t.generation?.success);
  const failedExec = results.queryTests.filter(t => t.generation?.success && !t.execution?.success);
  
  if (failedGen.length > 0) {
    console.log('Failed to Generate:');
    failedGen.forEach(t => console.log(`  - ${t.name}: ${t.generation?.error}`));
    console.log('');
  }
  
  if (failedExec.length > 0) {
    console.log('Generated but Failed to Execute:');
    failedExec.forEach(t => {
      console.log(`  - ${t.name}`);
      console.log(`    SQL: ${t.generation?.sql}`);
      console.log(`    Error: ${t.execution?.error}`);
    });
    console.log('');
  }
  
  // Recommendations
  console.log('RECOMMENDATIONS:');
  if (execSuccess === totalTests) {
    console.log('  ✓ All tests passed! SQLCoder integration is working.');
  } else if (genSuccess === 0) {
    console.log('  ✗ API connectivity issue - check REPLICATE_API_TOKEN');
  } else if (execSuccess === 0) {
    console.log('  ✗ Schema mismatch - SQLCoder SQL doesn\'t match database schema');
    console.log('    - Check column names in schema definition');
    console.log('    - Check table name matches');
  } else {
    console.log('  △ Partial success - some query types may need schema adjustments');
  }
  
  // Save results
  const fs = await import('fs');
  const outputPath = 'scripts/sqlcoder-diagnostic-results.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log('');
  console.log(`Full results saved to: ${outputPath}`);
  
  // Cleanup
  await pool.end();
  console.log('');
  console.log('Diagnostic complete.');
}

// Run
runDiagnostic().catch(console.error);
