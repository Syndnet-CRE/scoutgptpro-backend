/**
 * Download FEMA flood zones from City of Austin MapServer
 * Converts to GeoJSON with normalized zone codes for Mapbox styling
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAPSERVER_URL = 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Environmental_2/MapServer/1';
const OUTPUT_FILE = path.join(__dirname, '../flood-zones-travis.geojson');
const BATCH_SIZE = 1000;

async function getFeatureCount() {
  const url = `${MAPSERVER_URL}/query?where=1=1&returnCountOnly=true&f=json`;
  const res = await fetch(url);
  const data = await res.json();
  return data.count || 0;
}

async function fetchFeatures(offset) {
  const url = `${MAPSERVER_URL}/query?where=1=1&outFields=*&outSR=4326&f=geojson&geometryType=esriGeometryEnvelope&geometry=-98.5,29.5,-97.0,30.8&inSR=4326&resultOffset=${offset}&resultRecordCount=${BATCH_SIZE}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Normalize flood zone description to zone code and risk level
 */
function normalizeFloodZone(zoneDescription) {
  if (!zoneDescription) {
    return { zoneCode: 'D', riskLevel: 'undetermined' };
  }
  
  const zone = zoneDescription.toUpperCase().trim();
  
  // First, check if it's already a simple zone code (AE, X, V, etc.)
  // Match common FEMA zone codes: A, AE, AH, AO, A1-A30, V, VE, X, X500, D, etc.
  const zoneCodePattern = /^([AVX]|[AVX][EH]|[AVX]\d+|[AVX]\d+[EH]|X500|D|B|C)$/;
  if (zoneCodePattern.test(zone)) {
    // It's already a zone code
    if (['A', 'AE', 'AH', 'AO', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17', 'A18', 'A19', 'A20', 'A21', 'A22', 'A23', 'A24', 'A25', 'A26', 'A27', 'A28', 'A29', 'A30', 'A99', 'AR'].some(z => zone.startsWith(z))) {
      return { zoneCode: zone, riskLevel: 'high' };
    }
    if (['V', 'VE', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17', 'V18', 'V19', 'V20', 'V21', 'V22', 'V23', 'V24', 'V25', 'V26', 'V27', 'V28', 'V29', 'V30'].some(z => zone.startsWith(z))) {
      return { zoneCode: zone, riskLevel: 'high' };
    }
    if (zone === 'X500' || zone === 'B' || zone.startsWith('X') && zone.includes('500')) {
      return { zoneCode: 'X500', riskLevel: 'moderate' };
    }
    if (zone === 'X' || zone === 'C') {
      return { zoneCode: 'X', riskLevel: 'low' };
    }
    if (zone === 'D') {
      return { zoneCode: 'D', riskLevel: 'undetermined' };
    }
  }
  
  // High risk - 100-year floodplain (check descriptions)
  if (zone.includes('100-YEAR') || zone.includes('100 YEAR') || zone.includes('FULLY DEVELOPED')) {
    // Check for specific zone codes in description
    if (zone.includes('AE') || zone.includes('BASE FLOOD ELEVATION')) {
      return { zoneCode: 'AE', riskLevel: 'high' };
    }
    if (zone.includes('AH')) {
      return { zoneCode: 'AH', riskLevel: 'high' };
    }
    if (zone.includes('AO')) {
      return { zoneCode: 'AO', riskLevel: 'high' };
    }
    if (zone.includes('V') || zone.includes('COASTAL')) {
      return { zoneCode: 'VE', riskLevel: 'high' };
    }
    // Default to A for 100-year
    return { zoneCode: 'A', riskLevel: 'high' };
  }
  
  // Moderate risk - 500-year floodplain
  if (zone.includes('.2 PCT') || zone.includes('0.2 PCT') || zone.includes('500-YEAR') || zone.includes('500 YEAR')) {
    return { zoneCode: 'X500', riskLevel: 'moderate' };
  }
  
  // Low risk - minimal hazard
  if (zone.includes('MINIMAL') || zone.includes('OUTSIDE') || (zone.includes('X') && !zone.includes('500') && !zone.includes('SHADED'))) {
    return { zoneCode: 'X', riskLevel: 'low' };
  }
  
  // Undetermined
  return { zoneCode: 'D', riskLevel: 'undetermined' };
}

async function main() {
  try {
    console.log('🌊 Downloading FEMA Flood Zones from City of Austin\n');
    console.log(`MapServer URL: ${MAPSERVER_URL}\n`);
    
    // Get feature count
    console.log('📊 Fetching feature count...');
    const totalCount = await getFeatureCount();
    console.log(`   Total flood zone features: ${totalCount.toLocaleString()}\n`);
    
    if (totalCount === 0) {
      console.log('⚠️  No features found. Check MapServer URL.');
      return;
    }
    
    // Fetch all features in batches
    const allFeatures = [];
    let offset = 0;
    let batchNum = 1;
    
    while (offset < totalCount) {
      const endOffset = Math.min(offset + BATCH_SIZE, totalCount);
      console.log(`📥 Fetching batch ${batchNum}: ${offset.toLocaleString()} - ${endOffset.toLocaleString()} of ${totalCount.toLocaleString()}...`);
      
      const data = await fetchFeatures(offset);
      
      if (!data.features || data.features.length === 0) {
        console.log('   ⚠️  No features in this batch, stopping.');
        break;
      }
      
      // Normalize zone codes
      data.features.forEach(f => {
        const zone = f.properties.FLOOD_ZONE || '';
        const normalized = normalizeFloodZone(zone);
        f.properties.ZONE_CODE = normalized.zoneCode;
        f.properties.RISK_LEVEL = normalized.riskLevel;
        // Keep original for reference
        f.properties.FLOOD_ZONE_ORIGINAL = zone;
      });
      
      allFeatures.push(...data.features);
      offset += BATCH_SIZE;
      batchNum++;
      
      // Small delay to avoid rate limiting
      if (offset < totalCount) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log(`\n✅ Fetched ${allFeatures.length.toLocaleString()} features\n`);
    
    // Create complete GeoJSON
    const geojson = {
      type: 'FeatureCollection',
      features: allFeatures
    };
    
    // Write to file
    console.log(`💾 Writing to ${OUTPUT_FILE}...`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(geojson, null, 2));
    
    const fileSizeMB = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2);
    console.log(`   ✅ Saved ${allFeatures.length.toLocaleString()} features`);
    console.log(`   📦 File size: ${fileSizeMB} MB\n`);
    
    // Show distribution
    const dist = {};
    const riskDist = {};
    geojson.features.forEach(f => {
      const code = f.properties.ZONE_CODE || 'UNKNOWN';
      const risk = f.properties.RISK_LEVEL || 'UNKNOWN';
      dist[code] = (dist[code] || 0) + 1;
      riskDist[risk] = (riskDist[risk] || 0) + 1;
    });
    
    console.log('📊 Zone Code Distribution:');
    console.table(dist);
    console.log('\n📊 Risk Level Distribution:');
    console.table(riskDist);
    
    // Show sample features
    console.log('\n📋 Sample Features:');
    geojson.features.slice(0, 3).forEach((f, i) => {
      console.log(`\n   Feature ${i + 1}:`);
      console.log(`     Zone Code: ${f.properties.ZONE_CODE}`);
      console.log(`     Risk Level: ${f.properties.RISK_LEVEL}`);
      console.log(`     Original: ${f.properties.FLOOD_ZONE_ORIGINAL || 'N/A'}`);
    });
    
    console.log(`\n✅ Download complete!`);
    console.log(`\nNext steps:`);
    console.log(`1. Convert to MBTiles: tippecanoe -o flood-zones-travis.mbtiles --layer=flood_zones --minimum-zoom=8 --maximum-zoom=16 flood-zones-travis.geojson`);
    console.log(`2. Upload to Mapbox: mapbox upload bradyirwin.flood-zones-travis flood-zones-travis.mbtiles`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();

