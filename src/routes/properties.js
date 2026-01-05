import express from 'express';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { attachAttomGeoIdsToProperties, getAttomGeoIdByParcelId } from '../services/attom-resolver-service.js';
import { resolveParcelCounty } from '../services/countyResolver.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const prisma = new PrismaClient();

// Database pool for enrichment queries
const enrichmentPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10  // Increased from 5 to 10 for better concurrency
});

// Unreliable fields (0% coverage in enrichment table)
const UNRELIABLE_FIELDS = [
  'zoningCode',
  'floodZone',
  'taxDelinquentFlag',
  'lastSaleDate',
  'lastSalePrice',
  'homesteadExemptionFlag'
];

/**
 * GET /api/properties
 * Search properties with query parameters
 */
router.get('/', async (req, res) => {
  try {
    const {
      zip,
      city,
      propertyType,
      priceMin,
      priceMax,
      acresMin,
      acresMax,
      absenteeOwner,
      taxDelinquent,
      limit = 50,
      offset = 0
    } = req.query;

    const where = {};

    if (zip) where.siteZip = zip;
    if (city) where.siteCity = { contains: city, mode: 'insensitive' };
    if (propertyType) where.propertyType = propertyType;
    if (absenteeOwner === 'true') where.isAbsentee = true;
    if (taxDelinquent === 'true') where.isTaxDelinquent = true;

    // Price filters (use avmValue or mktValue)
    if (priceMin || priceMax) {
      where.OR = [];
      if (priceMin) {
        where.OR.push(
          { avmValue: { gte: parseFloat(priceMin) } },
          { mktValue: { gte: parseFloat(priceMin) } }
        );
      }
      if (priceMax) {
        where.OR.push(
          { avmValue: { lte: parseFloat(priceMax) } },
          { mktValue: { lte: parseFloat(priceMax) } }
        );
      }
    }

    // Acreage filter
    if (acresMin) where.acres = { ...where.acres, gte: parseFloat(acresMin) };
    if (acresMax) where.acres = { ...where.acres, lte: parseFloat(acresMax) };

    const properties = await prisma.property.findMany({
      where,
      take: Math.min(parseInt(limit), 100),
      skip: parseInt(offset),
      orderBy: [
        { motivationScore: 'desc' },
        { avmValue: 'desc' }
      ]
    });

    const total = await prisma.property.count({ where });

    // Attach ATTOM GeoJSON IDs to properties (preserves existing numeric attomId)
    const propertiesWithAttom = await attachAttomGeoIdsToProperties(properties);

    res.json({
      success: true,
      properties: propertiesWithAttom,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/properties/resolve?parcelId=...
 * Resolve parcelId to propertyId, numeric attomId (if present), and ATTOM GeoJSON ID
 */
router.get('/resolve', async (req, res) => {
  try {
    const { parcelId } = req.query;
    
    if (!parcelId) {
      return res.status(400).json({ 
        success: false, 
        error: 'parcelId query parameter is required' 
      });
    }
    
    const parcelIdStr = String(parcelId).trim();
    
    if (!parcelIdStr || !/^\d{6}$/.test(parcelIdStr)) {
      return res.status(400).json({ 
        success: false, 
        error: 'parcelId must be a 6-digit numeric string' 
      });
    }
    
    // Look up property by parcelId (include numeric attomId if present)
    const property = await prisma.property.findUnique({
      where: { parcelId: parcelIdStr },
      select: { id: true, parcelId: true, attomId: true }
    });
    
    if (!property) {
      return res.status(404).json({ 
        success: false, 
        error: 'No property found for this parcelId' 
      });
    }
    
    // Resolve ATTOM GeoJSON ID (32-hex)
    const { attomGeoId, attomConflict, attomGeoIdSource } = await getAttomGeoIdByParcelId(parcelIdStr);
    
    res.json({ 
      success: true, 
      parcelId: property.parcelId,
      propertyId: property.id,
      attomId: property.attomId || null, // Numeric ATTOM ID from properties table (if present)
      attomGeoId, // 32-hex GeoJSON ID from resolver
      attomConflict,
      attomGeoIdSource
    });
  } catch (error) {
    console.error('Error resolving parcelId:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/properties/parcel/:parcelId
 * PropertyBundle endpoint - returns complete property data keyed by parcel_id
 * 
 * Response shape:
 * {
 *   parcelId: string,
 *   geometry: GeoJSON | null,
 *   enrichment: { ownerName, mailingAddress, situsAddress, ... } | null,
 *   attomProperty: { full properties row } | null,
 *   meta: { enrichmentSource, attomMatched, unreliableFields }
 * }
 */
router.get('/parcel/:parcelId', async (req, res) => {
  try {
    const { parcelId } = req.params;
    
    // Validate parcelId format (non-empty string - formats vary by county)
    if (!parcelId || typeof parcelId !== 'string' || parcelId.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'parcelId is required and must be a non-empty string' 
      });
    }
    
    const parcelIdStr = String(parcelId).trim();
    
    // Resolve county for this parcelId
    const county = await resolveParcelCounty(parcelIdStr, prisma);
    if (!county) {
      console.log(`[PropertyBundle] Parcel ${parcelIdStr} not found in any county`);
      return res.status(404).json({ 
        success: false,
        error: 'Parcel not found in any county' 
      });
    }
    
    console.log(`[PropertyBundle] Resolved parcel ${parcelIdStr} to ${county.name} County (${county.fips})`);
    
    // OPTIMIZED: Parallelize all 4 database queries for 3-4x speedup
    const [geomResult, enrichmentResult, property, enrichmentFieldsResult] = await Promise.all([
      // Query 1: Geometry from county-specific table
      prisma.$queryRawUnsafe(
        `SELECT 
          parcel_id,
          ST_AsGeoJSON(geom)::jsonb as geometry
        FROM ${county.table}
        WHERE parcel_id = $1`,
        parcelIdStr
      ),
      
      // Query 2: Enrichment from county-specific enrichment table
      // Handle Travis County raw JSONB extraction with COALESCE fallbacks
      prisma.$queryRawUnsafe(
        `SELECT 
          owner_name,
          situs_address,
          -- Acres: Travis uses acreage, Williamson uses acres
          COALESCE(acres, acreage) as acres,
          -- Assessed value: Travis uses assessed_total_value
          COALESCE(assessed_value, assessed_total_value) as assessed_value,
          -- Market value: Travis stores in raw JSONB
          COALESCE(
            market_value::numeric,
            CASE WHEN raw IS NOT NULL THEN (raw->>'MKT_VALUE')::numeric ELSE NULL END
          ) as market_value,
          -- Improvement value: Travis stores in raw JSONB
          COALESCE(
            improvement_value::numeric,
            CASE WHEN raw IS NOT NULL THEN (raw->>'IMP_VALUE')::numeric ELSE NULL END
          ) as improvement_value,
          -- Land value: Travis stores in raw JSONB
          COALESCE(
            land_value::numeric,
            CASE WHEN raw IS NOT NULL THEN (raw->>'LAND_VALUE')::numeric ELSE NULL END
          ) as land_value,
          -- Mailing address: Travis stores in raw JSONB, Williamson uses separate columns
          COALESCE(
            mailing_address,
            raw->>'MAIL_ADDR',
            CONCAT_WS(', ',
              NULLIF(mail_address1, ''),
              NULLIF(mail_address2, ''),
              NULLIF(mail_city, ''),
              NULLIF(mail_state, ''),
              NULLIF(mail_zip, '')
            )
          ) as mailing_address,
          mail_address1,
          mail_address2,
          mail_city,
          mail_state,
          mail_zip,
          -- Legal description: Travis stores in raw JSONB
          COALESCE(legal_desc, raw->>'LEGAL_DESC') as legal_desc,
          -- Year built: Travis stores in raw JSONB
          COALESCE(
            year_built,
            CASE 
              WHEN raw IS NOT NULL AND raw->>'YEAR_BUILT' != '' AND raw->>'YEAR_BUILT' IS NOT NULL 
              THEN (raw->>'YEAR_BUILT')::integer 
              ELSE NULL 
            END
          ) as year_built
        FROM ${county.enrichment}
        WHERE parcel_id = $1`,
        parcelIdStr
      ),
      
      // Query 3: Properties/ATTOM data (non-blocking if fails)
      prisma.property.findUnique({
        where: { parcelId: parcelIdStr }
      }).catch((prismaError) => {
        console.warn(`[PropertyBundle] Could not query properties table for ${parcelIdStr}:`, prismaError.message);
        return null;
      }),
      
      // Query 4: Enrichment fields via raw SQL (fields not in Prisma schema)
      prisma.$queryRaw`
        SELECT asset_class, asset_subtype, land_use_code, general_land_use_code, land_use, general_land_use, zoning
        FROM properties 
        WHERE "parcelId" = ${parcelIdStr}
        LIMIT 1
      `.catch((err) => {
        console.warn('[PropertyBundle] Could not query enrichment fields:', err.message);
        return null;
      })
    ]);
    
    // Check if geometry exists (required)
    if (!geomResult || geomResult.length === 0) {
      console.log(`[PropertyBundle] Parcel ${parcelIdStr} not found in ${county.table}`);
      return res.status(404).json({ 
        success: false,
        error: 'Parcel not found' 
      });
    }
    
    const geometry = geomResult[0].geometry;
    const enrichmentRow = enrichmentResult && enrichmentResult.length > 0 ? enrichmentResult[0] : null;
    const hasEnrichment = !!enrichmentRow;
    
    if (hasEnrichment) {
      console.log(`[PropertyBundle] Enrichment found for parcel ${parcelIdStr}`);
    } else {
      console.log(`[PropertyBundle] No enrichment found for parcel ${parcelIdStr}`);
    }
    
    // Process ATTOM property data
    let attomProperty = property;
    if (property) {
      console.log(`[PropertyBundle] ATTOM match found for parcel ${parcelIdStr} (propertyId: ${property.id})`);
    } else {
      console.log(`[PropertyBundle] No ATTOM match for parcel ${parcelIdStr}`);
    }
    
    // Process enrichment fields
    const enrichmentFields = enrichmentFieldsResult && enrichmentFieldsResult[0] ? enrichmentFieldsResult[0] : null;
    
    // Merge enrichment fields into attomProperty
    if (attomProperty && enrichmentFields) {
      attomProperty = {
        ...attomProperty,
        assetType: enrichmentFields.asset_class || attomProperty.propertyType || null,
        assetSubtype: enrichmentFields.asset_subtype || null,
        landUseCode: enrichmentFields.land_use_code || enrichmentFields.land_use || null,
        generalLandUseCode: enrichmentFields.general_land_use_code || enrichmentFields.general_land_use || null,
        landUse: enrichmentFields.land_use || enrichmentFields.land_use_code || null,
        generalLandUse: enrichmentFields.general_land_use || enrichmentFields.general_land_use_code || null,
        zoning: enrichmentFields.zoning || attomProperty.zoning || null
      };
    }
    
    // Step 4: Build enrichment object with camelCase fields
    const enrichment = hasEnrichment ? {
      ownerName: enrichmentRow.owner_name || null,
      mailingAddress: enrichmentRow.mailing_address || [
        enrichmentRow.mail_address1,
        enrichmentRow.mail_address2,
        enrichmentRow.mail_city,
        enrichmentRow.mail_state,
        enrichmentRow.mail_zip
      ].filter(Boolean).join(', ') || null,
      situsAddress: enrichmentRow.situs_address || null,
      landValue: enrichmentRow.land_value ? Number(enrichmentRow.land_value) : null,
      improvementValue: enrichmentRow.improvement_value ? Number(enrichmentRow.improvement_value) : null,
      marketValue: enrichmentRow.market_value ? Number(enrichmentRow.market_value) : null,
      assessedValue: enrichmentRow.assessed_value ? Number(enrichmentRow.assessed_value) : null,
      acres: enrichmentRow.acres ? Number(enrichmentRow.acres) : null,
      yearBuilt: enrichmentRow.year_built ? Number(enrichmentRow.year_built) : null,
      legalDesc: enrichmentRow.legal_desc || null
    } : null;
    
    // Step 5: Build response
    const bundle = {
      parcelId: parcelIdStr,
      geometry: geometry,
      enrichment: enrichment,
      core: attomProperty,
      meta: {
        enrichmentSource: hasEnrichment ? 'tcad' : null,
        attomMatched: !!attomProperty,
        unreliableFields: UNRELIABLE_FIELDS
      }
    };
    
    res.json(bundle);
  } catch (error) {
    console.error(`[PropertyBundle] Error fetching bundle for ${req.params.parcelId}:`, error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /api/properties/:id
 * Get single property by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const property = await prisma.property.findUnique({
      where: { id: req.params.id }
    });

    if (!property) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }

    // Attach ATTOM GeoJSON ID (preserves existing numeric attomId)
    const [propertyWithAttom] = await attachAttomGeoIdsToProperties([property]);

    res.json({ success: true, property: propertyWithAttom });
  } catch (error) {
    console.error('Error fetching property:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/properties/bbox
 * Get properties in bounding box
 */
router.get('/bbox', async (req, res) => {
  try {
    const { minLat, maxLat, minLng, maxLng, limit = 100 } = req.query;

    if (!minLat || !maxLat || !minLng || !maxLng) {
      return res.status(400).json({
        success: false,
        error: 'minLat, maxLat, minLng, maxLng are required'
      });
    }

    const properties = await prisma.property.findMany({
      where: {
        latitude: {
          gte: parseFloat(minLat),
          lte: parseFloat(maxLat)
        },
        longitude: {
          gte: parseFloat(minLng),
          lte: parseFloat(maxLng)
        }
      },
      take: Math.min(parseInt(limit), 500),
      orderBy: [
        { motivationScore: 'desc' },
        { avmValue: 'desc' }
      ]
    });

    // Attach ATTOM GeoJSON IDs to properties (preserves existing numeric attomId)
    const propertiesWithAttom = await attachAttomGeoIdsToProperties(properties);

    res.json({
      success: true,
      properties: propertiesWithAttom,
      count: propertiesWithAttom.length,
      bbox: {
        minLat: parseFloat(minLat),
        maxLat: parseFloat(maxLat),
        minLng: parseFloat(minLng),
        maxLng: parseFloat(maxLng)
      }
    });
  } catch (error) {
    console.error('Error fetching properties by bbox:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/properties/search
 * Search properties with required bbox and optional filters
 */
router.post('/search', async (req, res) => {
  try {
    const { bbox, filters = {}, limit = 100, offset = 0 } = req.body;
    
    console.log('🔍 Property search request received at /api/properties/search');
    console.log('🔍 Property search request:', { bbox, filters, limit });
    
    // CRITICAL: bbox is REQUIRED
    if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) {
      return res.status(400).json({
        success: false,
        error: 'bbox is required. Format: [west, south, east, north]'
      });
    }
    
    const [west, south, east, north] = bbox;
    
    // Build WHERE clause
    const whereConditions = [];
    const params = [];
    let paramIndex = 1;
    
    // Spatial filter (REQUIRED) - using PostGIS if available, otherwise lat/lng
    whereConditions.push(`
      longitude >= $${paramIndex++} AND longitude <= $${paramIndex++}
      AND latitude >= $${paramIndex++} AND latitude <= $${paramIndex++}
    `);
    params.push(west, east, south, north);
    
    // Property type filter
    if (filters.propertyType) {
      whereConditions.push(`"propertyType" ILIKE $${paramIndex++}`);
      params.push(`%${filters.propertyType}%`);
    }
    
    // Absentee owner filter
    if (filters.absenteeOwner === true) {
      whereConditions.push(`"isAbsentee" = true`);
    }
    
    // Price filters - using mktValue or landValue
    if (filters.maxPrice) {
      whereConditions.push(`("mktValue" <= $${paramIndex++} OR "landValue" <= $${paramIndex++})`);
      params.push(filters.maxPrice, filters.maxPrice);
    }
    if (filters.minPrice) {
      whereConditions.push(`("mktValue" >= $${paramIndex++} OR "landValue" >= $${paramIndex++})`);
      params.push(filters.minPrice, filters.minPrice);
    }
    
    // Acreage filter
    if (filters.minAcres) {
      whereConditions.push(`acres >= $${paramIndex++}`);
      params.push(filters.minAcres);
    }
    
    // Units filter (if available in schema)
    if (filters.minUnits) {
      // Note: Adjust field name based on actual schema
      whereConditions.push(`1=1`); // Placeholder - add actual units field if exists
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // Execute query
    const query = `
      SELECT 
        id, "parcelId", address, "siteAddress", "siteCity", "siteState", "siteZip",
        city, state, zip, county, owner, "ownerName",
        latitude, longitude,
        "propertyType", zoning, land_use, general_land_use,
        "mktValue", "landValue", "impValue",
        acres, "totalTax", "totalDue",
        "yearBuilt", "motivationScore", "opportunityFlags",
        "isAbsentee", "isTaxDelinquent", "isVacantLand",
        "legalDesc", "taxYear",
        "mortgageAmount", "mortgageLender", "mortgageRate", "mortgageTerm",
        "lastSaleDate", "lastSaleAmount", "lastSaleDocType",
        "grantorName", "granteeName",
        "granteeMailAddress", "granteeMailCity", "granteeMailState", "granteeMailZip",
        "isInvestorOwned", "isForeclosure", "ownershipYears",
        "createdAt", "updatedAt"
      FROM properties
      WHERE ${whereClause}
      ORDER BY "motivationScore" DESC NULLS LAST, "mktValue" DESC NULLS LAST
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex++}
    `;
    
    params.push(limit, offset);
    
    console.log('📊 Executing query with bbox:', [west.toFixed(3), south.toFixed(3), east.toFixed(3), north.toFixed(3)]);
    
    const properties = await prisma.$queryRawUnsafe(query, ...params);
    
    console.log(`✅ Found ${properties.length} properties in bbox [${west.toFixed(3)}, ${south.toFixed(3)}, ${east.toFixed(3)}, ${north.toFixed(3)}]`);
    
    // Attach ATTOM GeoJSON IDs to properties (preserves existing numeric attomId)
    const propertiesWithAttom = await attachAttomGeoIdsToProperties(properties);
    
    res.json({
      success: true,
      properties: propertiesWithAttom,
      count: propertiesWithAttom.length,
      bbox,
      filters
    });
    
  } catch (error) {
    console.error('❌ Property search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * POST /api/properties/bulk
 * Bulk fetch PropertyBundles for multiple parcelIds
 * 
 * Body: { parcelIds: string[] } (max 500)
 * Response: { items: PropertyBundle[] } (same order as input)
 * For missing parcels: { parcelId: "xxx", error: "not found" }
 */
router.post('/bulk', async (req, res) => {
  try {
    const { parcelIds } = req.body;
    
    if (!Array.isArray(parcelIds) || parcelIds.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'parcelIds must be a non-empty array' 
      });
    }
    
    if (parcelIds.length > 500) {
      return res.status(400).json({ 
        success: false,
        error: 'Maximum 500 parcelIds allowed per request' 
      });
    }
    
    // Validate all parcelIds are non-empty strings
    const invalidParcelIds = parcelIds.filter(id => !id || typeof id !== 'string' || id.trim().length === 0);
    if (invalidParcelIds.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: `Invalid parcelId format: ${invalidParcelIds.slice(0, 5).join(', ')}${invalidParcelIds.length > 5 ? '...' : ''}. Must be non-empty strings.`
      });
    }
    
    const parcelIdStrings = parcelIds.map(id => String(id).trim());
    const startTime = Date.now();
    
    // Step 1: Resolve county for each parcelId (parallel)
    const countyResolutions = await Promise.all(
      parcelIdStrings.map(parcelId => resolveParcelCounty(parcelId, prisma))
    );
    
    // Step 2: Group parcelIds by county
    const countyGroups = new Map(); // county.fips -> {county, parcelIds[]}
    parcelIdStrings.forEach((parcelId, index) => {
      const county = countyResolutions[index];
      if (county) {
        if (!countyGroups.has(county.fips)) {
          countyGroups.set(county.fips, {
            county,
            parcelIds: []
          });
        }
        countyGroups.get(county.fips).parcelIds.push(parcelId);
      }
    });
    
    // Step 3: Query each county table in parallel
    const queryPromises = Array.from(countyGroups.values()).map(async ({ county, parcelIds }) => {
      const geomQuery = `
        SELECT 
          parcel_id,
          ST_AsGeoJSON(geom)::jsonb as geometry
        FROM ${county.table}
        WHERE parcel_id = ANY($1::text[])
      `;
      const enrichmentQuery = `
        SELECT 
          parcel_id,
          owner_name,
          mail_address1,
          mail_address2,
          mail_city,
          mail_state,
          mail_zip,
          situs_address,
          land_value,
          improvement_value,
          market_value,
          assessed_value,
          acres,
          acreage,
          year_built,
          legal_desc
        FROM ${county.enrichment}
        WHERE parcel_id = ANY($1::text[])
      `;
      
      const [geomResult, enrichmentResult] = await Promise.all([
        prisma.$queryRawUnsafe(geomQuery, parcelIds),
        prisma.$queryRawUnsafe(enrichmentQuery, parcelIds)
      ]);
      
      return {
        county,
        parcelIds,
        geomResult: geomResult || [],
        enrichmentResult: enrichmentResult || []
      };
    });
    
    const countyResults = await Promise.all(queryPromises);
    
    // Step 4: Query properties table and enrichment fields (all parcels together)
    const enrichmentFieldsQuery = `
      SELECT parcel_id, asset_class, asset_subtype, land_use_code, general_land_use_code 
      FROM properties 
      WHERE "parcelId" = ANY($1::text[])
    `;
    
    const [attomProperties, enrichmentFieldsResult] = await Promise.all([
      
      // Query properties table (ATTOM data) - non-blocking if fails
      prisma.property.findMany({
        where: { parcelId: { in: parcelIdStrings } }
      }).catch((prismaError) => {
        console.warn('[PropertyBundle Bulk] Could not query properties table:', prismaError.message);
        return [];
      }),
      
      // Query enrichment fields via raw SQL (fields not in Prisma schema) - non-blocking if fails
      prisma.$queryRawUnsafe(enrichmentFieldsQuery, parcelIdStrings).catch((err) => {
        console.warn('[PropertyBundle Bulk] Could not query enrichment fields:', err.message);
        return [];
      })
    ]);
    
    // Step 5: Build maps from county-specific results
    const geomMap = new Map();
    const enrichmentMap = new Map();
    
    countyResults.forEach(({ geomResult, enrichmentResult }) => {
      geomResult.forEach(row => {
        geomMap.set(row.parcel_id, row.geometry);
      });
      enrichmentResult.forEach(row => {
        enrichmentMap.set(row.parcel_id, {
          ownerName: row.owner_name || null,
          mailingAddress: [
            row.mail_address1,
            row.mail_address2,
            row.mail_city,
            row.mail_state,
            row.mail_zip
          ].filter(Boolean).join(', ') || null,
          situsAddress: row.situs_address || null,
          landValue: row.land_value ? Number(row.land_value) : null,
          improvementValue: row.improvement_value ? Number(row.improvement_value) : null,
          marketValue: row.market_value ? Number(row.market_value) : null,
          assessedValue: row.assessed_value ? Number(row.assessed_value) : null,
          acres: row.acres ? Number(row.acres) : null,
          acreage: row.acreage ? Number(row.acreage) : null,
          yearBuilt: row.year_built ? Number(row.year_built) : null,
          legalDesc: row.legal_desc || null
        });
      });
    });
    
    const attomMap = new Map(
      (attomProperties || []).map(property => [property.parcelId, property])
    );
    
    // Process enrichment fields (already fetched in Promise.all above)
    const enrichmentFieldsMap = new Map(
      (enrichmentFieldsResult || []).map(row => [row.parcelId, row])
    );
    
    // Merge enrichment fields into attomProperty objects
    for (const [parcelId, property] of attomMap.entries()) {
      const enrichmentFields = enrichmentFieldsMap.get(parcelId);
      if (enrichmentFields) {
        attomMap.set(parcelId, {
          ...property,
          assetType: enrichmentFields.asset_class || property.propertyType || null,
          assetSubtype: enrichmentFields.asset_subtype || null,
          landUseCode: enrichmentFields.land_use_code || null,
          generalLandUseCode: enrichmentFields.general_land_use_code || null
        });
      }
    }
    
    // Step 6: Build bundles in same order as input
    const bundles = parcelIdStrings.map(parcelId => {
      const geometry = geomMap.get(parcelId) || null;
      const enrichment = enrichmentMap.get(parcelId) || null;
      const attomProperty = attomMap.get(parcelId) || null;
      
      // If parcel not found, return error object
      if (!geometry) {
        return {
          parcelId: parcelId,
          error: 'not found'
        };
      }
      
      return {
        parcelId: parcelId,
        geometry: geometry,
        enrichment: enrichment,
        core: attomProperty,
        meta: {
          enrichmentSource: enrichment ? 'tcad' : null,
          attomMatched: !!attomProperty,
          unreliableFields: UNRELIABLE_FIELDS
        }
      };
    });
    
    const processingTime = Date.now() - startTime;
    const enrichmentCount = bundles.filter(b => b.enrichment && !b.error).length;
    const attomCount = bundles.filter(b => b.core && !b.error).length;
    const geometryCount = bundles.filter(b => b.geometry && !b.error).length;
    const notFoundCount = bundles.filter(b => b.error === 'not found').length;
    
    console.log(`[PropertyBundle Bulk] Processed ${bundles.length} parcels in ${processingTime}ms. Geometry: ${geometryCount}, Enrichment: ${enrichmentCount}, ATTOM: ${attomCount}, Not Found: ${notFoundCount}`);
    
    res.json({ items: bundles });
  } catch (error) {
    console.error('[PropertyBundle Bulk] Error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

export default router;






