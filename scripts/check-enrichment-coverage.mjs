/**
 * Check enrichment table coverage and data completeness
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkEnrichmentCoverage() {
  try {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    ENRICHMENT COVERAGE ANALYSIS                              ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // 1. Coverage statistics
    const totalParcels = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as total_parcels FROM parcels_travis;
    `);
    console.log('TOTAL PARCELS (parcels_travis):');
    console.table(totalParcels);

    const enrichedParcels = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as enriched_parcels FROM parcels_travis_enrichment;
    `);
    console.log('ENRICHED PARCELS (parcels_travis_enrichment):');
    console.table(enrichedParcels);

    const propertiesTotal = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as properties_total FROM properties;
    `);
    console.log('TOTAL PROPERTIES:');
    console.table(propertiesTotal);

    // Calculate coverage percentage
    const coverage = {
      parcels_total: Number(totalParcels[0].total_parcels),
      enriched_count: Number(enrichedParcels[0].enriched_parcels),
      properties_count: Number(propertiesTotal[0].properties_total),
    };
    coverage.enrichment_coverage_pct = coverage.parcels_total > 0 
      ? ((coverage.enriched_count / coverage.parcels_total) * 100).toFixed(2)
      : '0.00';
    coverage.properties_to_parcels_pct = coverage.parcels_total > 0
      ? ((coverage.properties_count / coverage.parcels_total) * 100).toFixed(2)
      : '0.00';

    console.log('\nCOVERAGE SUMMARY:');
    console.table([coverage]);

    // 2. Field completeness in enrichment table
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    ENRICHMENT TABLE FIELD COMPLETENESS                       ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    const fieldCompleteness = await prisma.$queryRawUnsafe(`
      SELECT 
        COUNT(*) as total_rows,
        COUNT(owner_name) as has_owner_name,
        COUNT(mailing_address) as has_mailing_address,
        COUNT(situs_address) as has_situs_address,
        COUNT(assessed_land_value) as has_land_value,
        COUNT(assessed_total_value) as has_total_value,
        COUNT(acreage) as has_acreage,
        COUNT(year_built) as has_year_built,
        COUNT(zoning_code) as has_zoning,
        COUNT(land_use_code) as has_land_use_code,
        COUNT(land_use_description) as has_land_use_desc,
        COUNT(flood_zone) as has_flood_zone,
        COUNT(land_use) as has_land_use,
        COUNT(land_use_desc) as has_land_use_desc_alt,
        COUNT(last_sale_date) as has_last_sale_date,
        COUNT(last_sale_price) as has_last_sale_price,
        COUNT(tax_delinquent_flag) as has_tax_delinquent
      FROM parcels_travis_enrichment;
    `);

    const completeness = fieldCompleteness[0];
    const totalRows = Number(completeness.total_rows);
    
    // Calculate percentages
    const completenessWithPct = {
      total_rows: totalRows,
      owner_name: `${completeness.has_owner_name} (${((Number(completeness.has_owner_name) / totalRows) * 100).toFixed(1)}%)`,
      mailing_address: `${completeness.has_mailing_address} (${((Number(completeness.has_mailing_address) / totalRows) * 100).toFixed(1)}%)`,
      situs_address: `${completeness.has_situs_address} (${((Number(completeness.has_situs_address) / totalRows) * 100).toFixed(1)}%)`,
      assessed_land_value: `${completeness.has_land_value} (${((Number(completeness.has_land_value) / totalRows) * 100).toFixed(1)}%)`,
      assessed_total_value: `${completeness.has_total_value} (${((Number(completeness.has_total_value) / totalRows) * 100).toFixed(1)}%)`,
      acreage: `${completeness.has_acreage} (${((Number(completeness.has_acreage) / totalRows) * 100).toFixed(1)}%)`,
      year_built: `${completeness.has_year_built} (${((Number(completeness.has_year_built) / totalRows) * 100).toFixed(1)}%)`,
      zoning_code: `${completeness.has_zoning} (${((Number(completeness.has_zoning) / totalRows) * 100).toFixed(1)}%)`,
      land_use_code: `${completeness.has_land_use_code} (${((Number(completeness.has_land_use_code) / totalRows) * 100).toFixed(1)}%)`,
      land_use_description: `${completeness.has_land_use_desc} (${((Number(completeness.has_land_use_desc) / totalRows) * 100).toFixed(1)}%)`,
      flood_zone: `${completeness.has_flood_zone} (${((Number(completeness.has_flood_zone) / totalRows) * 100).toFixed(1)}%)`,
      land_use: `${completeness.has_land_use} (${((Number(completeness.has_land_use) / totalRows) * 100).toFixed(1)}%)`,
      land_use_desc: `${completeness.has_land_use_desc_alt} (${((Number(completeness.has_land_use_desc_alt) / totalRows) * 100).toFixed(1)}%)`,
      last_sale_date: `${completeness.has_last_sale_date} (${((Number(completeness.has_last_sale_date) / totalRows) * 100).toFixed(1)}%)`,
      last_sale_price: `${completeness.has_last_sale_price} (${((Number(completeness.has_last_sale_price) / totalRows) * 100).toFixed(1)}%)`,
      tax_delinquent_flag: `${completeness.has_tax_delinquent} (${((Number(completeness.has_tax_delinquent) / totalRows) * 100).toFixed(1)}%)`,
    };

    console.log('FIELD COMPLETENESS (count and percentage):');
    console.table([completenessWithPct]);

    // 3. Check source_layer field
    const sourceLayers = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT source_layer, COUNT(*) as count
      FROM parcels_travis_enrichment
      WHERE source_layer IS NOT NULL
      GROUP BY source_layer
      ORDER BY COUNT(*) DESC;
    `);
    console.log('\nSOURCE LAYERS (data sources):');
    console.table(sourceLayers);

    // 4. Sample rows to see what data exists
    const samples = await prisma.$queryRawUnsafe(`
      SELECT 
        parcel_id,
        owner_name,
        situs_address,
        assessed_total_value,
        acreage,
        year_built,
        zoning_code,
        land_use_code,
        land_use_description,
        source_layer
      FROM parcels_travis_enrichment
      WHERE owner_name IS NOT NULL
      LIMIT 5;
    `);
    console.log('\nSAMPLE ENRICHED ROWS:');
    console.table(samples);

  } catch (error) {
    console.error('Error querying database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkEnrichmentCoverage()
  .then(() => {
    console.log('\n✅ Query completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Query failed:', error);
    process.exit(1);
  });


