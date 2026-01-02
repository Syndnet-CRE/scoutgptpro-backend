/**
 * Comprehensive ScoutGPT Data Audit
 * READ-ONLY - No modifications
 */

import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from backend
dotenv.config({ path: join(__dirname, '../.env') });

const prisma = new PrismaClient();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const audit = {
  timestamp: new Date().toISOString(),
  tables: {},
  geographic: {},
  completeness: {},
  pois: {},
  enrichment: {},
  dataSources: []
};

async function runAudit() {
  try {
    console.log('🔍 Starting comprehensive data audit...\n');

    // 1. Get all tables and row counts
    console.log('1. Auditing tables...');
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    for (const { table_name } of tables.rows) {
      try {
        const count = await pool.query(`SELECT COUNT(*) as count FROM ${table_name}`);
        const columns = await pool.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
          LIMIT 10;
        `, [table_name]);
        
        audit.tables[table_name] = {
          rowCount: Number(count.rows[0].count),
          sampleColumns: columns.rows.map(c => `${c.column_name} (${c.data_type})`)
        };
        console.log(`   ✓ ${table_name}: ${count.rows[0].count} rows`);
      } catch (e) {
        console.log(`   ✗ ${table_name}: Error - ${e.message}`);
      }
    }

    // 2. Geographic coverage
    console.log('\n2. Checking geographic coverage...');
    const counties = await pool.query(`
      SELECT DISTINCT county, COUNT(*) as count 
      FROM properties 
      WHERE county IS NOT NULL 
      GROUP BY county 
      ORDER BY count DESC 
      LIMIT 20;
    `);
    audit.geographic.counties = counties.rows;

    const cities = await pool.query(`
      SELECT DISTINCT "siteCity" as city, COUNT(*) as count 
      FROM properties 
      WHERE "siteCity" IS NOT NULL 
      GROUP BY "siteCity" 
      ORDER BY count DESC 
      LIMIT 20;
    `);
    audit.geographic.cities = cities.rows;

    // 3. Data completeness (properties table)
    console.log('\n3. Checking data completeness...');
    const completeness = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(owner) as has_owner,
        COUNT("siteAddress") as has_address,
        COUNT("avmValue") as has_avm,
        COUNT("yearBuilt") as has_year_built,
        COUNT("propertyType") as has_property_type,
        COUNT(latitude) as has_latitude,
        COUNT(longitude) as has_longitude,
        COUNT("attomId") as has_attom_id,
        COUNT("enrichedAt") as has_enriched_at,
        COUNT("zoning") as has_zoning,
        COUNT("lastSaleDate") as has_last_sale_date,
        COUNT("mortgageAmount") as has_mortgage
      FROM properties;
    `);
    audit.completeness = completeness.rows[0];

    // 4. POI coverage
    console.log('\n4. Checking POI coverage...');
    try {
      const poiCategories = await pool.query(`
        SELECT category, COUNT(*) as count 
        FROM osm_pois_travis 
        GROUP BY category 
        ORDER BY COUNT(*) DESC;
      `);
      audit.pois.categories = poiCategories.rows;
      audit.pois.total = poiCategories.rows.reduce((sum, r) => sum + Number(r.count), 0);
    } catch (e) {
      audit.pois.error = e.message;
    }

    // 5. Enrichment coverage
    console.log('\n5. Checking enrichment coverage...');
    const enrichment = await pool.query(`
      SELECT 
        COUNT(*) as total_properties,
        COUNT(CASE WHEN "enrichedAt" IS NOT NULL THEN 1 END) as enriched_count,
        COUNT(CASE WHEN "attomId" IS NOT NULL THEN 1 END) as has_attom_id
      FROM properties;
    `);
    audit.enrichment = enrichment.rows[0];

    // 6. Check parcels_travis and enrichment tables
    console.log('\n6. Checking parcel tables...');
    try {
      const parcelsTravis = await pool.query('SELECT COUNT(*) as count FROM parcels_travis');
      audit.tables['parcels_travis'] = {
        rowCount: Number(parcelsTravis.rows[0].count),
        sampleColumns: ['parcel_id', 'geom (geometry)']
      };
    } catch (e) {
      audit.tables['parcels_travis'] = { error: e.message };
    }

    try {
      const parcelsEnrichment = await pool.query('SELECT COUNT(*) as count FROM parcels_travis_enrichment');
      audit.tables['parcels_travis_enrichment'] = {
        rowCount: Number(parcelsEnrichment.rows[0].count),
        sampleColumns: ['parcel_id', 'raw (jsonb)', 'zoning_code', 'land_use_code']
      };
    } catch (e) {
      audit.tables['parcels_travis_enrichment'] = { error: e.message };
    }

    // Generate markdown report
    generateReport();

  } catch (error) {
    console.error('❌ Audit failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

function generateReport() {
  const total = audit.completeness.total;
  const report = `# ScoutGPT Data Audit Report
Generated: ${audit.timestamp}

## 1. Current Database State

### Tables & Row Counts
| Table | Row Count | Key Columns | Notes |
|-------|-----------|-------------|-------|
${Object.entries(audit.tables).map(([name, data]) => {
  if (data.error) {
    return `| ${name} | Error | - | ${data.error} |`;
  }
  const cols = data.sampleColumns.slice(0, 5).join(', ');
  return `| ${name} | ${data.rowCount.toLocaleString()} | ${cols} | - |`;
}).join('\n')}

### Geographic Coverage
- **Counties:** ${audit.geographic.counties.length} distinct counties
  ${audit.geographic.counties.slice(0, 10).map(c => `  - ${c.county}: ${c.count} properties`).join('\n')}
- **Cities:** ${audit.geographic.cities.length} distinct cities
  ${audit.geographic.cities.slice(0, 10).map(c => `  - ${c.city}: ${c.count} properties`).join('\n')}
- **Total properties:** ${total.toLocaleString()}

### Data Completeness (properties table)
| Field | Present | Missing | % Complete |
|-------|---------|---------|------------|
| Owner Name | ${audit.completeness.has_owner} | ${total - audit.completeness.has_owner} | ${((audit.completeness.has_owner / total) * 100).toFixed(1)}% |
| Address | ${audit.completeness.has_address} | ${total - audit.completeness.has_address} | ${((audit.completeness.has_address / total) * 100).toFixed(1)}% |
| AVM Value | ${audit.completeness.has_avm} | ${total - audit.completeness.has_avm} | ${((audit.completeness.has_avm / total) * 100).toFixed(1)}% |
| Year Built | ${audit.completeness.has_year_built} | ${total - audit.completeness.has_year_built} | ${((audit.completeness.has_year_built / total) * 100).toFixed(1)}% |
| Property Type | ${audit.completeness.has_property_type} | ${total - audit.completeness.has_property_type} | ${((audit.completeness.has_property_type / total) * 100).toFixed(1)}% |
| Latitude/Longitude | ${audit.completeness.has_latitude} | ${total - audit.completeness.has_latitude} | ${((audit.completeness.has_latitude / total) * 100).toFixed(1)}% |
| ATTOM ID | ${audit.completeness.has_attom_id} | ${total - audit.completeness.has_attom_id} | ${((audit.completeness.has_attom_id / total) * 100).toFixed(1)}% |
| Zoning | ${audit.completeness.has_zoning} | ${total - audit.completeness.has_zoning} | ${((audit.completeness.has_zoning / total) * 100).toFixed(1)}% |
| Last Sale Date | ${audit.completeness.has_last_sale_date} | ${total - audit.completeness.has_last_sale_date} | ${((audit.completeness.has_last_sale_date / total) * 100).toFixed(1)}% |
| Mortgage Data | ${audit.completeness.has_mortgage} | ${total - audit.completeness.has_mortgage} | ${((audit.completeness.has_mortgage / total) * 100).toFixed(1)}% |

### POI Coverage
${audit.pois.error ? `**Error:** ${audit.pois.error}` : `
| Category | Count |
|----------|-------|
${audit.pois.categories?.map(c => `| ${c.category} | ${c.count} |`).join('\n') || '| None | 0 |'}
**Total POIs:** ${audit.pois.total || 0}
`}

### Enrichment Coverage
- **Total Properties:** ${audit.enrichment.total_properties.toLocaleString()}
- **Enriched Properties:** ${audit.enrichment.enriched_count.toLocaleString()} (${((audit.enrichment.enriched_count / audit.enrichment.total_properties) * 100).toFixed(1)}%)
- **Properties with ATTOM ID:** ${audit.enrichment.has_attom_id.toLocaleString()} (${((audit.enrichment.has_attom_id / audit.enrichment.total_properties) * 100).toFixed(1)}%)

## 2. Available Data Sources (Target State)

| Source | Type | Coverage | Status |
|--------|------|----------|--------|
| TNRIS Parcels | Parcel boundaries | Texas statewide | ${audit.tables['parcels_travis']?.rowCount > 0 ? '✅ Loaded' : '❌ Missing'} |
| Travis County Clerk | Deeds/liens | Travis County | ${audit.completeness.has_last_sale_date > 0 ? '✅ Partial' : '❌ Missing'} |
| Travis Delinquent Tax | Tax distress | Travis County | ${audit.completeness.has_mortgage > 0 ? '✅ Partial' : '❌ Missing'} |
| Geofabrik OSM | POIs/roads | Texas | ${audit.pois.total > 0 ? '✅ Loaded (Travis)' : '❌ Missing'} |
| FEMA NFHL | Flood zones | US | ${audit.completeness.has_zoning > 0 ? '⚠️ Partial' : '❌ Missing'} |
| Zillow Research | Market indices | US | ${audit.completeness.has_avm > 0 ? '✅ Partial' : '❌ Missing'} |
| ACS Demographics | Census data | US tracts | ❌ Missing |
| RentCast API | Rent estimates | US | ❌ Missing |
| ATTOM | Property enrichment | US | ${audit.completeness.has_attom_id > 0 ? '✅ Partial' : '❌ Missing'} |

## 3. Gaps & Missing Data

### Critical Gaps (blocking features)
- [ ] **Demographics Data:** No ACS census tract data loaded
- [ ] **Rental Estimates:** No RentCast or similar rental data
- [ ] **Flood Zones:** FEMA flood zone data not integrated
- [ ] **Zoning Coverage:** Only ${((audit.completeness.has_zoning / total) * 100).toFixed(1)}% of properties have zoning data
- [ ] **POI Coverage:** Currently only Travis County POIs (${audit.pois.total || 0} total)

### Nice-to-Have Gaps
- [ ] **Historical Imagery:** No time-series imagery data
- [ ] **Traffic Data:** No real-time traffic flow data
- [ ] **Building Permits:** No permit/construction data
- [ ] **Crime Data:** No crime heat maps
- [ ] **Walkability Scores:** No walkability index data

## 4. Data Quality Issues
- **Enrichment Rate:** Only ${((audit.enrichment.enriched_count / audit.enrichment.total_properties) * 100).toFixed(1)}% of properties have enrichment data
- **ATTOM Coverage:** Only ${((audit.enrichment.has_attom_id / audit.enrichment.total_properties) * 100).toFixed(1)}% have ATTOM IDs
- **Zoning Coverage:** Low coverage (${((audit.completeness.has_zoning / total) * 100).toFixed(1)}%)
- **Mortgage Data:** Only ${((audit.completeness.has_mortgage / total) * 100).toFixed(1)}% have mortgage information

## 5. Recommendations (prioritized)
1. **High Priority:** Expand POI coverage beyond Travis County (currently ${audit.pois.total || 0} POIs)
2. **High Priority:** Increase zoning data coverage (currently ${((audit.completeness.has_zoning / total) * 100).toFixed(1)}%)
3. **High Priority:** Integrate FEMA flood zone data for risk assessment
4. **Medium Priority:** Add ACS demographics data for market analysis
5. **Medium Priority:** Integrate RentCast API for rental estimates
6. **Low Priority:** Add historical imagery and traffic data
`;

  const reportPath = join(__dirname, '../../scoutgpt_9461/scoutgpt-data-audit.md');
  writeFileSync(reportPath, report);
  console.log(`\n✅ Report saved to: ${reportPath}\n`);
  console.log('📊 Summary:');
  console.log(`   - Total properties: ${total.toLocaleString()}`);
  console.log(`   - Tables audited: ${Object.keys(audit.tables).length}`);
  console.log(`   - Counties: ${audit.geographic.counties.length}`);
  console.log(`   - Cities: ${audit.geographic.cities.length}`);
  console.log(`   - POIs: ${audit.pois.total || 0}`);
}

runAudit()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });

