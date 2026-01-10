#!/usr/bin/env node
import pg from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
const TABLE = 'parcel_features_travis';

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const tests = [
  // Acreage tests
  { name: 'Acreage: 2-4 acres', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE acres_calc >= 2 AND acres_calc <= 4`, min: 130000, max: 140000 },
  { name: 'Acreage: 10-20 acres', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE acres_calc >= 10 AND acres_calc <= 20`, min: 18000, max: 22000 },
  
  // Asset class tests (MUST be lowercase)
  { name: 'Asset: commercial (lowercase)', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE asset_class = 'commercial'`, min: 10000, max: 11000 },
  { name: 'Asset: Commercial (SHOULD BE 0)', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE asset_class = 'Commercial'`, min: 0, max: 0 },
  { name: 'Asset: residential', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE asset_class = 'residential'`, min: 220000, max: 225000 },
  { name: 'Asset: land', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE asset_class = 'land'`, min: 64000, max: 66000 },
  { name: 'Asset: unknown', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE asset_class = 'unknown'`, min: 71000, max: 74000 },
  
  // Owner entity type tests (MUST be lowercase)
  { name: 'Owner: llc (lowercase)', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE owner_entity_type = 'llc'`, min: 24000, max: 26000 },
  { name: 'Owner: LLC (SHOULD BE 0)', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE owner_entity_type = 'LLC'`, min: 0, max: 0 },
  { name: 'Owner: person', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE owner_entity_type = 'person'`, min: 315000, max: 320000 },
  { name: 'Owner: corp', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE owner_entity_type = 'corp'`, min: 9000, max: 10000 },
  { name: 'Owner: trust_estate', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE owner_entity_type = 'trust_estate'`, min: 17000, max: 19000 },
  
  // Owner segment tests
  { name: 'Segment: mom_pop', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE owner_segment = 'mom_pop'`, min: 314000, max: 318000 },
  { name: 'Segment: small_operator', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE owner_segment = 'small_operator'`, min: 31000, max: 34000 },
  { name: 'Segment: trust_estate', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE owner_segment = 'trust_estate'`, min: 17000, max: 19000 },
  { name: 'Segment: institutional', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE owner_segment = 'institutional'`, min: 2500, max: 3000 },
  { name: 'Segment: absentee', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE owner_segment = 'absentee'`, min: 1400, max: 1600 },
  
  // Tax delinquent
  { name: 'Tax Delinquent: true', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE tax_delinquent_flag = true`, min: 1100, max: 1200 },
  
  // Combined filters
  { name: 'Combined: commercial + 2-4 acres', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE asset_class = 'commercial' AND acres_calc >= 2 AND acres_calc <= 4`, min: 100, max: 5000 },
  { name: 'Combined: llc + commercial', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE owner_entity_type = 'llc' AND asset_class = 'commercial'`, min: 1000, max: 10000 },
  { name: 'Combined: land + 5-10 acres', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE asset_class = 'land' AND acres_calc >= 5 AND acres_calc <= 10`, min: 1000, max: 10000 },
  
  // Data quality
  { name: 'Total row count', query: `SELECT COUNT(*) as count FROM ${TABLE}`, min: 369000, max: 370000 },
  { name: 'Has geometry', query: `SELECT COUNT(*) as count FROM ${TABLE} WHERE geom_centroid IS NOT NULL`, min: 369000, max: 370000 },
];

async function run() {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  SCOUTGPT QUERY VALIDATION TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  Table: ${TABLE}`);
  console.log(`  Tests: ${tests.length}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  let passed = 0, failed = 0;
  
  for (const t of tests) {
    try {
      const result = await pool.query(t.query);
      const count = parseInt(result.rows[0].count);
      const ok = count >= t.min && count <= t.max;
      
      if (ok) {
        console.log(`✅ ${t.name}`);
        console.log(`   Count: ${count.toLocaleString()}`);
        passed++;
      } else {
        console.log(`❌ ${t.name}`);
        console.log(`   Count: ${count.toLocaleString()} | Expected: ${t.min.toLocaleString()}-${t.max.toLocaleString()}`);
        failed++;
      }
    } catch (err) {
      console.log(`❌ ${t.name}`);
      console.log(`   ERROR: ${err.message}`);
      failed++;
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed (${((passed / tests.length) * 100).toFixed(1)}%)`);
  console.log('═══════════════════════════════════════════════════════════════════');
  
  if (failed === 0) {
    console.log('  🎉 ALL TESTS PASSED');
  } else {
    console.log('  ⚠️  SOME TESTS FAILED - Review above');
  }
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
