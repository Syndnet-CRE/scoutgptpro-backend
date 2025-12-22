import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';

const prisma = new PrismaClient();

const TCAD_FILE = '/Users/braydonirwin/Downloads/TaxCurOpenData (1).csv';
const UPDATE_BATCH_SIZE = 100; // Update database in smaller batches

// Normalize address for matching
function normalizeAddress(addr) {
  if (!addr) return '';
  return addr.trim().toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,]/g, '')
    .replace(/\bST\b/g, 'STREET')
    .replace(/\bAVE\b/g, 'AVENUE')
    .replace(/\bRD\b/g, 'ROAD')
    .replace(/\bBLVD\b/g, 'BOULEVARD')
    .replace(/\bLN\b/g, 'LANE')
    .replace(/\bDR\b/g, 'DRIVE');
}

// Check if ADDRESS1 is valid (not empty, not just a business name)
function isValidSiteAddress(address) {
  if (!address || address.trim() === '') return false;
  
  const addr = address.trim().toUpperCase();
  
  // Skip if it's clearly not a street address
  const invalidPatterns = [
    /^%/,                          // Starts with % (care of)
    /^C\/O/,                       // Care of
    /^ATTN/,                       // Attention
    /^PO BOX/,                     // PO Box
    /^P\.?O\.? BOX/,
  ];
  
  for (const pattern of invalidPatterns) {
    if (pattern.test(addr)) return false;
  }
  
  // Should contain a number (street number) - but be more lenient
  if (!/\d/.test(addr)) return false;
  
  // Should be reasonably long
  if (addr.length < 5) return false;
  
  return true;
}

async function processBatch(batch, stats) {
  for (const update of batch) {
    try {
      // First try to match by parcel ID
      let result = await prisma.property.updateMany({
        where: { parcelId: update.parcelId },
        data: {
          siteAddress: update.siteAddress,
          siteCity: update.siteCity,
          siteState: update.siteState,
          siteZip: update.siteZip
        }
      });
      
      if (result.count > 0) {
        stats.updated++;
        continue;
      }
      
      // If no match by parcel ID, try matching by address
      // Normalize the database address for comparison
      const dbProperties = await prisma.property.findMany({
        where: {
          address: { not: null },
          siteAddress: null // Only update if siteAddress is not already set
        },
        take: 1000 // Limit search scope
      });
      
      // Try to find a match by normalized address
      let matched = false;
      for (const prop of dbProperties) {
        const dbAddrNorm = normalizeAddress(prop.address || '');
        if (dbAddrNorm && update.normalizedAddress) {
          // Check if addresses are similar (contains key parts)
          const dbParts = dbAddrNorm.split(' ').filter(p => p.length > 2);
          const csvParts = update.normalizedAddress.split(' ').filter(p => p.length > 2);
          
          // If we have matching street number and some street name parts
          const dbStreetNum = dbParts.find(p => /^\d+$/.test(p));
          const csvStreetNum = csvParts.find(p => /^\d+$/.test(p));
          
          if (dbStreetNum === csvStreetNum && dbStreetNum) {
            // Check if at least 2 other parts match
            const matchingParts = dbParts.filter(p => csvParts.includes(p));
            if (matchingParts.length >= 2) {
              // Found a match by address!
              await prisma.property.update({
                where: { id: prop.id },
                data: {
                  siteAddress: update.siteAddress,
                  siteCity: update.siteCity,
                  siteState: update.siteState,
                  siteZip: update.siteZip
                }
              });
              stats.updated++;
              matched = true;
              break;
            }
          }
        }
      }
      
      if (!matched) {
        stats.notFound++;
      }
    } catch (error) {
      stats.skipped++;
    }
  }
}

async function main() {
  console.log('=== TCAD ENRICHMENT SCRIPT ===\n');
  
  // Check if file exists
  if (!fs.existsSync(TCAD_FILE)) {
    console.error('TCAD file not found:', TCAD_FILE);
    process.exit(1);
  }
  
  const stats = {
    updated: 0,
    skipped: 0,
    notFound: 0,
    invalidAddress: 0,
    totalProcessed: 0
  };
  
  let updateBatch = [];
  let processing = false;
  
  return new Promise((resolve, reject) => {
    const parser = parse({
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_column_count: true,
      highWaterMark: 64 * 1024 // Smaller buffer
    });
    
    const stream = createReadStream(TCAD_FILE, { highWaterMark: 64 * 1024 })
      .pipe(parser);
    
    parser.on('readable', function() {
      let record;
      while ((record = parser.read()) !== null) {
        stats.totalProcessed++;
        
        const parcelId = (record.PARCEL || record['PARCEL'] || '').trim();
        const address1 = (record.ADDRESS1 || '').trim();
        const city = (record.CITY || '').trim();
        const state = (record.STATE || '').trim();
        const zipcode = (record.ZIPCODE || '').trim();
        
        if (!parcelId) {
          stats.skipped++;
          continue;
        }
        
        // Only update if we have a valid site address
        if (!isValidSiteAddress(address1)) {
          stats.invalidAddress++;
          continue;
        }
        
        updateBatch.push({
          parcelId,
          siteAddress: address1,
          siteCity: city || null,
          siteState: state || null,
          siteZip: zipcode || null
        });
        
        // Process batch when it reaches size
        if (updateBatch.length >= UPDATE_BATCH_SIZE && !processing) {
          processing = true;
          processBatch(updateBatch, stats).then(() => {
            updateBatch = [];
            processing = false;
          });
        }
        
        // Progress update every 5000 records
        if (stats.totalProcessed % 5000 === 0) {
          process.stdout.write(`\rProcessed: ${stats.totalProcessed.toLocaleString()} | Updated: ${stats.updated.toLocaleString()} | Invalid: ${stats.invalidAddress.toLocaleString()} | Not found: ${stats.notFound.toLocaleString()}`);
        }
      }
    });
    
    parser.on('end', async () => {
      // Wait for any pending batch processing
      while (processing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Process remaining batch
      if (updateBatch.length > 0) {
        await processBatch(updateBatch, stats);
      }
      
      console.log('\n\n=== ENRICHMENT COMPLETE ===');
      console.log(`Total TCAD records processed: ${stats.totalProcessed.toLocaleString()}`);
      console.log(`Updated in database: ${stats.updated.toLocaleString()}`);
      console.log(`Invalid addresses skipped: ${stats.invalidAddress.toLocaleString()}`);
      console.log(`Parcel not found in DB: ${stats.notFound.toLocaleString()}`);
      console.log(`Other skipped: ${stats.skipped.toLocaleString()}`);
      
      // Verify
      const withSiteAddress = await prisma.property.count({
        where: { siteAddress: { not: null } }
      });
      console.log(`\nProperties with site address: ${withSiteAddress.toLocaleString()}`);
      
      await prisma.$disconnect();
      resolve();
    });
    
    parser.on('error', (err) => {
      console.error('Parser error:', err);
      reject(err);
    });
  });
}

main().catch(e => {
  console.error('Enrichment failed:', e);
  prisma.$disconnect();
  process.exit(1);
});

