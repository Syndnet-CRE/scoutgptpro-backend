const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:Syndnet$512@localhost:5432/scoutgpt_local'
});

function classifyPropertyType(avmValue, siteAddress, legalDesc, acres) {
  const addr = (siteAddress || '').toUpperCase();
  const desc = (legalDesc || '').toUpperCase();
  const value = parseFloat(avmValue) || 0;
  
  // Check for commercial indicators
  if (addr.includes('BLVD') && value > 500000) {
    return 'Commercial';
  }
  if (addr.includes('HWY') || addr.includes('HIGHWAY')) {
    return 'Commercial';
  }
  if (desc.includes('COMMERCIAL') || desc.includes('RETAIL')) {
    return 'Commercial';
  }
  
  // Check for multi-family indicators
  if (addr.includes('APT') || addr.includes('APARTMENT') || addr.includes('UNIT')) {
    return 'Multi-Family';
  }
  if (desc.includes('CONDO') || desc.includes('CONDOMINIUM')) {
    return 'Condo';
  }
  
  // Check for mobile home
  if (addr.includes('MOBILE') || addr.includes('TRAILER') || desc.includes('MOBILE')) {
    return 'Mobile Home';
  }
  
  // Large acreage = likely agricultural or vacant
  if (acres && parseFloat(acres) > 5) {
    if (value < 100000) {
      return 'Agricultural';
    }
    return 'Vacant Land';
  }
  
  // High value with address = likely improved residential
  if (value > 200000 && siteAddress) {
    return 'Single Family';
  }
  
  // Medium value = likely improved
  if (value > 100000 && siteAddress) {
    return 'Single Family';
  }
  
  // Low value or no address = vacant land
  if (value < 50000 || !siteAddress) {
    return 'Vacant Land';
  }
  
  // Default based on value
  if (value > 0) {
    return 'Single Family';
  }
  
  return 'Vacant Land';
}

async function main() {
  console.log('=== PROPERTY TYPE CLASSIFICATION ===\n');
  
  // Get all properties
  const result = await pool.query(`
    SELECT "parcelId", "avm_value", "siteAddress", "legalDesc", acres
    FROM properties
    WHERE "propertyType" IS NULL OR "propertyType" = 'land'
  `);
  
  console.log(`Found ${result.rows.length} properties to classify\n`);
  
  let updated = 0;
  const startTime = Date.now();
  
  for (const row of result.rows) {
    const propType = classifyPropertyType(
      row.avm_value,
      row.siteAddress,
      row.legalDesc,
      row.acres
    );
    
    await pool.query(
      `UPDATE properties SET "propertyType" = $1 WHERE "parcelId" = $2`,
      [propType, row.parcelId]
    );
    
    updated++;
    
    if (updated % 10000 === 0) {
      const progress = Math.floor((updated / result.rows.length) * 100);
      process.stdout.write(`\rProgress: ${progress}% | Updated: ${updated.toLocaleString()}`);
    }
  }
  
  const duration = (Date.now() - startTime) / 1000;
  
  console.log(`\n\n=== COMPLETE ===`);
  console.log(`Duration: ${duration.toFixed(2)} seconds`);
  console.log(`Updated: ${updated.toLocaleString()}`);
  
  // Show new distribution
  const dist = await pool.query(`
    SELECT "propertyType", COUNT(*) as count,
      ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM properties)::numeric * 100, 2) as pct
    FROM properties 
    GROUP BY "propertyType" 
    ORDER BY count DESC
  `);
  
  console.log('\nNew property type distribution:');
  dist.rows.forEach(r => {
    console.log(`  ${r.propertyType}: ${parseInt(r.count).toLocaleString()} (${r.pct}%)`);
  });
  
  await pool.end();
}

main().catch(console.error);
