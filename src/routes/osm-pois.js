/**
 * OSM POI API Routes
 */

import express from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Database pool for OSM POI queries
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10
});

/**
 * GET /api/osm-pois
 * Query POIs by category and optional bounding box
 * 
 * Query params:
 * - category: required (e.g., 'self_storage')
 * - bbox: optional (west,south,east,north)
 * - limit: optional (default 100)
 */
router.get('/', async (req, res) => {
  try {
    const { category, bbox, limit = 100 } = req.query;
    
    if (!category) {
      return res.status(400).json({ error: 'category is required' });
    }
    
    let query = `
      SELECT 
        poi.id, 
        poi.osm_id, 
        poi.name, 
        poi.category, 
        poi.subcategory,
        poi.latitude, 
        poi.longitude, 
        poi.address, 
        poi.city, 
        poi.state, 
        poi.zip,
        poi.phone, 
        poi.website, 
        poi.tags,
        poi.property_id,
        -- Property data (null if not linked)
        p."siteAddress" as property_address,
        p.owner as property_owner,
        p."mktValue" as property_market_value,
        p."assessedValue" as property_assessed_value,
        p."totalTax" as property_total_tax,
        p.acres as property_acres,
        p."yearBuilt" as property_year_built,
        p.zoning as property_zoning,
        p."propertyType" as property_type
      FROM osm_pois_travis poi
      LEFT JOIN properties p ON poi.property_id = p.id
      WHERE poi.category = $1
    `;
    const params = [category];
    
    // Add bounding box filter if provided
    if (bbox) {
      const [west, south, east, north] = bbox.split(',').map(Number);
      query += ` AND poi.longitude >= $2 AND poi.longitude <= $3 AND poi.latitude >= $4 AND poi.latitude <= $5`;
      params.push(west, east, south, north);
    }
    
    query += ` ORDER BY poi.name LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      count: result.rows.length,
      category,
      pois: result.rows
    });
    
  } catch (err) {
    console.error('[OSM POIs] Error:', err);
    res.status(500).json({ error: 'Failed to fetch POIs' });
  }
});

/**
 * GET /api/osm-pois/nearby
 * Find POIs near a point
 * 
 * Query params:
 * - category: required
 * - lat: required
 * - lng: required
 * - radius: optional (meters, default 5000)
 * - limit: optional (default 20)
 */
router.get('/nearby', async (req, res) => {
  try {
    const { category, lat, lng, radius = 5000, limit = 20 } = req.query;
    
    if (!category || !lat || !lng) {
      return res.status(400).json({ error: 'category, lat, and lng are required' });
    }
    
    const query = `
      SELECT 
        id, osm_id, name, category, subcategory,
        latitude, longitude, address, city, state, zip,
        phone, website, tags,
        ST_Distance(
          geom::geography,
          ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
        ) as distance_meters
      FROM osm_pois_travis
      WHERE category = $1
        AND ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
          $4
        )
      ORDER BY distance_meters
      LIMIT $5
    `;
    
    const result = await pool.query(query, [
      category,
      parseFloat(lng),
      parseFloat(lat),
      parseInt(radius),
      parseInt(limit)
    ]);
    
    res.json({
      success: true,
      count: result.rows.length,
      category,
      center: { lat: parseFloat(lat), lng: parseFloat(lng) },
      radius_meters: parseInt(radius),
      pois: result.rows
    });
    
  } catch (err) {
    console.error('[OSM POIs Nearby] Error:', err);
    res.status(500).json({ error: 'Failed to fetch nearby POIs' });
  }
});

/**
 * GET /api/osm-pois/categories
 * List available POI categories
 */
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT category, subcategory, COUNT(*) as count
      FROM osm_pois_travis
      GROUP BY category, subcategory
      ORDER BY category, subcategory
    `);
    
    res.json({
      success: true,
      categories: result.rows
    });
    
  } catch (err) {
    console.error('[OSM POIs Categories] Error:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

export default router;

