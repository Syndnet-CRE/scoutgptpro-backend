import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

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

export default router;
