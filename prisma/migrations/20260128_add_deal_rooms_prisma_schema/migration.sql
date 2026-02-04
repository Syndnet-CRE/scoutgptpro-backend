-- Migration: Add missing columns to deal_rooms table to match Prisma schema
-- Date: 2026-01-28
-- Issue: Prisma schema expects ownerId and many other fields that don't exist in DB

-- Step 1: Add ownerId column (required, non-nullable)
-- For existing rows, set a default ownerId. In production, you may want to set this differently.
ALTER TABLE deal_rooms 
ADD COLUMN IF NOT EXISTS "ownerId" TEXT;

-- Set default ownerId for existing rows (using a placeholder - update this with actual user IDs if needed)
UPDATE deal_rooms 
SET "ownerId" = 'system_migrated_' || id::text 
WHERE "ownerId" IS NULL;

-- Make ownerId NOT NULL after setting defaults
ALTER TABLE deal_rooms 
ALTER COLUMN "ownerId" SET NOT NULL;

-- Step 2: Add title column (rename name -> title)
ALTER TABLE deal_rooms 
ADD COLUMN IF NOT EXISTS "title" TEXT;

-- Copy name to title for existing rows
UPDATE deal_rooms 
SET "title" = COALESCE(name, 'Untitled Deal Room')
WHERE "title" IS NULL;

-- Make title NOT NULL after setting defaults
ALTER TABLE deal_rooms 
ALTER COLUMN "title" SET NOT NULL;

-- Step 3: Add primaryPropertyId and propertyIds array
ALTER TABLE deal_rooms 
ADD COLUMN IF NOT EXISTS "primaryPropertyId" TEXT,
ADD COLUMN IF NOT EXISTS "propertyIds" TEXT[] DEFAULT '{}';

-- Migrate parcel_id to propertyIds array and primaryPropertyId
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

-- Step 4: Add all other Prisma schema fields (nullable, with defaults where appropriate)
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

-- Step 5: Update status default to match Prisma schema ('inbound' instead of 'active')
-- Note: Keep existing status values, just ensure new rows get 'inbound'
-- ALTER TABLE deal_rooms ALTER COLUMN status SET DEFAULT 'inbound';

-- Step 6: Rename timestamp columns to match Prisma (createdAt, updatedAt)
-- Prisma uses camelCase, but PostgreSQL typically uses snake_case
-- We'll keep both for now, or use Prisma's @map directive
-- The Prisma schema uses @map("deal_rooms") so column names should match DB

-- Step 7: Create index on ownerId (as specified in Prisma schema)
CREATE INDEX IF NOT EXISTS "deal_rooms_ownerId_idx" ON deal_rooms("ownerId");

-- Step 8: Update parcelIds to match propertyIds for existing rows
UPDATE deal_rooms 
SET "parcelIds" = "propertyIds"
WHERE "parcelIds" = '{}' OR "parcelIds" IS NULL;

-- Migration complete
-- Note: Old columns (parcel_id, name, property_data) are kept for backward compatibility
-- You may want to drop them in a future migration after verifying everything works
