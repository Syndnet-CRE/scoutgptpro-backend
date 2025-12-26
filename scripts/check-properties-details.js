import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function checkPropertiesDetails() {
  try {
    console.log('🔍 Analyzing Properties Table...\n');

    // Check distribution by state
    const stateDistribution = await prisma.$queryRaw`
      SELECT 
        CASE 
          WHEN state IS NOT NULL THEN state
          WHEN "siteState" IS NOT NULL THEN "siteState"
          ELSE 'NULL'
        END as state,
        COUNT(*) as count
      FROM properties 
      GROUP BY 
        CASE 
          WHEN state IS NOT NULL THEN state
          WHEN "siteState" IS NOT NULL THEN "siteState"
          ELSE 'NULL'
        END
      ORDER BY COUNT(*) DESC 
      LIMIT 10
    `;
    
    console.log('📊 Properties by State:');
    console.log('─'.repeat(100));
    stateDistribution.forEach((row, index) => {
      const count = typeof row.count === 'bigint' ? Number(row.count) : row.count;
      console.log(`${index + 1}. ${row.state}: ${count.toLocaleString()} properties`);
    });

    // Check distribution by city (top cities)
    const cityDistribution = await prisma.$queryRaw`
      SELECT 
        CASE 
          WHEN city IS NOT NULL THEN city
          WHEN "siteCity" IS NOT NULL THEN "siteCity"
          ELSE 'NULL'
        END as city,
        COUNT(*) as count
      FROM properties 
      GROUP BY 
        CASE 
          WHEN city IS NOT NULL THEN city
          WHEN "siteCity" IS NOT NULL THEN "siteCity"
          ELSE 'NULL'
        END
      ORDER BY COUNT(*) DESC 
      LIMIT 20
    `;
    
    console.log('\n🏙️  Top 20 Cities:');
    console.log('─'.repeat(100));
    cityDistribution.forEach((row, index) => {
      const count = typeof row.count === 'bigint' ? Number(row.count) : row.count;
      console.log(`${index + 1}. ${row.city}: ${count.toLocaleString()} properties`);
    });

    // Check for NULL/empty values
    const nullStats = await prisma.$queryRaw`
      SELECT 
        COUNT(*) FILTER (WHERE city IS NULL AND "siteCity" IS NULL) as null_city,
        COUNT(*) FILTER (WHERE state IS NULL AND "siteState" IS NULL) as null_state,
        COUNT(*) FILTER (WHERE latitude IS NULL) as null_lat,
        COUNT(*) FILTER (WHERE longitude IS NULL) as null_lng,
        COUNT(*) FILTER (WHERE "propertyType" IS NULL) as null_type
      FROM properties
    `;
    
    console.log('\n📊 NULL Value Statistics:');
    console.log('─'.repeat(100));
    const stats = nullStats[0];
    const nullCity = typeof stats.null_city === 'bigint' ? Number(stats.null_city) : stats.null_city;
    const nullState = typeof stats.null_state === 'bigint' ? Number(stats.null_state) : stats.null_state;
    const nullLat = typeof stats.null_lat === 'bigint' ? Number(stats.null_lat) : stats.null_lat;
    const nullLng = typeof stats.null_lng === 'bigint' ? Number(stats.null_lng) : stats.null_lng;
    const nullType = typeof stats.null_type === 'bigint' ? Number(stats.null_type) : stats.null_type;
    console.log(`NULL city: ${nullCity.toLocaleString()}`);
    console.log(`NULL state: ${nullState.toLocaleString()}`);
    console.log(`NULL latitude: ${nullLat.toLocaleString()}`);
    console.log(`NULL longitude: ${nullLng.toLocaleString()}`);
    console.log(`NULL propertyType: ${nullType.toLocaleString()}`);

    // Check index sizes
    const indexSizes = await prisma.$queryRaw`
      SELECT 
        indexname,
        pg_size_pretty(pg_relation_size(indexname::regclass)) as size
      FROM pg_indexes 
      WHERE tablename = 'properties'
      ORDER BY pg_relation_size(indexname::regclass) DESC
    `;
    
    console.log('\n📊 Index Sizes on Properties Table:');
    console.log('─'.repeat(100));
    indexSizes.forEach((idx, index) => {
      console.log(`${index + 1}. ${idx.indexname}: ${idx.size}`);
    });

    // Sample some property records to see structure
    const sample = await prisma.property.findMany({
      take: 3,
      select: {
        id: true,
        address: true,
        city: true,
        state: true,
        parcelId: true,
        propertyType: true,
        latitude: true,
        longitude: true
      }
    });
    
    console.log('\n📋 Sample Properties:');
    console.log('─'.repeat(100));
    sample.forEach((prop, index) => {
      console.log(`${index + 1}. ${prop.address || 'N/A'}, ${prop.city || 'N/A'}, ${prop.state || 'N/A'}`);
      console.log(`   Parcel ID: ${prop.parcelId}, Type: ${prop.propertyType || 'N/A'}`);
      console.log(`   Coordinates: ${prop.latitude || 'N/A'}, ${prop.longitude || 'N/A'}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPropertiesDetails();

