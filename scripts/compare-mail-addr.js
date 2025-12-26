import shapefile from 'shapefile';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const LAND_PARCELS_SHP = 'data/shapefiles/land_parcels/stratmap24-landparcels_48453_travis_202404.shp';

async function main() {
  console.log('=== COMPARING LAND PARCELS MAIL_ADDR vs DATABASE ADDRESS ===\n');
  
  const source = await shapefile.open(LAND_PARCELS_SHP);
  
  // Get 5 records with Prop_IDs that exist in database
  const samples = [];
  let count = 0;
  
  while (samples.length < 5 && count < 100) {
    const result = await source.read();
    if (result.done) break;
    
    const props = result.value.properties;
    const propId = String(props.Prop_ID);
    
    // Check if this Prop_ID exists in database
    const dbProperty = await prisma.property.findUnique({
      where: { parcelId: propId },
      select: {
        parcelId: true,
        address: true,
        city: true,
        zip: true,
        siteAddress: true
      }
    });
    
    if (dbProperty) {
      samples.push({
        propId,
        shapefile: {
          mailAddr: props.MAIL_ADDR || null,
          mailCity: props.MAIL_CITY || null,
          mailZip: props.MAIL_ZIP || null,
          situsAddr: props.SITUS_ADDR || null,
          situsCity: props.SITUS_CITY || null,
          situsZip: props.SITUS_ZIP || null
        },
        database: dbProperty
      });
    }
    
    count++;
  }
  
  console.log(`Found ${samples.length} matching records\n`);
  
  let sameCount = 0;
  let differentCount = 0;
  
  samples.forEach((sample, i) => {
    console.log(`--- Record ${i + 1} ---`);
    console.log(`Prop_ID: ${sample.propId}`);
    console.log();
    
    // Shapefile data
    console.log('SHAPEFILE:');
    console.log(`  MAIL_ADDR: ${sample.shapefile.mailAddr || '(null)'}`);
    console.log(`  MAIL_CITY: ${sample.shapefile.mailCity || '(null)'}`);
    console.log(`  MAIL_ZIP: ${sample.shapefile.mailZip || '(null)'}`);
    console.log(`  SITUS_ADDR: ${sample.shapefile.situsAddr || '(null)'}`);
    console.log(`  SITUS_CITY: ${sample.shapefile.situsCity || '(null)'}`);
    console.log(`  SITUS_ZIP: ${sample.shapefile.situsZip || '(null)'}`);
    console.log();
    
    // Database data
    console.log('DATABASE:');
    console.log(`  address: ${sample.database.address || '(null)'}`);
    console.log(`  city: ${sample.database.city || '(null)'}`);
    console.log(`  zip: ${sample.database.zip || '(null)'}`);
    console.log(`  siteAddress: ${sample.database.siteAddress || '(null)'}`);
    console.log();
    
    // Compare
    const shapefileAddr = (sample.shapefile.mailAddr || '').trim().toUpperCase();
    const dbAddr = (sample.database.address || '').trim().toUpperCase();
    
    // Normalize for comparison (remove extra spaces, commas)
    const normalize = (str) => str.replace(/\s+/g, ' ').replace(/,/g, '').trim();
    const shapefileNorm = normalize(shapefileAddr);
    const dbNorm = normalize(dbAddr);
    
    // Check if they match (allowing for minor differences)
    const match = shapefileNorm === dbNorm || 
                  shapefileNorm.includes(dbNorm.slice(0, 20)) ||
                  dbNorm.includes(shapefileNorm.slice(0, 20));
    
    if (match) {
      console.log('✅ MATCH: Shapefile MAIL_ADDR matches database address');
      sameCount++;
    } else {
      console.log('❌ DIFFERENT: Shapefile MAIL_ADDR does NOT match database address');
      console.log(`   Shapefile normalized: "${shapefileNorm}"`);
      console.log(`   Database normalized: "${dbNorm}"`);
      differentCount++;
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
  });
  
  console.log('=== SUMMARY ===');
  console.log(`Total compared: ${samples.length}`);
  console.log(`Same: ${sameCount}`);
  console.log(`Different: ${differentCount}`);
  
  if (differentCount > sameCount) {
    console.log('\n✅ CONCLUSION: Shapefile MAIL_ADDR appears to be SITE ADDRESS');
    console.log('   (Different from database mailing address)');
    console.log('   Recommendation: Use MAIL_ADDR as siteAddress');
  } else if (sameCount > differentCount) {
    console.log('\n⚠️  CONCLUSION: Shapefile MAIL_ADDR matches database address');
    console.log('   (Same as database mailing address)');
    console.log('   Recommendation: Need Address Points for site addresses');
  } else {
    console.log('\n⚠️  CONCLUSION: Mixed results - need more investigation');
  }
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Error:', e);
  prisma.$disconnect();
  process.exit(1);
});




