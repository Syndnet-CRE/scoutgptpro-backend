/**
 * Neon Production Database Read-Only Audit Script
 * 
 * This script connects to Neon production database via Prisma
 * and runs SELECT-only queries to audit the database state.
 * 
 * NO SCHEMA CHANGES. NO DATA MODIFICATIONS. READ-ONLY ONLY.
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env');
dotenv.config({ path: envPath });

const prisma = new PrismaClient();

// Results object to collect all query results
const results = {
  timestamp: new Date().toISOString(),
  environment: 'production Neon',
  queries: {}
};

async function runAudit() {
  try {
    console.log('🔍 Starting Neon production database audit (READ-ONLY)...\n');

    // A) Identify geometry/spatial columns
    console.log('Query A1: Listing all columns in properties table...');
    const allColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='properties'
      ORDER BY ordinal_position;
    `);
    results.queries.allColumns = allColumns;

    console.log('Query A2: Identifying spatial columns...');
    const spatialColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='properties'
        AND (
          udt_name IN ('geometry','geography')
          OR column_name ILIKE '%geom%'
          OR column_name ILIKE '%centroid%'
          OR column_name ILIKE '%lat%'
          OR column_name ILIKE '%lon%'
        )
      ORDER BY column_name;
    `);
    results.queries.spatialColumns = spatialColumns;

    // B) Coverage stats
    console.log('Query B: Coverage statistics...');
    const coverageStats = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE "siteAddress" IS NOT NULL) AS has_site_address,
        COUNT(*) FILTER (WHERE "avmValue" IS NOT NULL) AS has_avm,
        COUNT(*) FILTER (WHERE "lastSaleDate" IS NOT NULL) AS has_last_sale_date,
        COUNT(*) FILTER (WHERE "mortgageAmount" IS NOT NULL) AS has_mortgage,
        COUNT(*) FILTER (WHERE "zoning" IS NOT NULL) AS has_zoning,
        COUNT(*) FILTER (WHERE "attomId" IS NOT NULL) AS has_attom_id
      FROM properties;
    `);
    results.queries.coverageStats = coverageStats;

    // C) parcelId uniqueness
    console.log('Query C: parcelId uniqueness check...');
    const parcelIdUniqueness = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*) AS total,
        COUNT(DISTINCT "parcelId") AS distinct_parcelId
      FROM properties;
    `);
    results.queries.parcelIdUniqueness = parcelIdUniqueness;

    // D) Null/empty drivers
    console.log('Query D: Null/empty checks...');
    const nullEmptyChecks = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*) FILTER (WHERE "parcelId" IS NULL) AS parcelId_null,
        COUNT(*) FILTER (WHERE "parcelId" = '') AS parcelId_empty,
        COUNT(*) FILTER (WHERE "attomId" IS NULL) AS attomId_null
      FROM properties;
    `);
    results.queries.nullEmptyChecks = nullEmptyChecks;

    // E) Geometry column coverage (if exists)
    const geomColumn = spatialColumns.find(col => 
      col.udt_name === 'geometry' || col.udt_name === 'geography' || 
      col.column_name.toLowerCase() === 'geom'
    );

    if (geomColumn) {
      const geomColumnName = geomColumn.column_name;
      console.log(`Query E: Geometry column coverage (${geomColumnName})...`);
      
      // Safely construct query with whitelisted column name
      const geomCoverage = await prisma.$queryRawUnsafe(`
        SELECT 
          COUNT(*) AS total, 
          COUNT(*) FILTER (WHERE "${geomColumnName}" IS NOT NULL) AS has_geom 
        FROM properties;
      `);
      results.queries.geomCoverage = {
        columnName: geomColumnName,
        ...geomCoverage[0]
      };
    } else {
      results.queries.geomCoverage = {
        columnName: null,
        message: 'No geometry column found'
      };
    }

    // F) Travis County scope check
    console.log('Query F: Checking geographic scope...');
    const geographicScope = await prisma.$queryRawUnsafe(`
      SELECT 
        COUNT(*) FILTER (WHERE "county" ILIKE '%travis%') AS travis_county,
        COUNT(*) FILTER (WHERE "county" IS NOT NULL AND "county" NOT ILIKE '%travis%') AS other_counties,
        COUNT(*) FILTER (WHERE "county" IS NULL) AS null_county,
        COUNT(DISTINCT "county") AS distinct_counties
      FROM properties;
    `);
    results.queries.geographicScope = geographicScope;

    // Helper function to convert BigInt to Number for JSON serialization
    function convertBigInt(obj) {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === 'bigint') return Number(obj);
      if (Array.isArray(obj)) return obj.map(convertBigInt);
      if (typeof obj === 'object') {
        const converted = {};
        for (const [key, value] of Object.entries(obj)) {
          converted[key] = convertBigInt(value);
        }
        return converted;
      }
      return obj;
    }

    // Convert all BigInt values to numbers
    const convertedResults = convertBigInt(results);

    // Output results as JSON
    console.log('\n✅ Audit complete. Results:');
    console.log(JSON.stringify(convertedResults, null, 2));

  } catch (error) {
    console.error('❌ Audit failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runAudit();

