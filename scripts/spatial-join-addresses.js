// Spatial join script to match address points to parcels and update database
import shapefile from 'shapefile';
import * as turf from '@turf/turf';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== SPATIAL JOIN: ADDRESS POINTS TO PARCELS ===\n');
  
  // Load all address points into memory with their coordinates
  console.log('Loading address points...');
  const addressPoints = [];
  const addressSource = await shapefile.open('data/shapefiles/address_points/stratmap24-addresspoints_48453_travis_202402.shp');
  
  let addrCount = 0;
  while (true) {
    const result = await addressSource.read();
    if (result.done) break;
    
    const coords = result.value.geometry.coordinates;
    const props = result.value.properties;
    
    // Only add if we have coordinates and address
    if (coords && coords.length === 2 && props.Full_Addr) {
      addressPoints.push({
        point: turf.point(coords),
        address: props.Full_Addr?.trim(),
        city: props.Post_Comm?.trim(),
        zip: props.Post_Code?.toString().substring(0, 5)?.trim()
      });
    }
    
    addrCount++;
    if (addrCount % 50000 === 0) {
      process.stdout.write(`\rLoaded ${addrCount.toLocaleString()} address points...`);
    }
  }
  
  console.log(`\rLoaded ${addressPoints.length.toLocaleString()} address points (from ${addrCount.toLocaleString()} total)`);
  
  // Process parcels
  console.log('\nProcessing parcels...');
  const parcelSource = await shapefile.open('data/shapefiles/land_parcels/stratmap24-landparcels_48453_travis_202404.shp');
  
  let processed = 0;
  let matched = 0;
  let notFound = 0;
  let skipped = 0;
  let batchUpdates = [];
  
  while (true) {
    const result = await parcelSource.read();
    if (result.done) break;
    
    const propId = result.value.properties.Prop_ID?.toString();
    const parcelGeom = result.value.geometry;
    
    if (!propId || !parcelGeom || !parcelGeom.coordinates) {
      skipped++;
      processed++;
      continue;
    }
    
    // Convert parcel geometry to turf polygon
    // Parcels are in Web Mercator, need to convert to WGS84
    let parcelPolygon;
    try {
      let coords;
      
      // Handle MultiPolygon or Polygon
      if (parcelGeom.type === 'MultiPolygon') {
        // Use first polygon from MultiPolygon and convert coordinates
        coords = convertPolygonCoords(parcelGeom.coordinates[0]);
        parcelPolygon = turf.polygon(coords);
      } else if (parcelGeom.type === 'Polygon') {
        // Convert coordinates from Web Mercator to WGS84
        coords = convertPolygonCoords(parcelGeom.coordinates);
        parcelPolygon = turf.polygon(coords);
      } else {
        skipped++;
        processed++;
        continue;
      }
    } catch (e) {
      skipped++;
      processed++;
      continue;
    }
    
    // Get bounding box for quick filtering
    const bbox = turf.bbox(parcelPolygon);
    
    // Find address points within this parcel
    let matchedAddress = null;
    for (const ap of addressPoints) {
      const coords = ap.point.geometry.coordinates;
      
      // Quick bounding box check first (much faster)
      if (coords[0] < bbox[0] || coords[0] > bbox[2] || 
          coords[1] < bbox[1] || coords[1] > bbox[3]) {
        continue;
      }
      
      // Precise point-in-polygon check
      try {
        if (turf.booleanPointInPolygon(ap.point, parcelPolygon)) {
          matchedAddress = ap;
          break; // Take first match
        }
      } catch (e) {
        // Skip if geometry error
        continue;
      }
    }
    
    // Check if parcel exists in database before adding to batch
    const existsInDb = await prisma.property.findUnique({
      where: { parcelId: propId },
      select: { id: true }
    });
    
    if (matchedAddress) {
      if (existsInDb) {
        batchUpdates.push({
          parcelId: propId,
          siteAddress: matchedAddress.address,
          siteCity: matchedAddress.city,
          siteZip: matchedAddress.zip,
          siteState: 'TX'
        });
        matched++;
        
        // Debug first few matches
        if (matched <= 3) {
          console.log(`\n✅ Match #${matched}:`);
          console.log(`   Parcel ID: ${propId}`);
          console.log(`   Address: ${matchedAddress.address}`);
          console.log(`   City: ${matchedAddress.city}`);
          console.log(`   ZIP: ${matchedAddress.zip}`);
        }
      } else {
        // Address found but parcel not in database
        notFound++;
      }
    } else {
      // No address match
      if (existsInDb) {
        // Parcel in DB but no address point found
        notFound++;
      } else {
        // Parcel not in DB and no address
        skipped++;
      }
    }
    
    processed++;
    
    // Batch update every 500 records
    if (batchUpdates.length >= 500) {
      await updateDatabase(batchUpdates);
      batchUpdates = [];
    }
    
    // Progress log every 1000 (more frequent for test)
    if (processed % 1000 === 0) {
      const pct = processed > 0 ? ((matched / processed) * 100).toFixed(1) : '0.0';
      console.log(`Processed: ${processed.toLocaleString()} | Matched: ${matched.toLocaleString()} (${pct}%) | Not found: ${notFound.toLocaleString()} | Skipped: ${skipped.toLocaleString()}`);
    }
    
    // TEST MODE: Only process first 100 parcels
    if (processed >= 100) {
      console.log('\n⚠️  TEST MODE: Processing only first 100 parcels');
      break;
    }
  }
  
  // Final batch
  if (batchUpdates.length > 0) {
    await updateDatabase(batchUpdates);
  }
  
  console.log('\n=== COMPLETE ===');
  console.log(`Total processed: ${processed.toLocaleString()}`);
  console.log(`Total matched: ${matched.toLocaleString()}`);
  console.log(`Total not found: ${notFound.toLocaleString()}`);
  console.log(`Total skipped: ${skipped.toLocaleString()}`);
  if (processed > 0) {
    console.log(`Match rate: ${((matched / processed) * 100).toFixed(1)}%`);
  }
  
  await prisma.$disconnect();
}

async function updateDatabase(updates) {
  let updated = 0;
  let notInDb = 0;
  let errors = 0;
  
  for (const u of updates) {
    try {
      const result = await prisma.property.updateMany({
        where: { parcelId: u.parcelId },
        data: {
          siteAddress: u.siteAddress,
          siteCity: u.siteCity,
          siteState: u.siteState,
          siteZip: u.siteZip
        }
      });
      
      if (result.count > 0) {
        updated++;
      } else {
        notInDb++;
      }
    } catch (e) {
      errors++;
      console.error(`Error updating parcelId ${u.parcelId}:`, e.message);
    }
  }
  
  if (updated > 0 || notInDb > 0 || errors > 0) {
    console.log(`  Batch: Updated ${updated} | Not in DB ${notInDb} | Errors ${errors}`);
  }
}

main().catch(console.error);
