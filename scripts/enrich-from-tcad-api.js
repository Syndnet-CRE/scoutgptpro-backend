#!/usr/bin/env node
/**
 * TCAD API Enrichment Script
 * Fetches parcel data from TCAD ArcGIS API and enriches our database
 */

import { PrismaClient } from '@prisma/client';
import https from 'https';

const prisma = new PrismaClient();

const API_BASE = 'https://gis.geointelsystems.com/arcgis/rest/services/Clients/WCID17_Parcels/MapServer/0';
const BATCH_SIZE = 100; // Reduced from 1000 to avoid URL length limits
const RATE_LIMIT_MS = 1000; // 1 second between requests

// Fields to fetch from API
const OUT_FIELDS = [
  'PROP_ID',
  'situs_address',
  'situs_num', 
  'situs_street',
  'situs_zip',
  'py_owner_name',
  'ownfirstname',
  'ownlastname',
  'market_value',
  'appraised_val',
  'assessed_val',
  'legal_desc',
  'subdivision',
  'lot',
  'block',
  'floodzone',
  'land_type_desc',
  'F1year_imprv',
  'deed_date',
  'geo_id',
  'tcad_acres'
].join(',');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`API error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
            return;
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Invalid JSON: ${e.message}. Response preview: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function getParcelIdsToEnrich() {
  // Get parcel IDs that don't have siteAddress yet
  const parcels = await prisma.property.findMany({
    where: {
      siteAddress: null
    },
    select: {
      parcelId: true
    }
  });
  
  return parcels.map(p => p.parcelId);
}

async function fetchFromApi(propIds) {
  // Build WHERE clause for batch of PROP_IDs
  // Convert to integers since API expects numeric PROP_ID
  const numericIds = propIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
  if (numericIds.length === 0) {
    return [];
  }
  
  const whereClause = `PROP_ID IN (${numericIds.join(',')})`;
  
  const url = `${API_BASE}/query?` + new URLSearchParams({
    where: whereClause,
    outFields: OUT_FIELDS,
    f: 'json',
    returnGeometry: 'false'
  }).toString();
  
  const data = await fetchJson(url);
  
  if (data.error) {
    throw new Error(data.error.message || 'API error');
  }
  
  return data.features || [];
}

function parseApiRecord(attrs) {
  // Parse situs address components
  let siteCity = null;
  let siteState = 'TX';
  
  // Try to extract city from situs_address (usually "123 Main St, Austin, TX 78701")
  const situsAddr = attrs.situs_address || '';
  const cityMatch = situsAddr.match(/,\s*([^,]+),\s*TX/i);
  if (cityMatch) {
    siteCity = cityMatch[1].trim();
  }
  
  return {
    siteAddress: attrs.situs_address || null,
    situsNum: attrs.situs_num ? String(attrs.situs_num) : null,
    situsStreet: attrs.situs_street || null,
    siteZip: attrs.situs_zip ? String(attrs.situs_zip) : null,
    siteCity: siteCity,
    siteState: siteState,
    marketValue: attrs.market_value || null,
    appraisedValue: attrs.appraised_val || null,
    assessedValue: attrs.assessed_val || null,
    legalDesc: attrs.legal_desc ? attrs.legal_desc.substring(0, 500) : null,
    subdivision: attrs.subdivision || null,
    lot: attrs.lot ? String(attrs.lot) : null,
    block: attrs.block ? String(attrs.block) : null,
    floodZone: attrs.floodzone || null,
    landTypeDesc: attrs.land_type_desc || null,
    yearBuilt: attrs.F1year_imprv ? parseInt(attrs.F1year_imprv) : null,
    deedDate: attrs.deed_date || null,
    ownerFirstName: attrs.ownfirstname || null,
    ownerLastName: attrs.ownlastname || null,
    geoId: attrs.geo_id ? String(attrs.geo_id) : null,
    tcadAcres: attrs.tcad_acres || null,
    enrichedAt: new Date(),
    enrichmentSource: 'TCAD_API'
  };
}

async function enrichBatch(propIds) {
  let updated = 0;
  let notFound = 0;
  let errors = 0;
  
  try {
    const features = await fetchFromApi(propIds);
    
    for (const feature of features) {
      const attrs = feature.attributes;
      const propId = String(attrs.PROP_ID);
      
      try {
        const enrichData = parseApiRecord(attrs);
        
        const result = await prisma.property.updateMany({
          where: { parcelId: propId },
          data: enrichData
        });
        
        if (result.count > 0) {
          updated++;
        } else {
          notFound++;
        }
      } catch (e) {
        errors++;
      }
    }
    
    // Mark IDs not returned by API as not found
    const returnedIds = new Set(features.map(f => String(f.attributes.PROP_ID)));
    for (const id of propIds) {
      if (!returnedIds.has(id)) {
        notFound++;
      }
    }
    
  } catch (e) {
    console.error('Batch error:', e.message);
    errors = propIds.length;
  }
  
  return { updated, notFound, errors };
}

async function main() {
  console.log('=== TCAD API ENRICHMENT ===\n');
  
  // Get current stats
  const totalProps = await prisma.property.count();
  const alreadyEnriched = await prisma.property.count({ where: { siteAddress: { not: null } } });
  
  console.log(`Total properties: ${totalProps.toLocaleString()}`);
  console.log(`Already enriched: ${alreadyEnriched.toLocaleString()}`);
  console.log(`Need enrichment: ${(totalProps - alreadyEnriched).toLocaleString()}\n`);
  
  // Get all parcel IDs that need enrichment
  console.log('Fetching parcel IDs to enrich...');
  const parcelIds = await getParcelIdsToEnrich();
  console.log(`Found ${parcelIds.length.toLocaleString()} parcels to enrich\n`);
  
  if (parcelIds.length === 0) {
    console.log('Nothing to enrich!');
    await prisma.$disconnect();
    return;
  }
  
  // Process in batches
  let totalUpdated = 0;
  let totalNotFound = 0;
  let totalErrors = 0;
  const startTime = Date.now();
  
  // Note: API only has 47,478 records, so we batch query with our parcel IDs
  const batches = [];
  for (let i = 0; i < parcelIds.length; i += BATCH_SIZE) {
    batches.push(parcelIds.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`Processing ${batches.length} batches of ${BATCH_SIZE}...\n`);
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    
    process.stdout.write(`Batch ${i + 1}/${batches.length} (${batch.length} IDs)... `);
    
    const result = await enrichBatch(batch);
    totalUpdated += result.updated;
    totalNotFound += result.notFound;
    totalErrors += result.errors;
    
    console.log(`Updated: ${result.updated}, Not in API: ${result.notFound}, Errors: ${result.errors}`);
    
    // Rate limit
    if (i < batches.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
    
    // Progress update every 10 batches
    if ((i + 1) % 10 === 0) {
      const elapsed = (Date.now() - startTime) / 1000 / 60;
      const rate = totalUpdated / elapsed;
      console.log(`  Progress: ${totalUpdated.toLocaleString()} updated, ${elapsed.toFixed(1)} min, ${rate.toFixed(0)}/min`);
    }
  }
  
  const duration = (Date.now() - startTime) / 1000 / 60;
  
  console.log('\n=== ENRICHMENT COMPLETE ===');
  console.log(`Duration: ${duration.toFixed(2)} minutes`);
  console.log(`Total updated: ${totalUpdated.toLocaleString()}`);
  console.log(`Not in API: ${totalNotFound.toLocaleString()}`);
  console.log(`Errors: ${totalErrors.toLocaleString()}`);
  
  // Final stats
  const finalEnriched = await prisma.property.count({ where: { siteAddress: { not: null } } });
  console.log(`\nProperties with siteAddress: ${finalEnriched.toLocaleString()} (${Math.round(finalEnriched/totalProps*100)}%)`);
  
  // Show sample
  const sample = await prisma.property.findFirst({
    where: { enrichmentSource: 'TCAD_API' },
    select: {
      parcelId: true,
      siteAddress: true,
      siteCity: true,
      siteZip: true,
      marketValue: true,
      floodZone: true,
      address: true
    }
  });
  
  if (sample) {
    console.log('\nSample enriched property:');
    console.log(`  Parcel: ${sample.parcelId}`);
    console.log(`  Site: ${sample.siteAddress}, ${sample.siteCity}, ${sample.siteZip}`);
    console.log(`  Mail: ${sample.address}`);
    console.log(`  Market Value: $${sample.marketValue?.toLocaleString() || 'N/A'}`);
    console.log(`  Flood Zone: ${sample.floodZone || 'N/A'}`);
  }
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Fatal error:', e);
  prisma.$disconnect();
  process.exit(1);
});

