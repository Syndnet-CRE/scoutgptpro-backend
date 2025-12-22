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

export default router;
