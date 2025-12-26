-- Drop redundant columns to free space
ALTER TABLE "Property" DROP COLUMN IF EXISTS "centroid";
ALTER TABLE "Property" DROP COLUMN IF EXISTS "situsNum";
ALTER TABLE "Property" DROP COLUMN IF EXISTS "situsStreet";
ALTER TABLE "Property" DROP COLUMN IF EXISTS "geoId";
ALTER TABLE "Property" DROP COLUMN IF EXISTS "tcadAcres";
ALTER TABLE "Property" DROP COLUMN IF EXISTS "floodZone";
ALTER TABLE "Property" DROP COLUMN IF EXISTS "yearBuilt";
ALTER TABLE "Property" DROP COLUMN IF EXISTS "deedDate";
ALTER TABLE "Property" DROP COLUMN IF EXISTS "landTypeDesc";
ALTER TABLE "Property" DROP COLUMN IF EXISTS "lot";
ALTER TABLE "Property" DROP COLUMN IF EXISTS "block";
ALTER TABLE "Property" DROP COLUMN IF EXISTS "subdivision";
