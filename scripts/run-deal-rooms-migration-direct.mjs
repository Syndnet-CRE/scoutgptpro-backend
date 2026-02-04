#!/usr/bin/env node
/**
 * Run deal_rooms migration directly (inline SQL)
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Starting deal_rooms migration...\n');
    
    // Step 1: Add ownerId column
    console.log('Step 1: Adding ownerId column...');
    await client.query(`
      ALTER TABLE deal_rooms 
      ADD COLUMN IF NOT EXISTS "ownerId" TEXT;
    `);
    
    // Set default ownerId for existing rows
    await client.query(`
      UPDATE deal_rooms 
      SET "ownerId" = 'system_migrated_' || id::text 
      WHERE "ownerId" IS NULL;
    `);
    
    // Make ownerId NOT NULL
    await client.query(`
      ALTER TABLE deal_rooms 
      ALTER COLUMN "ownerId" SET NOT NULL;
    `);
    console.log('  ✓ ownerId added\n');
    
    // Step 2: Add title column
    console.log('Step 2: Adding title column...');
    await client.query(`
      ALTER TABLE deal_rooms 
      ADD COLUMN IF NOT EXISTS "title" TEXT;
    `);
    
    // Copy name to title
    await client.query(`
      UPDATE deal_rooms 
      SET "title" = COALESCE(name, 'Untitled Deal Room')
      WHERE "title" IS NULL;
    `);
    
    // Make title NOT NULL
    await client.query(`
      ALTER TABLE deal_rooms 
      ALTER COLUMN "title" SET NOT NULL;
    `);
    console.log('  ✓ title added\n');
    
    // Step 3: Add property arrays
    console.log('Step 3: Adding propertyIds and primaryPropertyId...');
    await client.query(`
      ALTER TABLE deal_rooms 
      ADD COLUMN IF NOT EXISTS "primaryPropertyId" TEXT,
      ADD COLUMN IF NOT EXISTS "propertyIds" TEXT[] DEFAULT '{}';
    `);
    
    // Migrate parcel_id to propertyIds
    await client.query(`
      UPDATE deal_rooms 
      SET 
        "propertyIds" = CASE 
          WHEN parcel_id IS NOT NULL AND parcel_id != '' THEN ARRAY[parcel_id]
          ELSE '{}'
        END,
        "primaryPropertyId" = CASE 
          WHEN parcel_id IS NOT NULL AND parcel_id != '' THEN parcel_id
          ELSE NULL
        END
      WHERE "propertyIds" = '{}' OR "propertyIds" IS NULL;
    `);
    console.log('  ✓ propertyIds and primaryPropertyId added\n');
    
    // Step 4: Add all other fields (batch)
    console.log('Step 4: Adding remaining Prisma schema fields...');
    await client.query(`
      ALTER TABLE deal_rooms 
      ADD COLUMN IF NOT EXISTS "assetType" TEXT,
      ADD COLUMN IF NOT EXISTS "location" TEXT,
      ADD COLUMN IF NOT EXISTS "purchasePrice" DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS "capEx" DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS "targetCapRate" DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS "notes" TEXT,
      ADD COLUMN IF NOT EXISTS "characteristics" JSONB,
      ADD COLUMN IF NOT EXISTS "outputs" JSONB,
      ADD COLUMN IF NOT EXISTS "mapState" JSONB,
      ADD COLUMN IF NOT EXISTS "accessTier" TEXT DEFAULT 'PUBLIC_PREVIEW',
      ADD COLUMN IF NOT EXISTS "acres" DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS "address" TEXT,
      ADD COLUMN IF NOT EXISTS "addressMasked" TEXT,
      ADD COLUMN IF NOT EXISTS "allowedUses" TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "askingPrice" DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS "assetClass" TEXT,
      ADD COLUMN IF NOT EXISTS "capRate" DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS "capacityNotes" TEXT,
      ADD COLUMN IF NOT EXISTS "contacts" JSONB,
      ADD COLUMN IF NOT EXISTS "county" TEXT,
      ADD COLUMN IF NOT EXISTS "description" TEXT,
      ADD COLUMN IF NOT EXISTS "developmentNotes" TEXT,
      ADD COLUMN IF NOT EXISTS "easementsNotes" TEXT,
      ADD COLUMN IF NOT EXISTS "electricProvider" TEXT,
      ADD COLUMN IF NOT EXISTS "entitlementStatus" TEXT,
      ADD COLUMN IF NOT EXISTS "environmentalIssues" TEXT,
      ADD COLUMN IF NOT EXISTS "far" DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS "fiberAvailable" BOOLEAN,
      ADD COLUMN IF NOT EXISTS "floodZone" TEXT,
      ADD COLUMN IF NOT EXISTS "gasProvider" TEXT,
      ADD COLUMN IF NOT EXISTS "highlights" TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "knownConstraints" TEXT,
      ADD COLUMN IF NOT EXISTS "legalDescription" TEXT,
      ADD COLUMN IF NOT EXISTS "locationVisibility" TEXT DEFAULT 'exact',
      ADD COLUMN IF NOT EXISTS "maxHeight" DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS "ndaRequired" BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS "noi" DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS "occupancy" DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS "offeringType" TEXT,
      ADD COLUMN IF NOT EXISTS "parcelIds" TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "phaseIIStatus" TEXT,
      ADD COLUMN IF NOT EXISTS "phaseIStatus" TEXT,
      ADD COLUMN IF NOT EXISTS "physicalAttributes" JSONB,
      ADD COLUMN IF NOT EXISTS "propertyType" TEXT,
      ADD COLUMN IF NOT EXISTS "requiredStudies" TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "setbacks" JSONB,
      ADD COLUMN IF NOT EXISTS "sewerProvider" TEXT,
      ADD COLUMN IF NOT EXISTS "soilNotes" TEXT,
      ADD COLUMN IF NOT EXISTS "squareFeet" DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS "submarket" TEXT,
      ADD COLUMN IF NOT EXISTS "t12Expenses" DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS "t12Income" DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS "topTenantSummary" TEXT,
      ADD COLUMN IF NOT EXISTS "units" INTEGER,
      ADD COLUMN IF NOT EXISTS "waterProvider" TEXT,
      ADD COLUMN IF NOT EXISTS "wetlandsPresent" TEXT,
      ADD COLUMN IF NOT EXISTS "yearBuilt" INTEGER,
      ADD COLUMN IF NOT EXISTS "zoning" TEXT,
      ADD COLUMN IF NOT EXISTS "zoningCodes" TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "zoningJurisdiction" TEXT;
    `);
    console.log('  ✓ All fields added\n');
    
    // Step 5: Update parcelIds to match propertyIds
    console.log('Step 5: Syncing parcelIds with propertyIds...');
    await client.query(`
      UPDATE deal_rooms 
      SET "parcelIds" = "propertyIds"
      WHERE "parcelIds" = '{}' OR "parcelIds" IS NULL;
    `);
    console.log('  ✓ parcelIds synced\n');
    
    // Step 6: Create index
    console.log('Step 6: Creating index on ownerId...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS "deal_rooms_ownerId_idx" ON deal_rooms("ownerId");
    `);
    console.log('  ✓ Index created\n');
    
    await client.query('COMMIT');
    console.log('✅ Migration completed successfully!\n');
    
    // Verify
    console.log('Verifying migration...');
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'deal_rooms' 
        AND column_name IN ('ownerId', 'title', 'propertyIds', 'primaryPropertyId')
      ORDER BY column_name;
    `);
    
    console.log('\nAdded columns:');
    result.rows.forEach(row => {
      console.log(`  ✓ ${row.column_name}`);
    });
    
    // Check row count
    const countResult = await pool.query('SELECT COUNT(*) as count FROM deal_rooms');
    console.log(`\nTotal rows: ${countResult.rows[0].count}`);
    
    if (result.rows.length >= 4) {
      console.log('\n✅ All required columns added successfully!');
    } else {
      console.log('\n⚠️  Some columns may be missing.');
    }
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
