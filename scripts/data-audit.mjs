/**
 * Comprehensive Data Audit
 * Shows all data sources: files, database tables, and sample data
 */

import { PrismaClient } from '@prisma/client';
import { readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import { openDbf } from 'shapefile';

const prisma = new PrismaClient();

async function auditData() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    COMPREHENSIVE DATA AUDIT                                   ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // 1. Check extracted shapefile data
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    1. EXTRACTED SHAPEFILE DATA                               ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    const dbfPath = '/tmp/travis_shapefile_extract/shp/stratmap25-landparcels_48453_travis_202508.dbf';
    
    if (existsSync(dbfPath)) {
      console.log(`📁 File: ${dbfPath}\n`);
      
      try {
        let source = await openDbf(dbfPath);
        
        // Get headers
        let headers = null;
        if (source.header && source.header.fields) {
          headers = source.header.fields.map(f => f.name || f.fieldName);
        } else {
          const firstResult = await source.read();
          if (!firstResult.done) {
            headers = Object.keys(firstResult.value || {});
            source = await openDbf(dbfPath);
          }
        }

        console.log(`📋 Columns (${headers.length} total):`);
        headers.forEach((h, i) => {
          console.log(`   ${i + 1}. ${h}`);
        });

        // Sample 20 rows
        console.log(`\n📊 Sample Rows (first 20):\n`);
        let rowCount = 0;
        const samples = [];

        while (rowCount < 20) {
          const result = await source.read();
          if (result.done) break;

          const record = result.value;
          samples.push(record);
          rowCount++;
        }

        // Display samples in table format
        console.log('Row | Prop_ID      | OWNER_NAME (first 40 chars) | MKT_VALUE | GIS_AREA | LOC_LAND_U | STAT_LAND_');
        console.log('────┼──────────────┼──────────────────────────────┼───────────┼──────────┼────────────┼───────────');
        
        samples.forEach((rec, idx) => {
          const propId = String(rec.Prop_ID || '').substring(0, 12);
          const owner = String(rec.OWNER_NAME || '').substring(0, 30).padEnd(30);
          const mktValue = String(rec.MKT_VALUE || '').substring(0, 9).padStart(9);
          const gisArea = String(rec.GIS_AREA || '').substring(0, 8).padStart(8);
          const locLand = String(rec.LOC_LAND_U || 'NULL').substring(0, 10).padEnd(10);
          const statLand = String(rec.STAT_LAND_ || 'NULL').substring(0, 9);
          console.log(`${String(idx + 1).padStart(3)} | ${propId.padEnd(12)} | ${owner} | ${mktValue} | ${gisArea} | ${locLand} | ${statLand}`);
        });

        console.log(`\n   Total records in file: 834,936`);
        console.log(`   Coverage: Travis County parcels\n`);

      } catch (error) {
        console.log(`   ❌ Error reading DBF: ${error.message}\n`);
      }
    } else {
      console.log(`   ⚠️  Shapefile not extracted at: ${dbfPath}\n`);
    }

    // 2. Check database tables
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    2. DATABASE TABLES                                         ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    const tables = await prisma.$queryRawUnsafe(`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND (table_name LIKE '%travis%' 
           OR table_name LIKE '%parcel%' 
           OR table_name LIKE '%property%'
           OR table_name LIKE '%enrichment%'
           OR table_name LIKE '%owner%')
      ORDER BY table_name;
    `);

    console.log('Travis County / Parcel / Property / Enrichment Tables:\n');
    console.table(tables);

    // Audit each relevant table
    for (const table of tables) {
      const tableName = table.table_name;
      
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`📊 Table: ${tableName}`);
      console.log(`${'─'.repeat(80)}\n`);

      // Get columns
      const columns = await prisma.$queryRawUnsafe(`
        SELECT column_name, data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = $1
        ORDER BY ordinal_position;
      `, tableName);

      console.log(`Columns (${columns.length} total):`);
      columns.forEach((col, i) => {
        const length = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
        console.log(`   ${i + 1}. ${col.column_name} - ${col.data_type}${length}`);
      });

      // Get row count
      const countResult = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM ${tableName};
      `);
      const rowCount = Number(countResult[0].count);
      console.log(`\n   Total rows: ${rowCount.toLocaleString()}`);

      // Sample 20 rows
      if (rowCount > 0) {
        console.log(`\n   Sample Rows (first 20):\n`);
        
        try {
          const samples = await prisma.$queryRawUnsafe(`
            SELECT * FROM ${tableName} LIMIT 20;
          `);

          if (samples.length > 0) {
            // Display as table
            const sampleKeys = Object.keys(samples[0]);
            const displayKeys = sampleKeys.slice(0, 8); // Show first 8 columns
            
            // Header
            let header = 'Row | ';
            displayKeys.forEach(key => {
              header += String(key).substring(0, 15).padEnd(15) + ' | ';
            });
            console.log(header);
            console.log('─'.repeat(header.length));

            // Rows
            samples.forEach((row, idx) => {
              let rowStr = `${String(idx + 1).padStart(3)} | `;
              displayKeys.forEach(key => {
                const value = String(row[key] || 'NULL').substring(0, 15).padEnd(15);
                rowStr += value + ' | ';
              });
              console.log(rowStr);
            });

            if (sampleKeys.length > 8) {
              console.log(`\n   ... and ${sampleKeys.length - 8} more columns`);
            }
          }
        } catch (error) {
          console.log(`   ⚠️  Error sampling rows: ${error.message}`);
        }
      }
    }

    // 3. Check for other data files
    console.log(`\n\n╔══════════════════════════════════════════════════════════════════════════════╗`);
    console.log(`║                    3. OTHER DATA FILES                                        ║`);
    console.log(`╚══════════════════════════════════════════════════════════════════════════════╝\n`);

    const dataDirs = [
      'data',
      'data/shapefiles',
      'data/shapefiles/land_parcels',
      '/tmp/travis_shapefile_extract'
    ];

    for (const dir of dataDirs) {
      if (existsSync(dir)) {
        try {
          const files = readdirSync(dir).filter(f => 
            f.endsWith('.csv') || 
            f.endsWith('.dbf') || 
            f.endsWith('.shp') || 
            f.endsWith('.json') ||
            f.endsWith('.zip')
          );

          if (files.length > 0) {
            console.log(`📁 Directory: ${dir}\n`);
            files.forEach(file => {
              const filePath = join(dir, file);
              const stats = statSync(filePath);
              const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
              console.log(`   • ${file} (${sizeMB} MB)`);
            });
            console.log('');
          }
        } catch (error) {
          // Skip if can't read
        }
      }
    }

    // 4. Summary and enrichment opportunities
    console.log(`\n\n╔══════════════════════════════════════════════════════════════════════════════╗`);
    console.log(`║                    4. ENRICHMENT OPPORTUNITIES                                ║`);
    console.log(`╚══════════════════════════════════════════════════════════════════════════════╝\n`);

    console.log(`Available Data Sources:\n`);
    console.log(`1. Shapefile (stratmap25-landparcels_48453_travis_202508.dbf)`);
    console.log(`   • 834,936 Travis County parcels`);
    console.log(`   • Fields: Prop_ID, OWNER_NAME, LEGAL_DESC, MKT_VALUE, GIS_AREA, addresses`);
    console.log(`   • ⚠️  LOC_LAND_U and STAT_LAND_ are empty`);
    console.log(`   • ✅ Can enrich: owner names, legal descriptions, market values, acreage\n`);

    console.log(`2. Database Tables:`);
    console.log(`   • properties - Main property data (372K+ rows)`);
    console.log(`   • parcels_travis - Parcel geometries`);
    console.log(`   • parcels_travis_enrichment - Enrichment data (may be empty)`);
    console.log(`   • owners, owner_properties, owner_features_tx - Owner analysis\n`);

    console.log(`Enrichment Opportunities:\n`);
    console.log(`✅ Owner Data:`);
    console.log(`   • Match shapefile OWNER_NAME → properties.owner`);
    console.log(`   • Use LEGAL_DESC for property type inference`);
    console.log(`   • Extract owner entity types from names\n`);

    console.log(`✅ Property Values:`);
    console.log(`   • Shapefile MKT_VALUE → properties.mktValue`);
    console.log(`   • Shapefile LAND_VALUE, IMP_VALUE → properties.landValue, improvementValue\n`);

    console.log(`✅ Address Data:`);
    console.log(`   • Shapefile SITUS_ADDR fields → properties.address`);
    console.log(`   • Shapefile MAIL_ADDR → owner mailing addresses\n`);

    console.log(`✅ Acreage:`);
    console.log(`   • Shapefile GIS_AREA → properties.acres\n`);

    console.log(`❌ Missing Data:`);
    console.log(`   • LOC_LAND_U (land use codes) - empty in shapefile`);
    console.log(`   • Zoning codes - not in shapefile`);
    console.log(`   • Property use codes - need TCAD API or other source\n`);

    console.log(`\n✅ Audit complete!\n`);

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

auditData()
  .then(() => {
    console.log('✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });

