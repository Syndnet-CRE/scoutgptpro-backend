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
    console.log('📍 Fetching parcel:', id);
    
    // Read chunk index to find which chunks might contain this parcel
    const indexPath = path.join(PARCELS_DIR, 'chunk_index.json');
    
    if (!fs.existsSync(indexPath)) {
      return res.status(404).json({ error: 'Parcel data not available' });
    }
    
    const chunkIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    
    // Search through chunks for the parcel
    for (const chunk of chunkIndex.chunks || []) {
      let chunkFile = chunk.file || chunk.filename;
      if (!chunkFile.includes('chunks/')) {
        chunkFile = path.join('chunks', chunkFile);
      }
      
      const chunkPath = path.join(PARCELS_DIR, chunkFile);
      
      if (fs.existsSync(chunkPath)) {
        try {
          const chunkData = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
          
          const feature = chunkData.features?.find(f => 
            f.properties?.id === id || 
            f.id === id || 
            String(f.properties?.id) === String(id) ||
            String(f.properties?.Prop_ID) === String(id)
          );
          
          if (feature) {
            console.log('✅ Found parcel:', id);
            res.set('Cache-Control', 'public, max-age=3600');
            return res.json({
              id,
              properties: feature.properties,
              geometry: feature.geometry
            });
          }
        } catch (e) {
          console.error(`Error reading chunk ${chunkFile}:`, e.message);
        }
      }
    }
    
    console.log('❌ Parcel not found:', id);
    res.status(404).json({ error: 'Parcel not found' });
    
  } catch (error) {
    console.error('❌ Error fetching parcel:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/parcels/viewport - Load parcels for current map viewport
router.get('/viewport', async (req, res) => {
  try {
    const { bbox, limit = 500 } = req.query;
    
    console.log('📡 Viewport request:', { bbox, limit });
    
    if (!bbox) {
      return res.status(400).json({ error: 'bbox required (west,south,east,north)' });
    }
    
    const [west, south, east, north] = bbox.split(',').map(Number);
    console.log('📍 Parsed bbox:', { west, south, east, north });
    
    // Read chunk index
    const indexPath = path.join(PARCELS_DIR, 'chunk_index.json');
    console.log('📁 Index path:', indexPath);
    console.log('📁 Index exists:', fs.existsSync(indexPath));
    
    if (!fs.existsSync(indexPath)) {
      console.log('❌ No chunk_index.json found');
      return res.json({ type: 'FeatureCollection', features: [], debug: 'No index file' });
    }
    
    const chunkIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    console.log('📦 Chunk index keys:', Object.keys(chunkIndex));
    console.log('📦 Number of chunks:', chunkIndex.chunks?.length || 0);
    
    if (chunkIndex.chunks?.length > 0) {
      console.log('📦 Sample chunk:', JSON.stringify(chunkIndex.chunks[0]).substring(0, 200));
    }
    
    const features = [];
    const maxLimit = Math.min(parseInt(limit) || 500, 2000);
    let chunksChecked = 0;
    let chunksIntersected = 0;
    
    for (const chunk of chunkIndex.chunks || []) {
      if (features.length >= maxLimit) break;
      chunksChecked++;
      
      // Get chunk bbox - handle different formats
      let cWest, cSouth, cEast, cNorth;
      
      if (chunk.bounds) {
        // Handle bounds format: { minLng, minLat, maxLng, maxLat }
        cWest = chunk.bounds.minLng;
        cSouth = chunk.bounds.minLat;
        cEast = chunk.bounds.maxLng;
        cNorth = chunk.bounds.maxLat;
      } else if (chunk.bbox && Array.isArray(chunk.bbox)) {
        // Handle array format: [west, south, east, north]
        [cWest, cSouth, cEast, cNorth] = chunk.bbox;
      } else {
        continue; // Skip chunks without valid bbox
      }
      
      // Check intersection
      const intersects = !(cEast < west || cWest > east || cNorth < south || cSouth > north);
      
      if (intersects) {
        chunksIntersected++;
        // Handle file path - chunk.file may already include "chunks/" prefix
        let chunkFile = chunk.file || chunk.filename || chunk.path;
        if (!chunkFile.includes('chunks/')) {
          chunkFile = path.join('chunks', chunkFile);
        }
        const chunkPath = path.join(PARCELS_DIR, chunkFile);
        
        console.log(`📂 Loading chunk: ${chunkFile}, exists: ${fs.existsSync(chunkPath)}`);
        
        if (fs.existsSync(chunkPath)) {
          try {
            const chunkData = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
            const chunkFeatures = chunkData.features || [];
            
            console.log(`📂 Chunk has ${chunkFeatures.length} features`);
            
            for (const feature of chunkFeatures) {
              if (features.length >= maxLimit) break;
              
              // Get centroid - handle different formats
              let centroid = feature.properties?.centroid;
              let lng, lat;
              
              if (Array.isArray(centroid)) {
                [lng, lat] = centroid;
              } else if (centroid && typeof centroid === 'object') {
                lng = centroid.lng || centroid.lon || centroid.x;
                lat = centroid.lat || centroid.y;
              } else if (feature.geometry?.type === 'Point') {
                [lng, lat] = feature.geometry.coordinates;
              } else if (feature.geometry?.coordinates) {
                // Try to get center of geometry
                const coords = feature.geometry.coordinates;
                if (feature.geometry.type === 'Polygon' && coords[0]) {
                  const ring = coords[0];
                  lng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
                  lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
                }
              }
              
              if (lng !== undefined && lat !== undefined) {
                if (lng >= west && lng <= east && lat >= south && lat <= north) {
                  features.push(feature);
                }
              } else {
                // Include feature anyway if no centroid but limit these
                if (features.length < 100) {
                  features.push(feature);
                }
              }
            }
          } catch (e) {
            console.error(`❌ Error reading chunk ${chunkFile}:`, e.message);
          }
        }
      }
    }
    
    console.log(`✅ Result: checked ${chunksChecked} chunks, ${chunksIntersected} intersected, found ${features.length} parcels`);
    
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      type: 'FeatureCollection',
      features,
      meta: {
        count: features.length,
        limit: maxLimit,
        bbox: [west, south, east, north],
        chunksChecked,
        chunksIntersected
      }
    });
    
  } catch (error) {
    console.error('❌ Viewport error:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

export default router;
