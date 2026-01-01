/**
 * Check zoning and land use fields across all data sources
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkZoningLandUse() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    TABLE COLUMNS CHECK                                         ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // 1. Get all columns for properties table
    const propertiesColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'properties'
      ORDER BY ordinal_position;
    `);

    console.log('PROPERTIES TABLE COLUMNS:');
    console.log('───────────────────────────────────────────────────────────────────────────────');
    console.table(propertiesColumns);

    // 2. Get all columns for parcels_travis table
    const parcelsTravisColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'parcels_travis'
      ORDER BY ordinal_position;
    `);

    console.log('\nPARCELS_TRAVIS TABLE COLUMNS:');
    console.log('───────────────────────────────────────────────────────────────────────────────');
    console.table(parcelsTravisColumns);

    // 3. Get all columns for parcels_travis_enrichment table
    const enrichmentColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'parcels_travis_enrichment'
      ORDER BY ordinal_position;
    `);

    console.log('\nPARCELS_TRAVIS_ENRICHMENT TABLE COLUMNS:');
    console.log('───────────────────────────────────────────────────────────────────────────────');
    console.table(enrichmentColumns);

    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    ZONING AND LAND USE DATA CHECK                           ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Check zoningCode in properties
    try {
      const zoningCode = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT "zoningCode" 
        FROM properties 
        WHERE "zoningCode" IS NOT NULL 
        LIMIT 20;
      `);
      console.log('PROPERTIES.zoningCode (distinct values):');
      console.table(zoningCode);
      console.log(`Total distinct values: ${zoningCode.length}\n`);
    } catch (error) {
      console.log('❌ PROPERTIES.zoningCode column does not exist or query failed:', error.message);
    }

    // Check landUseCode in properties
    try {
      const landUseCode = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT "landUseCode" 
        FROM properties 
        WHERE "landUseCode" IS NOT NULL 
        LIMIT 20;
      `);
      console.log('PROPERTIES.landUseCode (distinct values):');
      console.table(landUseCode);
      console.log(`Total distinct values: ${landUseCode.length}\n`);
    } catch (error) {
      console.log('❌ PROPERTIES.landUseCode column does not exist or query failed:', error.message);
    }

    // Check land_use_code in parcels_travis_enrichment
    try {
      const enrichmentLandUseCode = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT land_use_code 
        FROM parcels_travis_enrichment 
        WHERE land_use_code IS NOT NULL 
        LIMIT 20;
      `);
      console.log('PARCELS_TRAVIS_ENRICHMENT.land_use_code (distinct values):');
      console.table(enrichmentLandUseCode);
      console.log(`Total distinct values: ${enrichmentLandUseCode.length}\n`);
    } catch (error) {
      console.log('❌ PARCELS_TRAVIS_ENRICHMENT.land_use_code column does not exist or query failed:', error.message);
    }

    // Check land_use_description in parcels_travis_enrichment
    try {
      const enrichmentLandUseDesc = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT land_use_description 
        FROM parcels_travis_enrichment 
        WHERE land_use_description IS NOT NULL 
        LIMIT 20;
      `);
      console.log('PARCELS_TRAVIS_ENRICHMENT.land_use_description (distinct values):');
      console.table(enrichmentLandUseDesc);
      console.log(`Total distinct values: ${enrichmentLandUseDesc.length}\n`);
    } catch (error) {
      console.log('❌ PARCELS_TRAVIS_ENRICHMENT.land_use_description column does not exist or query failed:', error.message);
    }

    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    COLUMNS CONTAINING ZONE/USE/CLASS/TYPE                      ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Find all columns containing zone, use, class, or type
    const relevantColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name, table_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND (
        column_name ILIKE '%zone%' 
        OR column_name ILIKE '%use%' 
        OR column_name ILIKE '%class%' 
        OR column_name ILIKE '%type%'
      )
      ORDER BY table_name, column_name;
    `);

    console.log('ALL COLUMNS CONTAINING zone/use/class/type:');
    console.log('───────────────────────────────────────────────────────────────────────────────');
    console.table(relevantColumns);

    // Sample data from relevant columns
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    SAMPLE DATA FROM RELEVANT COLUMNS                          ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Check zoning column in properties (if exists)
    try {
      const zoningSample = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT zoning 
        FROM properties 
        WHERE zoning IS NOT NULL 
        LIMIT 20;
      `);
      console.log('PROPERTIES.zoning (distinct values):');
      console.table(zoningSample);
      console.log(`Total distinct values: ${zoningSample.length}\n`);
    } catch (error) {
      console.log('❌ PROPERTIES.zoning column does not exist or query failed:', error.message);
    }

    // Check propertyType in properties (we know this exists)
    try {
      const propertyTypeSample = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT "propertyType" 
        FROM properties 
        WHERE "propertyType" IS NOT NULL 
        LIMIT 20;
      `);
      console.log('PROPERTIES.propertyType (distinct values):');
      console.table(propertyTypeSample);
      console.log(`Total distinct values: ${propertyTypeSample.length}\n`);
    } catch (error) {
      console.log('❌ PROPERTIES.propertyType query failed:', error.message);
    }

    // Check asset_class in properties (we know this exists)
    try {
      const assetClassSample = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT asset_class 
        FROM properties 
        WHERE asset_class IS NOT NULL 
        LIMIT 20;
      `);
      console.log('PROPERTIES.asset_class (distinct values):');
      console.table(assetClassSample);
      console.log(`Total distinct values: ${assetClassSample.length}\n`);
    } catch (error) {
      console.log('❌ PROPERTIES.asset_class query failed:', error.message);
    }

  } catch (error) {
    console.error('Error querying database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkZoningLandUse()
  .then(() => {
    console.log('\n✅ Query completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Query failed:', error);
    process.exit(1);
  });


