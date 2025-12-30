/**
 * Phase A: Travis Resolver Proof (READ-ONLY)
 * 
 * Verifies feasibility of building parcel ↔ ATTOM ID resolver using:
 * - StratMap parcels (Prop_ID, GEO_ID)
 * - ATTOM boundary match CSV (GeoID, [ATTOM ID])
 * - Neon properties.parcelId
 * 
 * NO DATABASE WRITES. SELECT-only queries.
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
const PROOF_REPORT_PATH = join(__dirname, '../docs/TRAVIS_RESOLVER_PROOF.md');

const RESULTS = {
  stratmap: {},
  boundaryMatch: {},
  joinFeasibility: {},
  neonOverlap: {},
  conclusion: null
};

// Helper to convert BigInt
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

// Parse CSV line (handles quoted fields)
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

// Analyze StratMap DBF
async function analyzeStratMap() {
  console.log('\n📊 Analyzing StratMap DBF...');
  
  try {
    const { writeFileSync, unlinkSync } = await import('fs');
    const tempScript = join(tmpdir(), `stratmap_audit_${Date.now()}.py`);
    
    const pythonScript = `import json
from dbfread import DBF
try:
    table = DBF('${STRATMAP_DBF_PATH}', encoding='latin1')
except:
    table = DBF('${STRATMAP_DBF_PATH}')

# Get all records
records = []
prop_ids = set()
geo_ids = set()
prop_id_lengths = {}
geo_id_lengths = {}

for record in table:
    prop_id = str(record.get('Prop_ID', '')).strip()
    geo_id = str(record.get('GEO_ID', '')).strip()
    
    if prop_id:
        prop_ids.add(prop_id)
        prop_id_lengths[len(prop_id)] = prop_id_lengths.get(len(prop_id), 0) + 1
        
        # Check if digits-only
        if prop_id.isdigit():
            records.append({
                'Prop_ID': prop_id,
                'GEO_ID': geo_id,
                'is_digit': True
            })
        else:
            records.append({
                'Prop_ID': prop_id,
                'GEO_ID': geo_id,
                'is_digit': False
            })
    
    if geo_id:
        geo_ids.add(geo_id)
        geo_id_lengths[len(geo_id)] = geo_id_lengths.get(len(geo_id), 0) + 1

result = {
    'total_records': len(records),
    'distinct_prop_id': len(prop_ids),
    'distinct_geo_id': len(geo_ids),
    'prop_id_length_distribution': prop_id_lengths,
    'geo_id_length_distribution': geo_id_lengths,
    'prop_id_samples': list(prop_ids)[:20],
    'geo_id_samples': list(geo_ids)[:20],
    'all_digits': all(r.get('is_digit', False) for r in records if r.get('Prop_ID'))
}

print(json.dumps(result))`;
    
    writeFileSync(tempScript, pythonScript);
    const result = execSync(`python3 "${tempScript}"`, { 
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024
    });
    unlinkSync(tempScript);
    
    const data = JSON.parse(result);
    RESULTS.stratmap = data;
    
    console.log(`  ✅ Total records: ${data.total_records.toLocaleString()}`);
    console.log(`  ✅ Distinct Prop_ID: ${data.distinct_prop_id.toLocaleString()}`);
    console.log(`  ✅ Distinct GEO_ID: ${data.distinct_geo_id.toLocaleString()}`);
    console.log(`  ✅ Prop_ID length distribution:`, data.prop_id_length_distribution);
    console.log(`  ✅ All Prop_ID digits-only: ${data.all_digits}`);
    
  } catch (error) {
    console.error('  ❌ Error analyzing StratMap:', error.message);
    throw error;
  }
}

// Analyze boundary match CSV
async function analyzeBoundaryMatch() {
  console.log('\n📊 Analyzing ATTOM boundary match CSV...');
  
  const fileStream = createReadStream(BOUNDARY_MATCH_CSV_PATH);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineNumber = 0;
  let header = null;
  let headerIndices = {};
  const attomIds = new Set();
  const geoIds = new Set();
  const geoTypes = {};
  let totalRows = 0;

  for await (const line of rl) {
    lineNumber++;
    
    if (lineNumber === 1) {
      header = parseCSVLine(line);
      header.forEach((col, idx) => {
        const cleanCol = col.trim().replace(/^["\[]|["\]]$/g, '');
        headerIndices[cleanCol] = idx;
        headerIndices[col.trim()] = idx;
      });
      console.log(`  ✅ Header parsed. Columns: ${header.length}`);
      console.log(`  ✅ Column names: ${header.slice(0, 10).join(', ')}...`);
      continue;
    }
    
    const values = parseCSVLine(line);
    if (values.length < header.length) continue;
    
    totalRows++;
    
    // Extract key fields
    const attomIdIdx = headerIndices['[ATTOM ID]'] ?? headerIndices['ATTOM ID'] ?? headerIndices['attom_id'];
    const geoIdIdx = headerIndices['GeoID'] ?? headerIndices['geo_id'] ?? headerIndices['Geo_ID'];
    const geoTypeIdx = headerIndices['GeoType'] ?? headerIndices['geo_type'] ?? headerIndices['Geo_Type'];
    
    if (attomIdIdx !== undefined && values[attomIdIdx]) {
      attomIds.add(values[attomIdIdx].trim());
    }
    
    if (geoIdIdx !== undefined && values[geoIdIdx]) {
      const geoId = values[geoIdIdx].trim();
      geoIds.add(geoId);
      
      if (geoTypeIdx !== undefined && values[geoTypeIdx]) {
        const geoType = values[geoTypeIdx].trim();
        geoTypes[geoType] = (geoTypes[geoType] || 0) + 1;
      }
    }
    
    if (totalRows % 100000 === 0) {
      console.log(`  Processed ${totalRows.toLocaleString()} rows...`);
    }
  }
  
  RESULTS.boundaryMatch = {
    totalRows,
    distinctAttomId: attomIds.size,
    distinctGeoId: geoIds.size,
    geoTypeDistribution: geoTypes,
    attomIdSamples: Array.from(attomIds).slice(0, 20),
    geoIdSamples: Array.from(geoIds).slice(0, 20),
    headerColumns: header
  };
  
  console.log(`  ✅ Total rows: ${totalRows.toLocaleString()}`);
  console.log(`  ✅ Distinct [ATTOM ID]: ${attomIds.size.toLocaleString()}`);
  console.log(`  ✅ Distinct GeoID: ${geoIds.size.toLocaleString()}`);
  console.log(`  ✅ GeoType distribution:`, geoTypes);
}

// Compute join feasibility (local)
async function computeJoinFeasibility() {
  console.log('\n📊 Computing join feasibility (local)...');
  
  // Load StratMap GEO_IDs into Set
  const stratmapGeoIds = new Set(RESULTS.stratmap.geo_id_samples || []);
  
  // We need to scan the CSV again to check overlap
  // For now, use the samples we have
  const boundaryGeoIds = new Set(RESULTS.boundaryMatch.geoIdSamples || []);
  
  // Load full GEO_ID sets from both sources
  console.log('  Loading full GEO_ID sets...');
  
  // Load StratMap GEO_IDs
  const { writeFileSync, unlinkSync } = await import('fs');
  const tempScript = join(tmpdir(), `geo_ids_${Date.now()}.py`);
  
  const pythonScript = `import json
from dbfread import DBF
try:
    table = DBF('${STRATMAP_DBF_PATH}', encoding='latin1')
except:
    table = DBF('${STRATMAP_DBF_PATH}')

geo_ids = set()
for record in table:
    geo_id = str(record.get('GEO_ID', '')).strip()
    if geo_id:
        geo_ids.add(geo_id)

print(json.dumps(list(geo_ids)))`;
  
  writeFileSync(tempScript, pythonScript);
  const stratmapGeoIdsResult = execSync(`python3 "${tempScript}"`, { 
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024
  });
  unlinkSync(tempScript);
  
  const stratmapGeoIdSet = new Set(JSON.parse(stratmapGeoIdsResult));
  console.log(`  ✅ Loaded ${stratmapGeoIdSet.size.toLocaleString()} StratMap GEO_IDs`);
  
  // Load boundary match GeoIDs
  const fileStream = createReadStream(BOUNDARY_MATCH_CSV_PATH);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineNumber = 0;
  let header = null;
  let headerIndices = {};
  const boundaryGeoIdSet = new Set();
  const geoIdToAttomId = new Map();

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
    
    if (geoIdIdx !== undefined && attomIdIdx !== undefined) {
      const geoId = values[geoIdIdx]?.trim();
      const attomId = values[attomIdIdx]?.trim();
      
      if (geoId && attomId) {
        boundaryGeoIdSet.add(geoId);
        geoIdToAttomId.set(geoId, attomId);
      }
    }
  }
  
  console.log(`  ✅ Loaded ${boundaryGeoIdSet.size.toLocaleString()} boundary match GeoIDs`);
  
  // Compute overlap
  let overlapCount = 0;
  const matchedGeoIds = [];
  for (const geoId of stratmapGeoIdSet) {
    if (boundaryGeoIdSet.has(geoId)) {
      overlapCount++;
      if (matchedGeoIds.length < 10) {
        matchedGeoIds.push(geoId);
      }
    }
  }
  
  const overlapPercent = stratmapGeoIdSet.size > 0 
    ? ((overlapCount / stratmapGeoIdSet.size) * 100).toFixed(2)
    : '0.00';
  
  // Estimate resulting pairs
  // We need Prop_ID -> GEO_ID mapping from StratMap
  const tempScript2 = join(tmpdir(), `prop_geo_map_${Date.now()}.py`);
  
  const pythonScript2 = `import json
from dbfread import DBF
try:
    table = DBF('${STRATMAP_DBF_PATH}', encoding='latin1')
except:
    table = DBF('${STRATMAP_DBF_PATH}')

prop_geo_map = {}
for record in table:
    prop_id = str(record.get('Prop_ID', '')).strip()
    geo_id = str(record.get('GEO_ID', '')).strip()
    if prop_id and geo_id:
        prop_geo_map[geo_id] = prop_id

print(json.dumps(prop_geo_map))`;
  
  writeFileSync(tempScript2, pythonScript2);
  const propGeoMapResult = execSync(`python3 "${tempScript2}"`, { 
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024
  });
  unlinkSync(tempScript2);
  
  const propGeoMap = JSON.parse(propGeoMapResult);
  
  // Count resulting pairs
  let resultingPairs = 0;
  const pairSamples = [];
  for (const geoId of matchedGeoIds) {
    const propId = propGeoMap[geoId];
    const attomId = geoIdToAttomId.get(geoId);
    if (propId && attomId) {
      resultingPairs++;
      if (pairSamples.length < 10) {
        pairSamples.push({ prop_id: propId, geo_id: geoId, attom_id: attomId });
      }
    }
  }
  
  // Full count
  for (const geoId of stratmapGeoIdSet) {
    if (boundaryGeoIdSet.has(geoId)) {
      const propId = propGeoMap[geoId];
      const attomId = geoIdToAttomId.get(geoId);
      if (propId && attomId) {
        resultingPairs++;
      }
    }
  }
  
  RESULTS.joinFeasibility = {
    stratmapGeoIdCount: stratmapGeoIdSet.size,
    boundaryGeoIdCount: boundaryGeoIdSet.size,
    overlapCount,
    overlapPercent,
    resultingPairs,
    pairSamples
  };
  
  console.log(`  ✅ StratMap GEO_IDs: ${stratmapGeoIdSet.size.toLocaleString()}`);
  console.log(`  ✅ Boundary match GeoIDs: ${boundaryGeoIdSet.size.toLocaleString()}`);
  console.log(`  ✅ Overlap: ${overlapCount.toLocaleString()} (${overlapPercent}%)`);
  console.log(`  ✅ Resulting pairs (Prop_ID -> ATTOM ID): ${resultingPairs.toLocaleString()}`);
}

// Neon overlap (read-only)
async function checkNeonOverlap() {
  console.log('\n📊 Checking Neon overlap (READ-ONLY)...');
  
  // Count properties
  const totalProperties = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as count FROM properties;
  `);
  RESULTS.neonOverlap.totalProperties = Number(totalProperties[0].count);
  
  // Count distinct parcelIds
  const distinctParcelIds = await prisma.$queryRawUnsafe(`
    SELECT COUNT(DISTINCT "parcelId") as count FROM properties WHERE "parcelId" IS NOT NULL;
  `);
  RESULTS.neonOverlap.distinctParcelIds = Number(distinctParcelIds[0].count);
  
  // Load StratMap Prop_IDs
  const { writeFileSync, unlinkSync } = await import('fs');
  const tempScript = join(tmpdir(), `prop_ids_${Date.now()}.py`);
  
  const pythonScript = `import json
from dbfread import DBF
try:
    table = DBF('${STRATMAP_DBF_PATH}', encoding='latin1')
except:
    table = DBF('${STRATMAP_DBF_PATH}')

prop_ids = set()
for record in table:
    prop_id = str(record.get('Prop_ID', '')).strip()
    if prop_id and prop_id.isdigit() and len(prop_id) == 6:
        prop_ids.add(prop_id)

print(json.dumps(list(prop_ids)))`;
  
  writeFileSync(tempScript, pythonScript);
  const propIdsResult = execSync(`python3 "${tempScript}"`, { 
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024
  });
  unlinkSync(tempScript);
  
  const stratmapPropIds = JSON.parse(propIdsResult);
  console.log(`  ✅ Loaded ${stratmapPropIds.length.toLocaleString()} StratMap Prop_IDs`);
  
  // Check overlap in chunks
  const chunkSize = 1000;
  let neonPropIdCount = 0;
  let stratmapInNeonCount = 0;
  
  for (let i = 0; i < stratmapPropIds.length; i += chunkSize) {
    const chunk = stratmapPropIds.slice(i, i + chunkSize);
    const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(',');
    
    const found = await prisma.$queryRawUnsafe(`
      SELECT "parcelId" FROM properties 
      WHERE "parcelId" IN (${chunk.map((_, idx) => `$${idx + 1}`).join(',')})
      AND "parcelId" IS NOT NULL;
    `, ...chunk);
    
    stratmapInNeonCount += found.length;
    
    if (i % 10000 === 0) {
      console.log(`  Processed ${i.toLocaleString()} / ${stratmapPropIds.length.toLocaleString()} Prop_IDs...`);
    }
  }
  
  // Check Neon parcelIds in StratMap
  const neonParcelIds = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT "parcelId" FROM properties 
    WHERE "parcelId" IS NOT NULL 
    LIMIT 50000;
  `);
  
  const neonParcelIdSet = new Set(neonParcelIds.map(r => String(r.parcelId)));
  const stratmapPropIdSet = new Set(stratmapPropIds);
  
  let neonInStratmapCount = 0;
  for (const parcelId of neonParcelIdSet) {
    if (stratmapPropIdSet.has(parcelId)) {
      neonInStratmapCount++;
    }
  }
  
  RESULTS.neonOverlap.neonInStratmapCount = neonInStratmapCount;
  RESULTS.neonOverlap.neonSampleSize = neonParcelIdSet.size;
  RESULTS.neonOverlap.stratmapInNeonCount = stratmapInNeonCount;
  RESULTS.neonOverlap.stratmapTotal = stratmapPropIds.length;
  RESULTS.neonOverlap.stratmapInNeonPercent = stratmapPropIds.length > 0
    ? ((stratmapInNeonCount / stratmapPropIds.length) * 100).toFixed(2)
    : '0.00';
  RESULTS.neonOverlap.neonInStratmapPercent = neonParcelIdSet.size > 0
    ? ((neonInStratmapCount / neonParcelIdSet.size) * 100).toFixed(2)
    : '0.00';
  
  console.log(`  ✅ Total properties: ${RESULTS.neonOverlap.totalProperties.toLocaleString()}`);
  console.log(`  ✅ Distinct parcelIds: ${RESULTS.neonOverlap.distinctParcelIds.toLocaleString()}`);
  console.log(`  ✅ StratMap Prop_IDs in Neon: ${stratmapInNeonCount.toLocaleString()} (${RESULTS.neonOverlap.stratmapInNeonPercent}%)`);
  console.log(`  ✅ Neon parcelIds in StratMap (sample): ${neonInStratmapCount.toLocaleString()} / ${neonParcelIdSet.size.toLocaleString()} (${RESULTS.neonOverlap.neonInStratmapPercent}%)`);
}

// Generate conclusion
function generateConclusion() {
  const stratmapTotal = RESULTS.stratmap.total_records || 0;
  const overlapPercent = parseFloat(RESULTS.joinFeasibility.overlapPercent || '0');
  const resultingPairs = RESULTS.joinFeasibility.resultingPairs || 0;
  const stratmapInNeonPercent = parseFloat(RESULTS.neonOverlap.stratmapInNeonPercent || '0');
  
  let conclusion = 'NO-GO';
  let reason = '';
  
  if (overlapPercent >= 80 && resultingPairs >= 100000 && stratmapInNeonPercent >= 80) {
    conclusion = 'GO';
    reason = `Strong overlap (${overlapPercent}% GEO_ID match, ${resultingPairs.toLocaleString()} pairs, ${stratmapInNeonPercent}% Prop_ID in Neon)`;
  } else if (overlapPercent >= 50 && resultingPairs >= 50000) {
    conclusion = 'GO (MODERATE)';
    reason = `Moderate overlap (${overlapPercent}% GEO_ID match, ${resultingPairs.toLocaleString()} pairs)`;
  } else {
    conclusion = 'NO-GO';
    reason = `Insufficient overlap (${overlapPercent}% GEO_ID match, ${resultingPairs.toLocaleString()} pairs)`;
  }
  
  RESULTS.conclusion = { conclusion, reason };
}

// Write proof report
function writeProofReport() {
  const report = `# Travis Resolver Proof Report
**Date:** ${new Date().toISOString()}  
**Phase:** A (READ-ONLY)  
**Purpose:** Verify feasibility of building parcel ↔ ATTOM ID resolver

---

## Executive Summary

**CONCLUSION: ${RESULTS.conclusion.conclusion}**

**Reason:** ${RESULTS.conclusion.reason}

---

## 1. StratMap Parcels Analysis

**Source:** \`${STRATMAP_DBF_PATH}\`

| Metric | Value |
|--------|-------|
| **Total Records** | ${(RESULTS.stratmap.total_records || 0).toLocaleString()} |
| **Distinct Prop_ID** | ${(RESULTS.stratmap.distinct_prop_id || 0).toLocaleString()} |
| **Distinct GEO_ID** | ${(RESULTS.stratmap.distinct_geo_id || 0).toLocaleString()} |
| **Prop_ID All Digits** | ${RESULTS.stratmap.all_digits ? '✅ Yes' : '❌ No'} |

### Prop_ID Length Distribution

\`\`\`json
${JSON.stringify(RESULTS.stratmap.prop_id_length_distribution || {}, null, 2)}
\`\`\`

### Prop_ID Samples

${(RESULTS.stratmap.prop_id_samples || []).slice(0, 20).map(id => `- \`${id}\``).join('\n')}

### GEO_ID Length Distribution

\`\`\`json
${JSON.stringify(RESULTS.stratmap.geo_id_length_distribution || {}, null, 2)}
\`\`\`

### GEO_ID Samples

${(RESULTS.stratmap.geo_id_samples || []).slice(0, 20).map(id => `- \`${id}\``).join('\n')}

---

## 2. ATTOM Boundary Match CSV Analysis

**Source:** \`${BOUNDARY_MATCH_CSV_PATH}\`

| Metric | Value |
|--------|-------|
| **Total Rows** | ${(RESULTS.boundaryMatch.totalRows || 0).toLocaleString()} |
| **Distinct [ATTOM ID]** | ${(RESULTS.boundaryMatch.distinctAttomId || 0).toLocaleString()} |
| **Distinct GeoID** | ${(RESULTS.boundaryMatch.distinctGeoId || 0).toLocaleString()} |

### GeoType Distribution

\`\`\`json
${JSON.stringify(RESULTS.boundaryMatch.geoTypeDistribution || {}, null, 2)}
\`\`\`

### [ATTOM ID] Samples

${(RESULTS.boundaryMatch.attomIdSamples || []).slice(0, 20).map(id => `- \`${id}\``).join('\n')}

### GeoID Samples

${(RESULTS.boundaryMatch.geoIdSamples || []).slice(0, 20).map(id => `- \`${id}\``).join('\n')}

---

## 3. Join Feasibility (Local)

**Join Key:** StratMap \`GEO_ID\` = Boundary Match \`GeoID\`

| Metric | Value |
|--------|-------|
| **StratMap GEO_IDs** | ${(RESULTS.joinFeasibility.stratmapGeoIdCount || 0).toLocaleString()} |
| **Boundary Match GeoIDs** | ${(RESULTS.joinFeasibility.boundaryGeoIdCount || 0).toLocaleString()} |
| **Overlap Count** | ${(RESULTS.joinFeasibility.overlapCount || 0).toLocaleString()} |
| **Overlap Percentage** | **${RESULTS.joinFeasibility.overlapPercent || '0.00'}%** |
| **Resulting Pairs (Prop_ID → ATTOM ID)** | **${(RESULTS.joinFeasibility.resultingPairs || 0).toLocaleString()}** |

### Sample Pairs

${(RESULTS.joinFeasibility.pairSamples || []).map(p => `- Prop_ID: \`${p.prop_id}\` → GEO_ID: \`${p.geo_id}\` → ATTOM ID: \`${p.attom_id}\``).join('\n')}

---

## 4. Neon Overlap (READ-ONLY)

| Metric | Value |
|--------|-------|
| **Total Properties** | ${(RESULTS.neonOverlap.totalProperties || 0).toLocaleString()} |
| **Distinct parcelIds** | ${(RESULTS.neonOverlap.distinctParcelIds || 0).toLocaleString()} |
| **StratMap Prop_IDs in Neon** | ${(RESULTS.neonOverlap.stratmapInNeonCount || 0).toLocaleString()} / ${(RESULTS.neonOverlap.stratmapTotal || 0).toLocaleString()} |
| **StratMap → Neon Match Rate** | **${RESULTS.neonOverlap.stratmapInNeonPercent || '0.00'}%** |
| **Neon parcelIds in StratMap (sample)** | ${(RESULTS.neonOverlap.neonInStratmapCount || 0).toLocaleString()} / ${(RESULTS.neonOverlap.neonSampleSize || 0).toLocaleString()} |
| **Neon → StratMap Match Rate** | **${RESULTS.neonOverlap.neonInStratmapPercent || '0.00'}%** |

---

## 5. Conclusion

**${RESULTS.conclusion.conclusion === 'GO' || RESULTS.conclusion.conclusion === 'GO (MODERATE)' ? '✅' : '❌'} ${RESULTS.conclusion.conclusion}**

${RESULTS.conclusion.reason}

### Recommendation

${RESULTS.conclusion.conclusion === 'GO' || RESULTS.conclusion.conclusion === 'GO (MODERATE)' 
  ? '**Proceed to Phase B (Ingestion)** - The resolver can be built with acceptable overlap.' 
  : '**Do NOT proceed to Phase B** - Insufficient overlap or data quality issues detected.'}

---

**Script:** \`scripts/prove_travis_resolver.mjs\`  
**Report Generated:** ${new Date().toISOString()}
`;

  writeFileSync(PROOF_REPORT_PATH, report, 'utf8');
  console.log(`\n✅ Proof report written: ${PROOF_REPORT_PATH}`);
}

async function main() {
  try {
    console.log('🚀 Phase A: Travis Resolver Proof (READ-ONLY)\n');
    console.log('='.repeat(60));
    
    await analyzeStratMap();
    await analyzeBoundaryMatch();
    await computeJoinFeasibility();
    await checkNeonOverlap();
    
    generateConclusion();
    writeProofReport();
    
    console.log('\n' + '='.repeat(60));
    console.log(`\n✅ Phase A Complete`);
    console.log(`\nConclusion: ${RESULTS.conclusion.conclusion}`);
    console.log(`Reason: ${RESULTS.conclusion.reason}`);
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

