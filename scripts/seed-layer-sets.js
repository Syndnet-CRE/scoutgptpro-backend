import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function seedLayerSets() {
  console.log('🌱 Seeding Layer Sets...\n');
  
  // Read consolidated data
  const dataPath = path.join(__dirname, '../data/layersData_consolidated.json');
  
  if (!fs.existsSync(dataPath)) {
    console.error(`❌ Consolidated data file not found: ${dataPath}`);
    process.exit(1);
  }
  
  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const consolidated = JSON.parse(rawData);
  
  if (!consolidated.layerSets || !Array.isArray(consolidated.layerSets)) {
    console.error('❌ Invalid consolidated data format. Expected { layerSets: [...] }');
    process.exit(1);
  }
  
  console.log(`📊 Found ${consolidated.layerSets.length} layer sets to import\n`);
  
  // Clear existing layer sets
  console.log('🗑️  Clearing existing layer sets...');
  const deleted = await prisma.layerSet.deleteMany({});
  console.log(`   Cleared ${deleted.count} existing entries\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  // Import each layer set
  for (const layerSet of consolidated.layerSets) {
    try {
      // Validate required fields
      if (!layerSet.id || !layerSet.name || !layerSet.category || !layerSet.geometryType) {
        console.warn(`⚠️  Skipping layer set with missing required fields:`, layerSet.id);
        errorCount++;
        continue;
      }
      
      if (!layerSet.primaryLayer || !layerSet.primaryLayer.url) {
        console.warn(`⚠️  Skipping layer set with missing primary layer URL:`, layerSet.id);
        errorCount++;
        continue;
      }
      
      // Create layer set record
      await prisma.layerSet.create({
        data: {
          layerSetId: layerSet.id,
          name: layerSet.name,
          category: layerSet.category,
          description: layerSet.description || null,
          geometryType: layerSet.geometryType,
          style: layerSet.style || {},
          primaryLayerUrl: layerSet.primaryLayer.url,
          primaryLayerId: layerSet.primaryLayer.id || null,
          alternativeLayers: layerSet.alternativeLayers || [],
          totalFeatureCount: layerSet.totalFeatureCount || 0,
          layerCount: layerSet.layerCount || 1,
          isActive: true,
          queryCount: 0
        }
      });
      
      successCount++;
      
      if (successCount % 10 === 0) {
        const percentage = Math.round((successCount / consolidated.layerSets.length) * 100);
        console.log(`⏳ Progress: ${successCount} / ${consolidated.layerSets.length} (${percentage}%)`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to import ${layerSet.id}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`\n✅ Layer Sets seeding complete!`);
  console.log(`   ✓ Success: ${successCount}`);
  console.log(`   ✗ Errors: ${errorCount}`);
  
  // Print summary by category
  const categories = await prisma.layerSet.groupBy({
    by: ['category'],
    _count: true
  });
  
  console.log('\n📊 Layer Sets Summary by Category:');
  categories
    .sort((a, b) => b._count - a._count)
    .forEach(cat => {
      console.log(`   ${cat.category}: ${cat._count} layer sets`);
    });
  
  // Print summary by geometry type
  const geometryTypes = await prisma.layerSet.groupBy({
    by: ['geometryType'],
    _count: true
  });
  
  console.log('\n📐 Layer Sets Summary by Geometry Type:');
  geometryTypes
    .sort((a, b) => b._count - a._count)
    .forEach(geom => {
      console.log(`   ${geom.geometryType}: ${geom._count} layer sets`);
    });
  
  const total = await prisma.layerSet.count();
  console.log(`\n🎯 Total Layer Sets in database: ${total}`);
}

seedLayerSets()
  .catch((error) => {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
