import express from 'express';
import pool from '../db/pool.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

/**
 * GET /api/parcels-tx/viewport?bbox=west,south,east,north&limit=5000&countyFips=48453
 * Get parcels in viewport (with optional county filter)
 */
router.get('/viewport', async (req, res) => {
  try {
    const { bbox, limit = 5000, countyFips } = req.query;
    
    if (!bbox) {
      return res.status(400).json({ error: 'bbox parameter required (west,south,east,north)' });
    }
    
    const [west, south, east, north] = bbox.split(',').map(Number);
    
    if (isNaN(west) || isNaN(south) || isNaN(east) || isNaN(north)) {
      return res.status(400).json({ error: 'Invalid bbox format' });
    }
    
    const limitNum = Math.min(parseInt(limit) || 5000, 50000);
    
    // Build WHERE clause
    let whereClause = `
      ST_Intersects(
        geom,
        ST_MakeEnvelope($1, $2, $3, $4, 4326)
      )
    `;
    const params = [west, south, east, north];
    let paramIndex = 5;
    
    // Add county filter if provided
    if (countyFips) {
      whereClause += ` AND county_fips = $${paramIndex++}`;
      params.push(countyFips);
    }
    
    // Query parcels_tx table
    const query = `
      SELECT 
        parcel_uid,
        ST_AsGeoJSON(geom)::jsonb as geometry,
        state_fips,
        county_fips,
        prop_id,
        geo_id
      FROM parcels_tx
      WHERE ${whereClause}
      LIMIT $${paramIndex}
    `;
    
    params.push(limitNum);
    
    const result = await pool.query(query, params);
    
    // Transform to GeoJSON FeatureCollection
    const features = result.rows.map(row => ({
      type: 'Feature',
      id: row.parcel_uid,
      geometry: row.geometry,
      properties: {
        parcelUid: row.parcel_uid,
        stateFips: row.state_fips,
        countyFips: row.county_fips,
        propId: row.prop_id,
        geoId: row.geo_id
      }
    }));
    
    res.set('Cache-Control', 'public, max-age=300'); // 5 min cache
    res.json({
      type: 'FeatureCollection',
      features,
      meta: {
        count: features.length,
        limit: limitNum,
        bbox: [west, south, east, north],
        countyFips: countyFips || 'all'
      }
    });
  } catch (error) {
    console.error('Error fetching parcels-tx viewport:', error);
    res.status(500).json({ error: 'Failed to fetch parcels', details: error.message });
  }
});

/**
 * GET /api/parcels-tx/:parcelUid
 * Get single parcel by UID
 */
router.get('/:parcelUid', async (req, res) => {
  try {
    const { parcelUid } = req.params;
    
    const query = `
      SELECT 
        parcel_uid,
        ST_AsGeoJSON(geom)::jsonb as geometry,
        state_fips,
        county_fips,
        prop_id,
        geo_id,
        source_layer,
        ingested_at
      FROM parcels_tx
      WHERE parcel_uid = $1
    `;
    
    const result = await pool.query(query, [parcelUid]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Parcel not found' });
    }
    
    const row = result.rows[0];
    
    res.set('Cache-Control', 'public, max-age=3600'); // 1 hour cache
    res.json({
      type: 'Feature',
      id: row.parcel_uid,
      geometry: row.geometry,
      properties: {
        parcelUid: row.parcel_uid,
        stateFips: row.state_fips,
        countyFips: row.county_fips,
        propId: row.prop_id,
        geoId: row.geo_id,
        sourceLayer: row.source_layer,
        ingestedAt: row.ingested_at
      }
    });
  } catch (error) {
    console.error('Error fetching parcel-tx:', error);
    res.status(500).json({ error: 'Failed to fetch parcel', details: error.message });
  }
});

/**
 * GET /api/parcels-tx/stats?countyFips=48453
 * Get statistics about ingested parcels
 */
router.get('/stats', async (req, res) => {
  try {
    const { countyFips } = req.query;
    
    let query = 'SELECT COUNT(*) as total, COUNT(DISTINCT county_fips) as counties FROM parcels_tx';
    const params = [];
    
    if (countyFips) {
      query += ' WHERE county_fips = $1';
      params.push(countyFips);
    }
    
    const result = await pool.query(query, params);
    
    res.json({
      total: parseInt(result.rows[0].total),
      counties: parseInt(result.rows[0].counties),
      countyFips: countyFips || 'all'
    });
  } catch (error) {
    console.error('Error fetching parcels-tx stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats', details: error.message });
  }
});

export default router;



