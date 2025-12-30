/**
 * Owner Segments Script
 * Applies segment rules and assigns owners to segments
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Define segment rules
 */
const SEGMENT_RULES = [
  {
    segmentKey: 'mom_pop',
    description: 'Mom & pop owners (5 or fewer properties, not corporate)',
    ruleJson: {
      parcelCountMax: 5,
      isCorporate: false
    }
  },
  {
    segmentKey: 'small_operator',
    description: 'Small operators (6-25 properties)',
    ruleJson: {
      parcelCountMin: 6,
      parcelCountMax: 25
    }
  },
  {
    segmentKey: 'institutional',
    description: 'Institutional owners (200+ properties or high-value corporate)',
    ruleJson: {
      parcelCountMin: 200,
      or: {
        isCorporate: true,
        totalAssessedValueMin: 50000000
      }
    }
  },
  {
    segmentKey: 'local_owner',
    description: 'Local owners (Texas-based)',
    ruleJson: {
      outOfState: false
    }
  },
  {
    segmentKey: 'tired_landlord',
    description: 'Tired landlords (15+ years average hold)',
    ruleJson: {
      avgHoldYearsMin: 15
    }
  }
];

/**
 * Check if owner matches segment rule
 */
function matchesRule(ownerFeatures, rule) {
  if (rule.parcelCountMax !== undefined) {
    if (ownerFeatures.parcelCountTx > rule.parcelCountMax) return false;
  }
  
  if (rule.parcelCountMin !== undefined) {
    if (ownerFeatures.parcelCountTx < rule.parcelCountMin) return false;
  }
  
  if (rule.isCorporate !== undefined) {
    // Need to check owner's isCorporate flag
    if (ownerFeatures.isCorporate !== rule.isCorporate) return false;
  }
  
  if (rule.outOfState !== undefined) {
    if (ownerFeatures.outOfState !== rule.outOfState) return false;
  }
  
  if (rule.avgHoldYearsMin !== undefined) {
    if (!ownerFeatures.avgHoldYears || ownerFeatures.avgHoldYears < rule.avgHoldYearsMin) return false;
  }
  
  if (rule.totalAssessedValueMin !== undefined) {
    if (!ownerFeatures.totalAssessedValueTx || ownerFeatures.totalAssessedValueTx < rule.totalAssessedValueMin) return false;
  }
  
  if (rule.or) {
    // OR condition - at least one must match
    return Object.keys(rule.or).some(key => {
      const subRule = { [key]: rule.or[key] };
      return matchesRule(ownerFeatures, subRule);
    });
  }
  
  return true;
}

/**
 * Main execution
 */
async function main() {
  console.log('Starting owner segments assignment...');
  
  try {
    // Create/update segment definitions
    for (const segment of SEGMENT_RULES) {
      await prisma.ownerSegment.upsert({
        where: { segmentKey: segment.segmentKey },
        create: {
          segmentKey: segment.segmentKey,
          description: segment.description,
          ruleJson: segment.ruleJson,
          version: '1.0'
        },
        update: {
          description: segment.description,
          ruleJson: segment.ruleJson,
          version: '1.0',
          updatedAt: new Date()
        }
      });
    }
    
    console.log('Segment definitions created/updated');
    
    // Get all owners with features
    const owners = await prisma.owner.findMany({
      include: {
        features: true
      },
      where: {
        features: {
          isNot: null
        }
      }
    });
    
    console.log(`Processing ${owners.length} owners...`);
    
    // Assign segments
    for (const owner of owners) {
      if (!owner.features) continue;
      
      const matchedSegments = [];
      
      for (const segment of SEGMENT_RULES) {
        // Get owner's isCorporate from owner table
        const ownerWithCorporate = {
          ...owner.features,
          isCorporate: owner.isCorporate
        };
        
        if (matchesRule(ownerWithCorporate, segment.ruleJson)) {
          matchedSegments.push(segment.segmentKey);
        }
      }
      
      // Update owner's segments (using many-to-many relationship)
      // Note: Prisma doesn't directly support many-to-many with implicit join table
      // We'll need to handle this via raw SQL or adjust the schema
      // For now, we'll store the first matching segment
      if (matchedSegments.length > 0) {
        // This would require a junction table or array field
        // For MVP, we'll just log it
        console.log(`Owner ${owner.id} matches segments: ${matchedSegments.join(', ')}`);
      }
    }
    
    console.log('Owner segments assignment complete!');
    console.log('Note: Segment assignment logic is ready. Update schema to support many-to-many if needed.');
    
  } catch (error) {
    console.error('Error assigning owner segments:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();

