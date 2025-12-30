/**
 * Owner Features Script
 * Computes aggregated features per owner for Texas properties
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Main execution
 */
async function main() {
  console.log('Starting owner features computation...');
  
  try {
    // Get all owners with Texas properties
    const owners = await prisma.$queryRaw`
      SELECT DISTINCT o.id
      FROM owners o
      INNER JOIN owner_properties op ON op."ownerId" = o.id
      INNER JOIN properties p ON p."parcelId" = op."parcelId"
      WHERE p.state = 'TX'
    `;
    
    console.log(`Processing ${owners.length} owners...`);
    
    const batchSize = 100;
    
    for (let i = 0; i < owners.length; i += batchSize) {
      const batch = owners.slice(i, i + batchSize);
      
      for (const owner of batch) {
        // Compute features for this owner
        // Split into two queries to avoid nested aggregates
        const features = await prisma.$queryRaw`
          SELECT 
            COUNT(DISTINCT op."parcelId") as "parcelCountTx",
            COALESCE(SUM(p."mktValue"), 0) as "totalAssessedValueTx",
            COUNT(DISTINCT CASE WHEN p."isAbsentee" = true THEN op."parcelId" END)::float / 
              NULLIF(COUNT(DISTINCT op."parcelId"), 0) as "absenteeRate",
            CASE 
              WHEN o."mailingState" != 'TX' THEN true 
              ELSE false 
            END as "outOfState",
            COALESCE(
              AVG(EXTRACT(YEAR FROM CURRENT_DATE) - p."yearBuilt"),
              0
            ) as "avgHoldYears"
          FROM owners o
          INNER JOIN owner_properties op ON op."ownerId" = o.id
          INNER JOIN properties p ON p."parcelId" = op."parcelId"
          WHERE o.id = ${owner.id}
            AND p.state = 'TX'
          GROUP BY o.id, o."mailingState"
        `;
        
        // Get asset class mix separately
        const assetMix = await prisma.$queryRaw`
          SELECT 
            p."propertyType" as type,
            COUNT(DISTINCT op."parcelId") as count
          FROM owner_properties op
          INNER JOIN properties p ON p."parcelId" = op."parcelId"
          WHERE op."ownerId" = ${owner.id}
            AND p.state = 'TX'
            AND p."propertyType" IS NOT NULL
          GROUP BY p."propertyType"
        `;
        
        // Convert to JSONB object
        const assetClassMix = {};
        if (assetMix && assetMix.length > 0) {
          assetMix.forEach(row => {
            assetClassMix[row.type] = parseInt(row.count);
          });
        }
        
        if (features && features.length > 0) {
          const f = features[0];
          
          await prisma.ownerFeaturesTx.upsert({
            where: { ownerId: owner.id },
            create: {
              id: owner.id,
              ownerId: owner.id,
              parcelCountTx: parseInt(f.parcelCountTx) || 0,
              totalAssessedValueTx: parseFloat(f.totalAssessedValueTx) || 0,
              assetClassMix: assetClassMix,
              absenteeRate: parseFloat(f.absenteeRate) || 0,
              outOfState: f.outOfState || false,
              avgHoldYears: parseFloat(f.avgHoldYears) || 0
            },
            update: {
              parcelCountTx: parseInt(f.parcelCountTx) || 0,
              totalAssessedValueTx: parseFloat(f.totalAssessedValueTx) || 0,
              assetClassMix: assetClassMix,
              absenteeRate: parseFloat(f.absenteeRate) || 0,
              outOfState: f.outOfState || false,
              avgHoldYears: parseFloat(f.avgHoldYears) || 0,
              updatedAt: new Date()
            }
          });
        }
      }
      
      console.log(`Processed ${Math.min(i + batchSize, owners.length)}/${owners.length} owners`);
    }
    
    console.log('Owner features computation complete!');
    
  } catch (error) {
    console.error('Error computing owner features:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();

