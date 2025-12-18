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
router.get('/centroids', (req, res) => {
  try {
    const centroidsPath = path.join(PARCELS_DIR, 'parcels_centroids.geojson');
    
    if (!fs.existsSync(centroidsPath)) {
      return res.status(404).json({ error: 'Centroids not found' });
    }
    
    // Set cache headers
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Content-Type', 'application/json');
    
    // Stream the file
    const stream = fs.createReadStream(centroidsPath);
    stream.pipe(res);
  } catch (error) {
    console.error('Error loading centroids:', error);
    res.status(500).json({ error: 'Failed to load centroids' });
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

export default router;
