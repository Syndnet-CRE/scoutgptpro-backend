/**
 * Migration script to add PostGIS geometry column to properties table
 * Run this once on production database after enabling PostGIS extension
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function addGeometryColumn() {
  try {
    console.log('🔧 Adding geometry column to properties table...');
    
    // Step 1: Enable PostGIS extension (if not already enabled)
    console.log('1. Enabling PostGIS extension...');
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS postgis;`;
    console.log('✅ PostGIS extension enabled');
    
    // Step 2: Add geometry column (if not exists)
    console.log('2. Adding geometry column...');
    await prisma.$executeRaw`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'properties' AND column_name = 'geom'
        ) THEN
          ALTER TABLE properties ADD COLUMN geom geometry(Point, 4326);
        END IF;
      END $$;
    `;
    console.log('✅ Geometry column added');
    
    // Step 3: Populate geometry column from latitude/longitude
    console.log('3. Populating geometry column from lat/lng...');
    const updateResult = await prisma.$executeRaw`
      UPDATE properties
      SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
      WHERE latitude IS NOT NULL 
        AND longitude IS NOT NULL
        AND geom IS NULL;
    `;
    console.log(`✅ Updated ${updateResult} properties with geometry`);
    
    // Step 4: Create spatial index
    console.log('4. Creating spatial index...');
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS properties_geom_idx 
      ON properties USING GIST (geom);
    `;
    console.log('✅ Spatial index created');
    
    // Step 5: Verify
    console.log('5. Verifying...');
    const count = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count
      FROM properties
      WHERE geom IS NOT NULL
    `;
    console.log(`✅ ${count[0].count} properties have geometry`);
    
    console.log('\n✅ Migration complete!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addGeometryColumn();




