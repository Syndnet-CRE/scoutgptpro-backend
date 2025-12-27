import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

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

    res.json({
      success: true,
      properties,
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

    res.json({ success: true, property });
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

    res.json({
      success: true,
      properties,
      count: properties.length,
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
    
    res.json({
      success: true,
      properties,
      count: properties.length,
      bbox,
      filters
    });
    
  } catch (error) {
    console.error('❌ Property search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;






