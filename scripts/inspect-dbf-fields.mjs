/**
 * Inspect all fields in DBF file and show sample records
 */

import { openDbf } from 'shapefile';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const DBF_PATH = '/tmp/travis_shapefile_extract/shp/stratmap25-landparcels_48453_travis_202508.dbf';

async function inspectDBF() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    DBF FILE FIELD INSPECTION                                ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    console.log(`📁 Reading DBF file: ${DBF_PATH}\n`);

    let source = await openDbf(DBF_PATH);
    
    // Get all field names
    let headers = null;
    if (source.header && source.header.fields) {
      headers = source.header.fields.map(f => ({
        name: f.name || f.fieldName,
        type: f.type || 'unknown',
        length: f.length || 'unknown'
      }));
    } else {
      // Read first record to infer
      const firstResult = await source.read();
      if (!firstResult.done) {
        headers = Object.keys(firstResult.value || {}).map(name => ({
          name,
          type: 'unknown',
          length: 'unknown'
        }));
        source = await openDbf(DBF_PATH);
      }
    }

    console.log(`📋 ALL FIELDS IN DBF (${headers.length} total):\n`);
    console.log('Field Name          | Type      | Length');
    console.log('────────────────────┼───────────┼────────');
    headers.forEach((f, i) => {
      console.log(`${String(f.name).padEnd(20)} | ${String(f.type).padEnd(9)} | ${f.length}`);
    });

    // Check for fields containing keywords
    const keywords = ['property', 'use', 'improvement', 'building', 'zoning', 'class', 'category', 'type', 'code', 'desc'];
    console.log(`\n\n🔍 Fields containing keywords (${keywords.join(', ')}):\n`);
    const relevantFields = headers.filter(f => 
      keywords.some(kw => f.name.toLowerCase().includes(kw))
    );
    
    if (relevantFields.length > 0) {
      relevantFields.forEach(f => {
        console.log(`   • ${f.name} (${f.type}, length: ${f.length})`);
      });
    } else {
      console.log('   No fields found matching keywords');
    }

    // Sample records
    console.log(`\n\n📊 Sampling 10 records with ALL non-null fields:\n`);
    
    source = await openDbf(DBF_PATH);
    let recordCount = 0;
    const samples = [];

    while (true) {
      const result = await source.read();
      if (result.done) break;

      recordCount++;
      const record = result.value;

      // Collect non-null fields for this record
      const nonNullFields = {};
      for (const [key, value] of Object.entries(record)) {
        if (value !== null && value !== undefined && String(value).trim() !== '') {
          nonNullFields[key] = value;
        }
      }

      samples.push({
        recordNum: recordCount,
        propId: record.Prop_ID || 'N/A',
        nonNullCount: Object.keys(nonNullFields).length,
        fields: nonNullFields
      });

      if (samples.length >= 10) break;
    }

    // Display samples
    samples.forEach((sample, idx) => {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`Record ${sample.recordNum} (Prop_ID: ${sample.propId})`);
      console.log(`Non-null fields: ${sample.nonNullCount}/${headers.length}`);
      console.log(`${'─'.repeat(80)}`);
      
      // Group fields by category for readability
      const fieldGroups = {
        identifiers: [],
        owner: [],
        address: [],
        valuation: [],
        landUse: [],
        other: []
      };

      Object.keys(sample.fields).forEach(key => {
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('prop') || lowerKey.includes('geo') || lowerKey.includes('id')) {
          fieldGroups.identifiers.push(key);
        } else if (lowerKey.includes('owner') || lowerKey.includes('mail')) {
          fieldGroups.owner.push(key);
        } else if (lowerKey.includes('situs') || lowerKey.includes('addr') || lowerKey.includes('city') || lowerKey.includes('zip')) {
          fieldGroups.address.push(key);
        } else if (lowerKey.includes('value') || lowerKey.includes('mkt') || lowerKey.includes('land') || lowerKey.includes('imp')) {
          fieldGroups.valuation.push(key);
        } else if (lowerKey.includes('land') || lowerKey.includes('use') || lowerKey.includes('type') || lowerKey.includes('class') || lowerKey.includes('zoning')) {
          fieldGroups.landUse.push(key);
        } else {
          fieldGroups.other.push(key);
        }
      });

      // Display grouped
      if (fieldGroups.identifiers.length > 0) {
        console.log('\n  Identifiers:');
        fieldGroups.identifiers.forEach(key => {
          const value = String(sample.fields[key]).substring(0, 50);
          console.log(`    ${key.padEnd(20)}: ${value}`);
        });
      }

      if (fieldGroups.owner.length > 0) {
        console.log('\n  Owner/Mailing:');
        fieldGroups.owner.forEach(key => {
          const value = String(sample.fields[key]).substring(0, 50);
          console.log(`    ${key.padEnd(20)}: ${value}`);
        });
      }

      if (fieldGroups.address.length > 0) {
        console.log('\n  Address:');
        fieldGroups.address.forEach(key => {
          const value = String(sample.fields[key]).substring(0, 50);
          console.log(`    ${key.padEnd(20)}: ${value}`);
        });
      }

      if (fieldGroups.valuation.length > 0) {
        console.log('\n  Valuation:');
        fieldGroups.valuation.forEach(key => {
          const value = String(sample.fields[key]).substring(0, 50);
          console.log(`    ${key.padEnd(20)}: ${value}`);
        });
      }

      if (fieldGroups.landUse.length > 0) {
        console.log('\n  Land Use / Property Type:');
        fieldGroups.landUse.forEach(key => {
          const value = String(sample.fields[key]).substring(0, 50);
          console.log(`    ${key.padEnd(20)}: ${value}`);
        });
      }

      if (fieldGroups.other.length > 0) {
        console.log('\n  Other:');
        fieldGroups.other.forEach(key => {
          const value = String(sample.fields[key]).substring(0, 50);
          console.log(`    ${key.padEnd(20)}: ${value}`);
        });
      }
    });

    // Field population statistics
    console.log(`\n\n📊 Field Population Statistics (from ${recordCount} records):\n`);
    
    source = await openDbf(DBF_PATH);
    const fieldCounts = {};
    headers.forEach(h => fieldCounts[h.name] = 0);
    
    let statsRecordCount = 0;
    while (statsRecordCount < Math.min(recordCount, 10000)) {
      const result = await source.read();
      if (result.done) break;
      
      statsRecordCount++;
      const record = result.value;
      
      headers.forEach(h => {
        const value = record[h.name];
        if (value !== null && value !== undefined && String(value).trim() !== '') {
          fieldCounts[h.name]++;
        }
      });
    }

    console.log('Field Name          | Populated | Percentage');
    console.log('────────────────────┼───────────┼───────────');
    headers.forEach(h => {
      const count = fieldCounts[h.name];
      const pct = ((count / statsRecordCount) * 100).toFixed(1);
      console.log(`${String(h.name).padEnd(20)} | ${String(count).padStart(9)} | ${pct.padStart(6)}%`);
    });

    console.log(`\n\n✅ Inspection complete!`);

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  }
}

inspectDBF()
  .then(() => {
    console.log('\n✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });



