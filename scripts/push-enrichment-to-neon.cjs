const { Pool } = require('pg');

const localPool = new Pool({
  connectionString: 'postgresql://postgres:Syndnet$512@localhost:5432/scoutgpt_local'
});

const neonPool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_XMN3fLJZ1tib@ep-rapid-wind-a4k9miff-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

const BATCH_SIZE = 500;

async function main() {
  console.log('=== PUSH ENRICHMENT TO NEON ===\n');
  
  // Check local database
  const localCount = await localPool.query(`
    SELECT COUNT(*) as total,
           COUNT(CASE WHEN "siteAddress" IS NOT NULL THEN 1 END) as enriched
    FROM properties
  `);
  console.log('Local:', localCount.rows[0].total, 'total,', localCount.rows[0].enriched, 'enriched');
  
  // Check Neon before
  const neonBefore = await neonPool.query(`
    SELECT COUNT(CASE WHEN "siteAddress" IS NOT NULL THEN 1 END) as enriched FROM properties
  `);
  console.log('Neon before:', neonBefore.rows[0].enriched, 'enriched');
  
  console.log('\nFetching enriched from Local...');
  const enriched = await localPool.query(`
    SELECT "parcelId", "siteAddress", "siteCity", "siteZip", "siteState", "enrichedAt", "enrichmentSource"
    FROM properties WHERE "siteAddress" IS NOT NULL
  `);
  console.log('Fetched:', enriched.rows.length, 'rows\n');
  
  let updated = 0, errors = 0;
  const start = Date.now();
  const batches = Math.ceil(enriched.rows.length / BATCH_SIZE);
  
  for (let i = 0; i < enriched.rows.length; i += BATCH_SIZE) {
    const batch = enriched.rows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write('[' + batchNum + '/' + batches + '] ');
    
    let batchUp = 0;
    for (const r of batch) {
      try {
        const res = await neonPool.query(
          'UPDATE properties SET "siteAddress"=$1, "siteCity"=$2, "siteZip"=$3, "siteState"=$4, "enrichedAt"=$5, "enrichmentSource"=$6 WHERE "parcelId"=$7',
          [r.siteAddress, r.siteCity, r.siteZip, r.siteState, r.enrichedAt, r.enrichmentSource, r.parcelId]
        );
        if (res.rowCount > 0) { batchUp++; updated++; }
      } catch(e) { 
        errors++; 
        if (errors <= 5) console.error('Error updating', r.parcelId, ':', e.message);
      }
    }
    console.log('Updated', batchUp);
    
    if (batchNum % 50 === 0) {
      const min = (Date.now() - start) / 60000;
      console.log('  >> ' + updated + ' total, ' + min.toFixed(1) + 'm elapsed');
    }
  }
  
  const duration = (Date.now() - start) / 60000;
  const neonAfter = await neonPool.query(`
    SELECT COUNT(CASE WHEN "siteAddress" IS NOT NULL THEN 1 END) as enriched,
           COUNT(*) as total FROM properties
  `);
  
  console.log('\n=== COMPLETE ===');
  console.log('Duration:', duration.toFixed(2), 'min');
  console.log('Updated:', updated);
  console.log('Errors:', errors);
  console.log('Neon after:', neonAfter.rows[0].enriched, '/', neonAfter.rows[0].total, 
    '(' + (neonAfter.rows[0].enriched / neonAfter.rows[0].total * 100).toFixed(2) + '%)');
  
  const size = await neonPool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as s`);
  console.log('Neon size:', size.rows[0].s);
  
  await localPool.end();
  await neonPool.end();
}

main().catch(e => { console.error(e); process.exit(1); });

