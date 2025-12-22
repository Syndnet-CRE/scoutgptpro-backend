const shapefile = require('shapefile');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

const ADDRESS_POINTS_SHP = 'data/shapefiles/address_points/stratmap24-addresspoints_48453_travis_202402.shp';

async function main() {
  console.log('=== COORDINATE SYSTEM DIAGNOSTIC ===\n');
  
  // Read shapefile PRJ file to get coordinate system
  const prjPath = ADDRESS_POINTS_SHP.replace('.shp', '.prj');
  let prjContent = null;
  try {
    prjContent = fs.readFileSync(prjPath, 'utf-8');
    console.log('=== SHAPEFILE PROJECTION INFO ===');
    console.log(prjContent);
    console.log();
  } catch (e) {
    console.log('⚠️  Could not read .prj file:', e.message);
  }
  
  // Read first 5 records from shapefile
  console.log('=== SHAPEFILE COORDINATES (first 5 records) ===');
  const source = await shapefile.open(ADDRESS_POINTS_SHP);
  
  let count = 0;
  const shapefileCoords = [];
  
  while (count < 5) {
    const result = await source.read();
    if (result.done) break;
    
    const props = result.value.properties;
    const geometry = result.value.geometry;
    
    if (geometry && geometry.type === 'Point') {
      const coords = geometry.coordinates;
      shapefileCoords.push({
        address: props.Full_Addr || 'N/A',
        coords: coords,
        x: coords[0],
        y: coords[1]
      });
      
      console.log(`\nRecord ${count + 1}:`);
      console.log(`  Address: ${props.Full_Addr || 'N/A'}`);
      console.log(`  Coordinates: [${coords[0]}, ${coords[1]}]`);
      console.log(`  X (longitude-like): ${coords[0]}`);
      console.log(`  Y (latitude-like): ${coords[1]}`);
      
      count++;
    }
  }
  
  // Analyze coordinate ranges
  console.log('\n=== COORDINATE RANGE ANALYSIS ===');
  const xValues = shapefileCoords.map(c => c.x);
  const yValues = shapefileCoords.map(c => c.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  
  console.log(`X range: ${minX} to ${maxX}`);
  console.log(`Y range: ${minY} to ${maxY}`);
  
  // Detect coordinate system
  if (Math.abs(minX) > 1000 || Math.abs(maxX) > 1000) {
    console.log('\n⚠️  DETECTED: Projected coordinate system (State Plane or UTM)');
    console.log('   X/Y values are in meters/feet, not degrees');
    console.log('   Need to reproject to WGS84 (EPSG:4326)');
  } else if (minX >= -98 && maxX <= -97 && minY >= 29 && maxY <= 31) {
    console.log('\n✅ DETECTED: WGS84 (lat/lng in degrees)');
    console.log('   Coordinates are already in correct format');
  } else {
    console.log('\n⚠️  UNKNOWN: Coordinate system unclear');
    console.log('   May need manual investigation');
  }
  
  // Query database coordinates
  console.log('\n=== DATABASE COORDINATES (5 random properties) ===');
  const dbProperties = await prisma.property.findMany({
    where: {
      latitude: { not: null },
      longitude: { not: null }
    },
    take: 5,
    select: {
      parcelId: true,
      address: true,
      latitude: true,
      longitude: true
    }
  });
  
  dbProperties.forEach((prop, i) => {
    console.log(`\nProperty ${i + 1}:`);
    console.log(`  Parcel ID: ${prop.parcelId}`);
    console.log(`  Address: ${prop.address || 'N/A'}`);
    console.log(`  Latitude: ${prop.latitude}`);
    console.log(`  Longitude: ${prop.longitude}`);
    console.log(`  As array: [${prop.longitude}, ${prop.latitude}]`);
  });
  
  // Compare ranges
  const dbLats = dbProperties.map(p => p.latitude);
  const dbLngs = dbProperties.map(p => p.longitude);
  const dbMinLat = Math.min(...dbLats);
  const dbMaxLat = Math.max(...dbLats);
  const dbMinLng = Math.min(...dbLngs);
  const dbMaxLng = Math.max(...dbLngs);
  
  console.log('\n=== DATABASE COORDINATE RANGES ===');
  console.log(`Latitude range: ${dbMinLat} to ${dbMaxLat}`);
  console.log(`Longitude range: ${dbMinLng} to ${dbMaxLng}`);
  
  // Try to find a match
  console.log('\n=== ATTEMPTING TO FIND MATCH ===');
  if (shapefileCoords.length > 0 && dbProperties.length > 0) {
    const shapeCoord = shapefileCoords[0];
    const dbProp = dbProperties[0];
    
    console.log(`\nShapefile coord: [${shapeCoord.x}, ${shapeCoord.y}]`);
    console.log(`Database coord: [${dbProp.longitude}, ${dbProp.latitude}]`);
    
    // Check if they're in same system
    const xDiff = Math.abs(shapeCoord.x - dbProp.longitude);
    const yDiff = Math.abs(shapeCoord.y - dbProp.latitude);
    
    console.log(`\nDifference: X=${xDiff}, Y=${yDiff}`);
    
    if (xDiff > 1000 || yDiff > 1000) {
      console.log('⚠️  Large difference detected - coordinate systems likely differ');
      console.log('   Shapefile needs reprojection to WGS84');
    } else {
      console.log('✅ Coordinates are in similar range');
      console.log('   May just need tolerance adjustment or coordinate order fix');
    }
  }
  
  // Check if we need proj4
  if (prjContent) {
    console.log('\n=== PROJECTION CONVERSION NEEDED ===');
    if (prjContent.includes('State Plane') || prjContent.includes('NAD83') || prjContent.includes('EPSG:2276') || prjContent.includes('EPSG:2277')) {
      console.log('✅ Detected State Plane Texas Central (EPSG:2276 or 2277)');
      console.log('   Need to convert to WGS84 (EPSG:4326)');
      console.log('   Proj4 string for State Plane Texas Central: +proj=lcc +lat_1=30.28333333333333 +lat_2=31.88333333333333 +lat_0=30.0 +lon_0=-99.0 +x_0=700000 +y_0=3000000 +datum=NAD83 +units=m +no_defs');
    }
  }
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Error:', e);
  prisma.$disconnect();
  process.exit(1);
});
