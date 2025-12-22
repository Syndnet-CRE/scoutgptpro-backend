import shapefile from 'shapefile';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const LAND_PARCELS_SHP = 'data/shapefiles/land_parcels/stratmap24-landparcels_48453_travis_202404.shp';

async function main() {
  console.log('=== LAND PARCELS SHAPEFILE INVESTIGATION ===\n');
  
  const source = await shapefile.open(LAND_PARCELS_SHP);
  
  // Read first 5 records
  let count = 0;
  const samples = [];
  
  console.log('=== SAMPLE RECORDS (first 5) ===\n');
  
  while (count < 5) {
    const result = await source.read();
    if (result.done) break;
    
    samples.push(result.value);
    const props = result.value.properties;
    
    console.log(`--- Record ${count + 1} ---`);
    console.log('ALL FIELDS:');
    Object.keys(props).forEach(key => {
      const value = props[key];
      console.log(`  ${key}: ${value !== null && value !== undefined ? value : '(null)'}`);
    });
    
    console.log();
    count++;
  }
  
  // Analyze fields
  if (samples.length > 0) {
    const allFields = Object.keys(samples[0].properties);
    console.log('=== FIELD ANALYSIS ===\n');
    console.log(`Total fields: ${allFields.length}`);
    console.log('\nAll field names:');
    allFields.forEach((field, i) => {
      console.log(`  ${i + 1}. ${field}`);
    });
    
    // Look for parcel ID fields
    console.log('\n=== PARCEL ID FIELD CANDIDATES ===');
    const idFields = allFields.filter(f => 
      /id|parcel|pid|prop.*id|geo.*id/i.test(f)
    );
    idFields.forEach(field => {
      console.log(`  - ${field}`);
      if (samples[0].properties[field]) {
        console.log(`    Sample value: ${samples[0].properties[field]}`);
      }
    });
    
    // Check SITUS address fields
    console.log('\n=== SITUS ADDRESS FIELDS ===');
    const situsFields = allFields.filter(f => /situs/i.test(f));
    situsFields.forEach(field => {
      console.log(`  - ${field}`);
      const sampleValues = samples.map(s => s.properties[field]).filter(v => v);
      if (sampleValues.length > 0) {
        console.log(`    Sample values: ${sampleValues.slice(0, 3).join(', ')}`);
      } else {
        console.log(`    (all null in samples)`);
      }
    });
  }
  
  // Count records with SITUS_ADDR
  console.log('\n=== COUNTING RECORDS WITH SITUS_ADDR ===');
  const source2 = await shapefile.open(LAND_PARCELS_SHP);
  let total = 0;
  let withSitusAddr = 0;
  let withPropId = 0;
  
  while (true) {
    const result = await source2.read();
    if (result.done) break;
    
    total++;
    const props = result.value.properties;
    
    if (props.SITUS_ADDR && props.SITUS_ADDR.trim()) {
      withSitusAddr++;
    }
    
    if (props.Prop_ID || props.PROP_ID || props.Parcel_ID || props.PARCEL_ID) {
      withPropId++;
    }
    
    if (total % 50000 === 0) {
      process.stdout.write(`\rProcessed: ${total.toLocaleString()} | With SITUS_ADDR: ${withSitusAddr.toLocaleString()} | With Prop_ID: ${withPropId.toLocaleString()}`);
    }
  }
  
  console.log(`\n\nTotal records: ${total.toLocaleString()}`);
  console.log(`Records with SITUS_ADDR: ${withSitusAddr.toLocaleString()} (${Math.round(withSitusAddr/total*100)}%)`);
  console.log(`Records with Prop_ID: ${withPropId.toLocaleString()} (${Math.round(withPropId/total*100)}%)`);
  
  // Compare to database
  console.log('\n=== DATABASE PARCEL ID SAMPLES ===');
  const dbSamples = await prisma.property.findMany({
    take: 10,
    select: {
      parcelId: true,
      address: true
    }
  });
  
  dbSamples.forEach((prop, i) => {
    console.log(`${i + 1}. Parcel ID: "${prop.parcelId}" | Address: ${prop.address || 'N/A'}`);
  });
  
  // Check if formats match
  if (samples.length > 0 && dbSamples.length > 0) {
    const shapefileId = samples[0].properties.Prop_ID || samples[0].properties.PROP_ID || samples[0].properties.Parcel_ID || samples[0].properties.PARCEL_ID;
    const dbId = dbSamples[0].parcelId;
    
    console.log('\n=== FORMAT COMPARISON ===');
    console.log(`Shapefile ID sample: "${shapefileId}"`);
    console.log(`Database ID sample: "${dbId}"`);
    console.log(`Shapefile ID type: ${typeof shapefileId}, length: ${String(shapefileId || '').length}`);
    console.log(`Database ID type: ${typeof dbId}, length: ${dbId.length}`);
    
    if (shapefileId && dbId) {
      // Try to see if they match when converted
      const shapefileIdStr = String(shapefileId);
      const dbIdStr = String(dbId);
      
      if (shapefileIdStr === dbIdStr) {
        console.log('✅ IDs match exactly!');
      } else if (shapefileIdStr.replace(/^0+/, '') === dbIdStr.replace(/^0+/, '')) {
        console.log('⚠️  IDs match after removing leading zeros');
      } else if (shapefileIdStr.includes(dbIdStr) || dbIdStr.includes(shapefileIdStr)) {
        console.log('⚠️  IDs partially match (one contains the other)');
      } else {
        console.log('❌ IDs do not match - different formats');
      }
    }
  }
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Error:', e);
  prisma.$disconnect();
  process.exit(1);
});
