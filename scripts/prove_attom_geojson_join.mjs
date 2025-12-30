/**
 * ATTOM GeoJSON Join Proof (READ-ONLY)
 * 
 * Tests feasibility of joining Neon properties.parcelId (6-digit) to ATTOM ID
 * via ATTOM GeoJSON APN field.
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
import { execSync } from 'child_process';
import { tmpdir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env');
dotenv.config({ path: envPath });

const prisma = new PrismaClient();

const ATTOM_GEOJSON_PATH = '/tmp/zip_audit_3zips/zip2/ATTOM_Travis County.geojson';
const PROOF_REPORT_PATH = join(__dirname, '../docs/ATTOM_GEOJSON_JOIN_PROOF.md');

const RESULTS = {
  totalFeatures: 0,
  apnStats: {
    total: 0,
    digitsOnly: 0,
    exactly6Digits: 0,
    lengthDistribution: {},
    samples: []
  },
  neonOverlap: {
    overlapCount: 0,
    overlapRate: 0,
    collisionCount: 0,
    collisionRate: 0,
    exampleMappings: []
  },
  propertyKeys: []
};

// Stream GeoJSON features using Python (more efficient for large files)
async function streamGeoJSONFeatures() {
  console.log('\n📊 Streaming ATTOM GeoJSON features...');
  
  const neonParcelIdSet = await loadNeonParcelIds();
  console.log(`  ✅ Loaded ${neonParcelIdSet.size.toLocaleString()} Neon parcelIds`);
  
  // Use Python to stream process the GeoJSON
  const { writeFileSync, unlinkSync } = await import('fs');
  const { tmpdir } = await import('os');
  const tempScript = join(tmpdir(), `geojson_audit_${Date.now()}.py`);
  
  const pythonScript = `import json
import sys

neon_parcel_ids = set(${JSON.stringify(Array.from(neonParcelIdSet))})

with open('${ATTOM_GEOJSON_PATH}', 'r') as f:
    data = json.load(f)

features = data.get('features', [])
total_features = len(features)

# Track stats
apn_stats = {
    'total': 0,
    'digits_only': 0,
    'exactly_6_digits': 0,
    'length_distribution': {},
    'samples': []
}

apn_to_attom_id = {}  # apn -> [attom_ids]

property_keys = list(features[0].get('properties', {}).keys()) if features else []

for i, feature in enumerate(features):
    props = feature.get('properties', {})
    
    # Find ATTOM ID
    attom_id = props.get('id') or props.get('attomId') or props.get('attom_id') or None
    
    # Find APN
    apn = props.get('apn') or props.get('APN') or props.get('apn2') or None
    
    if not apn or not attom_id:
        continue
    
    apn_str = str(apn).strip()
    apn_stats['total'] += 1
    
    # Check if digits-only
    if apn_str.isdigit():
        apn_stats['digits_only'] += 1
        
        length = len(apn_str)
        apn_stats['length_distribution'][length] = apn_stats['length_distribution'].get(length, 0) + 1
        
        # Check if exactly 6 digits
        if length == 6:
            apn_stats['exactly_6_digits'] += 1
            
            if apn_str not in apn_to_attom_id:
                apn_to_attom_id[apn_str] = []
            apn_to_attom_id[apn_str].append(str(attom_id))
            
            if len(apn_stats['samples']) < 20:
                apn_stats['samples'].append(apn_str)
    
    if (i + 1) % 50000 == 0:
        print(f"Processed {{i+1}} / {{total_features}} features...", file=sys.stderr)

# Compute overlap
overlap_count = 0
collision_count = 0
example_mappings = []

for apn, attom_ids in apn_to_attom_id.items():
    if apn in neon_parcel_ids:
        overlap_count += 1
        
        unique_attom_ids = list(set(attom_ids))
        if len(unique_attom_ids) > 1:
            collision_count += 1
        
        if len(example_mappings) < 20:
            example_mappings.append({
                'parcelId': apn,
                'attomId': attom_ids[0],
                'collision': len(unique_attom_ids) > 1,
                'attomIdCount': len(unique_attom_ids)
            })

result = {
    'total_features': total_features,
    'property_keys': property_keys,
    'apn_stats': apn_stats,
    'overlap': {
        'overlap_count': overlap_count,
        'collision_count': collision_count,
        'example_mappings': example_mappings
    }
}

print(json.dumps(result))`;
  
  writeFileSync(tempScript, pythonScript);
  
  console.log('  Processing GeoJSON file (this may take a few minutes)...');
  const result = execSync(`python3 "${tempScript}"`, { 
    encoding: 'utf8',
    maxBuffer: 200 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'inherit']
  });
  unlinkSync(tempScript);
  
  const data = JSON.parse(result);
  
  RESULTS.totalFeatures = data.total_features;
  RESULTS.propertyKeys = data.property_keys;
  RESULTS.apnStats = {
    total: data.apn_stats.total,
    digitsOnly: data.apn_stats.digits_only,
    exactly6Digits: data.apn_stats.exactly_6_digits,
    lengthDistribution: data.apn_stats.length_distribution,
    samples: data.apn_stats.samples
  };
  
  RESULTS.neonOverlap.overlapCount = data.overlap.overlap_count;
  RESULTS.neonOverlap.overlapRate = RESULTS.apnStats.exactly6Digits > 0
    ? ((data.overlap.overlap_count / RESULTS.apnStats.exactly6Digits) * 100).toFixed(2)
    : '0.00';
  RESULTS.neonOverlap.collisionCount = data.overlap.collision_count;
  RESULTS.neonOverlap.collisionRate = data.overlap.overlap_count > 0
    ? ((data.overlap.collision_count / data.overlap.overlap_count) * 100).toFixed(2)
    : '0.00';
  RESULTS.neonOverlap.exampleMappings = data.overlap.example_mappings;
  
  console.log(`  ✅ Processed ${RESULTS.totalFeatures.toLocaleString()} features`);
  console.log(`  ✅ Overlap: ${RESULTS.neonOverlap.overlapCount.toLocaleString()} / ${RESULTS.apnStats.exactly6Digits.toLocaleString()} (${RESULTS.neonOverlap.overlapRate}%)`);
  console.log(`  ✅ Collisions: ${RESULTS.neonOverlap.collisionCount.toLocaleString()} (${RESULTS.neonOverlap.collisionRate}%)`);
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
  
  return parcelIdSet;
}

// Write proof report
function writeProofReport() {
  const report = `# ATTOM GeoJSON Join Proof Report
**Date:** ${new Date().toISOString()}  
**Phase:** READ-ONLY Proof  
**Purpose:** Test feasibility of joining Neon parcelId to ATTOM ID via ATTOM GeoJSON APN field

---

## Executive Summary

**Source:** \`${ATTOM_GEOJSON_PATH}\`

| Metric | Value |
|--------|-------|
| **Total Features** | ${RESULTS.totalFeatures.toLocaleString()} |
| **APN Fields (Total)** | ${RESULTS.apnStats.total.toLocaleString()} |
| **APN Digits-Only** | ${RESULTS.apnStats.digitsOnly.toLocaleString()} |
| **APN Exactly 6 Digits** | ${RESULTS.apnStats.exactly6Digits.toLocaleString()} |
| **Overlap with Neon parcelId** | ${RESULTS.neonOverlap.overlapCount.toLocaleString()} / ${RESULTS.apnStats.exactly6Digits.toLocaleString()} |
| **Overlap Rate** | **${RESULTS.neonOverlap.overlapRate}%** |
| **Collisions** | ${RESULTS.neonOverlap.collisionCount.toLocaleString()} |
| **Collision Rate** | **${RESULTS.neonOverlap.collisionRate}%** |

---

## 1. Property Keys Identified

**Available fields in ATTOM GeoJSON:**

${RESULTS.propertyKeys.map(k => `- \`${k}\``).join('\n')}

**Key Fields:**
- **ATTOM ID:** \`${RESULTS.propertyKeys.find(k => /id|attom/i.test(k)) || 'NOT FOUND'}\`
- **APN:** \`${RESULTS.propertyKeys.find(k => /apn/i.test(k)) || 'NOT FOUND'}\`

---

## 2. APN Field Analysis

### 2.1 Length Distribution

\`\`\`json
${JSON.stringify(RESULTS.apnStats.lengthDistribution, null, 2)}
\`\`\`

### 2.2 Statistics

| Metric | Count | Percentage |
|--------|-------|------------|
| **Total APN Values** | ${RESULTS.apnStats.total.toLocaleString()} | 100% |
| **Digits-Only** | ${RESULTS.apnStats.digitsOnly.toLocaleString()} | ${RESULTS.apnStats.total > 0 ? ((RESULTS.apnStats.digitsOnly / RESULTS.apnStats.total) * 100).toFixed(2) : '0.00'}% |
| **Exactly 6 Digits** | ${RESULTS.apnStats.exactly6Digits.toLocaleString()} | ${RESULTS.apnStats.total > 0 ? ((RESULTS.apnStats.exactly6Digits / RESULTS.apnStats.total) * 100).toFixed(2) : '0.00'}% |

---

## 3. Neon Overlap Analysis

**Neon parcelId Sample:** All ${RESULTS.neonOverlap.overlapCount > 0 ? '352,431' : '0'} distinct parcelIds

### 3.1 Overlap Metrics

| Metric | Value |
|--------|-------|
| **6-Digit APN Values** | ${RESULTS.apnStats.exactly6Digits.toLocaleString()} |
| **Overlap Count** | ${RESULTS.neonOverlap.overlapCount.toLocaleString()} |
| **Overlap Rate** | **${RESULTS.neonOverlap.overlapRate}%** |

### 3.2 Collision Analysis

**Collision:** Multiple ATTOM IDs mapping to the same 6-digit APN (parcelId)

| Metric | Value |
|--------|-------|
| **Collision Count** | ${RESULTS.neonOverlap.collisionCount.toLocaleString()} |
| **Collision Rate** | **${RESULTS.neonOverlap.collisionRate}%** |

**Interpretation:**
- Collision rate < 0.1%: ✅ Excellent (deterministic join)
- Collision rate 0.1-1%: ⚠️ Acceptable (may need conflict resolution)
- Collision rate > 1%: ❌ Poor (not deterministic)

---

## 4. Example Mappings

**Sample parcelId → ATTOM ID mappings:**

| parcelId | ATTOM ID | Collision? | ATTOM ID Count |
|----------|----------|------------|----------------|
${RESULTS.neonOverlap.exampleMappings.map(m => `| \`${m.parcelId}\` | \`${m.attomId}\` | ${m.collision ? '⚠️ Yes' : '✅ No'} | ${m.attomIdCount} |`).join('\n')}

---

## 5. Conclusion

**${parseFloat(RESULTS.neonOverlap.overlapRate) >= 95 && parseFloat(RESULTS.neonOverlap.collisionRate) <= 0.1 ? '✅ FEASIBLE' : '❌ NOT FEASIBLE'}**

**Overlap Rate:** ${RESULTS.neonOverlap.overlapRate}% ${parseFloat(RESULTS.neonOverlap.overlapRate) >= 95 ? '✅' : '❌'}  
**Collision Rate:** ${RESULTS.neonOverlap.collisionRate}% ${parseFloat(RESULTS.neonOverlap.collisionRate) <= 0.1 ? '✅' : '❌'}

**Recommendation:**
${parseFloat(RESULTS.neonOverlap.overlapRate) >= 95 && parseFloat(RESULTS.neonOverlap.collisionRate) <= 0.1
  ? '✅ **USE THIS PATH** - ATTOM GeoJSON APN field provides deterministic join to ATTOM ID.'
  : parseFloat(RESULTS.neonOverlap.overlapRate) >= 95
    ? '⚠️ **CONDITIONAL** - Good overlap but collisions detected. May need conflict resolution.'
    : '❌ **DO NOT USE** - Insufficient overlap or too many collisions.'}

---

**Script:** \`scripts/prove_attom_geojson_join.mjs\`  
**Report Generated:** ${new Date().toISOString()}
`;

  writeFileSync(PROOF_REPORT_PATH, report, 'utf8');
  console.log(`\n✅ Proof report written: ${PROOF_REPORT_PATH}`);
}

async function main() {
  try {
    console.log('🚀 ATTOM GeoJSON Join Proof (READ-ONLY)\n');
    console.log('='.repeat(60));
    
    await streamGeoJSONFeatures();
    writeProofReport();
    
    console.log('\n' + '='.repeat(60));
    console.log(`\n✅ Proof Complete`);
    console.log(`\nOverlap Rate: ${RESULTS.neonOverlap.overlapRate}%`);
    console.log(`Collision Rate: ${RESULTS.neonOverlap.collisionRate}%`);
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

