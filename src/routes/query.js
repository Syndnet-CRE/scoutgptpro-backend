import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/query/polygon - Query properties within a polygon
router.post('/polygon', async (req, res) => {
  try {
    const { geometry, filters = {}, limit = 500 } = req.body;
    
    // Validate geometry
    if (!geometry || geometry.type !== 'Polygon') {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid geometry. Must be a GeoJSON Polygon.' 
      });
    }
    
    // Validate coordinates
    if (!geometry.coordinates || !Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid coordinates. Must be an array of coordinate rings.' 
      });
    }
    
    const geojsonString = JSON.stringify(geometry);
    
    // Build filter conditions
    const filterConditions = [];
    const filterParams = [];
    let paramIndex = 1;
    
    if (filters.minValue !== undefined && filters.minValue !== null) {
      filterConditions.push(`"mktValue" >= $${paramIndex}`);
      filterParams.push(parseFloat(filters.minValue));
      paramIndex++;
    }
    if (filters.maxValue !== undefined && filters.maxValue !== null) {
      filterConditions.push(`"mktValue" <= $${paramIndex}`);
      filterParams.push(parseFloat(filters.maxValue));
      paramIndex++;
    }
    if (filters.minAcres !== undefined && filters.minAcres !== null) {
      filterConditions.push(`acres >= $${paramIndex}`);
      filterParams.push(parseFloat(filters.minAcres));
      paramIndex++;
    }
    if (filters.maxAcres !== undefined && filters.maxAcres !== null) {
      filterConditions.push(`acres <= $${paramIndex}`);
      filterParams.push(parseFloat(filters.maxAcres));
      paramIndex++;
    }
    if (filters.propertyType) {
      filterConditions.push(`"propertyType" = $${paramIndex}`);
      filterParams.push(String(filters.propertyType));
      paramIndex++;
    }
    if (filters.isAbsentee === true) {
      filterConditions.push(`"isAbsentee" = true`);
    }
    if (filters.isTaxDelinquent === true) {
      filterConditions.push(`"isTaxDelinquent" = true`);
    }
    if (filters.isVacantLand === true) {
      filterConditions.push(`"isVacantLand" = true`);
    }
    if (filters.minMotivationScore !== undefined && filters.minMotivationScore !== null) {
      filterConditions.push(`"motivationScore" >= $${paramIndex}`);
      filterParams.push(parseInt(filters.minMotivationScore));
      paramIndex++;
    }
    
    const whereClause = filterConditions.length > 0 
      ? `AND ${filterConditions.join(' AND ')}` 
      : '';
    
    const limitValue = Math.min(parseInt(limit) || 500, 10000); // Max 10k
    
    // Query properties within polygon using PostGIS
    // Build parameterized query
    let query = `
      SELECT 
        id,
        "parcelId",
        address,
        "siteAddress",
        "siteCity",
        "siteState",
        "siteZip",
        city,
        state,
        zip,
        county,
        owner,
        "ownerName",
        acres,
        "totalTax",
        "totalDue",
        "mktValue",
        "landValue",
        "impValue",
        latitude,
        longitude,
        "propertyType",
        zoning,
        "yearBuilt",
        "motivationScore",
        "opportunityFlags",
        "isAbsentee",
        "isTaxDelinquent",
        "isVacantLand",
        "legalDesc",
        "taxYear",
        "createdAt",
        "updatedAt"
      FROM properties
      WHERE ST_Within(
        geom,
        ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)
      )
      ${whereClause}
      ORDER BY "motivationScore" DESC NULLS LAST, "mktValue" DESC NULLS LAST
      LIMIT $${paramIndex}::int
    `;
    
    const queryParams = [geojsonString, ...filterParams, limitValue];
    
    const properties = await prisma.$queryRawUnsafe(query, ...queryParams);
    
    // Calculate polygon metadata
    const polygonMetaQuery = `
      SELECT 
        ST_Area(
          ST_Transform(
            ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326), 
            32614
          )
        ) / 4046.86 as area_acres,
        ST_X(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326))) as centroid_lng,
        ST_Y(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326))) as centroid_lat
    `;
    
    const polygonMeta = await prisma.$queryRawUnsafe(polygonMetaQuery, geojsonString);
    
    res.json({
      success: true,
      count: properties.length,
      properties: properties,
      polygon: {
        areaAcres: parseFloat(polygonMeta[0]?.area_acres || 0).toFixed(2),
        centroid: [
          parseFloat(polygonMeta[0]?.centroid_lng || 0),
          parseFloat(polygonMeta[0]?.centroid_lat || 0)
        ]
      },
      filters: filters,
      limit: limitValue
    });
    
  } catch (error) {
    console.error('Polygon query error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;
