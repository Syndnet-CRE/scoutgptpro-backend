import express from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Initialize database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5
});

/**
 * GET /api/parcels/search?bbox=west,south,east,north&ownerAbsentee=...&minMarketValue=...&landUse=...&yearBuiltMin=...
 * Search parcels with bbox and enrichment filters
 */
router.get('/search', async (req, res) => {
  try {
    const { 
      bbox, 
      ownerAbsentee, 
      minMarketValue, 
      landUse, 
      yearBuiltMin,
      limit = 100 
    } = req.query;
    
    if (!bbox) {
      return res.status(400).json({ error: 'bbox parameter required (west,south,east,north)' });
    }
    
    const [west, south, east, north] = bbox.split(',').map(Number);
    
    if (isNaN(west) || isNaN(south) || isNaN(east) || isNaN(north)) {
      return res.status(400).json({ error: 'Invalid bbox format' });
    }
    
    const limitNum = Math.min(parseInt(limit) || 100, 1000);
    
    // Build WHERE clause
    let whereConditions = [
      `ST_Intersects(pt.geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))`
    ];
    const params = [west, south, east, north];
    let paramIndex = 5;
    
    // Add enrichment filters
    if (ownerAbsentee === 'true') {
      whereConditions.push(`(e.owner_name IS NOT NULL AND e.mail_city IS NOT NULL AND e.mail_city != COALESCE(e.situs_address, ''))`);
    }
    
    if (minMarketValue) {
      whereConditions.push(`(e.market_value >= $${paramIndex++} OR e.assessed_value >= $${paramIndex++})`);
      params.push(parseFloat(minMarketValue), parseFloat(minMarketValue));
    }
    
    if (landUse) {
      whereConditions.push(`(e.land_use ILIKE $${paramIndex++} OR e.land_use_desc ILIKE $${paramIndex++})`);
      const landUsePattern = `%${landUse}%`;
      params.push(landUsePattern, landUsePattern);
    }
    
    if (yearBuiltMin) {
      whereConditions.push(`e.year_built >= $${paramIndex++}`);
      params.push(parseInt(yearBuiltMin));
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // Query with left join to enrichment
    const query = `
      SELECT 
        pt.parcel_id,
        ST_AsGeoJSON(ST_PointOnSurface(pt.geom))::jsonb as centroid,
        e.owner_name,
        e.situs_address,
        e.land_use,
        e.market_value,
        e.year_built
      FROM parcels_travis pt
      LEFT JOIN parcels_travis_enrichment e ON pt.parcel_id = e.parcel_id
      WHERE ${whereClause}
      LIMIT $${paramIndex}
    `;
    
    params.push(limitNum);
    
    const result = await pool.query(query, params);
    
    const features = result.rows.map(row => ({
      parcelId: row.parcel_id,
      centroid: row.centroid,
      enrichment: {
        ownerName: row.owner_name,
        situsAddress: row.situs_address,
        landUse: row.land_use,
        marketValue: row.market_value,
        yearBuilt: row.year_built
      }
    }));
    
    res.set('Cache-Control', 'public, max-age=300'); // 5 min cache
    res.json({
      features,
      count: features.length,
      bbox: [west, south, east, north],
      filters: {
        ownerAbsentee,
        minMarketValue,
        landUse,
        yearBuiltMin
      }
    });
  } catch (error) {
    console.error('Error searching parcels:', error);
    res.status(500).json({ error: 'Failed to search parcels', details: error.message });
  }
});

export default router;

