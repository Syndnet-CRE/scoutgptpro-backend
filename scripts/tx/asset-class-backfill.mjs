/**
 * Asset Class Backfill Script
 * Maps propertyType to asset_class using batch UPDATE with CASE statements
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Main execution - uses single SQL UPDATE with CASE statement
 */
async function main() {
  console.log('Starting asset class backfill...');
  
  try {
    // Check if asset_class column exists
    const columnCheck = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'properties' 
        AND column_name = 'asset_class'
    `;
    
    if (columnCheck.length === 0) {
      console.log('Adding asset_class column...');
      await prisma.$executeRawUnsafe(`
        ALTER TABLE properties 
        ADD COLUMN asset_class TEXT
      `);
      console.log('asset_class column added');
    } else {
      console.log('asset_class column already exists');
    }
    
    // Create index
    try {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_properties_asset_class 
        ON properties(asset_class)
      `);
      console.log('Index created');
    } catch (e) {
      console.log('Index creation skipped (may already exist)');
    }
    
    // Count total rows to update
    const countResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as total
      FROM properties
      WHERE state = 'TX'
        AND (asset_class IS NULL OR asset_class = 'other')
    `);
    
    const totalRows = parseInt(countResult[0].total) || 0;
    console.log(`Found ${totalRows} properties to update`);
    
    if (totalRows === 0) {
      console.log('No properties to update. Exiting.');
      return;
    }
    
    // Single batch UPDATE using CASE statement
    // This processes all rows in one efficient SQL statement
    console.log('Updating all properties in a single batch...');
    const startTime = Date.now();
    
    const updateResult = await prisma.$executeRawUnsafe(`
      UPDATE properties
      SET asset_class = CASE
        -- Self Storage
        WHEN LOWER(TRIM("propertyType")) IN ('self storage', 'self-storage', 'storage') 
          OR LOWER(TRIM("propertyType")) LIKE '%self storage%'
          OR LOWER(TRIM("propertyType")) LIKE '%storage%' THEN 'self_storage'
        
        -- Multifamily
        WHEN LOWER(TRIM("propertyType")) IN ('multifamily', 'apartment', 'apartments', 'condo', 'condominium')
          OR LOWER(TRIM("propertyType")) LIKE '%multifamily%'
          OR LOWER(TRIM("propertyType")) LIKE '%apartment%'
          OR LOWER(TRIM("propertyType")) LIKE '%condo%' THEN 'multifamily'
        
        -- Retail
        WHEN LOWER(TRIM("propertyType")) IN ('retail', 'shopping center', 'strip mall', 'retail store')
          OR LOWER(TRIM("propertyType")) LIKE '%retail%'
          OR LOWER(TRIM("propertyType")) LIKE '%shopping%'
          OR LOWER(TRIM("propertyType")) LIKE '%mall%' THEN 'retail'
        
        -- Office
        WHEN LOWER(TRIM("propertyType")) IN ('office', 'office building', 'office park')
          OR LOWER(TRIM("propertyType")) LIKE '%office%' THEN 'office'
        
        -- Industrial
        WHEN LOWER(TRIM("propertyType")) IN ('industrial', 'warehouse', 'distribution', 'manufacturing', 'flex')
          OR LOWER(TRIM("propertyType")) LIKE '%industrial%'
          OR LOWER(TRIM("propertyType")) LIKE '%warehouse%'
          OR LOWER(TRIM("propertyType")) LIKE '%distribution%'
          OR LOWER(TRIM("propertyType")) LIKE '%manufacturing%' THEN 'industrial'
        
        -- Land
        WHEN LOWER(TRIM("propertyType")) IN ('land', 'vacant land', 'undeveloped')
          OR LOWER(TRIM("propertyType")) LIKE '%vacant land%'
          OR LOWER(TRIM("propertyType")) LIKE '%undeveloped%' THEN 'land'
        
        -- Hospitality
        WHEN LOWER(TRIM("propertyType")) IN ('hotel', 'motel', 'hospitality')
          OR LOWER(TRIM("propertyType")) LIKE '%hotel%'
          OR LOWER(TRIM("propertyType")) LIKE '%motel%' THEN 'hospitality'
        
        -- Mixed Use
        WHEN LOWER(TRIM("propertyType")) IN ('mixed use', 'mixed-use')
          OR LOWER(TRIM("propertyType")) LIKE '%mixed use%'
          OR LOWER(TRIM("propertyType")) LIKE '%mixed-use%' THEN 'mixed_use'
        
        -- Default to 'other'
        ELSE 'other'
      END
      WHERE state = 'TX'
        AND (asset_class IS NULL OR asset_class = 'other')
    `);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Updated ${updateResult} properties in ${elapsed} seconds`);
    
    // Show distribution
    const distribution = await prisma.$queryRawUnsafe(`
      SELECT asset_class, COUNT(*) as count
      FROM properties
      WHERE state = 'TX'
      GROUP BY asset_class
      ORDER BY count DESC
    `);
    
    console.log('\nAsset class distribution:');
    distribution.forEach(row => {
      console.log(`  ${row.asset_class || 'NULL'}: ${row.count}`);
    });
    
  } catch (error) {
    console.error('Error backfilling asset class:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
