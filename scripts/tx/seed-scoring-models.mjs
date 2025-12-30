/**
 * Seed Scoring Models Script
 * Creates default scoring models for different asset classes
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Default scoring models
 */
const SCORING_MODELS = [
  {
    modelId: 'self_storage_v1',
    assetClass: 'self_storage',
    version: '1.0',
    modelJson: {
      weights: {
        location: {
          pop_1mi: 0.3,
          med_income_1mi: 0.2
        },
        owner: {
          mom_pop_bonus: 0.25,
          tired_landlord_bonus: 0.15
        },
        property: {
          acres: 0.1
        }
      }
    }
  },
  {
    modelId: 'multifamily_v1',
    assetClass: 'multifamily',
    version: '1.0',
    modelJson: {
      weights: {
        location: {
          pop_1mi: 0.25,
          med_income_1mi: 0.25
        },
        owner: {
          mom_pop_bonus: 0.2,
          tired_landlord_bonus: 0.15
        },
        property: {
          acres: 0.15
        }
      }
    }
  },
  {
    modelId: 'retail_v1',
    assetClass: 'retail',
    version: '1.0',
    modelJson: {
      weights: {
        location: {
          pop_1mi: 0.3,
          med_income_1mi: 0.25,
          traffic_index: 0.15
        },
        owner: {
          mom_pop_bonus: 0.15,
          tired_landlord_bonus: 0.1
        },
        property: {
          acres: 0.05
        }
      }
    }
  },
  {
    modelId: 'industrial_v1',
    assetClass: 'industrial',
    version: '1.0',
    modelJson: {
      weights: {
        location: {
          pop_1mi: 0.2,
          traffic_index: 0.25
        },
        owner: {
          mom_pop_bonus: 0.2,
          tired_landlord_bonus: 0.15
        },
        property: {
          acres: 0.2
        }
      }
    }
  },
  {
    modelId: 'general_v1',
    assetClass: 'general',
    version: '1.0',
    modelJson: {
      weights: {
        location: {
          pop_1mi: 0.25,
          med_income_1mi: 0.2
        },
        owner: {
          mom_pop_bonus: 0.2,
          tired_landlord_bonus: 0.15
        },
        property: {
          acres: 0.2
        }
      }
    }
  }
];

/**
 * Main execution
 */
async function main() {
  console.log('Seeding scoring models...');
  
  try {
    for (const model of SCORING_MODELS) {
      await prisma.scoringModel.upsert({
        where: { modelId: model.modelId },
        create: {
          modelId: model.modelId,
          assetClass: model.assetClass,
          version: model.version,
          modelJson: model.modelJson
        },
        update: {
          assetClass: model.assetClass,
          version: model.version,
          modelJson: model.modelJson,
          updatedAt: new Date()
        }
      });
      
      console.log(`Created/updated model: ${model.modelId}`);
    }
    
    console.log('Scoring models seeded successfully!');
    
  } catch (error) {
    console.error('Error seeding scoring models:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();

