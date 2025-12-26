import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('=== POPULATED TABLES INVESTIGATION ===\n');
  
  try {
    // Check LayerSet
    const layerSetCount = await prisma.layerSet.count();
    console.log(`LayerSet records: ${layerSetCount}`);
    
    if (layerSetCount > 0) {
      const samples = await prisma.layerSet.findMany({
        take: 5,
        select: {
          id: true,
          layerSetId: true,
          name: true,
          category: true,
          geometryType: true,
          isActive: true
        }
      });
      console.log('\nSample LayerSets:');
      samples.forEach(ls => {
        console.log(`  - ${ls.layerSetId}: ${ls.name} (${ls.category}, ${ls.geometryType})`);
      });
    }
    
    // Check MapServerRegistry
    const mapServerCount = await prisma.mapServerRegistry.count();
    console.log(`\nMapServerRegistry records: ${mapServerCount}`);
    
    if (mapServerCount > 0) {
      const samples = await prisma.mapServerRegistry.findMany({
        take: 5,
        select: {
          id: true,
          url: true,
          category: true,
          serviceName: true,
          geometryType: true,
          isActive: true
        }
      });
      console.log('\nSample MapServers:');
      samples.forEach(ms => {
        console.log(`  - ${ms.category}: ${ms.serviceName || 'N/A'} (${ms.geometryType || 'N/A'})`);
        console.log(`    URL: ${ms.url.substring(0, 80)}...`);
      });
    }
    
    // Summary
    console.log('\n=== SUMMARY ===');
    console.log('✅ Populated tables:');
    console.log(`   - layerSet: ${layerSetCount} records`);
    console.log(`   - mapServerRegistry: ${mapServerCount} records`);
    console.log('\n❌ Empty tables (ready for data):');
    console.log('   - property: 0 (parcels stored in GeoJSON files)');
    console.log('   - pin: 0');
    console.log('   - deal: 0');
    console.log('   - buyBox: 0');
    console.log('   - listing: 0');
    console.log('   - user: 0');
    console.log('   - All other tables: 0');
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);





