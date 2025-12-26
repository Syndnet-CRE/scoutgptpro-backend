const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_XMN3fLJZ1tib@ep-rapid-wind-a4k9miff-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

const BATCH_SIZE = 10000;

async function main() {
  console.log('=== BATCHED PROPERTY TYPE UPDATE ===\n');
  
  // Get total count from temp table
  const countResult = await pool.query('SELECT COUNT(*) as total FROM temp_prop_types');
  const total = parseInt(countResult.rows[0].total);
  console.log(`Total properties to update: ${total.toLocaleString()}\n`);
  
  let updated = 0;
  const startTime = Date.now();
  
  // Update in batches
  for (let offset = 0; offset < total; offset += BATCH_SIZE) {
    try {
      const result = await pool.query(`
        UPDATE properties p
        SET 
          "propertyType" = t.property_type,
          "isVacantLand" = (t.is_vacant_land = 'true')
        FROM (
          SELECT parcel_id, property_type, is_vacant_land
          FROM temp_prop_types
          ORDER BY parcel_id
          LIMIT $1 OFFSET $2
        ) t
        WHERE p."parcelId" = t.parcel_id
      `, [BATCH_SIZE, offset]);
      
      updated += result.rowCount;
      const progress = Math.floor((updated / total) * 100);
      const elapsed = (Date.now() - startTime) / 1000;
      
      process.stdout.write(`\rProgress: ${progress}% | Updated: ${updated.toLocaleString()} / ${total.toLocaleString()} | Time: ${elapsed.toFixed(1)}s`);
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      console.error(`\nError at offset ${offset}:`, err.message);
      // Continue with next batch
    }
  }
  
  const duration = (Date.now() - startTime) / 1000;
  console.log(`\n\n=== COMPLETE ===`);
  console.log(`Duration: ${duration.toFixed(2)} seconds`);
  console.log(`Updated: ${updated.toLocaleString()} properties`);
  
  await pool.end();
}

main().catch(console.error);
