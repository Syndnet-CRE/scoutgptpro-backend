/**
 * Query shapefile data via database (if already loaded)
 * or use ogr2ogr to extract LOC_LAND_USE
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkShapefileData() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    CHECKING DATABASE FOR SHAPEFILE DATA                      ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // Check what tables exist
    const tables = await prisma.$queryRawUnsafe(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('parcels_tx', 'parcels_tx_stage', 'parcels_travis')
      ORDER BY table_name;
    `);

    console.log('Tables found:');
    console.table(tables);

    // Check columns in each table
    for (const table of tables) {
      const tableName = table.table_name;
      console.log(`\n📋 Columns in ${tableName}:`);
      
      const columns = await prisma.$queryRawUnsafe(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = $1
        AND (column_name ILIKE '%land%' OR column_name ILIKE '%use%' OR column_name ILIKE '%loc%' OR column_name ILIKE '%stat%')
        ORDER BY column_name;
      `, tableName);

      if (columns.length > 0) {
        console.table(columns);
        
        // Try to query distinct values
        const locLandUseCol = columns.find(c => c.column_name.toLowerCase().includes('loc_land'));
        if (locLandUseCol) {
          console.log(`\n📊 Distinct ${locLandUseCol.column_name} values (top 20):`);
          try {
            const values = await prisma.$queryRawUnsafe(`
              SELECT DISTINCT "${locLandUseCol.column_name}" as code, COUNT(*) as count
              FROM ${tableName}
              WHERE "${locLandUseCol.column_name}" IS NOT NULL
              GROUP BY "${locLandUseCol.column_name}"
              ORDER BY COUNT(*) DESC
              LIMIT 20;
            `);
            console.table(values);
          } catch (e) {
            console.log(`   Error querying: ${e.message}`);
          }
        }
      } else {
        console.log('   No land use columns found');
      }
    }

    // Check if we can use ogr2ogr to query shapefile directly
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    ALTERNATIVE: QUERY SHAPEFILE DIRECTLY                      ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    
    console.log('To extract LOC_LAND_USE from shapefile, you can use ogr2ogr:');
    console.log('');
    console.log('ogr2ogr -f CSV -select PROP_ID,LOC_LAND_U,STAT_LAND_ \\');
    console.log('  /tmp/shapefile_attributes.csv \\');
    console.log('  data/shapefiles/land_parcels/stratmap24-landparcels_48453_travis_202404.shp');
    console.log('');
    console.log('Or use PostGIS to load shapefile and query:');
    console.log('');
    console.log('ogr2ogr -f PostgreSQL PG:"$DATABASE_URL" \\');
    console.log('  data/shapefiles/land_parcels/stratmap24-landparcels_48453_travis_202404.shp \\');
    console.log('  -nln shapefile_temp -overwrite');
    console.log('');
    console.log('Then query: SELECT DISTINCT "LOC_LAND_U", COUNT(*) FROM shapefile_temp GROUP BY "LOC_LAND_U";');

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkShapefileData()
  .then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Check failed:', error);
    process.exit(1);
  });


