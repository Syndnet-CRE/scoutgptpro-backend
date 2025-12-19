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
    
    console.log('📡 Viewport request received:', { bbox, limit });
    
    if (!bbox) {
      console.log('❌ No bbox provided');
      return res.status(400).json({ error: 'bbox required (west,south,east,north)' });
    }
    
    const [west, south, east, north] = bbox.split(',').map(Number);
    console.log('📍 Parsed bbox:', { west, south, east, north });
    
    // Validate bbox
    if (isNaN(west) || isNaN(south) || isNaN(east) || isNaN(north)) {
      console.log('❌ Invalid bbox numbers');
      return res.status(400).json({ error: 'Invalid bbox format' });
    }
    
    // Try multiple possible paths for chunk_index.json (for Render deployment)
    const possiblePaths = [
      path.join(__dirname, '../../data/parcels/chunk_index.json'), // Standard path
      path.join(__dirname, '../data/parcels/chunk_index.json'),   // Alternative
      path.join(process.cwd(), 'data/parcels/chunk_index.json'),  // From working dir
      '/opt/render/project/src/data/parcels/chunk_index.json'      // Render path
    ];
    
    let indexPath = null;
    for (const p of possiblePaths) {
      console.log('🔍 Checking path:', p, 'exists:', fs.existsSync(p));
      if (fs.existsSync(p)) {
        indexPath = p;
        break;
      }
    }
    
    if (!indexPath) {
      console.log('❌ chunk_index.json not found in any location');
      console.log('📁 Current directory:', process.cwd());
      console.log('📁 __dirname:', __dirname);
      
      // List what's in data directory for debugging
      const dataDir = path.join(process.cwd(), 'data');
      if (fs.existsSync(dataDir)) {
        console.log('📁 Contents of data/:', fs.readdirSync(dataDir));
        const parcelsDir = path.join(dataDir, 'parcels');
        if (fs.existsSync(parcelsDir)) {
          console.log('📁 Contents of data/parcels/:', fs.readdirSync(parcelsDir));
        }
      }
      
      return res.json({ 
        type: 'FeatureCollection', 
        features: [], 
        meta: { 
          error: 'No parcel data available', 
          paths_checked: possiblePaths,
          cwd: process.cwd(),
          __dirname: __dirname
        }
      });
    }
    
    console.log('✅ Using index path:', indexPath);
    
    const chunkIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    console.log('📦 Loaded chunk index, chunks:', chunkIndex.chunks?.length || 0);
    
    if (!chunkIndex.chunks || chunkIndex.chunks.length === 0) {
      console.log('❌ No chunks in index');
      return res.json({ type: 'FeatureCollection', features: [], meta: { error: 'No chunks in index' } });
    }
    
    const features = [];
    const maxLimit = Math.min(parseInt(limit) || 500, 10000);
    let chunksChecked = 0;
    let chunksIntersected = 0;
    let chunksLoaded = 0;
    
    const baseDir = path.dirname(indexPath);
    
    for (const chunk of chunkIndex.chunks) {
      if (features.length >= maxLimit) break;
      chunksChecked++;
      
      // Handle different bbox formats
      let cWest, cSouth, cEast, cNorth;
      
      if (chunk.bounds) {
        cWest = chunk.bounds.minLng;
        cSouth = chunk.bounds.minLat;
        cEast = chunk.bounds.maxLng;
        cNorth = chunk.bounds.maxLat;
      } else if (chunk.bbox && Array.isArray(chunk.bbox)) {
        [cWest, cSouth, cEast, cNorth] = chunk.bbox;
      } else {
        console.log('⚠️ Chunk has no bounds:', chunk.key || chunk.file);
        continue;
      }
      
      // Check intersection
      const intersects = !(cEast < west || cWest > east || cNorth < south || cSouth > north);
      
      if (intersects) {
        chunksIntersected++;
        
        // Handle file path - may or may not include 'chunks/'
        let chunkFile = chunk.file || chunk.filename || chunk.path;
        
        // Build full path
        let chunkPath;
        if (chunkFile.startsWith('chunks/')) {
          chunkPath = path.join(baseDir, chunkFile);
        } else {
          chunkPath = path.join(baseDir, 'chunks', chunkFile);
        }
        
        // Also try without 'chunks/' prefix if file already has it
        if (!fs.existsSync(chunkPath) && chunkFile.includes('chunks/')) {
          chunkPath = path.join(baseDir, chunkFile.replace('chunks/', ''));
        }
        
        console.log('📂 Loading chunk:', chunkFile, 'path:', chunkPath, 'exists:', fs.existsSync(chunkPath));
        
        if (fs.existsSync(chunkPath)) {
          try {
            const chunkData = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
            chunksLoaded++;
            
            const chunkFeatures = chunkData.features || [];
            console.log('📂 Chunk has', chunkFeatures.length, 'features');
            
            for (const feature of chunkFeatures) {
              if (features.length >= maxLimit) break;
              
              // Calculate viewport size to determine filtering strategy
              const viewportWidth = east - west;
              const viewportHeight = north - south;
              const isSmallViewport = viewportWidth < 0.05 || viewportHeight < 0.05; // Less than ~5.5km
              
              let includeFeature = false;
              
              if (isSmallViewport) {
                // For small viewports, use geometry intersection instead of centroid
                const geom = feature.geometry;
                if (geom && geom.type === 'Polygon' && geom.coordinates?.[0]) {
                  const ring = geom.coordinates[0];
                  // Check if any point of the polygon is in the viewport
                  for (const point of ring) {
                    const [lng, lat] = point;
                    if (lng >= west && lng <= east && lat >= south && lat <= north) {
                      includeFeature = true;
                      break;
                    }
                  }
                  // Also check if polygon might overlap viewport (bounding box check)
                  if (!includeFeature) {
                    const ringLngs = ring.map(p => p[0]);
                    const ringLats = ring.map(p => p[1]);
                    const ringWest = Math.min(...ringLngs);
                    const ringEast = Math.max(...ringLngs);
                    const ringSouth = Math.min(...ringLats);
                    const ringNorth = Math.max(...ringLats);
                    
                    // Check if polygon bbox overlaps viewport
                    if (!(ringEast < west || ringWest > east || ringNorth < south || ringSouth > north)) {
                      includeFeature = true;
                    }
                  }
                }
              }
              
              // Fallback to centroid filtering for larger viewports or if geometry check didn't work
              if (!includeFeature) {
                // Get centroid
                let lng, lat;
                const centroid = feature.properties?.centroid;
                
                if (Array.isArray(centroid)) {
                  [lng, lat] = centroid;
                } else if (centroid && typeof centroid === 'object') {
                  lng = centroid.lng || centroid.lon || centroid.x;
                  lat = centroid.lat || centroid.y;
                } else if (feature.geometry?.type === 'Point') {
                  [lng, lat] = feature.geometry.coordinates;
                } else if (feature.geometry?.type === 'Polygon' && feature.geometry.coordinates?.[0]) {
                  // Calculate centroid from polygon
                  const ring = feature.geometry.coordinates[0];
                  lng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
                  lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
                }
                
                // Add small buffer for centroid filtering (0.001° ≈ 111m)
                const buffer = 0.001;
                if (lng !== undefined && lat !== undefined) {
                  if (lng >= (west - buffer) && lng <= (east + buffer) && 
                      lat >= (south - buffer) && lat <= (north + buffer)) {
                    includeFeature = true;
                  }
                }
              }
              
              if (includeFeature) {
                features.push(feature);
              }
            }
          } catch (e) {
            console.error('❌ Error reading chunk:', chunkFile, e.message);
          }
        }
      }
    }
    
    console.log('✅ Viewport result:', {
      chunksChecked,
      chunksIntersected,
      chunksLoaded,
      featuresFound: features.length
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
        chunksLoaded
      }
    });
    
  } catch (error) {
    console.error('❌ Viewport error:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

export default router;
