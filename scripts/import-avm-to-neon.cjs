const { Pool } = require('pg');
const fs = require('fs');
const readline = require('readline');

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_XMN3fLJZ1tib@ep-rapid-wind-a4k9miff-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

const BATCH_SIZE = 1000;

async function main() {
  console.log('=== AVM IMPORT TO NEON ===\n');
  
  // First, create temp table for AVM data
  await pool.query(`
    DROP TABLE IF EXISTS temp_avm_import;
    CREATE TABLE temp_avm_import (
      attom_id VARCHAR(20) PRIMARY KEY,
      avm_value DECIMAL(14,2),
      avm_min DECIMAL(14,2),
      avm_max DECIMAL(14,2),
      avm_confidence INTEGER,
      avm_date DATE
    );
  `);
  
  console.log('Temp table created\n');
  
  // Parse CSV and load into temp table
  const fileStream = fs.createReadStream('/Users/braydonirwin/Downloads/avm_0002.csv');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  let lineCount = 0;
  let headers = [];
  let batch = [];
  let inserted = 0;
  
  for await (const line of rl) {
    lineCount++;
    
    if (lineCount === 1) {
      headers = line.split(',').map(h => h.trim().replace(/[\[\]]/g, ''));
      console.log('Headers:', headers.join(', '));
      continue;
    }
    
    const values = line.split(',');
    if (values.length < headers.length) continue;
    
    // Find column indices
    const attomIdx = headers.findIndex(h => h.toLowerCase().includes('attom') && h.toLowerCase().includes('id'));
    const valueIdx = headers.findIndex(h => h.toLowerCase().includes('estimatedvalue') && !h.toLowerCase().includes('min') && !h.toLowerCase().includes('max'));
    const minIdx = headers.findIndex(h => h.toLowerCase().includes('estimatedminvalue'));
    const maxIdx = headers.findIndex(h => h.toLowerCase().includes('estimatedmaxvalue'));
    const confIdx = headers.findIndex(h => h.toLowerCase().includes('confidencescore'));
    const dateIdx = headers.findIndex(h => h.toLowerCase().includes('valuationdate'));
    
    if (attomIdx === -1 || valueIdx === -1) {
      if (lineCount <= 5) console.log('Skipping line - missing required columns');
      continue;
    }
    
    const attomId = values[attomIdx]?.trim();
    const avmValue = parseFloat(values[valueIdx]) || null;
    const avmMin = minIdx >= 0 ? (parseFloat(values[minIdx]) || null) : null;
    const avmMax = maxIdx >= 0 ? (parseFloat(values[maxIdx]) || null) : null;
    const avmConf = confIdx >= 0 ? (parseInt(values[confIdx]) || null) : null;
    let avmDate = null;
    
    if (dateIdx >= 0 && values[dateIdx]) {
      const dateStr = values[dateIdx].trim();
      // Try parsing date (MM/DD/YY format)
      if (dateStr.includes('/')) {
        const [m, d, y] = dateStr.split('/');
        avmDate = `20${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    
    if (!attomId || !avmValue) continue;
    
    batch.push([attomId, avmValue, avmMin, avmMax, avmConf, avmDate]);
    
    if (batch.length >= BATCH_SIZE) {
      try {
        await pool.query(`
          INSERT INTO temp_avm_import (attom_id, avm_value, avm_min, avm_max, avm_confidence, avm_date)
          VALUES ${batch.map((_, i) => `($${i*6+1}, $${i*6+2}, $${i*6+3}, $${i*6+4}, $${i*6+5}, $${i*6+6})`).join(', ')}
          ON CONFLICT (attom_id) DO NOTHING
        `, batch.flat());
        
        inserted += batch.length;
        process.stdout.write(`\rInserted: ${inserted.toLocaleString()} AVM records`);
        batch = [];
      } catch (err) {
        console.error(`\nError at line ${lineCount}:`, err.message);
        batch = [];
      }
    }
  }
  
  // Insert remaining
  if (batch.length > 0) {
    await pool.query(`
      INSERT INTO temp_avm_import (attom_id, avm_value, avm_min, avm_max, avm_confidence, avm_date)
      VALUES ${batch.map((_, i) => `($${i*6+1}, $${i*6+2}, $${i*6+3}, $${i*6+4}, $${i*6+5}, $${i*6+6})`).join(', ')}
      ON CONFLICT (attom_id) DO NOTHING
    `, batch.flat());
    inserted += batch.length;
  }
  
  console.log(`\n\n✅ Loaded ${inserted.toLocaleString()} AVM records into temp table`);
  
  // Now match via RECORDER if available, else use address matching
  console.log('\n=== Matching AVM to properties ===');
  
  // Check if RECORDER staging table exists
  const recorderCheck = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'staging_recorder'
    )
  `);
  
  if (recorderCheck.rows[0].exists) {
    console.log('Using RECORDER table for matching...');
    await pool.query(`
      UPDATE properties p
      SET 
        "attomId" = a.attom_id,
        "avmValue" = a.avm_value,
        "avmMin" = a.avm_min,
        "avmMax" = a.avm_max,
        "avmConfidence" = a.avm_confidence,
        "avmDate" = a.avm_date
      FROM staging_recorder r
      JOIN temp_avm_import a ON r.attom_id = a.attom_id
      WHERE p."parcelId" = r.apn_formatted
        AND p."avmValue" IS NULL
    `);
  } else {
    console.log('RECORDER table not found - using address matching from local...');
    // We'll need to export matching data from local
  }
  
  const matched = await pool.query(`
    SELECT COUNT(*) as count FROM properties WHERE "avmValue" IS NOT NULL
  `);
  
  console.log(`\n✅ Matched ${matched.rows[0].count} properties with AVM values`);
  
  await pool.query('DROP TABLE IF EXISTS temp_avm_import');
  await pool.end();
}

main().catch(console.error);
