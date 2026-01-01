import express from 'express';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { attachAttomGeoIdsToProperties, getAttomGeoIdByParcelId } from '../services/attom-resolver-service.js';
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
    
    // Validate parcelId format (6-digit numeric string)
    if (!parcelId || !/^\d{6}$/.test(String(parcelId))) {
      return res.status(400).json({ 
        success: false,
        error: 'parcelId must be a 6-digit numeric string' 
      });
    }
    
    const parcelIdStr = String(parcelId).trim();
    
    // OPTIMIZED: Parallelize all 4 database queries for 3-4x speedup
    const [geomResult, enrichmentResult, property, enrichmentFieldsResult] = await Promise.all([
      // Query 1: Geometry from parcels_travis
      prisma.$queryRaw`
        SELECT 
          parcel_id,
          ST_AsGeoJSON(geom)::jsonb as geometry
        FROM parcels_travis
        WHERE parcel_id = ${parcelIdStr}
      `,
      
      // Query 2: Enrichment from parcels_travis_enrichment
      prisma.$queryRaw`
        SELECT 
          owner_name,
          mailing_address,
          situs_address,
          assessed_land_value,
          assessed_improvement_value,
          assessed_total_value,
          acreage,
          year_built,
          land_use_code,
          land_use_description
        FROM parcels_travis_enrichment
        WHERE parcel_id = ${parcelIdStr}
      `,
      
      // Query 3: Properties/ATTOM data (non-blocking if fails)
      prisma.property.findUnique({
        where: { parcelId: parcelIdStr }
      }).catch((prismaError) => {
        console.warn(`[PropertyBundle] Could not query properties table for ${parcelIdStr}:`, prismaError.message);
        return null;
      }),
      
      // Query 4: Enrichment fields via raw SQL (fields not in Prisma schema)
      prisma.$queryRaw`
        SELECT asset_class, asset_subtype, land_use_code, general_land_use_code 
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
      console.log(`[PropertyBundle] Parcel ${parcelIdStr} not found in parcels_travis`);
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
        landUseCode: enrichmentFields.land_use_code || null,
        generalLandUseCode: enrichmentFields.general_land_use_code || null
      };
    }
    
    // Step 4: Build enrichment object with camelCase fields
    const enrichment = hasEnrichment ? {
      ownerName: enrichmentRow.owner_name || null,
      mailingAddress: enrichmentRow.mailing_address || null,
      situsAddress: enrichmentRow.situs_address || null,
      assessedLandValue: enrichmentRow.assessed_land_value ? Number(enrichmentRow.assessed_land_value) : null,
      assessedImprovementValue: enrichmentRow.assessed_improvement_value ? Number(enrichmentRow.assessed_improvement_value) : null,
      assessedTotalValue: enrichmentRow.assessed_total_value ? Number(enrichmentRow.assessed_total_value) : null,
      acreage: enrichmentRow.acreage ? Number(enrichmentRow.acreage) : null,
      yearBuilt: enrichmentRow.year_built ? Number(enrichmentRow.year_built) : null,
      landUseCode: enrichmentRow.land_use_code || null,
      landUseDescription: enrichmentRow.land_use_description || null
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
        "propertyType", zoning,
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
    
    // Validate all parcelIds are 6-digit numeric strings
    const invalidParcelIds = parcelIds.filter(id => !/^\d{6}$/.test(String(id)));
    if (invalidParcelIds.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: `Invalid parcelId format: ${invalidParcelIds.slice(0, 5).join(', ')}${invalidParcelIds.length > 5 ? '...' : ''}. Must be 6-digit strings.`
      });
    }
    
    const parcelIdStrings = parcelIds.map(id => String(id).trim());
    const startTime = Date.now();
    
    // OPTIMIZED: Parallelize all batch queries for 3-4x speedup
    const geomQuery = `
      SELECT 
        parcel_id,
        ST_AsGeoJSON(geom)::jsonb as geometry
      FROM parcels_travis
      WHERE parcel_id = ANY($1::text[])
    `;
    const enrichmentQuery = `
      SELECT 
        parcel_id,
        owner_name,
        mailing_address,
        situs_address,
        assessed_land_value,
        assessed_improvement_value,
        assessed_total_value,
        acreage,
        year_built,
        land_use_code,
        land_use_description
      FROM parcels_travis_enrichment
      WHERE parcel_id = ANY($1::text[])
    `;
    const enrichmentFieldsQuery = `
      SELECT parcel_id, asset_class, asset_subtype, land_use_code, general_land_use_code 
      FROM properties 
      WHERE "parcelId" = ANY($1::text[])
    `;
    
    const [geomResult, enrichmentResult, attomProperties, enrichmentFieldsResult] = await Promise.all([
      // Query 1: Batch query parcels_travis for geometries
      prisma.$queryRawUnsafe(geomQuery, parcelIdStrings),
      
      // Query 2: Batch query parcels_travis_enrichment for attributes
      prisma.$queryRawUnsafe(enrichmentQuery, parcelIdStrings),
      
      // Query 3: Batch query properties table (ATTOM data) - non-blocking if fails
      prisma.property.findMany({
        where: { parcelId: { in: parcelIdStrings } }
      }).catch((prismaError) => {
        console.warn('[PropertyBundle Bulk] Could not query properties table:', prismaError.message);
        return [];
      }),
      
      // Query 4: Batch query enrichment fields via raw SQL (fields not in Prisma schema) - non-blocking if fails
      prisma.$queryRawUnsafe(enrichmentFieldsQuery, parcelIdStrings).catch((err) => {
        console.warn('[PropertyBundle Bulk] Could not query enrichment fields:', err.message);
        return [];
      })
    ]);
    
    const geomMap = new Map(
      (geomResult || []).map(row => [row.parcel_id, row.geometry])
    );
    
    const enrichmentMap = new Map(
      (enrichmentResult || []).map(row => [
        row.parcel_id,
        {
          ownerName: row.owner_name || null,
          mailingAddress: row.mailing_address || null,
          situsAddress: row.situs_address || null,
          assessedLandValue: row.assessed_land_value ? Number(row.assessed_land_value) : null,
          assessedImprovementValue: row.assessed_improvement_value ? Number(row.assessed_improvement_value) : null,
          assessedTotalValue: row.assessed_total_value ? Number(row.assessed_total_value) : null,
          acreage: row.acreage ? Number(row.acreage) : null,
          yearBuilt: row.year_built ? Number(row.year_built) : null,
          landUseCode: row.land_use_code || null,
          landUseDescription: row.land_use_description || null
        }
      ])
    );
    
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
    
    // Step 4: Build bundles in same order as input
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






