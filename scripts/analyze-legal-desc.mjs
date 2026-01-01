/**
 * Analyze LEGAL_DESC field for property type indicators
 */

import { openDbf } from 'shapefile';

const DBF_PATH = '/tmp/travis_shapefile_extract/shp/stratmap25-landparcels_48453_travis_202508.dbf';

async function analyzeLegalDesc() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    LEGAL_DESC ANALYSIS FOR PROPERTY TYPES                   ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    const source = await openDbf(DBF_PATH);
    
    // Keywords that might indicate property types
    const propertyTypeKeywords = {
      'residential': ['residential', 'resid', 'lot', 'subdivision', 'subd', 'sub', 'acre', 'acres', 'ft', 'feet'],
      'commercial': ['commercial', 'comm', 'retail', 'shopping', 'mall', 'strip'],
      'industrial': ['industrial', 'ind', 'warehouse', 'manufacturing', 'factory'],
      'multifamily': ['apartment', 'apt', 'multi', 'duplex', 'triplex', 'fourplex', 'condo', 'condominium', 'townhome', 'townhouse'],
      'office': ['office', 'bldg', 'building', 'suite', 'ste'],
      'storage': ['storage', 'self storage', 'self-storage', 'mini storage', 'mini-storage'],
      'hotel': ['hotel', 'motel', 'hospitality', 'inn', 'lodge'],
      'mobile_home': ['mobile home', 'mobile home park', 'trailer', 'rv park'],
      'church': ['church', 'religious', 'temple', 'mosque', 'synagogue'],
      'school': ['school', 'elementary', 'high school', 'university', 'college'],
      'government': ['city of', 'county', 'state', 'federal', 'government'],
      'park': ['park', 'greenbelt', 'open space', 'recreation']
    };

    const keywordMatches = {};
    Object.keys(propertyTypeKeywords).forEach(key => {
      keywordMatches[key] = 0;
    });

    let totalRecords = 0;
    const samples = {
      residential: [],
      commercial: [],
      industrial: [],
      multifamily: [],
      office: [],
      storage: [],
      other: []
    };

    console.log('📊 Analyzing LEGAL_DESC field...\n');

    while (true) {
      const result = await source.read();
      if (result.done) break;

      totalRecords++;
      const record = result.value;
      const legalDesc = record.LEGAL_DESC || '';
      const ownerName = record.OWNER_NAME || '';
      const combined = `${legalDesc} ${ownerName}`.toLowerCase();

      // Check for keyword matches
      Object.keys(propertyTypeKeywords).forEach(key => {
        const keywords = propertyTypeKeywords[key];
        if (keywords.some(kw => combined.includes(kw))) {
          keywordMatches[key]++;
          
          // Collect samples
          if (samples[key] && samples[key].length < 5) {
            samples[key].push({
              propId: record.Prop_ID,
              owner: ownerName.substring(0, 40),
              legalDesc: legalDesc.substring(0, 60)
            });
          }
        }
      });

      if (totalRecords % 100000 === 0) {
        process.stdout.write(`\r   Processed: ${totalRecords.toLocaleString()} records...`);
      }
    }

    console.log(`\n\n✅ Analysis complete! Processed ${totalRecords.toLocaleString()} records\n`);

    console.log('📊 Property Type Indicators Found in LEGAL_DESC/OWNER_NAME:');
    console.log('Category          | Count      | Percentage');
    console.log('──────────────────┼────────────┼────────────');
    
    const sorted = Object.entries(keywordMatches)
      .sort((a, b) => b[1] - a[1]);
    
    sorted.forEach(([key, count]) => {
      const pct = ((count / totalRecords) * 100).toFixed(2);
      console.log(`${key.padEnd(18)} | ${String(count).padStart(10)} | ${pct.padStart(6)}%`);
    });

    // Show samples
    console.log('\n\n📋 Sample Records by Category:\n');
    Object.keys(samples).forEach(category => {
      if (samples[category].length > 0) {
        console.log(`${category.toUpperCase()}:`);
        samples[category].forEach((sample, idx) => {
          console.log(`  ${idx + 1}. Prop_ID: ${sample.propId}`);
          console.log(`     Owner: ${sample.owner}`);
          console.log(`     Legal: ${sample.legalDesc}`);
        });
        console.log('');
      }
    });

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  }
}

analyzeLegalDesc()
  .then(() => {
    console.log('\n✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });


