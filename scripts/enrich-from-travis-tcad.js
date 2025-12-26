#!/usr/bin/env node
/**
 * Travis County TCAD API Enrichment Script
 * Fetches ALL 382k records and enriches our database with situs addresses
 */

import { PrismaClient } from '@prisma/client';
import https from 'https';

const prisma = new PrismaClient();

const API_BASE = 'https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/TCAD_public/MapServer/0';
const BATCH_SIZE = 1000;
const RATE_LIMIT_MS = 1000;

const OUT_FIELDS = [
  'PROP_ID',
  'situs_address',
  'situs_num',
  'situs_street',
  'situs_street_prefx',
  'situs_street_suffix',
  'situs_city',
  'situs_zip',
  'geo_id',
  'tcad_acres',
  'legal_desc',
  'sub_dec',
  'LOTS'
].join(',');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function getTotalCount() {
  const url = `${API_BASE}/query?where=1=1&returnCountOnly=true&f=json`;
  const data = await fetchJson(url);
  return data.count || 0;
}

async function fetchBatch(offset) {
  const url = `${API_BASE}/query?where=1=1&outFields=${OUT_FIELDS}&resultOffset=${offset}&resultRecordCount=${BATCH_SIZE}&f=json&returnGeometry=false`;
  
  const data = await fetchJson(url);
  
  if (data.error) {
    throw new Error(data.error.message || 'API error');
  }
  
  return data.features || [];
}

function parseApiRecord(attrs) {
  // Build full situs address if not provided
  let situsAddress = attrs.situs_address;
  if (!situsAddress && attrs.situs_num && attrs.situs_street) {
    const parts = [
      attrs.situs_num,
      attrs.situs_street_prefx,
      attrs.situs_street,
      attrs.situs_street_suffix
    ].filter(Boolean);
    situsAddress = parts.join(' ');
  }
  
  return {
    siteAddress: situsAddress || null,
    situsNum: attrs.situs_num ? String(attrs.situs_num) : null,
    situsStreet: attrs.situs_street || null,
    siteCity: attrs.situs_city || null,
    siteState: 'TX',
    siteZip: attrs.situs_zip ? String(attrs.situs_zip) : null,
    geoId: attrs.geo_id ? String(attrs.geo_id) : null,
    tcadAcres: attrs.tcad_acres || null,
    legalDesc: attrs.legal_desc ? String(attrs.legal_desc).substring(0, 500) : null,
    subdivision: attrs.sub_dec || null,
    lot: attrs.LOTS ? String(attrs.LOTS) : null,
    enrichedAt: new Date(),
    enrichmentSource: 'TRAVIS_TCAD_API'
  };
}

async function main() {
  console.log('=== TRAVIS COUNTY TCAD API ENRICHMENT ===\n');
  
  // Get current stats
  const totalProps = await prisma.property.count();
  const alreadyEnriched = await prisma.property.count({ where: { siteAddress: { not: null } } });
  
  console.log(`Our database: ${totalProps.toLocaleString()} properties`);
  console.log(`Already have siteAddress: ${alreadyEnriched.toLocaleString()}\n`);
  
  // Get total count from API
  console.log('Fetching total count from Travis County API...');
  const totalApiRecords = await getTotalCount();
  console.log(`API has ${totalApiRecords.toLocaleString()} records\n`);
  
  const totalBatches = Math.ceil(totalApiRecords / BATCH_SIZE);
  console.log(`Will fetch ${totalBatches} batches of ${BATCH_SIZE}\n`);
  
  let totalFetched = 0;
  let totalUpdated = 0;
  let totalNotFound = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const startTime = Date.now();
  
  for (let batch = 0; batch < totalBatches; batch++) {
    const offset = batch * BATCH_SIZE;
    
    process.stdout.write(`Batch ${batch + 1}/${totalBatches} (offset ${offset})... `);
    
    try {
      const features = await fetchBatch(offset);
      totalFetched += features.length;
      
      let batchUpdated = 0;
      let batchNotFound = 0;
      let batchSkipped = 0;
      
      for (const feature of features) {
        const attrs = feature.attributes;
        const propId = String(attrs.PROP_ID);
        
        if (!propId || propId === 'null' || propId === 'undefined') {
          batchSkipped++;
          totalSkipped++;
          continue;
        }
        
        // Skip if no situs address data
        if (!attrs.situs_address && !attrs.situs_num) {
          batchSkipped++;
          totalSkipped++;
          continue;
        }
        
        try {
          const enrichData = parseApiRecord(attrs);
          
          // Only update if siteAddress is null (don't overwrite existing)
          const result = await prisma.property.updateMany({
            where: { 
              parcelId: propId,
              siteAddress: null
            },
            data: enrichData
          });
          
          if (result.count > 0) {
            batchUpdated++;
            totalUpdated++;
          } else {
            batchNotFound++;
            totalNotFound++;
          }
        } catch (e) {
          totalErrors++;
        }
      }
      
      console.log(`Fetched: ${features.length}, Updated: ${batchUpdated}, Not found: ${batchNotFound}, Skipped: ${batchSkipped}`);
      
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      totalErrors += BATCH_SIZE;
      
      // Wait longer on error
      await sleep(5000);
    }
    
    // Rate limit
    if (batch < totalBatches - 1) {
      await sleep(RATE_LIMIT_MS);
    }
    
    // Progress every 10 batches
    if ((batch + 1) % 10 === 0) {
      const elapsed = (Date.now() - startTime) / 1000 / 60;
      const rate = totalUpdated / elapsed;
      const eta = (totalBatches - batch - 1) * (elapsed / (batch + 1));
      console.log(`  === Progress: ${totalFetched.toLocaleString()} fetched, ${totalUpdated.toLocaleString()} updated, ${elapsed.toFixed(1)} min elapsed, ~${eta.toFixed(1)} min remaining ===`);
    }
  }
  
  const duration = (Date.now() - startTime) / 1000 / 60;
  
  console.log('\n=== ENRICHMENT COMPLETE ===');
  console.log(`Duration: ${duration.toFixed(2)} minutes`);
  console.log(`API records fetched: ${totalFetched.toLocaleString()}`);
  console.log(`Database records updated: ${totalUpdated.toLocaleString()}`);
  console.log(`Not found in our DB: ${totalNotFound.toLocaleString()}`);
  console.log(`Skipped (no situs data): ${totalSkipped.toLocaleString()}`);
  console.log(`Errors: ${totalErrors.toLocaleString()}`);
  
  // Final stats
  const finalWithSite = await prisma.property.count({ where: { siteAddress: { not: null } } });
  const fromTravis = await prisma.property.count({ where: { enrichmentSource: 'TRAVIS_TCAD_API' } });
  
  console.log(`\nFinal stats:`);
  console.log(`  Properties with siteAddress: ${finalWithSite.toLocaleString()} (${Math.round(finalWithSite/totalProps*100)}%)`);
  console.log(`  Enriched from Travis TCAD: ${fromTravis.toLocaleString()}`);
  
  // Show sample
  const sample = await prisma.property.findFirst({
    where: { enrichmentSource: 'TRAVIS_TCAD_API', siteAddress: { not: null } },
    select: {
      parcelId: true,
      siteAddress: true,
      siteCity: true,
      siteZip: true,
      address: true,
      latitude: true,
      longitude: true
    }
  });
  
  if (sample) {
    console.log('\nSample enriched property:');
    console.log(`  Parcel: ${sample.parcelId}`);
    console.log(`  Site: ${sample.siteAddress}, ${sample.siteCity}, ${sample.siteZip}`);
    console.log(`  Mail: ${sample.address}`);
    console.log(`  Coords: [${sample.longitude}, ${sample.latitude}]`);
  }
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Fatal error:', e);
  prisma.$disconnect();
  process.exit(1);
});

