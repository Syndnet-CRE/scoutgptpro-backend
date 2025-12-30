/**
 * Safe ATTOM GeoJSON Xref Ingestion
 * 
 * Ingests ATTOM GeoJSON apn->id mappings into xref_parcel_property_travis.
 * Quarantines collisions (multiple ATTOM IDs per apn) into conflicts table.
 * 
 * NO GUESSING ON COLLISIONS - All conflicts are quarantined for manual review.
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env');
dotenv.config({ path: envPath });

const prisma = new PrismaClient();

// Resolve ATTOM GeoJSON path from env vars or defaults
function resolveAttomGeoJsonPath() {
  // Check env vars first
  const envZip = process.env.ATTOM_GEOJSON_ZIP;
  const envPath = process.env.ATTOM_GEOJSON_PATH;
  
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }
  
  if (envZip && fs.existsSync(envZip)) {
    // If zip, check if already extracted
    const extractedPath = '/tmp/zip_audit_3zips/zip2/ATTOM_Travis County.geojson';
    if (fs.existsSync(extractedPath)) {
      return extractedPath;
    }
    throw new Error(`Zip file provided but not extracted. Please extract ${envZip} or provide ATTOM_GEOJSON_PATH to extracted GeoJSON file.`);
  }
  
  // Fallback to default extracted path
  const defaultExtracted = '/tmp/zip_audit_3zips/zip2/ATTOM_Travis County.geojson';
  if (fs.existsSync(defaultExtracted)) {
    return defaultExtracted;
  }
  
  // Fallback to Downloads zip (if exists)
  const defaultZip = join(homedir(), 'Downloads/drive-download-20251228T175545Z-3-001.zip');
  if (fs.existsSync(defaultZip)) {
    // Check if extracted
    if (fs.existsSync(defaultExtracted)) {
      return defaultExtracted;
    }
    throw new Error(`Default zip found but not extracted. Please extract ${defaultZip} or set ATTOM_GEOJSON_PATH env var.`);
  }
  
  throw new Error('ATTOM GeoJSON file not found. Please set ATTOM_GEOJSON_PATH or ATTOM_GEOJSON_ZIP environment variable, or extract the zip file to /tmp/zip_audit_3zips/zip2/');
}

const ATTOM_GEOJSON_PATH = resolveAttomGeoJsonPath();
const REPORT_PATH = join(__dirname, '../docs/TRAVIS_XREF_INGEST_REPORT.md');
const CONFLICTS_SAMPLE_PATH = join(__dirname, '../docs/TRAVIS_XREF_CONFLICTS_SAMPLE.md');

const BATCH_SIZE = 1000;

const RESULTS = {
  step0: {},
  step1: {},
  step2: {},
  step3: {}
};

// Step 0: Read-only verification before writing
async function step0Verification() {
  console.log('\n📊 Step 0: Read-only verification before writing...');
  console.log('='.repeat(60));
  
  // Query Neon
  const totalProperties = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as count FROM properties;
  `);
  RESULTS.step0.totalProperties = Number(totalProperties[0].count);
  
  const distinctParcelIds = await prisma.$queryRawUnsafe(`
    SELECT COUNT(DISTINCT "parcelId") as count 
    FROM properties 
    WHERE "parcelId" IS NOT NULL;
  `);
  RESULTS.step0.distinctParcelIds = Number(distinctParcelIds[0].count);
  
  console.log(`  ✅ Total properties: ${RESULTS.step0.totalProperties.toLocaleString()}`);
  console.log(`  ✅ Distinct parcelIds: ${RESULTS.step0.distinctParcelIds.toLocaleString()}`);
  
  // Parse ATTOM GeoJSON
  console.log(`\n  Parsing ATTOM GeoJSON: ${ATTOM_GEOJSON_PATH}...`);
  const tempScript = join(tmpdir(), `geojson_parse_${Date.now()}.py`);
  
  const pythonScript = `import json
import sys

with open('${ATTOM_GEOJSON_PATH}', 'r') as f:
    data = json.load(f)

features = data.get('features', [])

# Track mappings
apn_to_attom_ids = {}  # apn -> [attom_ids]
apn_to_samples = {}    # apn -> [sample feature properties]

for feature in features:
    props = feature.get('properties', {})
    apn = props.get('apn')
    attom_id = props.get('id')
    
    if not apn or not attom_id:
        continue
    
    apn_str = str(apn).strip()
    
    # Only process 6-digit numeric APNs
    if not apn_str.isdigit() or len(apn_str) != 6:
        continue
    
    if apn_str not in apn_to_attom_ids:
        apn_to_attom_ids[apn_str] = []
        apn_to_samples[apn_str] = []
    
    apn_to_attom_ids[apn_str].append(str(attom_id))
    
    # Store sample properties (up to 5 per APN)
    if len(apn_to_samples[apn_str]) < 5:
        apn_to_samples[apn_str].append(props)

# Compute stats
unique_apns = set(apn_to_attom_ids.keys())
unique_mappings = 0
collisions = 0
collision_apns = []

for apn, attom_ids in apn_to_attom_ids.items():
    unique_attom_ids = list(set(attom_ids))
    if len(unique_attom_ids) == 1:
        unique_mappings += 1
    else:
        collisions += 1
        collision_apns.append({
            'apn': apn,
            'attom_ids': unique_attom_ids,
            'count': len(unique_attom_ids),
            'samples': apn_to_samples[apn]
        })

result = {
    'total_features_with_6digit_apn': len(unique_apns),
    'unique_apn_count': len(unique_apns),
    'unique_mappings': unique_mappings,
    'collisions': collisions,
    'collision_details': sorted(collision_apns, key=lambda x: x['count'], reverse=True)[:25]
}

print(json.dumps(result))`;
  
  fs.writeFileSync(tempScript, pythonScript);
  const result = execSync(`python3 "${tempScript}"`, { 
    encoding: 'utf8',
    maxBuffer: 200 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'inherit']
  });
  fs.unlinkSync(tempScript);
  
  const data = JSON.parse(result);
  
  RESULTS.step1 = {
    totalFeaturesWith6DigitApn: data.total_features_with_6digit_apn,
    uniqueApnCount: data.unique_apn_count,
    uniqueMappings: data.unique_mappings,
    collisions: data.collisions,
    collisionDetails: data.collision_details
  };
  
  console.log(`  ✅ Total features with 6-digit APN: ${data.total_features_with_6digit_apn.toLocaleString()}`);
  console.log(`  ✅ Unique APN count: ${data.unique_apn_count.toLocaleString()}`);
  console.log(`  ✅ Unique mappings (1 apn -> 1 attom_id): ${data.unique_mappings.toLocaleString()}`);
  console.log(`  ✅ Collisions (1 apn -> multiple attom_ids): ${data.collisions.toLocaleString()}`);
}

// Step 2: Ingestion
async function step2Ingestion() {
  console.log('\n📥 Step 2: Ingestion (writes only to new tables)...');
  console.log('='.repeat(60));
  
  // Check if tables exist
  const tablesExist = await prisma.$queryRawUnsafe(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('xref_parcel_property_travis', 'xref_parcel_property_travis_conflicts');
  `);
  
  if (tablesExist.length < 2) {
    console.error('❌ Required tables do not exist. Please apply migration first.');
    console.error('   Run: psql "$DATABASE_URL" -f db/migrations/0001_travis_resolver_and_parcels.sql');
    process.exit(1);
  }
  
  console.log('  ✅ Required tables exist');
  
  // Parse GeoJSON and separate unique vs collisions
  console.log(`\n  Parsing ATTOM GeoJSON and separating unique vs collisions: ${ATTOM_GEOJSON_PATH}...`);
  const tempScript = join(tmpdir(), `geojson_ingest_${Date.now()}.py`);
  
  const pythonScript = `import json
import csv
import sys

with open('${ATTOM_GEOJSON_PATH}', 'r') as f:
    data = json.load(f)

features = data.get('features', [])

# Track mappings
apn_to_attom_ids = {}  # apn -> [attom_ids]
apn_to_samples = {}    # apn -> [sample feature properties]

for feature in features:
    props = feature.get('properties', {})
    apn = props.get('apn')
    attom_id = props.get('id')
    
    if not apn or not attom_id:
        continue
    
    apn_str = str(apn).strip()
    
    # Only process 6-digit numeric APNs
    if not apn_str.isdigit() or len(apn_str) != 6:
        continue
    
    if apn_str not in apn_to_attom_ids:
        apn_to_attom_ids[apn_str] = []
        apn_to_samples[apn_str] = []
    
    apn_to_attom_ids[apn_str].append(str(attom_id))
    
    # Store sample properties (up to 5 per APN)
    if len(apn_to_samples[apn_str]) < 5:
        apn_to_samples[apn_str].append(props)

# Separate unique vs collisions
unique_mappings = []
collisions = []

for apn, attom_ids in apn_to_attom_ids.items():
    unique_attom_ids = list(set(attom_ids))
    if len(unique_attom_ids) == 1:
        unique_mappings.append({
            'parcel_id': apn,
            'attom_id': unique_attom_ids[0]
        })
    else:
        collisions.append({
            'parcel_id': apn,
            'attom_ids': unique_attom_ids,
            'attom_id_count': len(unique_attom_ids),
            'sample_rows': apn_to_samples[apn]
        })

# Write unique mappings to CSV
with open('${tmpdir()}/unique_mappings.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['parcel_id', 'attom_id', 'source'])
    for m in unique_mappings:
        writer.writerow([m['parcel_id'], m['attom_id'], 'attom_geojson_apn'])

# Write collisions to JSON
with open('${tmpdir()}/collisions.json', 'w') as f:
    json.dump(collisions, f)

result = {
    'unique_count': len(unique_mappings),
    'collisions_count': len(collisions),
    'csv_path': '${tmpdir()}/unique_mappings.csv',
    'collisions_path': '${tmpdir()}/collisions.json'
}

print(json.dumps(result))`;
  
  fs.writeFileSync(tempScript, pythonScript);
  const result = execSync(`python3 "${tempScript}"`, { 
    encoding: 'utf8',
    maxBuffer: 200 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'inherit']
  });
  fs.unlinkSync(tempScript);
  
  const data = JSON.parse(result);
  
  console.log(`  ✅ Unique mappings: ${data.unique_count.toLocaleString()}`);
  console.log(`  ✅ Collisions: ${data.collisions_count.toLocaleString()}`);
  
  // Ingest unique mappings using batch inserts
  console.log('\n  Ingesting unique mappings into xref_parcel_property_travis...');
  
  const csvPath = data.csv_path;
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  
  // Parse CSV (handle quoted fields)
  const lines = csvContent.split('\n').filter(line => line.trim());
  const uniqueMappings = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Simple CSV parsing (handle quoted fields)
    const parts = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current.trim());
    
    if (parts.length >= 3) {
      uniqueMappings.push({
        parcel_id: parts[0],
        attom_id: parts[1],
        source: parts[2] || 'attom_geojson_apn'
      });
    }
  }
  
  // Clear table first (if re-running)
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE xref_parcel_property_travis;`);
  
  // Insert in batches
  for (let i = 0; i < uniqueMappings.length; i += BATCH_SIZE) {
    const batch = uniqueMappings.slice(i, i + BATCH_SIZE);
    
    const values = batch.map((m, idx) => {
      const baseIdx = idx * 3;
      return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3})`;
    }).join(', ');
    
    const params = batch.flatMap(m => [m.parcel_id, m.attom_id, m.source]);
    
    await prisma.$executeRawUnsafe(`
      INSERT INTO xref_parcel_property_travis (parcel_id, attom_id, source)
      VALUES ${values}
      ON CONFLICT (parcel_id, attom_id) DO NOTHING;
    `, ...params);
    
    if (i % 10000 === 0) {
      console.log(`    Inserted ${i.toLocaleString()} / ${uniqueMappings.length.toLocaleString()}...`);
    }
  }
  
  console.log(`  ✅ Inserted ${uniqueMappings.length.toLocaleString()} unique mappings`);
  
  // Ingest collisions
  console.log('\n  Ingesting collisions into xref_parcel_property_travis_conflicts...');
  
  const collisions = JSON.parse(fs.readFileSync(data.collisions_path, 'utf8'));
  
  // Clear conflicts table first (if re-running)
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE xref_parcel_property_travis_conflicts;`);
  
  // Insert collisions in batches
  for (let i = 0; i < collisions.length; i += BATCH_SIZE) {
    const batch = collisions.slice(i, i + BATCH_SIZE);
    
    for (const collision of batch) {
      // Format array for PostgreSQL
      const attomIdsArray = `{${collision.attom_ids.map(id => `"${id}"`).join(',')}}`;
      
      await prisma.$executeRawUnsafe(`
        INSERT INTO xref_parcel_property_travis_conflicts 
          (parcel_id, attom_ids, attom_id_count, sample_rows)
        VALUES ($1, $2::text[], $3, $4::jsonb)
        ON CONFLICT (parcel_id) DO UPDATE SET
          attom_ids = EXCLUDED.attom_ids,
          attom_id_count = EXCLUDED.attom_id_count,
          sample_rows = EXCLUDED.sample_rows;
      `, 
        collision.parcel_id,
        attomIdsArray,
        collision.attom_id_count,
        JSON.stringify(collision.sample_rows)
      );
    }
    
    if (i % 1000 === 0) {
      console.log(`    Inserted ${i.toLocaleString()} / ${collisions.length.toLocaleString()}...`);
    }
  }
  
  console.log(`  ✅ Inserted ${collisions.length.toLocaleString()} collisions`);
  
  RESULTS.step2 = {
    uniqueInserted: uniqueMappings.length,
    collisionsInserted: collisions.length
  };
}

// Step 3: Post-ingest validation
async function step3Validation() {
  console.log('\n📊 Step 3: Post-ingest validation (read-only)...');
  console.log('='.repeat(60));
  
  // Count rows in xref table
  const xrefCount = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as count FROM xref_parcel_property_travis;
  `);
  RESULTS.step3.xrefCount = Number(xrefCount[0].count);
  
  // Count rows in conflicts table
  const conflictsCount = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as count FROM xref_parcel_property_travis_conflicts;
  `);
  RESULTS.step3.conflictsCount = Number(conflictsCount[0].count);
  
  // Verify no parcel_id appears in both tables
  const overlap = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as count
    FROM xref_parcel_property_travis x
    INNER JOIN xref_parcel_property_travis_conflicts c ON x.parcel_id = c.parcel_id;
  `);
  RESULTS.step3.overlapCount = Number(overlap[0].count);
  
  // Compute coverage
  const coverage = await prisma.$queryRawUnsafe(`
    SELECT 
      COUNT(DISTINCT x.parcel_id) as mapped_count,
      (SELECT COUNT(DISTINCT "parcelId") FROM properties WHERE "parcelId" IS NOT NULL) as total_parcel_ids
    FROM xref_parcel_property_travis x
    INNER JOIN properties p ON x.parcel_id = p."parcelId";
  `);
  
  RESULTS.step3.mappedCount = Number(coverage[0].mapped_count);
  RESULTS.step3.totalParcelIds = Number(coverage[0].total_parcel_ids);
  RESULTS.step3.coverageRate = RESULTS.step3.totalParcelIds > 0
    ? ((RESULTS.step3.mappedCount / RESULTS.step3.totalParcelIds) * 100).toFixed(2)
    : '0.00';
  
  console.log(`  ✅ Xref table rows: ${RESULTS.step3.xrefCount.toLocaleString()}`);
  console.log(`  ✅ Conflicts table rows: ${RESULTS.step3.conflictsCount.toLocaleString()}`);
  console.log(`  ✅ Overlap (should be 0): ${RESULTS.step3.overlapCount}`);
  console.log(`  ✅ Coverage: ${RESULTS.step3.mappedCount.toLocaleString()} / ${RESULTS.step3.totalParcelIds.toLocaleString()} (${RESULTS.step3.coverageRate}%)`);
  
  if (RESULTS.step3.overlapCount > 0) {
    console.warn(`  ⚠️  WARNING: ${RESULTS.step3.overlapCount} parcel_ids appear in both tables!`);
  }
}

// Generate reports
async function generateReports() {
  console.log('\n📄 Generating reports...');
  
  // Main report
  const report = `# Travis Xref Ingestion Report
**Date:** ${new Date().toISOString()}  
**Purpose:** Safe ingestion of ATTOM GeoJSON apn->id mappings

---

## Step 0: Pre-Ingest Verification

| Metric | Value |
|--------|-------|
| **Total Properties** | ${RESULTS.step0.totalProperties.toLocaleString()} |
| **Distinct parcelIds** | ${RESULTS.step0.distinctParcelIds.toLocaleString()} |

---

## Step 1: ATTOM GeoJSON Analysis

| Metric | Value |
|--------|-------|
| **Total Features with 6-Digit APN** | ${RESULTS.step1.totalFeaturesWith6DigitApn.toLocaleString()} |
| **Unique APN Count** | ${RESULTS.step1.uniqueApnCount.toLocaleString()} |
| **Unique Mappings (1 apn -> 1 attom_id)** | ${RESULTS.step1.uniqueMappings.toLocaleString()} |
| **Collisions (1 apn -> multiple attom_ids)** | ${RESULTS.step1.collisions.toLocaleString()} |

---

## Step 2: Ingestion Results

| Metric | Value |
|--------|-------|
| **Unique Mappings Inserted** | ${RESULTS.step2.uniqueInserted.toLocaleString()} |
| **Collisions Quarantined** | ${RESULTS.step2.collisionsInserted.toLocaleString()} |

---

## Step 3: Post-Ingest Validation

| Metric | Value |
|--------|-------|
| **Xref Table Rows** | ${RESULTS.step3.xrefCount.toLocaleString()} |
| **Conflicts Table Rows** | ${RESULTS.step3.conflictsCount.toLocaleString()} |
| **Overlap (should be 0)** | ${RESULTS.step3.overlapCount} ${RESULTS.step3.overlapCount === 0 ? '✅' : '❌'} |
| **Mapped parcelIds** | ${RESULTS.step3.mappedCount.toLocaleString()} |
| **Total Neon parcelIds** | ${RESULTS.step3.totalParcelIds.toLocaleString()} |
| **Coverage Rate** | **${RESULTS.step3.coverageRate}%** |

---

## Commands

### Apply Migration
\`\`\`bash
psql "$DATABASE_URL" -f db/migrations/0001_travis_resolver_and_parcels.sql
\`\`\`

### Run Ingestion
\`\`\`bash
cd /Users/braydonirwin/scoutgptpro-backend
node scripts/ingest_attom_geojson_xref_safe.mjs
\`\`\`

### Verify Results
\`\`\`sql
-- Count unique mappings
SELECT COUNT(*) FROM xref_parcel_property_travis;

-- Count conflicts
SELECT COUNT(*) FROM xref_parcel_property_travis_conflicts;

-- Check for overlap (should return 0)
SELECT COUNT(*) 
FROM xref_parcel_property_travis x
INNER JOIN xref_parcel_property_travis_conflicts c ON x.parcel_id = c.parcel_id;

-- Coverage
SELECT 
  COUNT(DISTINCT x.parcel_id) as mapped,
  (SELECT COUNT(DISTINCT "parcelId") FROM properties WHERE "parcelId" IS NOT NULL) as total,
  ROUND(100.0 * COUNT(DISTINCT x.parcel_id) / 
    (SELECT COUNT(DISTINCT "parcelId") FROM properties WHERE "parcelId" IS NOT NULL), 2) as coverage_pct
FROM xref_parcel_property_travis x
INNER JOIN properties p ON x.parcel_id = p."parcelId";
\`\`\`

---

**Script:** \`scripts/ingest_attom_geojson_xref_safe.mjs\`  
**Report Generated:** ${new Date().toISOString()}
`;

  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`  ✅ Report written: ${REPORT_PATH}`);
  
  // Conflicts sample report
  let conflictsSample = [];
  try {
    conflictsSample = await prisma.$queryRawUnsafe(`
      SELECT 
        parcel_id,
        attom_id_count,
        attom_ids,
        sample_rows
      FROM xref_parcel_property_travis_conflicts
      ORDER BY attom_id_count DESC
      LIMIT 25;
    `);
  } catch (e) {
    console.warn('  ⚠️  Could not query conflicts table (may not exist yet)');
  }
  
  const conflictsReport = `# Travis Xref Conflicts Sample
**Date:** ${new Date().toISOString()}  
**Purpose:** Sample of worst collisions (highest attom_id_count)

---

## Top 25 Collisions

${conflictsSample.length > 0 ? `| Rank | parcel_id | attom_id_count | attom_ids |
|------|-----------|----------------|-----------|
${conflictsSample.map((c, idx) => {
    const attomIds = Array.isArray(c.attom_ids) ? c.attom_ids : (typeof c.attom_ids === 'string' ? JSON.parse(c.attom_ids) : []);
    const attomIdsStr = Array.isArray(attomIds) ? attomIds : [];
    return `| ${idx + 1} | \`${c.parcel_id}\` | ${c.attom_id_count} | ${attomIdsStr.slice(0, 5).map(id => `\`${id}\``).join(', ')}${attomIdsStr.length > 5 ? '...' : ''} |`;
  }).join('\n')}` : 'No conflicts found or conflicts table not yet populated.'}

---

## Sample Feature Properties

${conflictsSample.length > 0 ? conflictsSample.slice(0, 5).map((c, idx) => {
    const samples = c.sample_rows ? (Array.isArray(c.sample_rows) ? c.sample_rows : (typeof c.sample_rows === 'string' ? JSON.parse(c.sample_rows) : [])) : [];
    const attomIds = Array.isArray(c.attom_ids) ? c.attom_ids : (typeof c.attom_ids === 'string' ? JSON.parse(c.attom_ids) : []);
    return `### Collision ${idx + 1}: parcel_id = \`${c.parcel_id}\`

**ATTOM IDs:** ${Array.isArray(attomIds) ? attomIds.join(', ') : JSON.stringify(attomIds)}

**Sample Properties:**
\`\`\`json
${JSON.stringify(samples.slice(0, 2), null, 2)}
\`\`\`

`;
  }).join('\n---\n\n') : 'No conflicts to display.'}

---

**Total Conflicts:** ${RESULTS.step3.conflictsCount || 0}  
**Report Generated:** ${new Date().toISOString()}
`;

  fs.writeFileSync(CONFLICTS_SAMPLE_PATH, conflictsReport, 'utf8');
  console.log(`  ✅ Conflicts sample written: ${CONFLICTS_SAMPLE_PATH}`);
}

async function main() {
  try {
    console.log('🚀 Safe ATTOM GeoJSON Xref Ingestion\n');
    console.log('='.repeat(60));
    
    await step0Verification();
    await step2Ingestion();
    await step3Validation();
    await generateReports();
    
    console.log('\n' + '='.repeat(60));
    console.log(`\n✅ Ingestion Complete`);
    console.log(`\nCoverage: ${RESULTS.step3.coverageRate}%`);
    console.log(`Conflicts: ${RESULTS.step3.conflictsCount.toLocaleString()}`);
    console.log(`\nReports:`);
    console.log(`  - ${REPORT_PATH}`);
    console.log(`  - ${CONFLICTS_SAMPLE_PATH}`);
    
  } catch (error) {
    console.error('❌ Ingestion failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

