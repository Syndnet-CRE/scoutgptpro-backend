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
    
    // Map canonical key to serviceName
    const layerNameMap = {
      'zoning_districts': 'Zoning Districts',
      'fema_flood_zones': 'FEMA Flood Zones',
      'sewer_mains': 'Sewer Mains',
      'sewer_manholes': 'Sewer Manholes',
      'water_mains': 'Water Mains',
      'fire_hydrants': 'Fire Hydrants',
      'water_meters': 'Water Meters',
      'wetland_types': 'Wetland Types',
      'building_permits': 'Building Permits',
      'parcel_boundaries': 'Parcel Boundaries',
      'gas_mains': 'Gas Mains'
    };
    
    // Validate canonical key exists
    if (!layerNameMap[layer]) {
      return res.status(400).json({ 
        success: false, 
        error: `Unknown canonical layer key: ${layer}. Valid keys: ${Object.keys(layerNameMap).join(', ')}` 
      });
    }
    
    const serviceName = layerNameMap[layer];
    
    // Find layer in database - EXACT match only, no fallback
    const layerRecord = await prisma.mapServerRegistry.findFirst({
      where: { 
        serviceName: { equals: serviceName, mode: 'insensitive' }, 
        isActive: true 
      }
    });
    
    if (!layerRecord) {
      return res.status(404).json({ 
        success: false, 
        error: `Layer not found for canonical key "${layer}" (serviceName: "${serviceName}"). No fallback allowed.` 
      });
    }
    
    // Build ArcGIS endpoint URL
    let arcgisUrl = layerRecord.url;
    if (layerRecord.layerId !== null && layerRecord.layerId !== undefined) {
      arcgisUrl = `${layerRecord.url.replace(/\/$/, '')}/${layerRecord.layerId}`;
    } else if (!arcgisUrl.match(/\/\d+\/?$/)) {
      arcgisUrl = `${arcgisUrl.replace(/\/$/, '')}/0`;
    }
    
    console.log(`✅ GIS layer resolved: ${layer} -> ${serviceName} -> ${arcgisUrl}`);
    
    res.json({
      success: true,
      ok: true,
      action,
      layer,
      serviceName: layerRecord.serviceName,
      arcgisUrl,
      endpoint: arcgisUrl, // Keep for backward compatibility
      geometryType: layerRecord.geometryType || null,
      bbox,
      opacity
    });
    
  } catch (error) {
    console.error('❌ GIS layer action error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
