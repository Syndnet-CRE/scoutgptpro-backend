import shapefile from 'shapefile';

async function inspectShapefile(path, name) {
  console.log(`\n=== ${name} ===`);
  console.log(`Path: ${path}`);
  
  try {
    const source = await shapefile.open(path);
    let count = 0;
    let samples = [];
    
    while (count < 3) {
      const result = await source.read();
      if (result.done) break;
      samples.push(result.value);
      count++;
    }
    
    if (samples.length > 0) {
      console.log('\nFields found:');
      const fields = Object.keys(samples[0].properties);
      fields.forEach((key, i) => {
        console.log(`  ${i + 1}. ${key}: ${samples[0].properties[key]}`);
      });
      
      console.log('\nGeometry type:', samples[0].geometry?.type);
      
      if (samples[0].geometry?.coordinates) {
        const coords = samples[0].geometry.coordinates;
        if (samples[0].geometry.type === 'Point') {
          console.log('Sample coordinates:', coords);
        } else if (samples[0].geometry.type === 'Polygon') {
          console.log('Sample centroid area:', coords[0]?.slice(0, 2));
        }
      }
    }
    
    // Count total records
    const source2 = await shapefile.open(path);
    let total = 0;
    while (true) {
      const result = await source2.read();
      if (result.done) break;
      total++;
      if (total % 100000 === 0) process.stdout.write(`\rCounting: ${total.toLocaleString()}`);
    }
    console.log(`\nTotal records: ${total.toLocaleString()}`);
    
  } catch (e) {
    console.log('Error:', e.message);
  }
}

async function main() {
  await inspectShapefile(
    'data/shapefiles/address_points/stratmap24-addresspoints_48453_travis_202402.shp',
    'ADDRESS POINTS'
  );
  
  await inspectShapefile(
    'data/shapefiles/land_parcels/stratmap24-landparcels_48453_travis_202404.shp',
    'LAND PARCELS'
  );
}

main().catch(console.error);
