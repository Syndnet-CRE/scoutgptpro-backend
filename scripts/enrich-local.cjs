const { PrismaClient } = require('@prisma/client');
const https = require('https');
const prisma = new PrismaClient();

const API = 'https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/TCAD_public/MapServer/0';
const FIELDS = 'PROP_ID,situs_address,situs_city,situs_zip';
const BATCH = 200;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function fetch(url) {
  return new Promise((res, rej) => {
    const req = https.get(url, { timeout: 30000 }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { res(JSON.parse(d)); } 
        catch(e) { rej(new Error('Bad JSON')); }
      });
    });
    req.on('error', rej);
    req.on('timeout', () => {
      req.destroy();
      rej(new Error('Timeout'));
    });
  });
}

async function main() {
  console.log('=== LOCAL TCAD ENRICHMENT ===\n');
  
  // Check current status
  const total = await prisma.property.count();
  const withSite = await prisma.property.count({ where: { siteAddress: { not: null } } });
  console.log(`Total: ${total.toLocaleString()}, Already enriched: ${withSite.toLocaleString()}\n`);
  
  // Get properties needing enrichment
  const needEnrich = await prisma.property.findMany({
    where: { siteAddress: null },
    select: { parcelId: true }
  });
  
  console.log(`Need enrichment: ${needEnrich.length.toLocaleString()}\n`);
  
  if (needEnrich.length === 0) {
    console.log('All properties already enriched!');
    await prisma.$disconnect();
    return;
  }
  
  const ids = needEnrich.map(p => parseInt(p.parcelId, 10)).filter(id => !isNaN(id));
  const batches = Math.ceil(ids.length / BATCH);
  
  let totalUpdated = 0, totalNotInApi = 0, totalErrors = 0;
  const start = Date.now();
  
  for (let i = 0; i < batches; i++) {
    const batchIds = ids.slice(i * BATCH, (i + 1) * BATCH);
    
    process.stdout.write(`[${i+1}/${batches}] `);
    
    try {
      const whereClause = `PROP_ID IN (${batchIds.join(',')})`;
      const url = `${API}/query?where=${encodeURIComponent(whereClause)}&outFields=${FIELDS}&f=json&returnGeometry=false`;
      const data = await fetch(url);
      const features = data.features || [];
      
      let updated = 0;
      for (const f of features) {
        const a = f.attributes;
        if (!a.situs_address) continue;
        
        try {
          await prisma.property.updateMany({
            where: { parcelId: String(a.PROP_ID) },
            data: {
              siteAddress: a.situs_address,
              siteCity: a.situs_city || null,
              siteZip: a.situs_zip ? String(a.situs_zip) : null,
              siteState: 'TX',
              enrichedAt: new Date(),
              enrichmentSource: 'TRAVIS_TCAD_API'
            }
          });
          updated++;
        } catch(e) { 
          totalErrors++;
        }
      }
      
      totalUpdated += updated;
      totalNotInApi += batchIds.length - features.length;
      console.log(`Got ${features.length}, Updated ${updated}`);
      
    } catch(e) {
      console.log(`ERROR: ${e.message}`);
      totalErrors += BATCH;
    }
    
    await sleep(300);
    
    if ((i+1) % 100 === 0) {
      const min = (Date.now() - start) / 60000;
      const rate = totalUpdated / min;
      console.log(`  >> ${totalUpdated.toLocaleString()} updated, ${min.toFixed(1)}m, ~${rate.toFixed(0)}/min`);
    }
  }
  
  const duration = (Date.now() - start) / 60000;
  
  console.log('\n=== ENRICHMENT COMPLETE ===');
  console.log(`Duration: ${duration.toFixed(1)} minutes`);
  console.log(`Updated: ${totalUpdated.toLocaleString()}`);
  console.log(`Not in API: ${totalNotInApi.toLocaleString()}`);
  console.log(`Errors: ${totalErrors.toLocaleString()}`);
  
  const finalWithSite = await prisma.property.count({ where: { siteAddress: { not: null } } });
  console.log(`\nFinal with siteAddress: ${finalWithSite.toLocaleString()} (${Math.round(finalWithSite/total*100)}%)`);
  
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); });

