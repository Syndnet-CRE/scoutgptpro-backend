/**
 * Join Sanity Check - Read-only diagnostic for parcel ID matching
 * 
 * Validates matching between parcels_travis.parcel_id and 
 * parcels_travis_enrichment_stage.detected_id
 * 
 * Usage:
 *   node scripts/join_sanity_check.js
 * 
 * Requires: DATABASE_URL environment variable
 */

import { Pool } from 'pg';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5
});

/**
 * normalizeDotZero: trim string, remove trailing ".0+" via /\.0+$/
 */
function normalizeDotZero(x) {
  if (x === null || x === undefined) return null;
  return String(x).trim().replace(/\.0+$/, '');
}

/**
 * stripLeadingZeros: remove leading zeros via /^0+/
 */
function stripLeadingZeros(x) {
  if (x === null || x === undefined) return null;
  return String(x).replace(/^0+/, '');
}

/**
 * matchKey: normalizeDotZero → stripLeadingZeros → if empty return "0"
 */
function matchKey(x) {
  if (x === null || x === undefined) return null;
  let s = normalizeDotZero(x);
  s = stripLeadingZeros(s);
  if (s === '') {
    return '0';
  }
  return s;
}

/**
 * Main diagnostic function
 */
async function runSanityCheck() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Starting join sanity check...');
    console.log(`📊 Database: ${process.env.DATABASE_URL ? 'connected' : 'MISSING DATABASE_URL'}`);
    
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    
    // Query 100 random non-null parcel_id values from parcels_travis
    console.log('\n📥 Querying 100 random parcel_id values from parcels_travis...');
    const parcelIdsResult = await client.query(`
      SELECT parcel_id
      FROM parcels_travis
      WHERE parcel_id IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 100
    `);
    const parcelIds = parcelIdsResult.rows.map(r => String(r.parcel_id).trim());
    console.log(`   ✅ Retrieved ${parcelIds.length} parcel_id values`);
    
    // Query 100 random non-null detected_id values from parcels_travis_enrichment_stage
    console.log('\n📥 Querying 100 random detected_id values from parcels_travis_enrichment_stage...');
    const detectedIdsResult = await client.query(`
      SELECT detected_id
      FROM parcels_travis_enrichment_stage
      WHERE detected_id IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 100
    `);
    const detectedIds = detectedIdsResult.rows.map(r => String(r.detected_id).trim());
    console.log(`   ✅ Retrieved ${detectedIds.length} detected_id values`);
    
    // Classification categories
    const categoryA = []; // exact raw string match
    const categoryB = []; // match after normalizeDotZero only
    const categoryC = []; // match after stripLeadingZeros only
    const categoryD = []; // match after full matchKey
    const categoryE = []; // no match
    
    // For each detected_id, compare against all parcel_id values
    console.log('\n🔍 Analyzing matches...');
    for (const detectedId of detectedIds) {
      let matchCategory = null;
      let matchData = null;
      
      // Pre-compute transformations once per detected_id
      const detectedNorm = normalizeDotZero(detectedId);
      const detectedStrip = stripLeadingZeros(detectedId);
      const detectedKey = matchKey(detectedId);
      
      for (const parcelId of parcelIds) {
        // A) exact raw string match
        if (detectedId === parcelId) {
          matchCategory = 'A';
          matchData = { detected: detectedId, parcel: parcelId };
          break; // Found exact match, stop searching
        }
      }
      
      // If no exact match, check other transformations
      if (!matchCategory) {
        for (const parcelId of parcelIds) {
          const parcelNorm = normalizeDotZero(parcelId);
          const parcelStrip = stripLeadingZeros(parcelId);
          const parcelKey = matchKey(parcelId);
          
          // B) match after normalizeDotZero only (but not exact)
          if (detectedNorm === parcelNorm && detectedNorm !== null && detectedId !== parcelId) {
            matchCategory = 'B';
            matchData = { detected: detectedId, parcel: parcelId, detectedNorm, parcelNorm };
            break;
          }
          
          // C) match after stripLeadingZeros only (but not exact, not normalizeDotZero)
          if (detectedStrip === parcelStrip && detectedStrip !== null && 
              detectedId !== parcelId && detectedNorm !== parcelNorm) {
            matchCategory = 'C';
            matchData = { detected: detectedId, parcel: parcelId, detectedStrip, parcelStrip };
            break;
          }
          
          // D) match after full matchKey (but not exact, not normalizeDotZero, not stripLeadingZeros)
          if (detectedKey === parcelKey && detectedKey !== null && 
              detectedId !== parcelId && detectedNorm !== parcelNorm && detectedStrip !== parcelStrip) {
            matchCategory = 'D';
            matchData = { detected: detectedId, parcel: parcelId, detectedKey, parcelKey };
            break;
          }
        }
      }
      
      // Assign to appropriate category
      if (matchCategory === 'A') {
        categoryA.push(matchData);
      } else if (matchCategory === 'B') {
        categoryB.push(matchData);
      } else if (matchCategory === 'C') {
        categoryC.push(matchData);
      } else if (matchCategory === 'D') {
        categoryD.push(matchData);
      } else {
        // E) no match
        categoryE.push({ detected: detectedId });
      }
    }
    
    // Top 10 transformations for each table
    console.log('\n📊 Computing top transformations...');
    const parcelTransformations = parcelIds.map(id => ({
      original: id,
      matchKey: matchKey(id)
    })).slice(0, 10);
    
    const detectedTransformations = detectedIds.map(id => ({
      original: id,
      matchKey: matchKey(id)
    })).slice(0, 10);
    
    // SQL verification
    console.log('\n🔍 Running SQL verification query...');
    const sqlVerificationResult = await client.query(`
      WITH s AS (
        SELECT CASE
          WHEN REGEXP_REPLACE(REGEXP_REPLACE(TRIM(detected_id::text), E'\\.0+$', ''), '^0+', '') = '' THEN '0'
          ELSE REGEXP_REPLACE(REGEXP_REPLACE(TRIM(detected_id::text), E'\\.0+$', ''), '^0+', '')
        END AS k
        FROM parcels_travis_enrichment_stage
        WHERE detected_id IS NOT NULL
      ),
      p AS (
        SELECT CASE
          WHEN REGEXP_REPLACE(REGEXP_REPLACE(TRIM(parcel_id::text), E'\\.0+$', ''), '^0+', '') = '' THEN '0'
          ELSE REGEXP_REPLACE(REGEXP_REPLACE(TRIM(parcel_id::text), E'\\.0+$', ''), '^0+', '')
        END AS k
        FROM parcels_travis
      )
      SELECT COUNT(*) AS matched_count FROM s JOIN p ON s.k = p.k
    `);
    const sqlMatchedCount = sqlVerificationResult.rows[0].matched_count;
    
    // Generate markdown report
    const report = `# Join Sanity Check Report

**Generated:** ${new Date().toISOString()}

## Summary

- **Sample Size:** 100 detected_id values vs 100 parcel_id values
- **SQL Verification Matched Count:** ${sqlMatchedCount}

## Match Categories

| Category | Count | Description |
|----------|-------|-------------|
| **A** | ${categoryA.length} | Exact raw string match |
| **B** | ${categoryB.length} | Match after normalizeDotZero only |
| **C** | ${categoryC.length} | Match after stripLeadingZeros only |
| **D** | ${categoryD.length} | Match after full matchKey |
| **E** | ${categoryE.length} | No match |

## Category A: Exact Raw String Match

${categoryA.length > 0 ? categoryA.slice(0, 10).map((pair, i) => 
  `${i + 1}. detected_id: \`${pair.detected}\` = parcel_id: \`${pair.parcel}\``
).join('\n') : 'No matches found.'}

## Category B: Match After normalizeDotZero Only

${categoryB.length > 0 ? categoryB.slice(0, 10).map((pair, i) => 
  `${i + 1}. detected_id: \`${pair.detected}\` → \`${pair.detectedNorm}\` = parcel_id: \`${pair.parcel}\` → \`${pair.parcelNorm}\``
).join('\n') : 'No matches found.'}

## Category C: Match After stripLeadingZeros Only

${categoryC.length > 0 ? categoryC.slice(0, 10).map((pair, i) => 
  `${i + 1}. detected_id: \`${pair.detected}\` → \`${pair.detectedStrip}\` = parcel_id: \`${pair.parcel}\` → \`${pair.parcelStrip}\``
).join('\n') : 'No matches found.'}

## Category D: Match After Full matchKey

${categoryD.length > 0 ? categoryD.slice(0, 10).map((pair, i) => 
  `${i + 1}. detected_id: \`${pair.detected}\` → \`${pair.detectedKey}\` = parcel_id: \`${pair.parcel}\` → \`${pair.parcelKey}\``
).join('\n') : 'No matches found.'}

## Category E: No Match

${categoryE.length > 0 ? categoryE.slice(0, 10).map((pair, i) => 
  `${i + 1}. detected_id: \`${pair.detected}\` (no matching parcel_id found)`
).join('\n') : 'No unmatched values.'}

## Top 10 Transformations: parcels_travis.parcel_id

| Original | matchKey |
|----------|----------|
${parcelTransformations.map(t => `| \`${t.original}\` | \`${t.matchKey}\` |`).join('\n')}

## Top 10 Transformations: parcels_travis_enrichment_stage.detected_id

| Original | matchKey |
|----------|----------|
${detectedTransformations.map(t => `| \`${t.original}\` | \`${t.matchKey}\` |`).join('\n')}

## SQL Verification Result

\`\`\`sql
WITH s AS (
  SELECT CASE
    WHEN REGEXP_REPLACE(REGEXP_REPLACE(TRIM(detected_id::text), E'\\.0+$', ''), '^0+', '') = '' THEN '0'
    ELSE REGEXP_REPLACE(REGEXP_REPLACE(TRIM(detected_id::text), E'\\.0+$', ''), '^0+', '')
  END AS k
  FROM parcels_travis_enrichment_stage
  WHERE detected_id IS NOT NULL
),
p AS (
  SELECT CASE
    WHEN REGEXP_REPLACE(REGEXP_REPLACE(TRIM(parcel_id::text), E'\\.0+$', ''), '^0+', '') = '' THEN '0'
    ELSE REGEXP_REPLACE(REGEXP_REPLACE(TRIM(parcel_id::text), E'\\.0+$', ''), '^0+', '')
  END AS k
  FROM parcels_travis
)
SELECT COUNT(*) AS matched_count FROM s JOIN p ON s.k = p.k;
\`\`\`

**Result:** \`matched_count = ${sqlMatchedCount}\`

---

## Helper Functions Used

### normalizeDotZero(x)
- Trim string
- Remove trailing ".0+" via \`/\.0+$/\`

### stripLeadingZeros(x)
- Remove leading zeros via \`/^0+/\`

### matchKey(x)
- Apply normalizeDotZero → stripLeadingZeros
- If empty, return "0"
`;

    // Ensure tmp directory exists
    const tmpDir = join(__dirname, '../tmp');
    try {
      mkdirSync(tmpDir, { recursive: true });
    } catch (err) {
      // Directory might already exist, ignore
    }
    
    // Write report
    const reportPath = join(tmpDir, 'join_sanity_report.md');
    writeFileSync(reportPath, report, 'utf8');
    
    console.log('\n✅ Sanity check complete!');
    console.log(`📄 Report written to: ${reportPath}`);
    console.log(`\n📊 Summary:`);
    console.log(`   Category A (exact): ${categoryA.length}`);
    console.log(`   Category B (normalizeDotZero): ${categoryB.length}`);
    console.log(`   Category C (stripLeadingZeros): ${categoryC.length}`);
    console.log(`   Category D (matchKey): ${categoryD.length}`);
    console.log(`   Category E (no match): ${categoryE.length}`);
    console.log(`   SQL Verification: ${sqlMatchedCount} matched rows`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run if executed directly
runSanityCheck().catch(err => {
  console.error(err);
  process.exit(1);
});

export { runSanityCheck, normalizeDotZero, stripLeadingZeros, matchKey };

