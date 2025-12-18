import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const PARCELS_DIR = path.join(__dirname, '../../data/parcels');

// GET /api/parcels/chunk-index
router.get('/chunk-index', (req, res) => {
  try {
    const indexPath = path.join(PARCELS_DIR, 'chunk_index.json');
    
    if (!fs.existsSync(indexPath)) {
      return res.status(404).json({ error: 'Chunk index not found' });
    }
    
    const data = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    res.json(data);
  } catch (error) {
    console.error('Error loading chunk index:', error);
    res.status(500).json({ error: 'Failed to load chunk index' });
  }
});

// GET /api/parcels/chunk/:key
router.get('/chunk/:key', (req, res) => {
  try {
    const { key } = req.params;
    const chunkPath = path.join(PARCELS_DIR, 'chunks', `chunk_${key}.geojson`);
    
    if (!fs.existsSync(chunkPath)) {
      return res.status(404).json({ error: `Chunk ${key} not found` });
    }
    
    const data = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
    
    // Set cache headers for better performance
    res.set('Cache-Control', 'public, max-age=86400'); // 24 hours
    res.json(data);
  } catch (error) {
    console.error('Error loading chunk:', error);
    res.status(500).json({ error: 'Failed to load chunk' });
  }
});

// GET /api/parcels/stats
router.get('/stats', (req, res) => {
  try {
    const indexPath = path.join(PARCELS_DIR, 'chunk_index.json');
    
    if (!fs.existsSync(indexPath)) {
      return res.status(404).json({ error: 'Parcel data not found' });
    }
    
    const data = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    
    res.json({
      totalParcels: data.totalParcels,
      totalChunks: data.totalChunks,
      chunkSize: data.chunkSize
    });
  } catch (error) {
    console.error('Error loading stats:', error);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// GET /api/parcels/centroids - Returns all parcel centroids for clustering
router.get('/centroids', async (req, res) => {
  try {
    const chunksDir = path.join(PARCELS_DIR, 'chunks');
    
    if (!fs.existsSync(chunksDir)) {
      return res.status(404).json({ error: 'Parcel data not found' });
    }
    
    console.log('Building centroids from chunks...');
    
    const files = fs.readdirSync(chunksDir).filter(f => f.endsWith('.geojson'));
    const allCentroids = [];
    
    for (const file of files) {
      const chunkPath = path.join(chunksDir, file);
      const data = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
      
      for (const feature of data.features) {
        const props = feature.properties;
        const centroid = props.centroid;
        
        if (centroid) {
          allCentroids.push({
            type: 'Feature',
            properties: {
              id: props.id,
              owner: props.owner,
              address: props.address,
              acres: props.acres,
              totalTax: props.totalTax,
              taxYear: props.taxYear
            },
            geometry: {
              type: 'Point',
              coordinates: centroid
            }
          });
        }
      }
    }
    
    console.log(`Built ${allCentroids.length} centroids`);
    
    const geojson = {
      type: 'FeatureCollection',
      features: allCentroids
    };
    
    // Cache for 1 hour
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(geojson);
    
  } catch (error) {
    console.error('Error building centroids:', error);
    res.status(500).json({ error: 'Failed to build centroids' });
  }
});

// GET /api/parcels/parcel/:id - Returns single parcel with full geometry
router.get('/parcel/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Search through chunks to find the parcel
    const chunksDir = path.join(PARCELS_DIR, 'chunks');
    const files = fs.readdirSync(chunksDir);
    
    for (const file of files) {
      if (!file.endsWith('.geojson')) continue;
      
      const chunkPath = path.join(chunksDir, file);
      const data = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
      
      const parcel = data.features.find(f => 
        f.properties.id == id || 
        f.properties.Prop_ID == id
      );
      
      if (parcel) {
        res.set('Cache-Control', 'public, max-age=3600');
        return res.json(parcel);
      }
    }
    
    res.status(404).json({ error: 'Parcel not found' });
  } catch (error) {
    console.error('Error finding parcel:', error);
    res.status(500).json({ error: 'Failed to find parcel' });
  }
});

// GET /api/parcels/viewport - Load parcels for current map viewport (zoom 15+)
router.get('/viewport', async (req, res) => {
  try {
    const { bbox, limit = 500 } = req.query;
    
    if (!bbox) {
      return res.status(400).json({ error: 'bbox parameter required (west,south,east,north)' });
    }
    
    const [west, south, east, north] = bbox.split(',').map(Number);
    
    // Validate bbox
    if (isNaN(west) || isNaN(south) || isNaN(east) || isNaN(north)) {
      return res.status(400).json({ error: 'Invalid bbox format' });
    }
    
    // Read chunk index
    const indexPath = path.join(PARCELS_DIR, 'chunk_index.json');
    
    if (!fs.existsSync(indexPath)) {
      return res.json({ type: 'FeatureCollection', features: [], meta: { count: 0, message: 'No parcel data available' } });
    }
    
    const chunkIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    
    const features = [];
    let count = 0;
    const maxLimit = Math.min(parseInt(limit) || 500, 1000);
    
    // Find chunks that intersect with bbox
    for (const chunk of chunkIndex.chunks || []) {
      if (count >= maxLimit) break;
      
      const [cWest, cSouth, cEast, cNorth] = chunk.bbox || [];
      
      // Check if chunk bbox intersects with request bbox
      const intersects = !(cEast < west || cWest > east || cNorth < south || cSouth > north);
      
      if (intersects) {
        const chunkPath = path.join(PARCELS_DIR, 'chunks', chunk.file);
        
        if (fs.existsSync(chunkPath)) {
          try {
            const chunkData = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
            
            // Filter features within bbox
            for (const feature of chunkData.features || []) {
              if (count >= maxLimit) break;
              
              // Check if feature centroid is within bbox
              const centroid = feature.properties?.centroid;
              if (centroid) {
                const [lng, lat] = Array.isArray(centroid) ? centroid : [centroid.lng, centroid.lat];
                if (lng >= west && lng <= east && lat >= south && lat <= north) {
                  features.push(feature);
                  count++;
                }
              } else if (feature.geometry) {
                // If no centroid, try to use geometry center
                features.push(feature);
                count++;
              }
            }
          } catch (e) {
            console.error(`Error reading chunk ${chunk.file}:`, e.message);
          }
        }
      }
    }
    
    console.log(`Viewport query: bbox=[${west},${south},${east},${north}], found ${features.length} parcels`);
    
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      type: 'FeatureCollection',
      features,
      meta: { 
        count: features.length, 
        limit: maxLimit,
        bbox: [west, south, east, north]
      }
    });
    
  } catch (error) {
    console.error('Viewport parcels error:', error);
    res.status(500).json({ error: 'Failed to load parcels', details: error.message });
  }
});

export default router;
