/**
 * Map asset classes using LEGAL_DESC and OWNER_NAME keywords
 * Uses bulk SQL UPDATE for performance
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function mapAssetClasses() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    ASSET CLASS MAPPING FROM KEYWORDS                        ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Step 1: Check owner column name
    console.log('Step 1: Checking owner column name...\n');
    
    const ownerColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'properties' 
      AND column_name ILIKE '%owner%'
      ORDER BY column_name;
    `);

    console.log('Owner-related columns found:');
    console.table(ownerColumns);

    if (ownerColumns.length === 0) {
      console.log('❌ No owner columns found!');
      return;
    }

    // Use the first owner column (likely "owner" or "ownerName")
    const ownerCol = ownerColumns[0].column_name;
    console.log(`\n✅ Using column: "${ownerCol}"\n`);

    // Step 2: Check current asset_class distribution
    console.log('Step 2: Current asset_class distribution (before update):\n');
    
    const beforeStats = await prisma.$queryRawUnsafe(`
      SELECT asset_class, COUNT(*) as count
      FROM properties
      GROUP BY asset_class
      ORDER BY COUNT(*) DESC;
    `);

    console.table(beforeStats);

    // Step 3: Run bulk UPDATE
    console.log('\nStep 3: Running bulk UPDATE with keyword mapping...\n');

    const updateQuery = `
      UPDATE properties 
      SET asset_class = CASE
        -- Self Storage
        WHEN "${ownerCol}" ILIKE '%storage%' 
             OR "${ownerCol}" ILIKE '%self storage%' 
             OR "${ownerCol}" ILIKE '%self-storage%'
             OR "${ownerCol}" ILIKE '%mini storage%'
             OR "${ownerCol}" ILIKE '%mini-storage%' 
        THEN 'self_storage'
        
        -- Multifamily
        WHEN "${ownerCol}" ILIKE '%apartment%' 
             OR "${ownerCol}" ILIKE '%apt %' 
             OR "${ownerCol}" ILIKE '%duplex%' 
             OR "${ownerCol}" ILIKE '%triplex%' 
             OR "${ownerCol}" ILIKE '%fourplex%' 
             OR "${ownerCol}" ILIKE '%condo%' 
             OR "${ownerCol}" ILIKE '%condominium%'
             OR "${ownerCol}" ILIKE '%townhome%'
             OR "${ownerCol}" ILIKE '%townhouse%'
             OR "propertyType" = 'Multi-Family'
             OR "propertyType" ILIKE '%multi%'
        THEN 'multifamily'
        
        -- Retail
        WHEN "${ownerCol}" ILIKE '%retail%' 
             OR "${ownerCol}" ILIKE '%shopping%' 
             OR "${ownerCol}" ILIKE '%mall%' 
             OR "${ownerCol}" ILIKE '%strip%'
             OR "${ownerCol}" ILIKE '%plaza%'
        THEN 'retail'
        
        -- Industrial
        WHEN "${ownerCol}" ILIKE '%industrial%' 
             OR "${ownerCol}" ILIKE '%warehouse%' 
             OR "${ownerCol}" ILIKE '%manufacturing%' 
             OR "${ownerCol}" ILIKE '%factory%'
             OR "propertyType" ILIKE '%industrial%'
        THEN 'industrial'
        
        -- Office
        WHEN "${ownerCol}" ILIKE '%office%' 
             OR "${ownerCol}" ILIKE '%bldg%'
             OR "${ownerCol}" ILIKE '%building%'
             OR "${ownerCol}" ILIKE '%suite%'
             OR "${ownerCol}" ILIKE '%ste %'
             OR "propertyType" ILIKE '%office%'
        THEN 'office'
        
        -- Hospitality
        WHEN "${ownerCol}" ILIKE '%hotel%' 
             OR "${ownerCol}" ILIKE '%motel%' 
             OR "${ownerCol}" ILIKE '%inn %' 
             OR "${ownerCol}" ILIKE '%lodge%'
             OR "${ownerCol}" ILIKE '%suites%'
             OR "propertyType" ILIKE '%hotel%'
             OR "propertyType" ILIKE '%hospitality%'
        THEN 'hospitality'
        
        -- Mobile Home Park
        WHEN "${ownerCol}" ILIKE '%mobile home%' 
             OR "${ownerCol}" ILIKE '%trailer%' 
             OR "${ownerCol}" ILIKE '%rv park%'
        THEN 'mobile_home_park'
        
        -- Land
        WHEN "propertyType" IN ('Vacant Land', 'Agricultural')
             OR "propertyType" ILIKE '%vacant%'
             OR "propertyType" ILIKE '%land%'
        THEN 'land'
        
        -- Commercial (generic)
        WHEN "propertyType" = 'Commercial'
             OR "propertyType" ILIKE '%commercial%'
        THEN 'commercial'
        
        -- Keep existing asset_class if already set and not 'other'
        ELSE asset_class
      END
      WHERE asset_class IS NULL OR asset_class = 'other';
    `;

    console.log('Executing UPDATE query...');
    const updateResult = await prisma.$executeRawUnsafe(updateQuery);
    console.log(`✅ Updated ${updateResult} rows\n`);

    // Step 4: Show results
    console.log('Step 4: New asset_class distribution (after update):\n');
    
    const afterStats = await prisma.$queryRawUnsafe(`
      SELECT asset_class, COUNT(*) as count
      FROM properties
      GROUP BY asset_class
      ORDER BY COUNT(*) DESC;
    `);

    console.table(afterStats);

    // Calculate changes
    const beforeMap = new Map(beforeStats.map(s => [s.asset_class, Number(s.count)]));
    const afterMap = new Map(afterStats.map(s => [s.asset_class, Number(s.count)]));

    console.log('\n📊 Changes:\n');
    console.log('Asset Class        | Before    | After     | Change');
    console.log('───────────────────┼───────────┼───────────┼───────────');
    
    const allClasses = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    for (const cls of Array.from(allClasses).sort()) {
      const before = beforeMap.get(cls) || 0;
      const after = afterMap.get(cls) || 0;
      const change = after - before;
      const changeStr = change >= 0 ? `+${change.toLocaleString()}` : `${change.toLocaleString()}`;
      console.log(`${String(cls || 'NULL').padEnd(19)} | ${String(before).padStart(9)} | ${String(after).padStart(9)} | ${changeStr.padStart(9)}`);
    }

    console.log('\n✅ Asset class mapping complete!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

mapAssetClasses()
  .then(() => {
    console.log('\n✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });

