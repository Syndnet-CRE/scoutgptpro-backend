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

// GET /api/parcels/viewport - Load parcels for map viewport
router.get('/viewport', async (req, res) => {
  try {
    const { bbox, limit = 3000 } = req.query;
    
    console.log('📡 Viewport request:', { bbox, limit });
    
    if (!bbox) {
      return res.status(400).json({ error: 'bbox required (west,south,east,north)' });
    }
    
    const [west, south, east, north] = bbox.split(',').map(Number);
    
    if (isNaN(west) || isNaN(south) || isNaN(east) || isNaN(north)) {
      return res.status(400).json({ error: 'Invalid bbox format' });
    }
    
    console.log('📍 Parsed bbox:', { west, south, east, north });
    
    // Find chunk index
    const possiblePaths = [
      path.join(__dirname, '../../data/parcels/chunk_index.json'),
      path.join(__dirname, '../data/parcels/chunk_index.json'),
      path.join(process.cwd(), 'data/parcels/chunk_index.json'),
      '/opt/render/project/src/data/parcels/chunk_index.json'
    ];
    
    let indexPath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        indexPath = p;
        break;
      }
    }
    
    if (!indexPath) {
      console.log('❌ chunk_index.json not found');
      return res.json({ type: 'FeatureCollection', features: [], meta: { error: 'No index' } });
    }
    
    const chunkIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const chunks = chunkIndex.chunks || [];
    const baseDir = path.dirname(indexPath);
    
    console.log('📦 Total chunks in index:', chunks.length);
    
    // FIXED: Proper limit handling - allow up to 50000
    const maxLimit = Math.min(parseInt(limit) || 3000, 50000);
    
    const features = [];
    let chunksChecked = 0;
    let chunksIntersected = 0;
    let chunksLoaded = 0;
    let totalParcelsInChunks = 0;
    
    for (const chunk of chunks) {
      if (features.length >= maxLimit) break;
      chunksChecked++;
      
      // Get chunk bounds - handle different formats
      let cWest, cSouth, cEast, cNorth;
      
      if (chunk.bounds) {
        // Object format: { minLng, minLat, maxLng, maxLat }
        cWest = chunk.bounds.minLng ?? chunk.bounds.west ?? chunk.bounds.min_lng;
        cSouth = chunk.bounds.minLat ?? chunk.bounds.south ?? chunk.bounds.min_lat;
        cEast = chunk.bounds.maxLng ?? chunk.bounds.east ?? chunk.bounds.max_lng;
        cNorth = chunk.bounds.maxLat ?? chunk.bounds.north ?? chunk.bounds.max_lat;
      } else if (chunk.bbox) {
        // Array format: [west, south, east, north]
        if (Array.isArray(chunk.bbox)) {
          [cWest, cSouth, cEast, cNorth] = chunk.bbox;
        }
      }
      
      // Skip if no valid bounds
      if (cWest === undefined || cSouth === undefined || cEast === undefined || cNorth === undefined) {
        console.log('⚠️ Chunk missing bounds:', chunk.file || chunk.key);
        continue;
      }
      
      // FIXED: Proper bbox intersection check
      // Two boxes intersect if they overlap on both axes
      const intersects = !(
        cEast < west ||   // chunk is entirely left of bbox
        cWest > east ||   // chunk is entirely right of bbox
        cNorth < south || // chunk is entirely below bbox
        cSouth > north    // chunk is entirely above bbox
      );
      
      if (!intersects) continue;
      
      chunksIntersected++;
      
      // Build chunk file path
      let chunkFile = chunk.file || chunk.filename || chunk.path;
      if (!chunkFile) {
        console.log('⚠️ Chunk missing file path:', chunk);
        continue;
      }
      
      // Handle different path formats
      let chunkPath;
      if (chunkFile.startsWith('chunks/')) {
        chunkPath = path.join(baseDir, chunkFile);
      } else if (chunkFile.startsWith('/')) {
        chunkPath = chunkFile;
      } else {
        chunkPath = path.join(baseDir, 'chunks', chunkFile);
      }
      
      // Try alternate path if not found
      if (!fs.existsSync(chunkPath)) {
        const altPath = path.join(baseDir, chunkFile);
        if (fs.existsSync(altPath)) {
          chunkPath = altPath;
        } else {
          console.log('⚠️ Chunk file not found:', chunkPath);
          continue;
        }
      }
      
      try {
        const chunkData = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
        const chunkFeatures = chunkData.features || [];
        chunksLoaded++;
        totalParcelsInChunks += chunkFeatures.length;
        
        // Add features that have centroids within the bbox
        for (const feature of chunkFeatures) {
          if (features.length >= maxLimit) break;
          
          // Get centroid
          let lng, lat;
          const centroid = feature.properties?.centroid;
          
          if (Array.isArray(centroid)) {
            [lng, lat] = centroid;
          } else if (centroid && typeof centroid === 'object') {
            lng = centroid.lng ?? centroid.lon ?? centroid.x;
            lat = centroid.lat ?? centroid.y;
          } else if (feature.geometry?.type === 'Point') {
            [lng, lat] = feature.geometry.coordinates;
          } else if (feature.geometry?.type === 'Polygon' && feature.geometry.coordinates?.[0]) {
            // Calculate centroid from polygon
            const ring = feature.geometry.coordinates[0];
            if (ring.length > 0) {
              lng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
              lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
            }
          }
          
          // Check if centroid is within bbox (with small buffer for edge cases)
          const buffer = 0.001; // ~100m buffer
          if (lng !== undefined && lat !== undefined) {
            if (lng >= (west - buffer) && lng <= (east + buffer) && 
                lat >= (south - buffer) && lat <= (north + buffer)) {
              features.push(feature);
            }
          }
        }
      } catch (err) {
        console.error('❌ Error reading chunk:', chunkPath, err.message);
      }
    }
    
    console.log('✅ Viewport result:', {
      chunksChecked,
      chunksIntersected,
      chunksLoaded,
      totalParcelsInChunks,
      featuresReturned: features.length,
      limit: maxLimit
    });
    
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      type: 'FeatureCollection',
      features,
      meta: {
        count: features.length,
        limit: maxLimit,
        bbox: [west, south, east, north],
        chunksChecked,
        chunksIntersected,
        chunksLoaded,
        totalParcelsInChunks
      }
    });
    
  } catch (error) {
    console.error('❌ Viewport error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

