import express from 'express';
import pg from 'pg';

const router = express.Router();

// Create connection pool for PostGIS queries
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10
});

// GET /api/boundaries/zip
// Returns ZIP boundaries as GeoJSON for choropleth visualization
router.get('/zip', async (req, res) => {
  try {
    const { zips } = req.query;
    
    let query = `
      SELECT 
        zcta5 as zip,
        ST_AsGeoJSON(geom)::json as geometry
      FROM zip_boundaries
    `;
    
    const values = [];
    
    if (zips) {
      const zipArray = zips.split(',').map(z => z.trim().padStart(5, '0'));
      query += ` WHERE zcta5 = ANY($1)`;
      values.push(zipArray);
    }
    
    query += ` ORDER BY zcta5`;
    
    const result = await pool.query(query, values);
    
    const geojson = {
      type: 'FeatureCollection',
      features: result.rows.map(row => ({
        type: 'Feature',
        properties: { zip: row.zip },
        geometry: row.geometry
      }))
    };
    
    res.json({
      success: true,
      count: result.rows.length,
      data: geojson
    });
    
  } catch (error) {
    console.error('Error fetching ZIP boundaries:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch ZIP boundaries' 
    });
  }
});

// GET /api/boundaries/zip/:zipCode
router.get('/zip/:zipCode', async (req, res) => {
  try {
    const zipCode = req.params.zipCode.padStart(5, '0');
    
    const result = await pool.query(`
      SELECT 
        zcta5 as zip,
        ST_AsGeoJSON(geom)::json as geometry,
        aland,
        awater
      FROM zip_boundaries
      WHERE zcta5 = $1
    `, [zipCode]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'ZIP code not found' 
      });
    }
    
    const row = result.rows[0];
    res.json({
      success: true,
      data: {
        type: 'Feature',
        properties: { 
          zip: row.zip,
          aland: row.aland,
          awater: row.awater
        },
        geometry: row.geometry
      }
    });
    
  } catch (error) {
    console.error('Error fetching ZIP boundary:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch ZIP boundary' 
    });
  }
});

export default router;
