-- Drop foreign key constraint on deals.userId
ALTER TABLE "deals" DROP CONSTRAINT IF EXISTS "deals_userId_fkey";

-- Drop foreign key constraint on activities.userId  
ALTER TABLE "activities" DROP CONSTRAINT IF EXISTS "activities_userId_fkey";
