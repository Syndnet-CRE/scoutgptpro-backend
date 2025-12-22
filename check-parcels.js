import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('=== PROPERTY TABLE INVESTIGATION ===\n');
  
  try {
    // Check Property table
    const propertyCount = await prisma.property.count();
    console.log(`Properties in database: ${propertyCount}`);
    
    if (propertyCount > 0) {
      const sample = await prisma.property.findFirst({
        include: {
          pins: true,
          deals: true,
          listings: true
        }
      });
      console.log('\nSample property:');
      console.log(JSON.stringify(sample, null, 2));
    } else {
      console.log('\n⚠️  No properties found in database');
      console.log('Properties are stored in GeoJSON files, not database');
    }
    
    // Check if there are any pins
    const pinCount = await prisma.pin.count();
    console.log(`\nPins in database: ${pinCount}`);
    
    if (pinCount > 0) {
      const samplePin = await prisma.pin.findFirst({
        include: {
          property: true
        }
      });
      console.log('\nSample pin:');
      console.log(JSON.stringify(samplePin, null, 2));
    }
    
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);

