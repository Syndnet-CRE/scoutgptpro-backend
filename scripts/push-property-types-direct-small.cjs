const { Pool } = require('pg');
const fs = require('fs');
const readline = require('readline');

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_XMN3fLJZ1tib@ep-rapid-wind-a4k9miff-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

const BATCH_SIZE = 100;

async function main() {
  console.log('=== DIRECT UPDATE (NO TEMP TABLE) ===\n');
  
  const fileStream = fs.createReadStream('data/exports/property_types.csv');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  let lineCount = 0;
  let batch = [];
  let updated = 0;
  let skipped = 0;
  const startTime = Date.now();
  
  for await (const line of rl) {
    lineCount++;
    
    // Skip header
    if (lineCount === 1) {
      continue;
    }
    
    const [parcelId, propertyType, isVacantLandStr] = line.split(',');
    
    if (!parcelId || !propertyType) {
      continue;
    }
    
    // Only update if not "land" (skip already updated ones)
    if (propertyType === 'land') {
      skipped++;
      continue;
    }
    
    const isVacant = isVacantLandStr === 'true';
    
    batch.push({ parcelId, propertyType, isVacant });
    
    if (batch.length >= BATCH_SIZE) {
      try {
        // Update in small batches
        for (const item of batch) {
          await pool.query(`
            UPDATE properties
            SET 
              "propertyType" = $1,
              "isVacantLand" = $2
            WHERE "parcelId" = $3
              AND ("propertyType" IS NULL OR "propertyType" = 'land')
          `, [item.propertyType, item.isVacant, item.parcelId]);
          updated++;
        }
        
        const progress = Math.floor((lineCount / 352431) * 100);
        process.stdout.write(`\rProgress: ${progress}% | Updated: ${updated.toLocaleString()} | Skipped: ${skipped.toLocaleString()}`);
        
        batch = [];
        
        // Small delay
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (err) {
        console.error(`\nError at line ${lineCount}:`, err.message);
        batch = [];
      }
    }
  }
  
  // Process remaining batch
  if (batch.length > 0) {
    try {
      for (const item of batch) {
        await pool.query(`
          UPDATE properties
          SET 
            "propertyType" = $1,
            "isVacantLand" = $2
          WHERE "parcelId" = $3
            AND ("propertyType" IS NULL OR "propertyType" = 'land')
        `, [item.propertyType, item.isVacant, item.parcelId]);
        updated++;
      }
    } catch (err) {
      console.error(`\nError processing final batch:`, err.message);
    }
  }
  
  const duration = (Date.now() - startTime) / 1000;
  console.log(`\n\n=== COMPLETE ===`);
  console.log(`Duration: ${duration.toFixed(2)} seconds`);
  console.log(`Updated: ${updated.toLocaleString()} properties`);
  console.log(`Skipped: ${skipped.toLocaleString()} (already 'land')`);
  
  await pool.end();
}

main().catch(console.error);
