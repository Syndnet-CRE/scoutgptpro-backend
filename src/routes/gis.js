import express from 'express';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';

const router = express.Router();
const prisma = new PrismaClient();
const { Pool } = pg;

// Database pool for spatial queries
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// GET /api/gis/layers?name=Zoning
router.get('/layers', async (req, res) => {
  try {
    const { name } = req.query;
    
    console.log('GIS layers request:', { name });
    
    if (name) {
      // Simple query - find all matching layers
      const allMatching = await prisma.mapServerRegistry.findMany({
        where: {
          AND: [
            {
              OR: [
                { category: { contains: name, mode: 'insensitive' } },
                { serviceName: { contains: name, mode: 'insensitive' } }
              ]
            },
            { isActive: true }
          ]
        },
        take: 20
      });
      
      console.log(`Found ${allMatching.length} matching layers for "${name}"`);
      
      // Prefer Austin/Texas layers
      let layer = allMatching.find(l => 
        l.url?.toLowerCase().includes('austin') ||
        l.url?.toLowerCase().includes('texas') ||
        l.url?.toLowerCase().includes('travis')
      );
      
      // Fallback to first match
      if (!layer && allMatching.length > 0) {
        layer = allMatching[0];
      }
      
      if (layer) {
        // Build endpoint URL
        let endpoint = layer.url;
        if (layer.layerId !== null && layer.layerId !== undefined) {
          endpoint = `${layer.url.replace(/\/$/, '')}/${layer.layerId}`;
        } else if (!endpoint.match(/\/\d+\/?$/)) {
          // If URL doesn't end with a number, assume layer 0
          endpoint = `${endpoint.replace(/\/$/, '')}/0`;
        }
        
        console.log(`Returning: ${layer.serviceName} -> ${endpoint}`);
        
        return res.json({
          success: true,
          layer: {
            id: layer.id,
            name: layer.serviceName,
            displayName: layer.serviceName,
            endpoint: endpoint,
            category: layer.category,
            url: layer.url
          }
        });
      }
      
      console.log(`No layer found for "${name}"`);
      return res.json({ success: false, error: 'Layer not found' });
    }
    
    // Return all active layers
    const layers = await prisma.mapServerRegistry.findMany({
      where: { isActive: true },
      take: 100
    });
    
    res.json({ success: true, layers, count: layers.length });
    
  } catch (error) {
    console.error('GIS layers error:', error.message, error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/gis/layers - Handle layer toggle actions
router.post('/layers', async (req, res) => {
  try {
    const { action, layer, bbox, opacity = 0.7 } = req.body;
    
    console.log('🗺️ GIS layer action:', { action, layer, bbox });
    
    if (!layer) {
      return res.status(400).json({ success: false, error: 'layer is required' });
    }
    
    // Hardcoded canonical map - no DB dependency
    const CANONICAL = {
      'zoning_districts': {
        arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Zoning_1/MapServer/0',
        geometryType: 'Polygon'
      },
      'fema_flood_zones': {
        arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Environmental_2/MapServer/1',
        geometryType: 'Polygon'
      },
      'sewer_mains': {
        arcgisUrl: 'https://maps.pape-dawson.com/server1/rest/services/LandDevelopment/LANDDEVELOPMENT__Chesmar_SiteSelection/MapServer/55',
        geometryType: 'LineString'
      },
      'sewer_manholes': {
        arcgisUrl: 'https://gis.horrocks.com/arcgis/rest/services/TX_9706_24_General/MapServer/22',
        geometryType: 'Point'
      },
      'water_mains': {
        arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Water/MapServer/0',
        geometryType: 'LineString'
      },
      'fire_hydrants': {
        arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Water/MapServer/1',
        geometryType: 'Point'
      },
      'water_meters': {
        arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Water/MapServer/2',
        geometryType: 'Point'
      },
      'wetland_types': {
        arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Environmental_2/MapServer/0',
        geometryType: 'Polygon'
      },
      'building_permits': {
        arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Permits/MapServer/0',
        geometryType: 'Point'
      },
      'parcel_boundaries': {
        arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Parcels/MapServer/0',
        geometryType: 'Polygon'
      },
      'gas_mains': {
        arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Gas/MapServer/0',
        geometryType: 'LineString'
      }
    };
    
    // Validate canonical key exists
    if (!CANONICAL[layer]) {
      return res.status(400).json({ 
        success: false, 
        error: `Unknown canonical layer key: ${layer}. Valid keys: ${Object.keys(CANONICAL).join(', ')}` 
      });
    }
    
    const layerConfig = CANONICAL[layer];
    
    console.log(`[GIS] resolved ${layer} -> ${layerConfig.arcgisUrl}`);
    
    res.json({
      success: true,
      ok: true,
      action,
      layer,
      serviceName: layer.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      arcgisUrl: layerConfig.arcgisUrl,
      endpoint: layerConfig.arcgisUrl, // Keep for backward compatibility
      geometryType: layerConfig.geometryType,
      bbox,
      opacity
    });
    
  } catch (error) {
    console.error('❌ GIS layer action error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/gis/layers/:id/query - Query specific layer by bbox or geometry
router.get('/layers/:id/query', async (req, res) => {
  try {
    const { id } = req.params;
    const { bbox, geometry } = req.query;

    const layer = await prisma.gisLayer.findUnique({
      where: { id }
    });

    if (!layer) {
      return res.status(404).json({ success: false, error: 'Layer not found' });
    }

    // For now, return layer info - actual querying would require ArcGIS API calls
    res.json({
      success: true,
      layer: {
        id: layer.id,
        name: layer.name,
        category: layer.category,
        url: layer.sourceUrl,
        bbox: bbox ? JSON.parse(bbox) : null,
        geometry: geometry ? JSON.parse(geometry) : null
      },
      message: 'Layer query endpoint - implement ArcGIS query logic here'
    });
  } catch (error) {
    console.error('Error querying layer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/gis/local/:layerName/geojson - Query imported GIS layers
router.get('/local/:layerName/geojson', async (req, res) => {
  try {
    const { layerName } = req.params;
    const { bbox, limit = 1000 } = req.query;
    
    // Whitelist of valid table names (prevent SQL injection)
    const validLayers = {
      'water_ccn': 'gis_water_ccn',
      'sewer_ccn': 'gis_sewer_ccn',
      'water_districts': 'gis_water_districts',
      'floodplain_austin': 'gis_floodplain_austin',
      'wetlands_cef': 'gis_wetlands_cef',
      'cef_buffers': 'gis_cef_buffers',
      'contours_austin': 'gis_contours_austin'
    };
    
    const tableName = validLayers[layerName];
    if (!tableName) {
      return res.status(400).json({ 
        success: false,
        error: `Invalid layer name: ${layerName}. Valid layers: ${Object.keys(validLayers).join(', ')}` 
      });
    }
    
    // Build query
    let query = `
      SELECT 
        id,
        ST_AsGeoJSON(geometry)::jsonb as geometry,
        raw_attributes
    `;
    
    // Add specific fields based on table (for better property extraction)
    if (tableName === 'gis_water_ccn' || tableName === 'gis_sewer_ccn') {
      query += `, ccn_no, utility, county, type`;
    } else if (tableName === 'gis_water_districts') {
      query += `, district_name, district_type`;
    } else if (tableName === 'gis_floodplain_austin') {
      query += `, zone_code, zone_desc`;
    } else if (tableName === 'gis_wetlands_cef') {
      query += `, wetland_type`;
    } else if (tableName === 'gis_cef_buffers') {
      query += `, buffer_type, buffer_distance`;
    } else if (tableName === 'gis_contours_austin') {
      query += `, elevation, contour_type`;
    }
    
    query += ` FROM ${tableName}`;
    const params = [];
    
    // Add bbox filter if provided
    if (bbox) {
      const bboxParts = bbox.split(',').map(Number);
      if (bboxParts.length === 4 && bboxParts.every(n => !isNaN(n))) {
        const [west, south, east, north] = bboxParts;
        query += ` WHERE ST_Intersects(geometry, ST_MakeEnvelope($${params.length + 1}, $${params.length + 2}, $${params.length + 3}, $${params.length + 4}, 4326))`;
        params.push(west, south, east, north);
      } else {
        return res.status(400).json({ 
          success: false,
          error: 'Invalid bbox format. Use: west,south,east,north' 
        });
      }
    }
    
    // Add limit
    const limitNum = parseInt(limit, 10);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 10000) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid limit. Must be between 1 and 10000' 
      });
    }
    query += ` LIMIT $${params.length + 1}`;
    params.push(limitNum);
    
    console.log(`[GIS Local] Querying ${tableName}${bbox ? ` with bbox` : ''} (limit: ${limitNum})`);
    
    const result = await pool.query(query, params);
    
    // Transform to GeoJSON FeatureCollection
    const geojson = {
      type: 'FeatureCollection',
      features: result.rows.map(row => {
        const properties = { ...(row.raw_attributes || {}) };
        
        // Add specific fields to properties
        if (row.ccn_no) properties.ccn_no = row.ccn_no;
        if (row.utility) properties.utility = row.utility;
        if (row.county) properties.county = row.county;
        if (row.type) properties.type = row.type;
        if (row.district_name) properties.district_name = row.district_name;
        if (row.district_type) properties.district_type = row.district_type;
        if (row.zone_code) properties.zone_code = row.zone_code;
        if (row.zone_desc) properties.zone_desc = row.zone_desc;
        if (row.wetland_type) properties.wetland_type = row.wetland_type;
        if (row.buffer_type) properties.buffer_type = row.buffer_type;
        if (row.buffer_distance !== null) properties.buffer_distance = row.buffer_distance;
        if (row.elevation !== null) properties.elevation = row.elevation;
        if (row.contour_type) properties.contour_type = row.contour_type;
        
        return {
          type: 'Feature',
          id: row.id,
          geometry: row.geometry,
          properties
        };
      })
    };
    
    console.log(`[GIS Local] Returning ${geojson.features.length} features`);
    
    res.json(geojson);
    
  } catch (error) {
    console.error('[GIS Local] Error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

export default router;








