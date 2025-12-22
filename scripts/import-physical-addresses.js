import shapefile from 'shapefile';
import { PrismaClient } from '@prisma/client';
import * as turf from '@turf/turf';

const prisma = new PrismaClient();

// Try both shapefiles - address points first (has better address data), then land parcels
const ADDRESS_POINTS_SHP = 'data/shapefiles/address_points/stratmap24-addresspoints_48453_travis_202402.shp';
const LAND_PARCELS_SHP = 'data/shapefiles/land_parcels/stratmap24-landparcels_48453_travis_202404.shp';

const BATCH_SIZE = 500;
const COORD_TOLERANCE = 0.005; // ~500 meters (address points can be far from parcel centroids)

// Convert Web Mercator to WGS84 (lat/lng)
function webMercatorToWGS84(x, y) {
  const lng = (x / 20037508.34) * 180;
  let lat = (y / 20037508.34) * 180;
  lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
  return [lng, lat];
}

async function importFromAddressPoints(shpPath) {
  console.log(`\n=== IMPORTING FROM ADDRESS POINTS ===`);
  console.log(`File: ${shpPath}`);
  
  const source = await shapefile.open(shpPath);
  
  let processed = 0;
  let updated = 0;
  let notFound = 0;
  let noCoords = 0;
  let batch = [];
  
  console.log('\nProcessing records...');
  
  while (true) {
    const result = await source.read();
    if (result.done) break;
    
    const props = result.value.properties;
    const geometry = result.value.geometry;
    
    // Get coordinates (already in WGS84 lat/lng)
    let lat, lng;
    if (geometry && geometry.type === 'Point') {
      lng = geometry.coordinates[0];
      lat = geometry.coordinates[1];
    } else {
      noCoords++;
      processed++;
      continue;
    }
    
    // Get address fields
    const address = props.Full_Addr ? props.Full_Addr.trim() : null;
    const city = props.Post_Comm ? props.Post_Comm.trim() : null;
    const zip = props.Post_Code ? String(props.Post_Code).trim() : null;
    const state = props.State ? props.State.trim() : null;
    
    // Only process if we have address and coordinates
    if (address && address.length > 5 && lat && lng) {
      // Validate coordinates are in Texas area
      if (lat > 25 && lat < 37 && lng > -107 && lng < -93) {
        batch.push({
          lat,
          lng,
          address,
          city,
          zip,
          state
        });
      }
    }
    
    processed++;
    
    // Process batch
    if (batch.length >= BATCH_SIZE) {
      const results = await processBatch(batch);
      updated += results.updated;
      notFound += results.notFound;
      batch = [];
      
      process.stdout.write(`\rProcessed: ${processed.toLocaleString()} | Updated: ${updated.toLocaleString()} | Not found: ${notFound.toLocaleString()}`);
    }
  }
  
  // Process remaining batch
  if (batch.length > 0) {
    const results = await processBatch(batch);
    updated += results.updated;
    notFound += results.notFound;
  }
  
  console.log(`\n\nCompleted Address Points:`);
  console.log(`  Processed: ${processed.toLocaleString()}`);
  console.log(`  Updated: ${updated.toLocaleString()}`);
  console.log(`  Not found: ${notFound.toLocaleString()}`);
  console.log(`  No coordinates: ${noCoords.toLocaleString()}`);
  
  return { updated, notFound };
}

async function importFromLandParcels(shpPath) {
  console.log(`\n=== IMPORTING FROM LAND PARCELS ===`);
  console.log(`File: ${shpPath}`);
  
  const source = await shapefile.open(shpPath);
  
  let processed = 0;
  let updated = 0;
  let notFound = 0;
  let noCoords = 0;
  let batch = [];
  
  console.log('\nProcessing records...');
  
  while (true) {
    const result = await source.read();
    if (result.done) break;
    
    const props = result.value.properties;
    const geometry = result.value.geometry;
    
    // Get coordinates - need to convert from Web Mercator
    let lat, lng;
    if (geometry) {
      try {
        // Get centroid of polygon
        const centroid = turf.centroid(result.value);
        const coords = centroid.geometry.coordinates;
        
        // Check if coordinates are in Web Mercator (large numbers) or WGS84
        if (Math.abs(coords[0]) > 1000 || Math.abs(coords[1]) > 1000) {
          // Web Mercator - convert to WGS84
          const wgs84 = webMercatorToWGS84(coords[0], coords[1]);
          lng = wgs84[0];
          lat = wgs84[1];
        } else {
          // Already WGS84
          lng = coords[0];
          lat = coords[1];
        }
      } catch (e) {
        noCoords++;
        processed++;
        continue;
      }
    } else {
      noCoords++;
      processed++;
      continue;
    }
    
    // Get address fields - prefer SITUS fields, fallback to MAIL if SITUS is empty
    const situsAddr = props.SITUS_ADDR ? props.SITUS_ADDR.trim() : null;
    const situsCity = props.SITUS_CITY ? props.SITUS_CITY.trim() : null;
    const situsZip = props.SITUS_ZIP ? String(props.SITUS_ZIP).trim() : null;
    const situsState = props.SITUS_STAT ? props.SITUS_STAT.trim() : null;
    
    // Build full address from components if SITUS_ADDR is null
    let address = situsAddr;
    if (!address && props.SITUS_NUM && props.SITUS_STRE) {
      const parts = [props.SITUS_NUM, props.SITUS_STRE, props.SITUS_ST_1, props.SITUS_ST_2]
        .filter(p => p && p.trim())
        .map(p => p.trim());
      address = parts.join(' ');
    }
    
    // Fallback to mailing address if no situs address
    if (!address && props.MAIL_ADDR) {
      address = props.MAIL_ADDR.split(',')[0].trim(); // Take first line only
    }
    
    const city = situsCity || (props.MAIL_CITY ? props.MAIL_CITY.trim() : null);
    const zip = situsZip || (props.MAIL_ZIP ? String(props.MAIL_ZIP).trim() : null);
    const state = situsState || (props.MAIL_STAT ? props.MAIL_STAT.trim() : null);
    
    // Only process if we have address and coordinates
    if (address && address.length > 5 && lat && lng) {
      // Validate coordinates are in Texas area
      if (lat > 25 && lat < 37 && lng > -107 && lng < -93) {
        batch.push({
          lat,
          lng,
          address,
          city,
          zip,
          state
        });
      }
    }
    
    processed++;
    
    // Process batch
    if (batch.length >= BATCH_SIZE) {
      const results = await processBatch(batch);
      updated += results.updated;
      notFound += results.notFound;
      batch = [];
      
      process.stdout.write(`\rProcessed: ${processed.toLocaleString()} | Updated: ${updated.toLocaleString()} | Not found: ${notFound.toLocaleString()}`);
    }
  }
  
  // Process remaining batch
  if (batch.length > 0) {
    const results = await processBatch(batch);
    updated += results.updated;
    notFound += results.notFound;
  }
  
  console.log(`\n\nCompleted Land Parcels:`);
  console.log(`  Processed: ${processed.toLocaleString()}`);
  console.log(`  Updated: ${updated.toLocaleString()}`);
  console.log(`  Not found: ${notFound.toLocaleString()}`);
  console.log(`  No coordinates: ${noCoords.toLocaleString()}`);
  
  return { updated, notFound };
}

async function processBatch(batch) {
  let updated = 0;
  let notFound = 0;
  let multipleMatches = 0;
  
  for (const item of batch) {
    try {
      // First, find all properties within tolerance
      const candidates = await prisma.property.findMany({
        where: {
          latitude: { gte: item.lat - COORD_TOLERANCE, lte: item.lat + COORD_TOLERANCE },
          longitude: { gte: item.lng - COORD_TOLERANCE, lte: item.lng + COORD_TOLERANCE },
          siteAddress: null // Only update if not already set
        },
        select: {
          id: true,
          latitude: true,
          longitude: true
        }
      });
      
      if (candidates.length === 0) {
        notFound++;
        continue;
      }
      
      // If multiple candidates, find the closest one
      let targetProperty = null;
      if (candidates.length === 1) {
        targetProperty = candidates[0];
      } else {
        // Multiple matches - find closest
        multipleMatches++;
        let minDistance = Infinity;
        for (const candidate of candidates) {
          // Calculate distance in degrees (simple approximation)
          const latDiff = Math.abs(candidate.latitude - item.lat);
          const lngDiff = Math.abs(candidate.longitude - item.lng);
          const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
          if (distance < minDistance) {
            minDistance = distance;
            targetProperty = candidate;
          }
        }
      }
      
      if (targetProperty) {
        // Update the closest match
        await prisma.property.update({
          where: { id: targetProperty.id },
          data: {
            siteAddress: item.address,
            siteCity: item.city,
            siteState: item.state,
            siteZip: item.zip
          }
        });
        updated++;
      } else {
        notFound++;
      }
    } catch (e) {
      notFound++;
    }
  }
  
  return { updated, notFound, multipleMatches };
}

async function main() {
  console.log('=== PHYSICAL ADDRESS IMPORT FROM ATTOM SHAPEFILES ===\n');
  
  // Check current state
  const totalBefore = await prisma.property.count();
  const withSiteBefore = await prisma.property.count({ where: { siteAddress: { not: null } } });
  console.log(`Database status before import:`);
  console.log(`  Total properties: ${totalBefore.toLocaleString()}`);
  console.log(`  With site address: ${withSiteBefore.toLocaleString()}`);
  
  let totalUpdated = 0;
  
  // Try address points first (has better address data)
  try {
    const result = await importFromAddressPoints(ADDRESS_POINTS_SHP);
    totalUpdated += result.updated;
  } catch (e) {
    console.log('\nAddress points import error:', e.message);
    console.error(e);
  }
  
  // Then try land parcels for any remaining
  try {
    const result = await importFromLandParcels(LAND_PARCELS_SHP);
    totalUpdated += result.updated;
  } catch (e) {
    console.log('\nLand parcels import error:', e.message);
    console.error(e);
  }
  
  // Final verification
  const withSiteAfter = await prisma.property.count({ where: { siteAddress: { not: null } } });
  
  console.log('\n=== IMPORT COMPLETE ===');
  console.log(`Total properties updated: ${totalUpdated.toLocaleString()}`);
  console.log(`Properties with site address: ${withSiteAfter.toLocaleString()} (${Math.round(withSiteAfter/totalBefore*100)}%)`);
  
  // Show sample
  const sample = await prisma.property.findFirst({
    where: { siteAddress: { not: null } },
    select: {
      parcelId: true,
      siteAddress: true,
      siteCity: true,
      siteZip: true,
      address: true,
      latitude: true,
      longitude: true
    }
  });
  
  if (sample) {
    console.log('\nSample property:');
    console.log(`  Parcel ID: ${sample.parcelId}`);
    console.log(`  Site Address: ${sample.siteAddress}, ${sample.siteCity}, ${sample.siteZip}`);
    console.log(`  Mailing Address: ${sample.address}`);
    console.log(`  Coordinates: [${sample.longitude}, ${sample.latitude}]`);
  }
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Import failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
