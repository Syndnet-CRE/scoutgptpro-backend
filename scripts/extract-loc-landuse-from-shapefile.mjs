/**
 * Extract LOC_LAND_U from Travis County shapefile
 * Uses shapefile npm package (already in dependencies)
 * Reads from DBF file which contains the attributes
 */

import { openDbf } from 'shapefile';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to DBF file (attributes are stored separately from geometry)
// Use the extracted ZIP file location
const DBF_PATH = '/tmp/travis_shapefile_extract/shp/stratmap25-landparcels_48453_travis_202508.dbf';

async function extractLocLandUse() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    EXTRACTING LOC_LAND_U FROM SHAPEFILE                      ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    console.log(`📁 Reading DBF file: ${DBF_PATH}`);

    let source = await openDbf(DBF_PATH);
    
    // Get headers
    let headers = null;
    if (source.header && source.header.fields) {
      headers = source.header.fields.map(f => f.name || f.fieldName);
    } else {
      // Read first record to infer headers
      const firstResult = await source.read();
      if (!firstResult.done) {
        headers = Object.keys(firstResult.value || {});
        // Reset the source to read from beginning
        source = await openDbf(DBF_PATH);
      }
    }

    console.log(`\n📋 Fields found: ${headers?.length || 'unknown'}`);
    
    if (headers && headers.length > 0) {
      console.log(`\n📋 First 50 fields:`);
      headers.slice(0, 50).forEach((h, i) => {
        console.log(`   ${i + 1}. ${h}`);
      });
      if (headers.length > 50) {
        console.log(`   ... and ${headers.length - 50} more`);
      }
    }
    
    // Find LOC_LAND_U field (DBF field names are truncated to 10 chars)
    const locLandUseField = headers?.find(h => 
      h.toLowerCase().includes('loc_land') || 
      h.toLowerCase().includes('locland') ||
      h.toLowerCase() === 'loc_land_u' ||
      h.toLowerCase() === 'loc_land_use'
    );
    
    const statLandUseField = headers?.find(h => 
      h.toLowerCase().includes('stat_land') || 
      h.toLowerCase().includes('statland') ||
      h.toLowerCase() === 'stat_land' ||
      h.toLowerCase() === 'stat_land_use'
    );

    console.log(`\n🔍 Found fields:`);
    console.log(`   LOC_LAND_U field: ${locLandUseField || 'NOT FOUND'}`);
    console.log(`   STAT_LAND_ field: ${statLandUseField || 'NOT FOUND'}`);
    
    if (!locLandUseField) {
      console.log('\n⚠️  LOC_LAND_U field not found. Searching for similar fields...');
      const similarFields = headers?.filter(h => 
        h.toLowerCase().includes('land') || h.toLowerCase().includes('use')
      );
      if (similarFields && similarFields.length > 0) {
        console.log('   Similar fields found:');
        similarFields.forEach(h => console.log(`     - ${h}`));
      }
      return;
    }

    const locCodes = new Map();
    const statByLoc = new Map();
    let totalRecords = 0;
    let recordsWithLoc = 0;
    let recordsWithStat = 0;
    let debugSamples = [];

    console.log('\n📊 Processing records...\n');

    while (true) {
      const result = await source.read();
      if (result.done) break;

      totalRecords++;
      const record = result.value;

      const loc = record[locLandUseField];
      const stat = statLandUseField ? record[statLandUseField] : null;

      // Debug: show first 5 records and any non-null values
      if (totalRecords <= 5) {
        console.log(`\n   Record ${totalRecords}:`);
        console.log(`     LOC_LAND_U: ${JSON.stringify(loc)} (type: ${typeof loc})`);
        console.log(`     STAT_LAND_: ${JSON.stringify(stat)} (type: ${typeof stat})`);
        console.log(`     Full record keys: ${Object.keys(record).slice(0, 15).join(', ')}`);
      }
      
      // Sample records with non-null LOC_LAND_U
      if (loc !== null && loc !== undefined && String(loc).trim() !== '' && debugSamples.length < 5) {
        debugSamples.push({
          record: totalRecords,
          loc: loc,
          stat: stat,
          prop_id: record.Prop_ID
        });
      }

      // Try multiple ways to extract the value
      let locStr = null;
      if (loc !== null && loc !== undefined && loc !== '') {
        const locTest = String(loc).trim();
        if (locTest && locTest !== '' && locTest !== 'None' && locTest !== 'null' && locTest !== 'NULL' && locTest.length > 0) {
          locStr = locTest;
        }
      }

      if (locStr) {
        recordsWithLoc++;
        locCodes.set(locStr, (locCodes.get(locStr) || 0) + 1);
        
        if (!statByLoc.has(locStr) && stat !== null && stat !== undefined) {
          const statTest = String(stat).trim();
          if (statTest && statTest !== '' && statTest !== 'None' && statTest !== 'null' && statTest !== 'NULL') {
            statByLoc.set(locStr, statTest);
          }
        }
      }

      if (stat !== null && stat !== undefined && stat !== '') {
        const statTest = String(stat).trim();
        if (statTest && statTest !== '' && statTest !== 'None' && statTest !== 'null' && statTest !== 'NULL') {
          recordsWithStat++;
        }
      }

      if (totalRecords % 50000 === 0) {
        process.stdout.write(`\r   Processed: ${totalRecords.toLocaleString()} records...`);
      }
    }

    console.log(`\n\n✅ Processing complete!`);
    console.log(`   Total records: ${totalRecords.toLocaleString()}`);
    console.log(`   Records with LOC_LAND_U: ${recordsWithLoc.toLocaleString()} (${((recordsWithLoc / totalRecords) * 100).toFixed(1)}%)`);
    console.log(`   Records with STAT_LAND_USE: ${recordsWithStat.toLocaleString()} (${((recordsWithStat / totalRecords) * 100).toFixed(1)}%)`);
    
    if (debugSamples.length > 0) {
      console.log(`\n\n📋 Sample records with non-null LOC_LAND_U:`);
      console.table(debugSamples);
    } else {
      console.log(`\n⚠️  No records found with non-null LOC_LAND_U in first ${Math.min(totalRecords, 100000)} records`);
      console.log(`   This suggests LOC_LAND_U may be empty/null for most or all records in this shapefile.`);
    }

    // Sort by count
    const sortedCodes = Array.from(locCodes.entries())
      .sort((a, b) => b[1] - a[1]);

    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    LOC_LAND_U CODE DISTRIBUTION                              ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    console.log('LOC_LAND_U codes (sorted by frequency):');
    console.log('Code    | Count      | Percentage | STAT_LAND_USE');
    console.log('────────┼────────────┼────────────┼───────────────');
    
    for (const [code, count] of sortedCodes) {
      const pct = ((count / recordsWithLoc) * 100).toFixed(2);
      const stat = statByLoc.get(code) || 'N/A';
      const codeStr = String(code).substring(0, 7).padEnd(7);
      const statStr = String(stat).substring(0, 13);
      console.log(`${codeStr} | ${String(count).padStart(10)} | ${pct.padStart(6)}%    | ${statStr}`);
    }

    console.log(`\n\nSummary:`);
    console.log(`   Total unique LOC_LAND_U codes: ${locCodes.size}`);
    console.log(`   Total records with LOC_LAND_U: ${recordsWithLoc.toLocaleString()}`);
    console.log(`   Coverage: ${((recordsWithLoc / totalRecords) * 100).toFixed(1)}% of parcels`);

    // Show all unique codes in a list
    console.log(`\n\nAll unique LOC_LAND_U codes (alphabetical):`);
    const allCodes = Array.from(locCodes.keys()).sort();
    console.log(`   ${allCodes.join(', ')}`);

  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error('Stack:', error.stack);
    throw error;
  }
}

extractLocLandUse()
  .then(() => {
    console.log('\n✅ Extraction complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Extraction failed:', error);
    process.exit(1);
  });

