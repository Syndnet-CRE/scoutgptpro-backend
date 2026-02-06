import express from 'express';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { LAYER_REGISTRY } from '../config/gis-layer-registry.js';

const router = express.Router();
const prisma = new PrismaClient();
const { Pool } = pg;

// Database pool for spatial queries
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ============ LAYER CONFIGURATION ============
// Master layer catalog with local DB + external ArcGIS fallbacks
const LAYER_CATALOG = {
  // LOCAL DATA AVAILABLE (query local DB first)
  'zoning_districts': {
    displayName: 'Zoning Districts',
    category: 'Zoning',
    source: 'local',
    localTable: 'zoning_districts',
    geometryColumn: 'geometry',
    geometryType: 'Polygon',
    fallbackArcgis: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Zoning_1/MapServer/0'
  },

  // EXTERNAL ARCGIS ONLY (no local data)
  'fema_flood_zones': {
    displayName: 'FEMA Flood Zones',
    category: 'Floodplain',
    source: 'arcgis',
    arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Environmental_2/MapServer/1',
    geometryType: 'Polygon'
  },
  'floodplain': {
    displayName: 'Floodplain',
    category: 'Floodplain',
    source: 'arcgis',
    arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Floodplain/MapServer/0',
    geometryType: 'Polygon'
  },
  'water_mains': {
    displayName: 'Water Mains',
    category: 'Water Utilities',
    source: 'arcgis',
    arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Water/MapServer/0',
    geometryType: 'LineString'
  },
  'fire_hydrants': {
    displayName: 'Fire Hydrants',
    category: 'Water Utilities',
    source: 'arcgis',
    arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Water/MapServer/1',
    geometryType: 'Point'
  },
  'water_meters': {
    displayName: 'Water Meters',
    category: 'Water Utilities',
    source: 'arcgis',
    arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Water/MapServer/2',
    geometryType: 'Point'
  },
  'sewer_mains': {
    displayName: 'Sewer Mains',
    category: 'Sewer Utilities',
    source: 'arcgis',
    arcgisUrl: 'https://maps.pape-dawson.com/server1/rest/services/LandDevelopment/LANDDEVELOPMENT__Chesmar_SiteSelection/MapServer/55',
    geometryType: 'LineString'
  },
  'sewer_manholes': {
    displayName: 'Sewer Manholes',
    category: 'Sewer Utilities',
    source: 'arcgis',
    arcgisUrl: 'https://gis.horrocks.com/arcgis/rest/services/TX_9706_24_General/MapServer/22',
    geometryType: 'Point'
  },
  'wetlands': {
    displayName: 'Wetlands',
    category: 'Wetlands',
    source: 'arcgis',
    arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Environmental_2/MapServer/0',
    geometryType: 'Polygon'
  },
  'building_permits': {
    displayName: 'Building Permits',
    category: 'Permits',
    source: 'arcgis',
    arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Permits/MapServer/0',
    geometryType: 'Point'
  },
  'parcel_boundaries': {
    displayName: 'Parcel Boundaries',
    category: 'Parcels',
    source: 'arcgis',
    arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Parcels/MapServer/0',
    geometryType: 'Polygon'
  },
  'gas_mains': {
    displayName: 'Gas Mains',
    category: 'Gas Utilities',
    source: 'arcgis',
    arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Gas/MapServer/0',
    geometryType: 'LineString'
  },
  'buildings': {
    displayName: 'Building Footprints',
    category: 'Buildings',
    source: 'arcgis',
    arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Buildings/MapServer/0',
    geometryType: 'Polygon'
  },
  'transit_routes': {
    displayName: 'Transit Routes',
    category: 'Transportation',
    source: 'arcgis',
    arcgisUrl: 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Transit/MapServer/0',
    geometryType: 'LineString'
  }
};

// GET /api/gis/catalog - List all available layers with metadata from registry
router.get('/catalog', async (req, res) => {
  try {
    const layers = [];
    const categories = new Set();

    // Build catalog from registry with live feature counts
    for (const [layerId, layer] of Object.entries(LAYER_REGISTRY)) {
      categories.add(layer.category);
      
      let featureCount = 0;
      if (layer.hasData) {
        try {
          const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${layer.table}`);
          featureCount = parseInt(countResult.rows[0].count);
        } catch (error) {
          console.warn(`Failed to count features for ${layerId}:`, error.message);
        }
      }

      layers.push({
        id: layer.id,
        displayName: layer.displayName,
        category: layer.category,
        geometryType: layer.geometryType,
        hasData: layer.hasData,
        featureCount,
        style: layer.style,
        keywords: layer.keywords
      });
    }

    const availableCount = layers.filter(l => l.hasData).length;
    const totalCount = layers.length;

    res.json({
      layers,
      categories: Array.from(categories).sort(),
      availableCount,
      totalCount
    });
  } catch (error) {
    console.error('GIS catalog error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/gis/layers?name=Zoning
router.get('/layers', async (req, res) => {
  try {
    const { name } = req.query;

    console.log('GIS layers request:', { name });

    if (name) {
      // First check LAYER_CATALOG for curated layers
      const catalogMatch = Object.entries(LAYER_CATALOG).find(([id, config]) =>
        id.toLowerCase().includes(name.toLowerCase()) ||
        config.displayName.toLowerCase().includes(name.toLowerCase()) ||
        config.category.toLowerCase().includes(name.toLowerCase())
      );

      if (catalogMatch) {
        const [layerId, config] = catalogMatch;
        const arcgisUrl = config.arcgisUrl || config.fallbackArcgis;

        return res.json({
          success: true,
          layer: {
            id: layerId,
            name: config.displayName,
            displayName: config.displayName,
            endpoint: arcgisUrl,
            category: config.category,
            geometryType: config.geometryType,
            source: config.source,
            localTable: config.localTable || null
          }
        });
      }

      // Fallback: query map_server_registry for additional layers
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
            url: layer.url,
            source: 'registry'
          }
        });
      }

      console.log(`No layer found for "${name}"`);
      return res.json({ success: false, error: 'Layer not found' });
    }

    // Return curated catalog + registry layers
    const catalogLayers = Object.entries(LAYER_CATALOG).map(([id, config]) => ({
      id,
      name: config.displayName,
      category: config.category,
      geometryType: config.geometryType,
      source: config.source
    }));

    const registryLayers = await prisma.mapServerRegistry.findMany({
      where: { isActive: true },
      take: 100
    });

    res.json({
      success: true,
      catalogLayers,
      registryLayers,
      count: catalogLayers.length + registryLayers.length
    });

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

    // Check LAYER_CATALOG first
    const layerConfig = LAYER_CATALOG[layer];

    if (!layerConfig) {
      return res.status(400).json({
        success: false,
        error: `Unknown layer: ${layer}. Valid layers: ${Object.keys(LAYER_CATALOG).join(', ')}`
      });
    }

    // Determine data source
    let useLocal = false;
    let localCount = 0;

    if (layerConfig.source === 'local' && layerConfig.localTable) {
      try {
        const result = await pool.query(`SELECT COUNT(*) as count FROM ${layerConfig.localTable}`);
        localCount = parseInt(result.rows[0].count);
        useLocal = localCount > 0;
      } catch (e) {
        console.log(`[GIS] Local table ${layerConfig.localTable} not available, using ArcGIS`);
      }
    }

    const arcgisUrl = layerConfig.arcgisUrl || layerConfig.fallbackArcgis;

    console.log(`[GIS] ${layer} -> ${useLocal ? 'LOCAL (' + localCount + ' rows)' : 'ArcGIS: ' + arcgisUrl}`);

    res.json({
      success: true,
      ok: true,
      action,
      layer,
      serviceName: layerConfig.displayName,
      category: layerConfig.category,
      geometryType: layerConfig.geometryType,
      source: useLocal ? 'local' : 'arcgis',
      localTable: useLocal ? layerConfig.localTable : null,
      localCount: useLocal ? localCount : null,
      arcgisUrl: arcgisUrl,
      endpoint: arcgisUrl, // Backward compatibility
      bbox,
      opacity
    });

  } catch (error) {
    console.error('❌ GIS layer action error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/gis/layers/:layerId/features - Query layer features (local or proxy to ArcGIS)
router.get('/layers/:layerId/features', async (req, res) => {
  try {
    const { layerId } = req.params;
    const { bbox, lat, lng, radius = 500, limit = 500 } = req.query;

    const layerConfig = LAYER_CATALOG[layerId];
    if (!layerConfig) {
      return res.status(404).json({
        success: false,
        error: `Unknown layer: ${layerId}`,
        availableLayers: Object.keys(LAYER_CATALOG)
      });
    }

    // Check if local data is available
    let useLocal = false;
    if (layerConfig.source === 'local' && layerConfig.localTable) {
      try {
        const countResult = await pool.query(`SELECT COUNT(*) FROM ${layerConfig.localTable}`);
        useLocal = parseInt(countResult.rows[0].count) > 0;
      } catch (e) {
        // Table doesn't exist
      }
    }

    if (useLocal) {
      // Query local database
      let query = `
        SELECT
          id,
          zoning_code,
          zoning_desc,
          overlay,
          ST_AsGeoJSON(${layerConfig.geometryColumn})::json as geometry
        FROM ${layerConfig.localTable}
      `;
      const params = [];

      if (bbox) {
        const bboxParts = bbox.split(',').map(Number);
        if (bboxParts.length === 4) {
          const [west, south, east, north] = bboxParts;
          query += ` WHERE ST_Intersects(${layerConfig.geometryColumn}, ST_MakeEnvelope($1, $2, $3, $4, 4326))`;
          params.push(west, south, east, north);
        }
      } else if (lat && lng) {
        query += ` WHERE ST_DWithin(${layerConfig.geometryColumn}::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)`;
        params.push(parseFloat(lng), parseFloat(lat), parseFloat(radius));
      }

      query += ` LIMIT $${params.length + 1}`;
      params.push(parseInt(limit));

      console.log(`[GIS] Querying LOCAL ${layerConfig.localTable}`);
      const result = await pool.query(query, params);

      return res.json({
        type: 'FeatureCollection',
        source: 'local',
        layer: layerId,
        features: result.rows.map(row => ({
          type: 'Feature',
          geometry: row.geometry,
          properties: {
            id: row.id,
            zoning_code: row.zoning_code,
            zoning_desc: row.zoning_desc,
            overlay: row.overlay
          }
        })),
        count: result.rows.length
      });
    }

    // Return ArcGIS endpoint for client to query directly
    const arcgisUrl = layerConfig.arcgisUrl || layerConfig.fallbackArcgis;
    return res.json({
      success: true,
      source: 'arcgis',
      layer: layerId,
      arcgisUrl,
      message: 'Query ArcGIS endpoint directly',
      queryParams: { bbox, lat, lng, radius, limit }
    });

  } catch (error) {
    console.error('Error querying layer features:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/gis/layers/:id/query - Legacy endpoint (backward compatibility)
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
    const { bbox, limit } = req.query;
    
    // Look up layer in registry
    const layer = LAYER_REGISTRY[layerName];
    if (!layer) {
      return res.status(400).json({ 
        success: false,
        error: `Unknown layer: ${layerName}`,
        available: Object.keys(LAYER_REGISTRY)
      });
    }
    
    // Check if layer has data
    if (!layer.hasData) {
      return res.status(404).json({ 
        success: false,
        error: 'Layer data not yet imported',
        layer: layer.displayName,
        status: 'pending'
      });
    }
    
    // Apply limit (use layer's maxFeatures or query param, whichever is lower)
    const requestedLimit = limit ? parseInt(limit, 10) : layer.maxFeatures;
    const safeLimit = Math.min(requestedLimit, layer.maxFeatures);
    
    if (isNaN(safeLimit) || safeLimit < 1) {
      return res.status(400).json({ 
        success: false,
        error: `Invalid limit. Must be between 1 and ${layer.maxFeatures}` 
      });
    }
    
    // Build query with feature properties
    const propertyColumns = layer.featureProperties.length > 0 
      ? `, ${layer.featureProperties.join(', ')}`
      : '';
    
    let query = `
      SELECT 
        id,
        ST_AsGeoJSON(${layer.geometryColumn})::json AS geometry
        ${propertyColumns}
      FROM ${layer.table}
    `;
    
    const params = [];
    
    // Add bbox filter if provided
    if (bbox) {
      const bboxParts = bbox.split(',').map(Number);
      if (bboxParts.length === 4 && bboxParts.every(n => !isNaN(n))) {
        const [west, south, east, north] = bboxParts;
        query += ` WHERE ST_Intersects(${layer.geometryColumn}, ST_MakeEnvelope($1, $2, $3, $4, ${layer.srid}))`;
        params.push(west, south, east, north);
      } else {
        return res.status(400).json({ 
          success: false,
          error: 'Invalid bbox format. Use: west,south,east,north' 
        });
      }
    }
    
    query += ` LIMIT $${params.length + 1}`;
    params.push(safeLimit);
    
    console.log(`[GIS Local] Querying ${layer.table}${bbox ? ` with bbox` : ''} (limit: ${safeLimit})`);
    
    const result = await pool.query(query, params);
    
    // Build properties from feature columns
    const features = result.rows.map(row => {
      const properties = {};
      
      // Include specified feature properties
      layer.featureProperties.forEach(prop => {
        if (row[prop] !== null && row[prop] !== undefined) {
          properties[prop] = row[prop];
        }
      });
      
      return {
        type: 'Feature',
        id: row.id,
        geometry: row.geometry,
        properties
      };
    });
    
    // Return GeoJSON with layer metadata
    const response = {
      type: 'FeatureCollection',
      features,
      metadata: {
        layerId: layer.id,
        displayName: layer.displayName,
        geometryType: layer.geometryType,
        category: layer.category,
        style: layer.style,
        featureCount: features.length,
        hasData: layer.hasData
      }
    };
    
    console.log(`[GIS Local] Returning ${features.length} features for ${layer.displayName}`);
    
    res.json(response);
    
  } catch (error) {
    console.error('[GIS Local] Error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

export default router;








