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

// GET /api/gis/catalog - List all available layers with metadata
router.get('/catalog', async (req, res) => {
  try {
    const catalog = [];

    // Check local data availability for each layer
    for (const [layerId, config] of Object.entries(LAYER_CATALOG)) {
      let localCount = 0;
      let localAvailable = false;

      if (config.source === 'local' && config.localTable) {
        try {
          const result = await pool.query(`SELECT COUNT(*) as count FROM ${config.localTable}`);
          localCount = parseInt(result.rows[0].count);
          localAvailable = localCount > 0;
        } catch (e) {
          // Table doesn't exist or error
        }
      }

      catalog.push({
        id: layerId,
        displayName: config.displayName,
        category: config.category,
        geometryType: config.geometryType,
        source: localAvailable ? 'local' : 'arcgis',
        localAvailable,
        localCount,
        arcgisUrl: config.arcgisUrl || config.fallbackArcgis || null
      });
    }

    // Group by category
    const byCategory = {};
    for (const layer of catalog) {
      if (!byCategory[layer.category]) byCategory[layer.category] = [];
      byCategory[layer.category].push(layer);
    }

    res.json({
      success: true,
      catalog,
      byCategory,
      totalLayers: catalog.length,
      localLayers: catalog.filter(l => l.localAvailable).length,
      arcgisLayers: catalog.filter(l => !l.localAvailable).length
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
    const { bbox, limit = 1000 } = req.query;
    
    // Whitelist of valid table names (prevent SQL injection)
    const validLayers = {
      'zoning_districts': 'zoning_districts',  // 22,488 rows - LOCAL DATA
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
    if (tableName === 'zoning_districts') {
      query += `, zoning_code, zoning_desc, overlay`;
    } else if (tableName === 'gis_water_ccn' || tableName === 'gis_sewer_ccn') {
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
        if (row.zoning_code) properties.zoning_code = row.zoning_code;
        if (row.zoning_desc) properties.zoning_desc = row.zoning_desc;
        if (row.overlay) properties.overlay = row.overlay;
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








