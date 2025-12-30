/**
 * TAXASSESSOR Join Proof (READ-ONLY)
 * 
 * Tests feasibility of joining Neon properties.parcelId (6-digit) to ATTOM ID
 * via TAXASSESSOR CSV parcel number fields.
 * 
 * NO DATABASE WRITES. SELECT-only queries.
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env');
dotenv.config({ path: envPath });

const prisma = new PrismaClient();

const TAXASSESSOR_CSV_PATH = '/Users/braydonirwin/Downloads/TAXASSESSOR_0001.csv';
const PROOF_REPORT_PATH = join(__dirname, '../docs/TAXASSESSOR_JOIN_PROOF.md');

const FIELDS_TO_TEST = [
  'ParcelAccountNumber',
  'ParcelNumberAlternate',
  'ParcelNumberPrevious',
  'ParcelNumberRaw'
];

const RESULTS = {
  totalRows: 0,
  fields: {},
  neonOverlap: {}
};

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

// Load Neon parcelIds into Set
async function loadNeonParcelIds() {
  console.log('\n📊 Loading Neon parcelIds...');
  
  const parcelIdSet = new Set();
  const chunkSize = 10000;
  let offset = 0;
  
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
    offset += chunkSize;
    
    if (parcelIdSet.size % 50000 === 0) {
      console.log(`  Loaded ${parcelIdSet.size.toLocaleString()} parcelIds...`);
    }
  }
  
  console.log(`  ✅ Loaded ${parcelIdSet.size.toLocaleString()} parcelIds`);
  return parcelIdSet;
}

// Analyze TAXASSESSOR CSV
async function analyzeTAXASSESSOR() {
  console.log('\n📊 Analyzing TAXASSESSOR CSV...');
  
  const fileStream = createReadStream(TAXASSESSOR_CSV_PATH);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineNumber = 0;
  let header = null;
  let headerIndices = {};
  
  // Initialize field stats
  for (const field of FIELDS_TO_TEST) {
    RESULTS.fields[field] = {
      total: 0,
      digitsOnly: 0,
      exactly6Digits: 0,
      lengthDistribution: {},
      samples: [],
      parcelIdToAttomId: new Map() // parcelId -> [attomIds]
    };
  }
  
  // Find ATTOM ID field
  let attomIdField = null;
  let attomIdIdx = null;

  for await (const line of rl) {
    lineNumber++;
    
    if (lineNumber === 1) {
      header = parseCSVLine(line);
      header.forEach((col, idx) => {
        const cleanCol = col.trim().replace(/^["\[]|["\]]$/g, '');
        headerIndices[cleanCol] = idx;
        headerIndices[col.trim()] = idx;
        
        // Find ATTOM ID field
        if (!attomIdField && (/attom.*id|\[attom id\]/i.test(cleanCol) || cleanCol === 'id')) {
          attomIdField = cleanCol;
          attomIdIdx = idx;
        }
      });
      
      console.log(`  ✅ Header parsed. Columns: ${header.length}`);
      console.log(`  ✅ ATTOM ID field: ${attomIdField || 'NOT FOUND'}`);
      console.log(`  ✅ Fields to test: ${FIELDS_TO_TEST.join(', ')}`);
      continue;
    }
    
    const values = parseCSVLine(line);
    if (values.length < header.length) continue;
    
    RESULTS.totalRows++;
    
    // Get ATTOM ID
    const attomId = attomIdIdx !== null && attomIdIdx < values.length
      ? values[attomIdIdx]?.trim()
      : null;
    
    // Analyze each field
    for (const field of FIELDS_TO_TEST) {
      const fieldIdx = headerIndices[field];
      if (fieldIdx === undefined || fieldIdx >= values.length) continue;
      
      const value = values[fieldIdx]?.trim();
      if (!value) continue;
      
      const stats = RESULTS.fields[field];
      stats.total++;
      
      // Check if digits-only
      const isDigitsOnly = /^\d+$/.test(value);
      if (isDigitsOnly) {
        stats.digitsOnly++;
        
        const len = value.length;
        stats.lengthDistribution[len] = (stats.lengthDistribution[len] || 0) + 1;
        
        // Check if exactly 6 digits
        if (len === 6) {
          stats.exactly6Digits++;
          
          // Store mapping for overlap check
          if (!stats.parcelIdToAttomId.has(value)) {
            stats.parcelIdToAttomId.set(value, []);
          }
          if (attomId) {
            stats.parcelIdToAttomId.get(value).push(attomId);
          }
          
          // Collect samples
          if (stats.samples.length < 20) {
            stats.samples.push(value);
          }
        }
      }
    }
    
    if (RESULTS.totalRows % 100000 === 0) {
      console.log(`  Processed ${RESULTS.totalRows.toLocaleString()} rows...`);
    }
  }
  
  console.log(`  ✅ Processed ${RESULTS.totalRows.toLocaleString()} rows`);
}

// Compute overlap for each field
async function computeOverlap() {
  console.log('\n📊 Computing overlap with Neon parcelIds...');
  
  const neonParcelIdSet = await loadNeonParcelIds();
  
  for (const field of FIELDS_TO_TEST) {
    const stats = RESULTS.fields[field];
    
    let overlapCount = 0;
    let collisionCount = 0;
    const exampleMappings = [];
    
    for (const [parcelId, attomIds] of stats.parcelIdToAttomId.entries()) {
      if (neonParcelIdSet.has(parcelId)) {
        overlapCount++;
        
        // Check for collisions
        const uniqueAttomIds = new Set(attomIds);
        if (uniqueAttomIds.size > 1) {
          collisionCount++;
        }
        
        // Collect examples
        if (exampleMappings.length < 20) {
          exampleMappings.push({
            parcelId,
            attomId: attomIds[0],
            collision: uniqueAttomIds.size > 1,
            attomIdCount: uniqueAttomIds.size
          });
        }
      }
    }
    
    RESULTS.neonOverlap[field] = {
      overlapCount,
      overlapRate: stats.exactly6Digits > 0
        ? ((overlapCount / stats.exactly6Digits) * 100).toFixed(2)
        : '0.00',
      collisionCount,
      collisionRate: overlapCount > 0
        ? ((collisionCount / overlapCount) * 100).toFixed(2)
        : '0.00',
      exampleMappings
    };
    
    console.log(`  ${field}:`);
    console.log(`    Overlap: ${overlapCount.toLocaleString()} / ${stats.exactly6Digits.toLocaleString()} (${RESULTS.neonOverlap[field].overlapRate}%)`);
    console.log(`    Collisions: ${collisionCount.toLocaleString()} (${RESULTS.neonOverlap[field].collisionRate}%)`);
  }
}

// Write proof report
function writeProofReport() {
  const report = `# TAXASSESSOR Join Proof Report
**Date:** ${new Date().toISOString()}  
**Phase:** READ-ONLY Proof  
**Purpose:** Test feasibility of joining Neon parcelId to ATTOM ID via TAXASSESSOR CSV parcel number fields

---

## Executive Summary

**Source:** \`${TAXASSESSOR_CSV_PATH}\`

| Field | 6-Digit Count | Overlap | Overlap Rate | Collisions | Collision Rate |
|-------|---------------|---------|--------------|------------|----------------|
${FIELDS_TO_TEST.map(f => {
  const stats = RESULTS.fields[f];
  const overlap = RESULTS.neonOverlap[f] || {};
  return `| \`${f}\` | ${stats.exactly6Digits.toLocaleString()} | ${overlap.overlapCount || 0} | **${overlap.overlapRate || '0.00'}%** | ${overlap.collisionCount || 0} | **${overlap.collisionRate || '0.00'}%** |`;
}).join('\n')}

---

## 1. Overall Statistics

| Metric | Value |
|--------|-------|
| **Total Rows** | ${RESULTS.totalRows.toLocaleString()} |

---

## 2. Field Analysis

${FIELDS_TO_TEST.map(field => {
  const stats = RESULTS.fields[field];
  const overlap = RESULTS.neonOverlap[field] || {};
  
  return `### 2.${FIELDS_TO_TEST.indexOf(field) + 1} ${field}

#### Statistics

| Metric | Count | Percentage |
|--------|-------|------------|
| **Total Values** | ${stats.total.toLocaleString()} | 100% |
| **Digits-Only** | ${stats.digitsOnly.toLocaleString()} | ${stats.total > 0 ? ((stats.digitsOnly / stats.total) * 100).toFixed(2) : '0.00'}% |
| **Exactly 6 Digits** | ${stats.exactly6Digits.toLocaleString()} | ${stats.total > 0 ? ((stats.exactly6Digits / stats.total) * 100).toFixed(2) : '0.00'}% |

#### Length Distribution

\`\`\`json
${JSON.stringify(stats.lengthDistribution, null, 2)}
\`\`\`

#### Neon Overlap

| Metric | Value |
|--------|-------|
| **6-Digit Values** | ${stats.exactly6Digits.toLocaleString()} |
| **Overlap Count** | ${overlap.overlapCount || 0} |
| **Overlap Rate** | **${overlap.overlapRate || '0.00'}%** |
| **Collision Count** | ${overlap.collisionCount || 0} |
| **Collision Rate** | **${overlap.collisionRate || '0.00'}%** |

#### Example Mappings

${overlap.exampleMappings && overlap.exampleMappings.length > 0
  ? `| parcelId | ATTOM ID | Collision? | ATTOM ID Count |
|----------|----------|------------|----------------|
${overlap.exampleMappings.map(m => `| \`${m.parcelId}\` | \`${m.attomId}\` | ${m.collision ? '⚠️ Yes' : '✅ No'} | ${m.attomIdCount} |`).join('\n')}`
  : 'No mappings found.'}

#### Conclusion

**${parseFloat(overlap.overlapRate || '0') >= 95 && parseFloat(overlap.collisionRate || '100') <= 0.1 ? '✅ FEASIBLE' : '❌ NOT FEASIBLE'}**

${parseFloat(overlap.overlapRate || '0') >= 95 && parseFloat(overlap.collisionRate || '100') <= 0.1
  ? '✅ **USE THIS FIELD** - Provides deterministic join to ATTOM ID.'
  : parseFloat(overlap.overlapRate || '0') >= 95
    ? '⚠️ **CONDITIONAL** - Good overlap but collisions detected.'
    : '❌ **DO NOT USE** - Insufficient overlap.'}

`;
}).join('\n---\n\n')}

---

## 3. Recommendation

**Best Field:** ${(() => {
  let bestField = null;
  let bestScore = 0;
  
  for (const field of FIELDS_TO_TEST) {
    const overlap = RESULTS.neonOverlap[field] || {};
    const overlapRate = parseFloat(overlap.overlapRate || '0');
    const collisionRate = parseFloat(overlap.collisionRate || '100');
    
    // Score: overlap rate - (collision rate * 10)
    const score = overlapRate - (collisionRate * 10);
    
    if (score > bestScore) {
      bestScore = score;
      bestField = field;
    }
  }
  
  return bestField || 'NONE';
})()}

---

**Script:** \`scripts/prove_taxassessor_join.mjs\`  
**Report Generated:** ${new Date().toISOString()}
`;

  writeFileSync(PROOF_REPORT_PATH, report, 'utf8');
  console.log(`\n✅ Proof report written: ${PROOF_REPORT_PATH}`);
}

async function main() {
  try {
    console.log('🚀 TAXASSESSOR Join Proof (READ-ONLY)\n');
    console.log('='.repeat(60));
    
    await analyzeTAXASSESSOR();
    await computeOverlap();
    writeProofReport();
    
    console.log('\n' + '='.repeat(60));
    console.log(`\n✅ Proof Complete`);
    console.log(`\nReport: ${PROOF_REPORT_PATH}`);
    
  } catch (error) {
    console.error('❌ Proof failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

