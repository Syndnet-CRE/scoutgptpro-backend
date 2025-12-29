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

// GET /api/mts/centroids?bbox=minLng,minLat,maxLng,maxLat&limit=50000
router.get('/centroids', async (req, res) => {
  try {
    const { bbox, limit = 50000 } = req.query;
    
    if (!bbox) {
      return res.status(400).json({ error: 'bbox parameter required (minLng,minLat,maxLng,maxLat)' });
    }
    
    const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);
    
    if (isNaN(minLng) || isNaN(minLat) || isNaN(maxLng) || isNaN(maxLat)) {
      return res.status(400).json({ error: 'Invalid bbox format. Expected: minLng,minLat,maxLng,maxLat' });
    }
    
    const limitNum = parseInt(limit, 10);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 50000) {
      return res.status(400).json({ error: 'limit must be between 1 and 50000' });
    }
    
    // Query centroids from parcels_travis table
    // Use ST_PointOnSurface to get centroid point, transform to GeoJSON
    const query = `
      SELECT 
        pt.parcel_id as "parcelId",
        ST_AsGeoJSON(ST_PointOnSurface(pt.geom))::jsonb as geometry,
        EXISTS(SELECT 1 FROM properties p WHERE p."parcelId" = pt.parcel_id) as "hasProperty",
        COALESCE(p."motivationScore", 0) as "motivationScore"
      FROM parcels_travis pt
      LEFT JOIN properties p ON p."parcelId" = pt.parcel_id
      WHERE ST_Intersects(
        pt.geom,
        ST_MakeEnvelope($1, $2, $3, $4, 4326)
      )
      LIMIT $5
    `;
    
    const result = await pool.query(query, [minLng, minLat, maxLng, maxLat, limitNum]);
    
    // Transform to GeoJSON FeatureCollection
    const features = result.rows.map(row => {
      // Parse geometry JSONB to get coordinates
      const geom = row.geometry;
      return {
        type: 'Feature',
        geometry: geom,
        properties: {
          parcelId: row.parcelId,
          hasProperty: row.hasProperty,
          motivationScore: row.motivationScore
        }
      };
    });
    
    const geojson = {
      type: 'FeatureCollection',
      features: features
    };
    
    // Set cache headers
    res.set('Cache-Control', 'public, max-age=300'); // 5 minutes
    
    res.json(geojson);
  } catch (error) {
    console.error('Error fetching centroids:', error);
    res.status(500).json({ error: 'Failed to fetch centroids', details: error.message });
  }
});

export default router;

