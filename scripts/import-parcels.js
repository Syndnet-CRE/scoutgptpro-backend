import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// Try multiple possible paths for chunks directory
function findChunksDir() {
  const possiblePaths = [
    path.join(__dirname, '../../data/parcels/chunks'),
    path.join(process.cwd(), 'data/parcels/chunks'),
    path.join(__dirname, '../data/parcels/chunks')
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  
  throw new Error(`Chunks directory not found. Tried: ${possiblePaths.join(', ')}`);
}

const CHUNKS_DIR = findChunksDir();
const BATCH_SIZE = 500; // Insert 500 at a time

// Detect property type from data
function detectPropertyType(props) {
  if (!props.impValue || props.impValue === 0) {
    return 'land';
  }
  const legalDesc = (props.legalDesc || '').toLowerCase();
  if (legalDesc.includes('commercial') || legalDesc.includes('retail')) {
    return 'commercial';
  }
  if (legalDesc.includes('industrial') || legalDesc.includes('warehouse')) {
    return 'industrial';
  }
  if (legalDesc.includes('mixed')) {
    return 'mixed';
  }
  if (legalDesc.includes('multifamily') || legalDesc.includes('apartment')) {
    return 'multifamily';
  }
  return 'residential';
}

// Detect absentee owner (out of state)
function detectAbsentee(address) {
  if (!address) return false;
  const addrUpper = address.toUpperCase();
  const txPatterns = [', TX ', ', TEXAS ', ' TX ', ' TEXAS '];
  const hasTexas = txPatterns.some(p => addrUpper.includes(p));
  // If address exists and doesn't contain Texas, likely absentee
  return address.length > 10 && !hasTexas;
}

// Calculate motivation score
function calculateMotivationScore(props, isAbsentee, isTaxDelinquent, isVacantLand) {
  let score = 50;
  if (isTaxDelinquent) score += 25;
  if (isAbsentee) score += 15;
  if (isVacantLand) score += 10;
  
  // Entity ownership
  const owner = (props.owner || '').toLowerCase();
  if (owner.includes('llc') || owner.includes('trust') || owner.includes('corp') || owner.includes('inc') || owner.includes('estate')) {
    score += 5;
  }
  
  // Large lot
  if (props.acres && parseFloat(props.acres) > 1) {
    score += 5;
  }
  
  return Math.min(score, 100);
}

// Get opportunity flags
function getOpportunityFlags(props, isAbsentee, isTaxDelinquent, isVacantLand) {
  const flags = [];
  if (isTaxDelinquent) flags.push('tax-delinquent');
  if (isAbsentee) flags.push('absentee-owner');
  if (isVacantLand) flags.push('vacant-land');
  if (props.acres && parseFloat(props.acres) > 1) flags.push('large-lot');
  
  const owner = (props.owner || '').toLowerCase();
  if (owner.includes('llc') || owner.includes('trust') || owner.includes('corp')) {
    flags.push('entity-owned');
  }
  
  return flags;
}

// Parse number helper
function parseNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val;
  return isNaN(num) ? null : num;
}

// Parse int helper
function parseIntSafe(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'string' ? parseInt(val.replace(/,/g, ''), 10) : val;
  return isNaN(num) ? null : num;
}

async function importChunk(chunkFile, chunkIndex, totalChunks, chunksDir) {
  console.log(`\nProcessing chunk ${chunkIndex + 1}/${totalChunks}: ${chunkFile}`);
  
  // Try multiple possible paths
  const possiblePaths = [
    path.join(chunksDir, chunkFile),
    path.join(process.cwd(), 'data/parcels/chunks', chunkFile),
    path.join(__dirname, '../data/parcels/chunks', chunkFile),
    chunkFile // Absolute path
  ];
  
  let filePath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      filePath = p;
      break;
    }
  }
  
  if (!filePath) {
    console.log(`  ⚠️  File not found: ${chunkFile}`);
    return 0;
  }
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const features = data.features || [];
  
  console.log(`  Found ${features.length} parcels`);
  
  const properties = features.map(feature => {
    const props = feature.properties || {};
    const centroid = props.centroid || [];
    const lng = centroid[0] || null;
    const lat = centroid[1] || null;
    
    const totalTax = parseNumber(props.totalTax);
    const totalDue = parseNumber(props.totalDue);
    const isTaxDelinquent = totalTax !== null && totalDue !== null && totalDue > totalTax;
    const isVacantLand = !props.impValue || parseNumber(props.impValue) === 0;
    const isAbsentee = detectAbsentee(props.address);
    const propertyType = detectPropertyType(props);
    const motivationScore = calculateMotivationScore(props, isAbsentee, isTaxDelinquent, isVacantLand);
    const opportunityFlags = getOpportunityFlags(props, isAbsentee, isTaxDelinquent, isVacantLand);
    
    // Extract city/state/zip from address
    let city = null, state = null, zip = null;
    if (props.address) {
      const parts = props.address.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        city = parts[parts.length - 2] || null;
        const stateZip = parts[parts.length - 1] || '';
        const stateZipParts = stateZip.split(/\s+/);
        state = stateZipParts[0] || null;
        zip = stateZipParts[1] || null;
      }
    }
    
    return {
      parcelId: String(props.id || `chunk${chunkIndex}-${Math.random().toString(36).slice(2)}`),
      address: props.address || null,
      owner: props.owner || null,
      acres: parseNumber(props.acres),
      legalDesc: props.legalDesc || null,
      taxYear: parseIntSafe(props.taxYear),
      totalTax,
      totalDue,
      mailingAddr: props.mailingAddr || null,
      impValue: parseNumber(props.impValue),
      landValue: parseNumber(props.landValue),
      mktValue: parseNumber(props.mktValue),
      yearBuilt: parseIntSafe(props.yearBuilt),
      propertyType,
      latitude: lat,
      longitude: lng,
      centroid: centroid.length > 0 ? centroid : null,
      motivationScore,
      opportunityFlags,
      isAbsentee,
      isTaxDelinquent,
      isVacantLand,
      city,
      state,
      zip
    };
  }).filter(p => p.parcelId); // Filter out invalid entries
  
  // Insert in batches
  let inserted = 0;
  let skipped = 0;
  
  for (let i = 0; i < properties.length; i += BATCH_SIZE) {
    const batch = properties.slice(i, i + BATCH_SIZE);
    
    try {
      const result = await prisma.property.createMany({
        data: batch,
        skipDuplicates: true
      });
      inserted += result.count;
      skipped += (batch.length - result.count);
      process.stdout.write(`\r  Inserted: ${inserted}/${properties.length} (skipped: ${skipped})`);
    } catch (error) {
      console.error(`\n  Error inserting batch ${i}-${i + batch.length}: ${error.message}`);
      // Try individual inserts to find problematic records
      for (const prop of batch) {
        try {
          await prisma.property.create({ data: prop });
          inserted++;
        } catch (e) {
          skipped++;
          // Skip problematic records
        }
      }
    }
  }
  
  console.log(`\n  ✅ Completed: ${inserted} inserted, ${skipped} skipped`);
  return inserted;
}

async function main() {
  console.log('=== PARCEL IMPORT TO NEON DATABASE ===\n');
  
  // Check existing count
  const existingCount = await prisma.property.count();
  console.log(`Existing properties in database: ${existingCount}`);
  
  if (existingCount > 0) {
    console.log('\n⚠️  Database already has properties.');
    console.log('To reimport, first run: TRUNCATE TABLE properties CASCADE;');
    
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    
    const answer = await new Promise(resolve => {
      rl.question('\nContinue anyway? (y/n): ', resolve);
    });
    rl.close();
    
    if (answer.toLowerCase() !== 'y') {
      console.log('Aborted.');
      await prisma.$disconnect();
      return;
    }
  }
  
  // Get chunk files
  const indexPath = path.join(__dirname, '../../data/parcels/chunk_index.json');
  let chunkFiles = [];
  
  if (fs.existsSync(indexPath)) {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    chunkFiles = (index.chunks || []).map(c => c.filename || c.file || c);
  } else {
    chunkFiles = fs.readdirSync(CHUNKS_DIR)
      .filter(f => f.endsWith('.geojson') && f !== 'chunk_index.json')
      .sort();
  }
  
  console.log(`\nFound ${chunkFiles.length} chunk files to import`);
  
  // For testing, only process first chunk
  const TEST_MODE = process.env.TEST_MODE === 'true';
  if (TEST_MODE) {
    console.log('\n🧪 TEST MODE: Processing only first chunk');
    chunkFiles = chunkFiles.slice(0, 1);
  }
  
  let totalImported = 0;
  const startTime = Date.now();
  
  // Determine chunks directory
  let chunksDir = CHUNKS_DIR;
  if (!fs.existsSync(chunksDir)) {
    const altPaths = [
      path.join(process.cwd(), 'data/parcels/chunks'),
      path.join(__dirname, '../data/parcels/chunks')
    ];
    for (const altPath of altPaths) {
      if (fs.existsSync(altPath)) {
        chunksDir = altPath;
        break;
      }
    }
  }
  
  for (let i = 0; i < chunkFiles.length; i++) {
    const imported = await importChunk(chunkFiles[i], i, chunkFiles.length, chunksDir);
    totalImported += imported;
  }
  
  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
  
  console.log('\n=== IMPORT COMPLETE ===');
  console.log(`Total imported: ${totalImported} parcels`);
  console.log(`Duration: ${duration} minutes`);
  
  // Verify
  const finalCount = await prisma.property.count();
  console.log(`Database now has: ${finalCount} properties`);
  
  // Show sample stats
  const absentee = await prisma.property.count({ where: { isAbsentee: true } });
  const delinquent = await prisma.property.count({ where: { isTaxDelinquent: true } });
  const vacant = await prisma.property.count({ where: { isVacantLand: true } });
  console.log(`\nStatistics:`);
  console.log(`  Absentee owners: ${absentee}`);
  console.log(`  Tax delinquent: ${delinquent}`);
  console.log(`  Vacant land: ${vacant}`);
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Import failed:', e);
  prisma.$disconnect();
  process.exit(1);
});

