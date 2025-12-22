import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/properties/search
 * Search properties with required bbox and optional filters
 */
router.post('/search', async (req, res) => {
  try {
    const { bbox, filters = {}, limit = 100, offset = 0 } = req.body;
    
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
