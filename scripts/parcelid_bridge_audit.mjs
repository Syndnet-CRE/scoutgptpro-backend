/**
 * ParcelID Bridge Audit Script
 * 
 * Determines the correct normalization rule to map TAXASSESSOR ParcelNumberRaw
 * to Neon properties.parcelId for populating xref_parcel_property_travis.
 * 
 * READ-ONLY: No database writes, no schema changes.
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env');
dotenv.config({ path: envPath });

const prisma = new PrismaClient();

const CSV_PATH = '/Users/braydonirwin/Downloads/TAXASSESSOR_0001.csv';

// Simple CSV line parser (handles quoted fields)
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
  result.push(current); // Add last field
  
  return result;
}
const RESULTS = {
  neon: {},
  csv: {},
  normalizationRules: {}
};

// Helper to convert BigInt to Number
function convertBigInt(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (Array.isArray(obj)) return obj.map(convertBigInt);
  if (typeof obj === 'object') {
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertBigInt(value);
    }
    return converted;
  }
  return obj;
}

// Normalization rules to test
const normalizationRules = {
  'lstrip_zeros': (raw) => {
    if (!raw) return null;
    return String(raw).replace(/^0+/, '') || '0';
  },
  'rightmost_6': (raw) => {
    if (!raw) return null;
    const str = String(raw);
    return str.length >= 6 ? str.slice(-6) : str;
  },
  'rightmost_7': (raw) => {
    if (!raw) return null;
    const str = String(raw);
    return str.length >= 7 ? str.slice(-7) : str;
  },
  'rightmost_8': (raw) => {
    if (!raw) return null;
    const str = String(raw);
    return str.length >= 8 ? str.slice(-8) : str;
  },
  'integer_cast': (raw) => {
    if (!raw) return null;
    try {
      return String(parseInt(String(raw), 10));
    } catch {
      return null;
    }
  }
};

async function auditNeon() {
  console.log('🔍 Auditing Neon database parcelId format...\n');

  // 1. Length distribution of properties.parcelId
  console.log('Query 1: Length distribution of parcelId...');
  const lengthDist = await prisma.$queryRawUnsafe(`
    SELECT 
      LENGTH("parcelId") AS len,
      COUNT(*) AS count
    FROM properties
    GROUP BY LENGTH("parcelId")
    ORDER BY len;
  `);
  RESULTS.neon.lengthDistribution = convertBigInt(lengthDist);
  console.log('✅ Length distribution:', RESULTS.neon.lengthDistribution);

  // 2. Sample 50 parcelIds
  console.log('\nQuery 2: Sampling 50 parcelIds...');
  const samples = await prisma.$queryRawUnsafe(`
    SELECT 
      "parcelId",
      "attomId",
      "id" AS property_id
    FROM properties
    ORDER BY RANDOM()
    LIMIT 50;
  `);
  RESULTS.neon.samples = samples;
  console.log('✅ Sampled 50 parcelIds');

  // 3. Columns containing "parcel"
  console.log('\nQuery 3: Finding columns containing "parcel"...');
  const parcelColumns = await prisma.$queryRawUnsafe(`
    SELECT 
      column_name,
      data_type,
      udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'properties'
      AND column_name ILIKE '%parcel%'
    ORDER BY column_name;
  `);
  RESULTS.neon.parcelColumns = parcelColumns;
  console.log('✅ Parcel columns:', parcelColumns.map(c => c.column_name).join(', '));

  // 4. Get all parcelIds for matching (in chunks)
  console.log('\nQuery 4: Loading all parcelIds for matching...');
  const parcelIdSet = new Set();
  const chunkSize = 10000;
  let offset = 0;
  let totalLoaded = 0;
  
  while (true) {
    const chunk = await prisma.$queryRawUnsafe(`
      SELECT "parcelId"
      FROM properties
      WHERE "parcelId" IS NOT NULL
      ORDER BY "parcelId"
      LIMIT ${chunkSize} OFFSET ${offset};
    `);
    
    if (chunk.length === 0) break;
    
    chunk.forEach(row => parcelIdSet.add(String(row.parcelId)));
    totalLoaded += chunk.length;
    offset += chunkSize;
    
    if (totalLoaded % 50000 === 0 || chunk.length < chunkSize) {
      console.log(`  Loaded ${parcelIdSet.size} unique parcelIds (${totalLoaded} rows processed)...`);
    }
  }
  
  RESULTS.neon.parcelIdSetSize = parcelIdSet.size;
  RESULTS.neon.totalRowsProcessed = totalLoaded;
  console.log(`✅ Loaded ${parcelIdSet.size} unique parcelIds from ${totalLoaded} rows`);
  
  return parcelIdSet;
}

async function auditCSV(parcelIdSet) {
  console.log('\n🔍 Auditing TAXASSESSOR CSV file...\n');
  
  const fileStream = createReadStream(CSV_PATH);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineNumber = 0;
  let header = null;
  let headerIndices = {};
  const lengthDist = {};
  let blankFormattedCount = 0;
  let totalRows = 0;
  const maxRows = 200000;
  
  // Track matches for each normalization rule
  const ruleMatches = {
    'lstrip_zeros': { matched: 0, total: 0 },
    'rightmost_6': { matched: 0, total: 0 },
    'rightmost_7': { matched: 0, total: 0 },
    'rightmost_8': { matched: 0, total: 0 },
    'integer_cast': { matched: 0, total: 0 }
  };
  
  // Store example mappings
  const exampleMappings = [];
  const maxExamples = 10;

  for await (const line of rl) {
    lineNumber++;
    
    // Parse header
    if (lineNumber === 1) {
      // Parse CSV with quoted fields
      header = parseCSVLine(line);
      header.forEach((col, idx) => {
        // Remove quotes and brackets from column names
        const cleanCol = col.trim().replace(/^["\[]|["\]]$/g, '');
        headerIndices[cleanCol] = idx;
        headerIndices[col.trim()] = idx; // Also keep original for lookup
      });
      
      // Verify required columns (check both with and without brackets)
      const required = ['[ATTOM ID]', 'ATTOM ID', 'ParcelNumberRaw', 'ParcelNumberFormatted'];
      const found = required.filter(col => 
        headerIndices.hasOwnProperty(col) || 
        headerIndices.hasOwnProperty(col.replace(/[\[\]]/g, ''))
      );
      if (found.length < 3) {
        console.log('Available columns:', Object.keys(headerIndices).slice(0, 20).join(', '));
        throw new Error(`Missing required columns. Found: ${found.join(', ')}`);
      }
      
      RESULTS.csv.header = header;
      RESULTS.csv.headerIndices = headerIndices;
      console.log('✅ Header parsed. Columns:', header.length);
      console.log('   Required columns found');
      continue;
    }
    
    // Skip empty lines
    if (!line.trim()) continue;
    
    // Parse CSV row with quoted fields
    const values = parseCSVLine(line);
    if (values.length < header.length) continue; // Skip malformed rows
    
    // Get column indices (try both with and without brackets)
    const attomIdIdx = headerIndices['[ATTOM ID]'] ?? headerIndices['ATTOM ID'];
    const parcelNumberRawIdx = headerIndices['ParcelNumberRaw'];
    const parcelNumberFormattedIdx = headerIndices['ParcelNumberFormatted'];
    
    const attomId = values[attomIdIdx]?.trim().replace(/^["\[]|["\]]$/g, '');
    const parcelNumberRaw = values[parcelNumberRawIdx]?.trim().replace(/^["]|["]$/g, '');
    const parcelNumberFormatted = values[parcelNumberFormattedIdx]?.trim().replace(/^["]|["]$/g, '');
    
    if (!parcelNumberRaw) continue;
    
    totalRows++;
    
    // Length distribution
    const len = parcelNumberRaw.length;
    lengthDist[len] = (lengthDist[len] || 0) + 1;
    
    // Blank formatted check
    if (!parcelNumberFormatted || parcelNumberFormatted === '') {
      blankFormattedCount++;
    }
    
    // Test normalization rules
    for (const [ruleName, ruleFn] of Object.entries(normalizationRules)) {
      const normalized = ruleFn(parcelNumberRaw);
      if (normalized && parcelIdSet.has(normalized)) {
        ruleMatches[ruleName].matched++;
        
        // Store example mappings
        if (exampleMappings.length < maxExamples && attomId) {
          // Find the matching parcelId and property
          const matchingParcelId = normalized;
          exampleMappings.push({
            parcelNumberRaw,
            normalized,
            matchedParcelId: matchingParcelId,
            attomId,
            rule: ruleName
          });
        }
      }
      ruleMatches[ruleName].total++;
    }
    
    // Stop early if we have enough data or a rule matches > 80%
    if (totalRows >= maxRows) {
      const bestRule = Object.entries(ruleMatches)
        .find(([_, stats]) => stats.total > 0 && (stats.matched / stats.total) > 0.8);
      if (bestRule) {
        console.log(`\n✅ Early stop: Rule "${bestRule[0]}" has >80% match rate`);
        break;
      }
    }
    
    if (totalRows % 10000 === 0) {
      console.log(`  Processed ${totalRows} rows...`);
    }
  }
  
  // Calculate match rates
  const matchRates = {};
  for (const [ruleName, stats] of Object.entries(ruleMatches)) {
    matchRates[ruleName] = {
      matched: stats.matched,
      total: stats.total,
      rate: stats.total > 0 ? (stats.matched / stats.total * 100).toFixed(2) : '0.00'
    };
  }
  
  RESULTS.csv.lengthDistribution = lengthDist;
  RESULTS.csv.blankFormattedPercent = totalRows > 0 ? (blankFormattedCount / totalRows * 100).toFixed(2) : '0.00';
  RESULTS.csv.totalRowsAnalyzed = totalRows;
  RESULTS.csv.normalizationRules = matchRates;
  RESULTS.csv.exampleMappings = exampleMappings;
  
  console.log(`\n✅ CSV audit complete:`);
  console.log(`   Total rows analyzed: ${totalRows}`);
  console.log(`   Blank ParcelNumberFormatted: ${RESULTS.csv.blankFormattedPercent}%`);
  console.log(`   Match rates:`, matchRates);
  
  return matchRates;
}

async function main() {
  try {
    console.log('🚀 Starting ParcelID Bridge Audit\n');
    console.log('=' .repeat(60));
    
    // Audit Neon
    const parcelIdSet = await auditNeon();
    
    // Audit CSV
    const matchRates = await auditCSV(parcelIdSet);
    
    // Find best rule
    const bestRule = Object.entries(matchRates)
      .sort((a, b) => parseFloat(b[1].rate) - parseFloat(a[1].rate))[0];
    
    RESULTS.recommendedRule = {
      name: bestRule[0],
      matchRate: bestRule[1].rate,
      matched: bestRule[1].matched,
      total: bestRule[1].total
    };
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Audit Complete');
    console.log(`\n📊 Recommended Rule: ${bestRule[0]}`);
    console.log(`   Match Rate: ${bestRule[1].rate}%`);
    console.log(`   Matched: ${bestRule[1].matched} / ${bestRule[1].total}`);
    
    // Output JSON for report generation
    console.log('\n📄 Results JSON:');
    console.log(JSON.stringify(RESULTS, null, 2));
    
  } catch (error) {
    console.error('❌ Audit failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

