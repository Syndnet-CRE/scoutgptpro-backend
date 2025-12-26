const { Pool } = require('pg');
const fs = require('fs');
const readline = require('readline');

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_XMN3fLJZ1tib@ep-rapid-wind-a4k9miff-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

const BATCH_SIZE = 1000;

async function main() {
  console.log('=== DIRECT PROPERTY TYPE UPDATE (NO TEMP TABLE) ===\n');
  
  const fileStream = fs.createReadStream('data/exports/property_types.csv');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  let lineCount = 0;
  let batch = [];
  let updated = 0;
  const startTime = Date.now();
  
  for await (const line of rl) {
    lineCount++;
    
    // Skip header
    if (lineCount === 1) {
      continue;
    }
    
    const [parcelId, propertyType, isVacantLand] = line.split(',');
    
    if (!parcelId || !propertyType) {
      continue;
    }
    
    // Convert boolean string to boolean
    const isVacant = isVacantLand === 't' || isVacantLand === 'true';
    
    batch.push({ parcelId, propertyType, isVacant });
    
    if (batch.length >= BATCH_SIZE) {
      try {
        // Update in batch
        const values = batch.map((_, i) => `($${i*3+1}, $${i*3+2}, $${i*3+3})`).join(',');
        const params = batch.flatMap(b => [b.parcelId, b.propertyType, b.isVacant]);
        
        // Use UPDATE with VALUES clause
        const updateQuery = `
          UPDATE properties p
          SET 
            "propertyType" = v.property_type,
            "isVacantLand" = v.is_vacant_land
          FROM (VALUES ${values}) AS v(parcel_id, property_type, is_vacant_land)
          WHERE p."parcelId" = v.parcel_id
        `;
        
        const result = await pool.query(updateQuery, params);
        updated += result.rowCount;
        
        const progress = Math.floor((lineCount / 352431) * 100);
        process.stdout.write(`\rProgress: ${progress}% | Updated: ${updated.toLocaleString()} | Processed: ${lineCount.toLocaleString()}`);
        
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
      const values = batch.map((_, i) => `($${i*3+1}, $${i*3+2}, $${i*3+3})`).join(',');
      const params = batch.flatMap(b => [b.parcelId, b.propertyType, b.isVacant]);
      const updateQuery = `
        UPDATE properties p
        SET 
          "propertyType" = v.property_type,
          "isVacantLand" = v.is_vacant_land
        FROM (VALUES ${values}) AS v(parcel_id, property_type, is_vacant_land)
        WHERE p."parcelId" = v.parcel_id
      `;
      const result = await pool.query(updateQuery, params);
      updated += result.rowCount;
    } catch (err) {
      console.error(`\nError processing final batch:`, err.message);
    }
  }
  
  const duration = (Date.now() - startTime) / 1000;
  console.log(`\n\n=== COMPLETE ===`);
  console.log(`Duration: ${duration.toFixed(2)} seconds`);
  console.log(`Updated: ${updated.toLocaleString()} properties`);
  
  await pool.end();
}

main().catch(console.error);
