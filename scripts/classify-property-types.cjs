const https = require('https');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:Syndnet$512@localhost:5432/scoutgpt_local'
});

const TCAD_URL = 'https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/TCAD_public/MapServer/0/query';
const BATCH_SIZE = 200;
const RATE_LIMIT_MS = 300;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchTCAD(propIds) {
  const where = `PROP_ID IN (${propIds.map(id => String(id)).join(',')})`;
  const url = `${TCAD_URL}?where=${encodeURIComponent(where)}&outFields=PROP_ID,state_cd,land_val,imprv_val,legal_desc&f=json`;
  
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function classifyPropertyType(stateCode, landVal, imprvVal, legalDesc, yearBuilt) {
  const code = (stateCode || '').toUpperCase().trim();
  const hasImprovements = imprvVal && parseFloat(imprvVal) > 0;
  const desc = (legalDesc || '').toUpperCase();
  const hasYearBuilt = yearBuilt && parseInt(yearBuilt) > 0;
  
  // Single Family Residential (A1, A2, etc.)
  if (code.startsWith('A') && code !== 'A0') {
    return 'Single Family';
  }
  
  // Multi-Family (B1, B2, etc.)
  if (code.startsWith('B')) {
    return 'Multi-Family';
  }
  
  // Vacant Land (C1, C0, etc.)
  if (code.startsWith('C') || code === 'A0') {
    return 'Vacant Land';
  }
  
  // Agricultural (D1, D2, etc.)
  if (code.startsWith('D')) {
    return 'Agricultural';
  }
  
  // Industrial (E1, etc.)
  if (code.startsWith('E')) {
    return 'Industrial';
  }
  
  // Commercial (F1, F2, etc.)
  if (code.startsWith('F')) {
    return 'Commercial';
  }
  
  // Mobile Home (M1, etc.)
  if (code.startsWith('M')) {
    return 'Mobile Home';
  }
  
  // Special Purpose (G, J, L, etc.)
  if (code.startsWith('G') || code.startsWith('J') || code.startsWith('L')) {
    return 'Special Purpose';
  }
  
  // Fallback: Use improvement value and year built
  if (hasImprovements) {
    if (desc.includes('CONDO') || desc.includes('UNIT') || desc.includes('APARTMENT')) {
      return 'Condo';
    }
    if (hasYearBuilt) {
      return 'Improved';
    }
    return 'Improved';
  }
  
  // Default to Vacant Land if no improvements
  return 'Vacant Land';
}

async function main() {
  console.log('=== PROPERTY TYPE CLASSIFICATION FROM TCAD ===\n');
  
  // Get properties that need classification
  const result = await pool.query(`
    SELECT "parcelId", "yearBuilt" FROM properties 
    WHERE "propertyType" IS NULL 
       OR "propertyType" = 'land'
    LIMIT 100000
  `);
  
  console.log(`Found ${result.rows.length} properties to classify\n`);
  
  let updated = 0;
  let errors = 0;
  const startTime = Date.now();
  
  for (let i = 0; i < result.rows.length; i += BATCH_SIZE) {
    const batch = result.rows.slice(i, i + BATCH_SIZE);
    const propIds = batch.map(r => r.parcel_id || r.parcelId);
    const yearBuiltMap = {};
    batch.forEach(r => {
      yearBuiltMap[r.parcel_id || r.parcelId] = r.yearBuilt || r.yearBuilt;
    });
    
    try {
      const tcadData = await fetchTCAD(propIds);
      
      if (tcadData.features && tcadData.features.length > 0) {
        for (const feature of tcadData.features) {
          const attrs = feature.attributes;
          const propId = String(attrs.PROP_ID);
          const propType = classifyPropertyType(
            attrs.state_cd,
            attrs.land_val,
            attrs.imprv_val,
            attrs.legal_desc,
            yearBuiltMap[propId]
          );
          
          await pool.query(
            `UPDATE properties SET "propertyType" = $1 WHERE "parcelId" = $2`,
            [propType, propId]
          );
          updated++;
        }
      }
      
      const progress = Math.floor((i / result.rows.length) * 100);
      process.stdout.write(`\rProgress: ${progress}% | Updated: ${updated} | Batch: ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(result.rows.length/BATCH_SIZE)}`);
      
      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      errors++;
      if (errors % 10 === 0) {
        console.log(`\nError count: ${errors}`);
      }
    }
  }
  
  const duration = (Date.now() - startTime) / 1000 / 60;
  
  console.log(`\n\n=== COMPLETE ===`);
  console.log(`Duration: ${duration.toFixed(2)} minutes`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors: ${errors}`);
  
  // Show new distribution
  const dist = await pool.query(`
    SELECT "propertyType", COUNT(*) as count 
    FROM properties 
    GROUP BY "propertyType" 
    ORDER BY count DESC
  `);
  
  console.log('\nNew property type distribution:');
  dist.rows.forEach(r => console.log(`  ${r.propertyType}: ${parseInt(r.count).toLocaleString()}`));
  
  await pool.end();
}

main().catch(console.error);
