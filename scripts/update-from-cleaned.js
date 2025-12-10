import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting MapServer registry update from cleaned data...\n');
  
  // Use cleaned_mapservers.csv from the home directory
  const csvPath = path.join(process.env.HOME || '/Users/braydonirwin', 'cleaned_mapservers.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    console.error('   Please ensure cleaned_mapservers.csv exists in your home directory');
    process.exit(1);
  }
  
  console.log(`📂 Reading cleaned data from: ${csvPath}\n`);
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  
  const parsed = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true
  });
  
  console.log(`📊 Parsed ${parsed.data.length} cleaned MapServer entries\n`);
  
  // Show summary of cleaned data
  const withErrors = parsed.data.filter(row => row.error_flag === 'True' || row.error_flag === true).length;
  const withLowScore = parsed.data.filter(row => {
    const score = parseInt(row.data_score || 0);
    return score < 3;
  }).length;
  
  console.log(`📈 Cleaned Data Stats:`);
  console.log(`   Total entries: ${parsed.data.length}`);
  console.log(`   With errors: ${withErrors}`);
  console.log(`   Low score (<3): ${withLowScore}`);
  console.log(`   ✅ Ready to import: ${parsed.data.length - withErrors - withLowScore}\n`);
  
  // Clear existing registry
  console.log('🗑️  Clearing existing registry...');
  const deleted = await prisma.mapServerRegistry.deleteMany({});
  console.log(`   Cleared ${deleted.count} existing entries\n`);
  
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  let duplicateCount = 0;
  
  // First pass: group by normalized URL and keep the best entry per service
  const urlMap = new Map();
  
  for (const row of parsed.data) {
    // Skip entries with errors or low scores
    if (row.error_flag === 'True' || row.error_flag === true) {
      skippedCount++;
      continue;
    }
    
    const dataScore = parseInt(row.data_score || 0);
    if (dataScore < 3) {
      skippedCount++;
      continue;
    }
    
    // Normalize URL (remove layer IDs if present, as per clean_mapservers.py logic)
    let url = row.url || '';
    url = url.trim().replace(/\/\d+$/, ''); // Remove trailing /number
    
    if (!url) {
      skippedCount++;
      continue;
    }
    
    // Keep the entry with the highest data_score for each normalized URL
    if (!urlMap.has(url) || parseInt(urlMap.get(url).data_score || 0) < dataScore) {
      urlMap.set(url, row);
    } else {
      duplicateCount++;
    }
  }
  
  console.log(`\n📊 Deduplication:`);
  console.log(`   Unique services: ${urlMap.size}`);
  console.log(`   Duplicate layers removed: ${duplicateCount}\n`);
  
  // Second pass: insert unique services
  for (const [url, row] of urlMap.entries()) {
    try {
      await prisma.mapServerRegistry.upsert({
        where: { url: url },
        update: {
          category: row.category || 'Uncategorized',
          context: row.context || null,
          datasetType: row.dataset_type || null,
          datasetCategory: row.dataset_category || null,
          isActive: true
        },
        create: {
          url: url,
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
        const percentage = Math.round((successCount / urlMap.size) * 100);
        console.log(`⏳ Progress: ${successCount} / ${urlMap.size} (${percentage}%)`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to process ${url}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`\n✅ MapServer registry update complete!`);
  console.log(`   ✓ Success: ${successCount}`);
  console.log(`   ✗ Errors: ${errorCount}`);
  console.log(`   ⊘ Skipped: ${skippedCount}`);
  console.log(`   🔄 Duplicates removed: ${duplicateCount}`);
  
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
  console.log(`\n🎯 Total MapServers in database: ${total}`);
  
  // Compare with original
  const originalCount = parsed.data.length;
  console.log(`\n📊 Update Summary:`);
  console.log(`   Original cleaned entries: ${originalCount}`);
  console.log(`   Unique services (after dedup): ${urlMap.size}`);
  console.log(`   Successfully imported: ${successCount}`);
  console.log(`   Skipped (errors/low score): ${skippedCount}`);
  console.log(`   Duplicates removed: ${duplicateCount}`);
  console.log(`   Database errors: ${errorCount}`);
}

main()
  .catch((error) => {
    console.error('\n❌ Update failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

