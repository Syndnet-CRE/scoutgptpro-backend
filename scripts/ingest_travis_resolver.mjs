/**
 * Phase B: Travis Resolver Ingestion
 * 
 * Ingests StratMap parcels and ATTOM boundary match data into staging tables,
 * then populates the canonical xref table.
 * 
 * WRITES ONLY TO NEW TABLES (created by migration).
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env');
dotenv.config({ path: envPath });

const prisma = new PrismaClient();

const STRATMAP_DBF_PATH = '/Users/braydonirwin/attom_bridge/parcel_boundaries/parcel_boundaries/stratmap24-landparcels_48453_travis_202404.dbf';
const BOUNDARY_MATCH_CSV_PATH = '/Users/braydonirwin/Downloads/PROPERTYTOBOUNDARYMATCH_PARCEL_0003.csv';

// Chunk size for batch inserts
const CHUNK_SIZE = 1000;
const BATCH_SIZE = 100;

// Parse CSV line
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result;
}

// Ingest StratMap data into staging
async function ingestStratMap() {
  console.log('\n📥 Ingesting StratMap data into staging...');
  
  const { writeFileSync, unlinkSync } = await import('fs');
  const tempScript = join(tmpdir(), `stratmap_ingest_${Date.now()}.py`);
  
  const pythonScript = `import json
from dbfread import DBF
try:
    table = DBF('${STRATMAP_DBF_PATH}', encoding='latin1')
except:
    table = DBF('${STRATMAP_DBF_PATH}')

records = []
for record in table:
    prop_id = str(record.get('Prop_ID', '')).strip()
    geo_id = str(record.get('GEO_ID', '')).strip()
    
    if prop_id and geo_id:
        # Convert record to dict for JSON
        record_dict = {k: str(v).strip() if v is not None else '' for k, v in record.items()}
        records.append({
            'prop_id': prop_id,
            'geo_id': geo_id,
            'raw': record_dict
        })

print(json.dumps(records))`;
  
  writeFileSync(tempScript, pythonScript);
  
  console.log('  Reading StratMap DBF...');
  const result = execSync(`python3 "${tempScript}"`, { 
    encoding: 'utf8',
    maxBuffer: 200 * 1024 * 1024
  });
  unlinkSync(tempScript);
  
  const records = JSON.parse(result);
  console.log(`  ✅ Loaded ${records.length.toLocaleString()} records`);
  
  // Insert in chunks
  console.log('  Inserting into staging table...');
  let inserted = 0;
  
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    
    // Build INSERT statement
    const values = chunk.map((r, idx) => {
      const baseIdx = idx * 5;
      return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5})`;
    }).join(', ');
    
    const params = chunk.flatMap(r => [
      r.prop_id,
      r.geo_id, // Using GEO_ID as attom_id placeholder (will be updated later)
      'Travis',
      'stratmap24-landparcels_48453_travis_202404.dbf',
      JSON.stringify(r.raw)
    ]);
    
    await prisma.$executeRawUnsafe(`
      INSERT INTO stg_attom_property_boundary_travis (parcel_id, attom_id, county, source_file, raw)
      VALUES ${values}
      ON CONFLICT DO NOTHING;
    `, ...params);
    
    inserted += chunk.length;
    
    if (i % 10000 === 0) {
      console.log(`    Inserted ${inserted.toLocaleString()} / ${records.length.toLocaleString()}...`);
    }
  }
  
  console.log(`  ✅ Inserted ${inserted.toLocaleString()} records`);
  return inserted;
}

// Ingest boundary match CSV
async function ingestBoundaryMatch() {
  console.log('\n📥 Ingesting ATTOM boundary match CSV...');
  
  const fileStream = createReadStream(BOUNDARY_MATCH_CSV_PATH);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineNumber = 0;
  let header = null;
  let headerIndices = {};
  const batch = [];
  let inserted = 0;

  for await (const line of rl) {
    lineNumber++;
    
    if (lineNumber === 1) {
      header = parseCSVLine(line);
      header.forEach((col, idx) => {
        const cleanCol = col.trim().replace(/^["\[]|["\]]$/g, '');
        headerIndices[cleanCol] = idx;
      });
      continue;
    }
    
    const values = parseCSVLine(line);
    if (values.length < header.length) continue;
    
    const geoIdIdx = headerIndices['GeoID'] ?? headerIndices['geo_id'] ?? headerIndices['Geo_ID'];
    const attomIdIdx = headerIndices['[ATTOM ID]'] ?? headerIndices['ATTOM ID'] ?? headerIndices['attom_id'];
    const geoTypeIdx = headerIndices['GeoType'] ?? headerIndices['geo_type'] ?? headerIndices['Geo_Type'];
    
    if (geoIdIdx !== undefined && attomIdIdx !== undefined) {
      const geoId = values[geoIdIdx]?.trim();
      const attomId = values[attomIdIdx]?.trim();
      const geoType = geoTypeIdx !== undefined ? values[geoTypeIdx]?.trim() : null;
      
      if (geoId && attomId) {
        batch.push({
          parcel_id: geoId, // Using GeoID as parcel_id (will need to map via GEO_ID)
          attom_id: attomId,
          county: 'Travis',
          source_file: 'PROPERTYTOBOUNDARYMATCH_PARCEL_0003.csv',
          raw: JSON.stringify({
            GeoID: geoId,
            '[ATTOM ID]': attomId,
            GeoType: geoType
          })
        });
        
        if (batch.length >= BATCH_SIZE) {
          await insertBatch(batch);
          inserted += batch.length;
          batch.length = 0;
          
          if (inserted % 10000 === 0) {
            console.log(`    Inserted ${inserted.toLocaleString()} records...`);
          }
        }
      }
    }
  }
  
  // Insert remaining batch
  if (batch.length > 0) {
    await insertBatch(batch);
    inserted += batch.length;
  }
  
  console.log(`  ✅ Inserted ${inserted.toLocaleString()} records`);
  return inserted;
}

async function insertBatch(batch) {
  const values = batch.map((r, idx) => {
    const baseIdx = idx * 5;
    return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5})`;
  }).join(', ');
  
  const params = batch.flatMap(r => [
    r.parcel_id,
    r.attom_id,
    r.county,
    r.source_file,
    r.raw
  ]);
  
  await prisma.$executeRawUnsafe(`
    INSERT INTO stg_attom_property_boundary_travis (parcel_id, attom_id, county, source_file, raw)
    VALUES ${values}
    ON CONFLICT DO NOTHING;
  `, ...params);
}

// Populate xref table
async function populateXref() {
  console.log('\n📥 Populating xref_parcel_property_travis...');
  
  // NOTE: Since GEO_ID formats don't match, we need an alternative approach
  // For now, we'll use Prop_ID directly if we can find ATTOM data with matching parcel numbers
  // This is a placeholder - actual implementation depends on finding the right join key
  
  console.log('  ⚠️  WARNING: GEO_ID formats do not match between StratMap and ATTOM boundary match.');
  console.log('  ⚠️  Need alternative join strategy (e.g., Prop_ID ↔ APN from ATTOM GeoJSON).');
  console.log('  ⚠️  Skipping xref population until join strategy is determined.');
  
  return 0;
}

async function main() {
  try {
    console.log('🚀 Phase B: Travis Resolver Ingestion\n');
    console.log('='.repeat(60));
    
    // Check if tables exist
    const tablesExist = await prisma.$queryRawUnsafe(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('stg_attom_property_boundary_travis', 'xref_parcel_property_travis');
    `);
    
    if (tablesExist.length < 2) {
      console.error('❌ Required tables do not exist. Please apply migration first.');
      console.error('   Run: psql $DATABASE_URL -f db/migrations/0001_travis_resolver_and_parcels.sql');
      process.exit(1);
    }
    
    console.log('✅ Required tables exist');
    
    // Ingest StratMap
    await ingestStratMap();
    
    // Ingest boundary match
    await ingestBoundaryMatch();
    
    // Populate xref (skipped due to format mismatch)
    await populateXref();
    
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Phase B Complete');
    console.log('\n⚠️  NOTE: Xref table not populated due to GEO_ID format mismatch.');
    console.log('   See TRAVIS_RESOLVER_PROOF.md for details.');
    
  } catch (error) {
    console.error('❌ Ingestion failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();


