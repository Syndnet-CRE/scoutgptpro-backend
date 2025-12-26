#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';
import https from 'https';

const prisma = new PrismaClient();

const API = 'https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/TCAD_public/MapServer/0';
const BATCH = 1000;
const FIELDS = 'PROP_ID,situs_address,situs_city,situs_zip,geo_id,tcad_acres,legal_desc,sub_dec';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function fetch(url) {
  return new Promise((res, rej) => {
    const req = https.get(url, { timeout: 20000 }, r => {
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
  console.log('=== FAST TRAVIS TCAD ENRICHMENT ===\n');
  
  const total = await prisma.property.count();
  const done = await prisma.property.count({ where: { enrichmentSource: 'TRAVIS_TCAD_API' } });
  console.log(`DB: ${total.toLocaleString()} total, ${done.toLocaleString()} already enriched\n`);
  
  const countData = await fetch(`${API}/query?where=1=1&returnCountOnly=true&f=json`);
  const apiTotal = countData.count;
  console.log(`API: ${apiTotal.toLocaleString()} records\n`);
  
  const batches = Math.ceil(apiTotal / BATCH);
  let updated = 0, notFound = 0, skipped = 0, errors = 0;
  const start = Date.now();
  
  for (let i = 0; i < batches; i++) {
    const offset = i * BATCH;
    process.stdout.write(`[${i+1}/${batches}] `);
    
    try {
      const url = `${API}/query?where=1=1&outFields=${FIELDS}&resultOffset=${offset}&resultRecordCount=${BATCH}&f=json&returnGeometry=false`;
      const data = await fetch(url);
      const features = data.features || [];
      
      let bU = 0, bN = 0, bS = 0;
      
      for (const f of features) {
        const a = f.attributes;
        const id = String(a.PROP_ID);
        if (!id || !a.situs_address) { bS++; skipped++; continue; }
        
        try {
          const r = await prisma.property.updateMany({
            where: { parcelId: id, siteAddress: null },
            data: {
              siteAddress: a.situs_address,
              siteCity: a.situs_city || null,
              siteZip: a.situs_zip ? String(a.situs_zip) : null,
              siteState: 'TX',
              geoId: a.geo_id ? String(a.geo_id) : null,
              tcadAcres: a.tcad_acres || null,
              legalDesc: a.legal_desc ? String(a.legal_desc).slice(0,500) : null,
              subdivision: a.sub_dec || null,
              enrichedAt: new Date(),
              enrichmentSource: 'TRAVIS_TCAD_API'
            }
          });
          if (r.count > 0) { bU++; updated++; } else { bN++; notFound++; }
        } catch(e) { errors++; }
      }
      
      console.log(`Got ${features.length}, Updated ${bU}, NotFound ${bN}, Skip ${bS}`);
    } catch(e) {
      console.log(`ERROR: ${e.message}`);
      errors += BATCH;
    }
    
    if (i < batches - 1) await sleep(500);
    
    if ((i+1) % 20 === 0) {
      const min = (Date.now() - start) / 60000;
      const eta = (batches - i - 1) * (min / (i + 1));
      console.log(`  >> ${updated.toLocaleString()} updated, ${min.toFixed(1)}m elapsed, ~${eta.toFixed(1)}m left`);
    }
  }
  
  console.log('\n=== DONE ===');
  console.log(`Updated: ${updated.toLocaleString()}`);
  console.log(`Not found: ${notFound.toLocaleString()}`);
  console.log(`Skipped: ${skipped.toLocaleString()}`);
  console.log(`Errors: ${errors.toLocaleString()}`);
  console.log(`Time: ${((Date.now()-start)/60000).toFixed(1)} minutes`);
  
  const final = await prisma.property.count({ where: { siteAddress: { not: null } } });
  console.log(`\nProperties with siteAddress: ${final.toLocaleString()} (${Math.round(final/total*100)}%)`);
  
  await prisma.$disconnect();
}

main().catch(e => { 
  console.error(e); 
  prisma.$disconnect(); 
  process.exit(1); 
});


