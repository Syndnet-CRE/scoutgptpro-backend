/**
 * Ingest Travis County Parcel Enrichment from Local ZIP File
 * 
 * This script enriches parcels_travis with attributes from a local ZIP file.
 * Supports CSV, TXT, TSV files (attributes only, no geometry).
 * 
 * Usage:
 *   node scripts/ingest-travis-enrichment-local.mjs --zip ~/Downloads/stratmap25-landparcels_48453_lp.zip
 *   node scripts/ingest-travis-enrichment-local.mjs --dbfPath ~/data/travis_landparcels/shp/stratmap25-landparcels_48453_travis_202508.dbf
 *   node scripts/ingest-travis-enrichment-local.mjs --zip ~/Downloads/file.zip --limit 10
 *   node scripts/ingest-travis-enrichment-local.mjs --dbfPath ~/data/file.dbf --truncateStage
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { createReadStream } from 'fs';
import { readdirSync, statSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { parse } from 'csv-parse';
import { execSync } from 'child_process';
import { openDbf } from 'shapefile';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const zipArg = process.argv.find(a => a.startsWith('--zip='));
const ZIP_PATH = zipArg ? zipArg.split('=')[1] : process.argv.find((a, i) => process.argv[i - 1] === '--zip');
const dbfArg = process.argv.find(a => a.startsWith('--dbfPath='));
const DBF_PATH = dbfArg ? dbfArg.split('=')[1] : process.argv.find((a, i) => process.argv[i - 1] === '--dbfPath');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0');
const TRUNCATE_STAGE = process.argv.includes('--truncateStage');
const DEBUG_IDS = process.argv.includes('--debugIds');
const TEMP_DIR = DBF_PATH ? null : join(__dirname, '../temp_enrichment_' + Date.now());

// Initialize database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5
});

/**
 * Print database connection info (password redacted)
 */
function printDbInfo() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL environment variable not set');
    process.exit(1);
  }
  
  const url = process.env.DATABASE_URL;
  const match = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (match) {
    const [, user, , host, port, database] = match;
    console.log(`📊 Database: ${host}:${port}/${database}`);
    console.log(`👤 User: ${user}`);
  } else {
    console.log(`📊 Database: ${url.replace(/:[^:@]+@/, ':****@')}`);
  }
}

/**
 * Unzip file to temp directory
 */
function unzipFile(zipPath) {
  console.log(`📦 Unzipping: ${zipPath}`);
  
  if (!existsSync(zipPath)) {
    throw new Error(`Zip file not found: ${zipPath}`);
  }
  
  // Create temp directory
  mkdirSync(TEMP_DIR, { recursive: true });
  
  // Try unzip command first (Linux/Unix)
  try {
    execSync(`unzip -q -o "${zipPath}" -d "${TEMP_DIR}"`, { stdio: 'pipe' });
    console.log(`✅ Unzipped to: ${TEMP_DIR}`);
    return;
  } catch (err) {
    // Try ditto on macOS
    try {
      execSync(`ditto -x -k "${zipPath}" "${TEMP_DIR}"`, { stdio: 'pipe' });
      console.log(`✅ Unzipped to: ${TEMP_DIR}`);
      return;
    } catch (err2) {
      throw new Error(`Failed to unzip file. Ensure 'unzip' or 'ditto' command is available. Error: ${err2.message}`);
    }
  }
}

/**
 * Detect best attribute file in temp directory
 */
function detectAttributeFile() {
  // Recursively find files in temp directory
  function findFiles(dir, fileList = []) {
    const files = readdirSync(dir);
    files.forEach(file => {
      const filePath = join(dir, file);
      try {
        const stat = statSync(filePath);
        if (stat.isDirectory()) {
          findFiles(filePath, fileList);
        } else {
          fileList.push(filePath);
        }
      } catch (err) {
        // Skip if can't stat
      }
    });
    return fileList;
  }
  
  const allFiles = findFiles(TEMP_DIR);
  const extensions = new Set();
  
  // Priority: CSV > TXT/TSV > DBF (if parser exists)
  const csvFiles = allFiles.filter(f => /\.csv$/i.test(f));
  const txtFiles = allFiles.filter(f => /\.(txt|tsv)$/i.test(f));
  const dbfFiles = allFiles.filter(f => /\.dbf$/i.test(f));
  
  allFiles.forEach(f => {
    const ext = extname(f).toLowerCase();
    if (ext) extensions.add(ext);
  });
  
  if (csvFiles.length > 0) {
    const file = csvFiles[0];
    console.log(`✅ Detected CSV file: ${basename(file)}`);
    return { file, type: 'csv', extensions: Array.from(extensions) };
  }
  
  if (txtFiles.length > 0) {
    const file = txtFiles[0];
    const isTsv = /\.tsv$/i.test(file);
    console.log(`✅ Detected ${isTsv ? 'TSV' : 'TXT'} file: ${basename(file)}`);
    return { file, type: isTsv ? 'tsv' : 'csv', extensions: Array.from(extensions) };
  }
  
  if (dbfFiles.length > 0) {
    const file = dbfFiles[0];
    console.log(`✅ Detected DBF file: ${basename(file)}`);
    return { file, type: 'dbf', extensions: Array.from(extensions) };
  }
  
  throw new Error(`No ingestable attribute file found (CSV/TXT/TSV/DBF). Found file extensions: ${Array.from(extensions).join(', ')}`);
}

/**
 * Detect parcel ID column in CSV (generic)
 */
function detectParcelIdColumn(headers) {
  const priorities = ['prop_id', 'PROP_ID', 'parcel_id', 'PARCEL_ID', 'geo_id', 'GEO_ID', 'APN', 'apn', 'OBJECTID', 'objectid', 'FID', 'fid'];
  
  for (const priority of priorities) {
    const col = headers.find(h => 
      h === priority || 
      h.toLowerCase() === priority.toLowerCase() ||
      h.toLowerCase().includes('parcel') ||
      h.toLowerCase().includes('property')
    );
    if (col) {
      return col;
    }
  }
  
  // Fallback to first column
  return headers[0] || null;
}

/**
 * Strictly detect parcel ID column for DBF (with validation)
 */
function detectParcelIdColumnDbf(headers) {
  // Prefer exact names (case-insensitive) in this order
  const exactNames = ['PROP_ID', 'PROPID', 'PROP_ID_1', 'PROPERTYID', 'PROPERTY_ID', 'PARCELID', 'PARCEL_ID', 'PID'];
  
  for (const exactName of exactNames) {
    const col = headers.find(h => h.toLowerCase() === exactName.toLowerCase());
    if (col) {
      return col;
    }
  }
  
  // If none match, choose field containing both 'PROP' and 'ID'
  const propIdCol = headers.find(h => {
    const lower = h.toLowerCase();
    return lower.includes('prop') && lower.includes('id');
  });
  if (propIdCol) {
    return propIdCol;
  }
  
  // Or field containing both 'PARCEL' and 'ID'
  const parcelIdCol = headers.find(h => {
    const lower = h.toLowerCase();
    return lower.includes('parcel') && lower.includes('id');
  });
  if (parcelIdCol) {
    return parcelIdCol;
  }
  
  // If still none found, throw error with header list
  throw new Error(
    `Cannot find parcel ID column in DBF. Expected one of: ${exactNames.join(', ')} or field containing 'PROP'/'ID' or 'PARCEL'/'ID'.\n` +
    `Available DBF fields: ${headers.join(', ')}`
  );
}

/**
 * Normalize parcel ID to match parcels_travis.parcel_id exactly
 * 
 * LOCKED: Raw DBF prop_id values already match parcels_travis.parcel_id format.
 * No padding, prefix removal, or transformation needed - only trim whitespace.
 */
function normalizeParcelId(id) {
  if (!id) return null;
  
  let normalized = String(id).trim();
  // DBF numeric fields are stored as floats (e.g., "970897.0"), but parcels_travis.parcel_id is integer-like.
  // Strip trailing ".0" to match: "970897.0" → "970897"
  if (/^\d+\.0$/.test(normalized)) {
    normalized = normalized.replace(/\.0$/, '');
  }
  return normalized;
}

/**
 * Create canonical match key for joining (strips leading zeros and trailing .0+)
 * Used for matching DBF Prop_ID (e.g., "0100050259") with parcels_travis.parcel_id (e.g., "100050259")
 */
function matchKey(id) {
  if (id === null || id === undefined) return null;
  let s = String(id).trim();
  // Strip trailing ".0+"
  s = s.replace(/\.0+$/, '');
  // Strip leading zeros, but if result becomes empty string, keep "0"
  s = s.replace(/^0+/, '');
  if (s === '') {
    s = '0';
  }
  return s;
}

/**
 * Stream DBF file and insert into staging
 * Uses shapefile package's openDbf for standalone DBF files
 */
async function streamDbfToStage(filePath, limit) {
  console.log(`📥 Streaming DBF to staging table...`);
  console.log(`   File: ${basename(filePath)}`);
  if (limit > 0) console.log(`   Limit: ${limit} rows`);
  
  const client = await pool.connect();
  let rowCount = 0;
  let stagedCount = 0;
  const batchSize = 1000;
  let batch = [];
  let parcelIdColumn = null;
  let debugSamples = [];
  
  try {
    await client.query('BEGIN');
    
    // Use shapefile package's openDbf to read standalone DBF file
    const source = await openDbf(filePath);
    
    // TASK 1: One-time header dump at start of DBF ingest
    console.log('\n📋 DBF Header Dump:');
    let headers = null;
    if (source.header && source.header.fields && Array.isArray(source.header.fields)) {
      headers = source.header.fields.map(f => f.name || f.fieldName || f);
      console.log(`   Total fields: ${headers.length}`);
      source.header.fields.forEach((f, i) => {
        const name = f.name || f.fieldName || f;
        const type = f.type || 'unknown';
        const length = f.length || 'unknown';
        console.log(`   ${i + 1}. ${name} (type: ${type}, length: ${length})`);
      });
    } else {
      // If header not available, read first record to infer
      const firstResult = await source.read();
      if (firstResult.done) {
        throw new Error('DBF file is empty - cannot determine field names');
      }
      headers = Object.keys(firstResult.value || {});
      console.log(`   Total fields: ${headers.length} (inferred from first record)`);
      headers.forEach((h, i) => {
        console.log(`   ${i + 1}. ${h}`);
      });
    }
    
    // Defensive guard: if headers still not determined
    if (!headers || headers.length === 0) {
      const availableKeys = Object.keys(source).join(', ');
      throw new Error(`Cannot determine DBF field names. Available object keys: ${availableKeys}. Try reading first record to infer fields.`);
    }
    
    // TASK 2: Strict selection of parcel ID column for DBF
    parcelIdColumn = detectParcelIdColumnDbf(headers);
    console.log(`\n✅ Selected parcel ID column: ${parcelIdColumn}`);
    
    // TASK 3: Validate selected field using first 200 records
    console.log(`\n🔍 Validating selected field "${parcelIdColumn}" using first 200 records...`);
    const validationRecords = [];
    const validationSource = await openDbf(filePath); // Reopen for validation
    let validationCount = 0;
    const numericPattern = /^\d+(\.0+)?$/;
    
    while (validationCount < 200) {
      const result = await validationSource.read();
      if (result.done) break;
      
      const record = result.value || {};
      // Case-insensitive lookup for the selected field
      const recordKeys = Object.keys(record);
      const matchedKey = recordKeys.find(k => k.toLowerCase() === parcelIdColumn.toLowerCase());
      const value = matchedKey ? record[matchedKey] : null;
      
      if (value !== null && value !== undefined) {
        const strValue = String(value).trim();
        validationRecords.push({
          value: strValue,
          isNumeric: numericPattern.test(strValue)
        });
      }
      validationCount++;
    }
    
    // Compute validation stats
    const totalValidated = validationRecords.length;
    const numericCount = validationRecords.filter(r => r.isNumeric).length;
    const numericPercent = totalValidated > 0 ? (numericCount / totalValidated * 100).toFixed(2) : 0;
    
    // Get top 10 distinct values
    const valueCounts = {};
    validationRecords.forEach(r => {
      valueCounts[r.value] = (valueCounts[r.value] || 0) + 1;
    });
    const topValues = Object.entries(valueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([val, count]) => ({ value: val, count }));
    
    console.log(`   Validated ${totalValidated} records`);
    console.log(`   Numeric-like values: ${numericCount} (${numericPercent}%)`);
    console.log(`   Top 10 distinct values:`);
    topValues.forEach((tv, i) => {
      console.log(`     ${i + 1}. "${tv.value}" (${tv.count} occurrences)`);
    });
    
    // If numeric-ish % is < 80%, throw error
    if (numericPercent < 80) {
      throw new Error(
        `Selected field "${parcelIdColumn}" appears incorrect. Only ${numericPercent}% of values are numeric-like.\n` +
        `Top values suggest this is not a parcel ID field. Please check DBF header dump above.\n` +
        `Available fields: ${headers.join(', ')}`
      );
    }
    
    console.log(`✅ Validation passed: ${numericPercent}% numeric-like (threshold: 80%)`);
    
    // Reopen source for actual streaming (validation read position is lost)
    const actualSource = await openDbf(filePath);
    
    // Get parcels_travis parcel_ids for debug matching
    let parcelIdsSet = null;
    if (DEBUG_IDS) {
      const parcelIdsResult = await client.query('SELECT parcel_id FROM parcels_travis');
      parcelIdsSet = new Set(parcelIdsResult.rows.map(r => r.parcel_id));
      console.log(`\n🔍 DEBUG: Loaded ${parcelIdsSet.size} parcel_ids from parcels_travis`);
    }
    
    // TASK 4: Stream records using validated field (case-insensitive lookup)
    console.log(`\n📥 Streaming DBF to staging table...`);
    console.log(`   File: ${basename(filePath)}`);
    console.log(`   Using parcel ID column: ${parcelIdColumn}`);
    
    // Read all records for streaming
    while (true) {
      const result = await actualSource.read();
      if (result.done) break;
      
      rowCount++;
      if (limit > 0 && rowCount > limit) break;
      
      // DBF record is already an object with field names as keys
      const record = result.value || {};
      
      // TASK 4: Case-insensitive lookup for validated parcel ID column
      let rawParcelId = null;
      const recordKeys = Object.keys(record);
      const matchedKey = recordKeys.find(k => k.toLowerCase() === parcelIdColumn.toLowerCase());
      if (matchedKey) {
        rawParcelId = record[matchedKey];
      } else {
        throw new Error(`Field "${parcelIdColumn}" not found in DBF record. Available keys: ${recordKeys.join(', ')}`);
      }
      
      // TASK 4: detected_id = normalizeParcelId(record[selectedFieldKey])
      const normalizedParcelId = normalizeParcelId(rawParcelId);
      const rawJson = JSON.stringify(record);
      
      // Debug: Collect first 10 samples
      if (DEBUG_IDS && debugSamples.length < 10) {
        const exists = normalizedParcelId && parcelIdsSet ? parcelIdsSet.has(normalizedParcelId) : false;
        debugSamples.push({
          raw: rawParcelId,
          normalized: normalizedParcelId,
          exists
        });
      }
      
      batch.push({ rawJson, parcelId: normalizedParcelId });
      
      // Insert batch when full
      if (batch.length >= batchSize) {
        await insertBatch(client, batch);
        stagedCount += batch.length;
        batch = [];
        process.stdout.write(`\r   Processed: ${rowCount} rows, staged: ${stagedCount}`);
      }
    }
    
    // Insert remaining batch
    if (batch.length > 0) {
      await insertBatch(client, batch);
      stagedCount += batch.length;
    }
    
    await client.query('COMMIT');
    console.log(`\n✅ Staged ${stagedCount} rows from ${rowCount} total rows`);
    
    // Debug: Print sample matches
    if (DEBUG_IDS && debugSamples.length > 0) {
      console.log(`\n🔍 DEBUG: Parcel ID Matching Samples (first ${debugSamples.length} records):`);
      console.log(`   Format: raw_id → normalized_id → exists(true/false)`);
      console.log(`   Column used: ${parcelIdColumn || headers[0] || 'first column'}`);
      debugSamples.forEach((sample, idx) => {
        const existsStr = sample.exists ? 'TRUE' : 'FALSE';
        console.log(`   ${idx + 1}. "${sample.raw}" → "${sample.normalized}" → ${existsStr}`);
      });
      
      const trueCount = debugSamples.filter(s => s.exists).length;
      const falseCount = debugSamples.filter(s => !s.exists).length;
      console.log(`\n   Summary: ${trueCount} TRUE, ${falseCount} FALSE`);
    }
    
    return { rowCount, stagedCount, parcelIdColumn };
  } finally {
    client.release();
  }
}

/**
 * Stream CSV/TSV file and insert into staging
 */
async function streamCsvToStage(filePath, fileType, limit) {
  console.log(`📥 Streaming ${fileType.toUpperCase()} to staging table...`);
  console.log(`   File: ${basename(filePath)}`);
  if (limit > 0) console.log(`   Limit: ${limit} rows`);
  
  const client = await pool.connect();
  let rowCount = 0;
  let stagedCount = 0;
  const batchSize = 1000;
  let batch = [];
  let parcelIdColumn = null;
  let headersDetected = false;
  let debugSamples = [];
  
  try {
    await client.query('BEGIN');
    
    // Get parcels_travis parcel_ids for debug matching
    let parcelIdsSet = null;
    if (DEBUG_IDS) {
      const parcelIdsResult = await client.query('SELECT parcel_id FROM parcels_travis');
      parcelIdsSet = new Set(parcelIdsResult.rows.map(r => r.parcel_id));
      console.log(`\n🔍 DEBUG: Loaded ${parcelIdsSet.size} parcel_ids from parcels_travis`);
    }
    
    const parser = parse({
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      delimiter: fileType === 'tsv' ? '\t' : ','
    });
    
    const fileStream = createReadStream(filePath);
    
    return new Promise((resolve, reject) => {
      parser.on('readable', async function() {
        let record;
        while ((record = parser.read()) !== null) {
          rowCount++;
          
          // Detect parcel ID column on first row
          if (!headersDetected && record) {
            const headers = Object.keys(record);
            
            // Debug: Log all headers
            if (DEBUG_IDS) {
              console.log(`\n🔍 DEBUG: Detected CSV headers (${headers.length} columns):`);
              headers.forEach((h, i) => console.log(`   ${i + 1}. ${h}`));
            }
            
            parcelIdColumn = detectParcelIdColumn(headers);
            headersDetected = true;
            console.log(`   Detected parcel ID column: ${parcelIdColumn || 'first column'}`);
          }
          
          if (limit > 0 && rowCount > limit) {
            parser.destroy();
            break;
          }
          
          const rawParcelId = record[parcelIdColumn] || record[Object.keys(record)[0]] || null;
          const normalizedParcelId = normalizeParcelId(rawParcelId);
          const rawJson = JSON.stringify(record);
          
          // Debug: Collect first 10 samples
          if (DEBUG_IDS && debugSamples.length < 10) {
            const exists = normalizedParcelId && parcelIdsSet ? parcelIdsSet.has(normalizedParcelId) : false;
            debugSamples.push({
              raw: rawParcelId,
              normalized: normalizedParcelId,
              exists
            });
          }
          
          batch.push({ rawJson, parcelId: normalizedParcelId });
          
          // Insert batch when full
          if (batch.length >= batchSize) {
            await insertBatch(client, batch);
            stagedCount += batch.length;
            batch = [];
            process.stdout.write(`\r   Processed: ${rowCount} rows, staged: ${stagedCount}`);
          }
        }
      });
      
      parser.on('end', async function() {
        // Insert remaining batch
        if (batch.length > 0) {
          await insertBatch(client, batch);
          stagedCount += batch.length;
        }
        
        await client.query('COMMIT');
        console.log(`\n✅ Staged ${stagedCount} rows from ${rowCount} total rows`);
        
        // Debug: Print sample matches
        if (DEBUG_IDS && debugSamples.length > 0) {
          console.log(`\n🔍 DEBUG: Parcel ID Matching Samples (first ${debugSamples.length} records):`);
          console.log(`   Format: raw_id → normalized_id → exists(true/false)`);
          console.log(`   Column used: ${parcelIdColumn || 'first column'}`);
          debugSamples.forEach((sample, idx) => {
            const existsStr = sample.exists ? 'TRUE' : 'FALSE';
            console.log(`   ${idx + 1}. "${sample.raw}" → "${sample.normalized}" → ${existsStr}`);
          });
          
          const trueCount = debugSamples.filter(s => s.exists).length;
          const falseCount = debugSamples.filter(s => !s.exists).length;
          console.log(`\n   Summary: ${trueCount} TRUE, ${falseCount} FALSE`);
        }
        
        resolve({ rowCount, stagedCount, parcelIdColumn });
      });
      
      parser.on('error', async function(err) {
        await client.query('ROLLBACK');
        reject(err);
      });
      
      fileStream.pipe(parser);
    });
  } finally {
    client.release();
  }
}

/**
 * Insert batch into staging table
 */
async function insertBatch(client, batch) {
  if (batch.length === 0) return;
  
  const values = [];
  const placeholders = [];
  
  for (let i = 0; i < batch.length; i++) {
    values.push(batch[i].rawJson, batch[i].parcelId);
    placeholders.push(`($${i * 2 + 1}::jsonb, $${i * 2 + 2})`);
  }
  
  const query = `
    INSERT INTO parcels_travis_enrichment_stage (raw, detected_id)
    VALUES ${placeholders.join(', ')}
  `;
  
  await client.query(query, values);
}

/**
 * Match staging records to parcel_id and upsert into enrichment table
 */
async function matchAndUpsert() {
  console.log('\n🔄 Matching staging records to parcel_id...');
  
  const client = await pool.connect();
  
  try {
    // Get all unique parcel_ids from parcels_travis
    const parcelIdsResult = await client.query('SELECT parcel_id FROM parcels_travis');
    // Create lookup map: canonical matchKey -> original parcel_id
    const parcelIdsMap = new Map();
    parcelIdsResult.rows.forEach(r => {
      const originalParcelId = String(r.parcel_id).trim();
      const key = matchKey(originalParcelId);
      if (key) {
        parcelIdsMap.set(key, originalParcelId);
      }
    });
    
    console.log(`📊 Total parcels_travis records: ${parcelIdsMap.size}`);
    
    // Pre-run validation: print sample match attempts
    console.log('\n🔍 Pre-run validation: Sample match key transformations');
    const sampleParcels = parcelIdsResult.rows.slice(0, 5);
    console.log('   Sample parcels_travis.parcel_id → matchKey:');
    sampleParcels.forEach((r, i) => {
      const original = String(r.parcel_id).trim();
      const key = matchKey(original);
      console.log(`     ${i + 1}. "${original}" → "${key}"`);
    });
    
    // Get sample staged detected_id values
    const sampleStagedResult = await client.query(`
      SELECT DISTINCT detected_id
      FROM parcels_travis_enrichment_stage
      WHERE detected_id IS NOT NULL
      LIMIT 5
    `);
    console.log('   Sample staging detected_id → matchKey:');
    sampleStagedResult.rows.forEach((r, i) => {
      const original = String(r.detected_id).trim();
      const key = matchKey(original);
      console.log(`     ${i + 1}. "${original}" → "${key}"`);
    });
    
    // Process staging in batches
    let offset = 0;
    let matched = 0;
    let unmatched = 0;
    
    while (true) {
      const result = await client.query(`
        SELECT id, raw, detected_id
        FROM parcels_travis_enrichment_stage
        ORDER BY id
        LIMIT 1000 OFFSET $1
      `, [offset]);
      
      if (result.rows.length === 0) break;
      
      for (const row of result.rows) {
        const raw = row.raw;
        let detectedId = row.detected_id;
        
        // Ensure detected_id is string and trim whitespace (type-safe)
        if (detectedId !== null && detectedId !== undefined) {
          detectedId = String(detectedId).trim();
        } else {
          detectedId = null;
        }
        
        // Try to match detected_id to parcel_id using canonical matchKey
        let matchedParcelId = null;
        
        if (detectedId) {
          // Apply matchKey to detected_id for canonical matching
          const matchKeyValue = matchKey(detectedId);
          if (matchKeyValue) {
            matchedParcelId = parcelIdsMap.get(matchKeyValue) || null;
          }
        }
        
        if (matchedParcelId) {
          try {
            // Upsert into enrichment table
            await client.query(`
              INSERT INTO parcels_travis_enrichment (
                parcel_id, owner_name, owner2, mail_address1, mail_address2,
                mail_city, mail_state, mail_zip, situs_address, land_use,
                land_use_desc, legal_desc, year_built, acres, land_value,
                improvement_value, market_value, assessed_value, last_update,
                source_layer, raw, updated_at
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                $16, $17, $18, $19, $20, $21, NOW()
              )
              ON CONFLICT (parcel_id) DO UPDATE SET
                owner_name = EXCLUDED.owner_name,
                owner2 = EXCLUDED.owner2,
                mail_address1 = EXCLUDED.mail_address1,
                mail_address2 = EXCLUDED.mail_address2,
                mail_city = EXCLUDED.mail_city,
                mail_state = EXCLUDED.mail_state,
                mail_zip = EXCLUDED.mail_zip,
                situs_address = EXCLUDED.situs_address,
                land_use = EXCLUDED.land_use,
                land_use_desc = EXCLUDED.land_use_desc,
                legal_desc = EXCLUDED.legal_desc,
                year_built = EXCLUDED.year_built,
                acres = EXCLUDED.acres,
                land_value = EXCLUDED.land_value,
                improvement_value = EXCLUDED.improvement_value,
                market_value = EXCLUDED.market_value,
                assessed_value = EXCLUDED.assessed_value,
                last_update = EXCLUDED.last_update,
                source_layer = EXCLUDED.source_layer,
                raw = EXCLUDED.raw,
                updated_at = NOW()
            `, [
              matchedParcelId,
              raw.owner_name || raw.OWNER_NAME || raw.owner || null,
              raw.owner2 || raw.OWNER2 || null,
              raw.mail_address1 || raw.MAIL_ADDRESS1 || raw.mail_addr1 || null,
              raw.mail_address2 || raw.MAIL_ADDRESS2 || raw.mail_addr2 || null,
              raw.mail_city || raw.MAIL_CITY || null,
              raw.mail_state || raw.MAIL_STATE || null,
              raw.mail_zip || raw.MAIL_ZIP || null,
              raw.situs_address || raw.SITUS_ADDRESS || raw.address || null,
              raw.land_use || raw.LAND_USE || null,
              raw.land_use_desc || raw.LAND_USE_DESC || null,
              raw.legal_desc || raw.LEGAL_DESC || null,
              raw.year_built || raw.YEAR_BUILT || null,
              raw.acres || raw.ACRES || null,
              raw.land_value || raw.LAND_VALUE || null,
              raw.improvement_value || raw.IMPROVEMENT_VALUE || null,
              raw.market_value || raw.MARKET_VALUE || null,
              raw.assessed_value || raw.ASSESSED_VALUE || null,
              raw.last_update || raw.LAST_UPDATE || null,
              'stratmap25_local',
              JSON.stringify(raw)
            ]);
            
            matched++;
          } catch (err) {
            console.error(`⚠️  Error upserting parcel ${matchedParcelId}: ${err.message}`);
            unmatched++;
          }
        } else {
          unmatched++;
        }
      }
      
      offset += result.rows.length;
      process.stdout.write(`\r   Processed: ${offset} staging records, matched: ${matched}, unmatched: ${unmatched}`);
    }
    
    console.log('');
    return { matched, unmatched };
  } finally {
    client.release();
  }
}

/**
 * Main ingestion function
 */
async function ingestEnrichment() {
  let attrFile = null;
  let parcelIdColumn = null;
  let rowCount = 0;
  let stagedCount = 0;
  let matched = 0;
  let unmatched = 0;
  
  try {
    console.log('🚀 Starting Travis County parcel enrichment ingestion (local ZIP)...');
    printDbInfo();
    
    if (!ZIP_PATH && !DBF_PATH) {
      throw new Error('Either --zip or --dbfPath parameter is required. Usage: node scripts/ingest-travis-enrichment-local.mjs --zip <path> OR --dbfPath <path>');
    }
    
    // Verify tables exist
    const tableCheck = await pool.query(`
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'parcels_travis_enrichment_stage'
      LIMIT 1
    `);
    
    if (tableCheck.rows.length === 0) {
      throw new Error('parcels_travis_enrichment_stage table does not exist. Run migration first.');
    }
    
    // Truncate stage if requested
    if (TRUNCATE_STAGE) {
      console.log('⚠️  TRUNCATING staging table...');
      await pool.query('TRUNCATE TABLE parcels_travis_enrichment_stage');
      console.log('✅ Truncated staging table');
    }
    
    // Handle DBF source (direct file or extracted from ZIP)
    let fileType;
    if (DBF_PATH) {
      // Direct DBF file path provided
      if (!existsSync(DBF_PATH)) {
        throw new Error(`DBF file not found: ${DBF_PATH}`);
      }
      attrFile = DBF_PATH;
      fileType = 'dbf';
      console.log(`📄 DBF source: direct`);
      console.log(`📄 DBF file: ${DBF_PATH}`);
    } else {
      // Extract from ZIP
      console.log(`📦 ZIP file: ${ZIP_PATH}`);
      console.log(`📄 DBF source: zip`);
      unzipFile(ZIP_PATH);
      
      // Detect attribute file
      const detected = detectAttributeFile();
      attrFile = detected.file;
      fileType = detected.type;
      console.log(`📄 Extracted DBF file: ${attrFile}`);
    }
    
    // Stream to staging based on file type
    let streamResult;
    if (fileType === 'dbf') {
      streamResult = await streamDbfToStage(attrFile, LIMIT);
    } else {
      streamResult = await streamCsvToStage(attrFile, fileType, LIMIT);
    }
    rowCount = streamResult.rowCount;
    stagedCount = streamResult.stagedCount;
    parcelIdColumn = streamResult.parcelIdColumn || 'detected during streaming';
    
    // Match and upsert
    const matchResult = await matchAndUpsert();
    matched = matchResult.matched;
    unmatched = matchResult.unmatched;
    
    // Get final counts
    const enrichedResult = await pool.query('SELECT COUNT(*) as cnt FROM parcels_travis_enrichment');
    const enrichedCount = enrichedResult.rows[0].cnt;
    
    // Final runtime logs
    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL RUNTIME SUMMARY');
    console.log('='.repeat(60));
    console.log(`   ZIP path: ${ZIP_PATH}`);
    console.log(`   Extracted DBF file: ${attrFile}`);
    console.log(`   parcel_id column: ${parcelIdColumn}`);
    console.log(`   Total records read: ${rowCount}`);
    console.log(`   Rows inserted into parcels_travis_enrichment_stage: ${stagedCount}`);
    console.log(`   Rows upserted into parcels_travis_enrichment: ${matched}`);
    console.log(`   Unmatched parcel_id count: ${unmatched}`);
    console.log(`   Final enriched count: ${enrichedCount}`);
    console.log('='.repeat(60));
    
    console.log('\n✅ Ingestion complete!');
    
    // Exit with success code
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Ingestion error:', error);
    console.error('\n📊 PARTIAL RUNTIME SUMMARY (on error):');
    if (DBF_PATH) {
      console.error(`   DBF source: direct`);
      console.error(`   DBF file: ${DBF_PATH || 'N/A'}`);
    } else {
      console.error(`   ZIP path: ${ZIP_PATH || 'N/A'}`);
      console.error(`   DBF source: zip`);
      console.error(`   Extracted DBF file: ${attrFile || 'N/A'}`);
    }
    console.error(`   parcel_id column: ${parcelIdColumn || 'N/A'}`);
    console.error(`   Total records read: ${rowCount}`);
    console.error(`   Rows inserted into parcels_travis_enrichment_stage: ${stagedCount}`);
    console.error(`   Rows upserted into parcels_travis_enrichment: ${matched}`);
    console.error(`   Unmatched parcel_id count: ${unmatched}`);
    
    // Exit with error code
    process.exit(1);
  } finally {
    // Cleanup temp directory (always, even on error or early exit)
    try {
      if (existsSync(TEMP_DIR)) {
        rmSync(TEMP_DIR, { recursive: true, force: true });
        console.log(`🧹 Cleaned up temp directory: ${TEMP_DIR}`);
      }
    } catch (err) {
      console.warn(`⚠️  Failed to cleanup temp directory: ${err.message}`);
    }
    
    // Close database pool
    try {
      await pool.end();
    } catch (err) {
      console.warn(`⚠️  Error closing database pool: ${err.message}`);
    }
  }
}

// Run ingestion
ingestEnrichment();

