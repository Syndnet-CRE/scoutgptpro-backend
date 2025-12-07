import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting MapServer registry seeding...\n');
  
  const csvPath = path.join(__dirname, '../data/mapserver_links.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    process.exit(1);
  }
  
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  
  const parsed = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true
  });
  
  console.log(`📊 Parsed ${parsed.data.length} MapServer entries\n`);
  
  // Clear existing registry
  const deleted = await prisma.mapServerRegistry.deleteMany({});
  console.log(`🗑️  Cleared ${deleted.count} existing entries\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const row of parsed.data) {
    try {
      await prisma.mapServerRegistry.create({
        data: {
          url: row.url,
          category: row.category || 'Uncategorized',
          context: row.context || null,
          datasetType: row.dataset_type || null,
          datasetCategory: row.dataset_category || null,
          isActive: true,
          queryCount: 0
        }
      });
      
      successCount++;
      
      if (successCount % 100 === 0) {
        const percentage = Math.round((successCount / parsed.data.length) * 100);
        console.log(`⏳ Progress: ${successCount} / ${parsed.data.length} (${percentage}%)`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to process ${row.url}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`\n✅ MapServer registry seeding complete!`);
  console.log(`   ✓ Success: ${successCount}`);
  console.log(`   ✗ Errors: ${errorCount}`);
  
  // Print summary
  const categories = await prisma.mapServerRegistry.groupBy({
    by: ['category'],
    _count: true
  });
  
  console.log('\n📊 Registry Summary by Category:');
  categories
    .sort((a, b) => b._count - a._count)
    .forEach(cat => {
      console.log(`   ${cat.category}: ${cat._count} servers`);
    });
  
  const total = await prisma.mapServerRegistry.count();
  console.log(`\n🎯 Total MapServers: ${total}`);
}

main()
  .catch((error) => {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
