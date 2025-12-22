import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/gis/layers?name=Zoning_Districts
router.get('/layers', async (req, res) => {
  try {
    const { name } = req.query;
    
    if (name) {
      // PRIORITY: First try to find Austin/Texas/Travis specific layer
      // This ensures we get local data, not random international layers
      let layer = await prisma.mapServerRegistry.findFirst({
        where: {
          AND: [
            {
              OR: [
                { category: { equals: name, mode: 'insensitive' } },
                { category: { contains: name, mode: 'insensitive' } },
                { serviceName: { equals: name, mode: 'insensitive' } },
                { serviceName: { contains: name, mode: 'insensitive' } }
              ]
            },
            {
              OR: [
                { url: { contains: 'austin', mode: 'insensitive' } },
                { url: { contains: 'texas', mode: 'insensitive' } },
                { url: { contains: 'travis', mode: 'insensitive' } }
              ]
            },
            { isActive: true }
          ]
        }
      });
      
      // If no Austin/Texas layer found, try first word extraction with Austin/Texas filter
      if (!layer) {
        const firstWord = name.split(/[_\s]/)[0];
        if (firstWord && firstWord.length > 0 && firstWord !== name) {
          layer = await prisma.mapServerRegistry.findFirst({
            where: {
              AND: [
                {
                  OR: [
                    { category: { equals: firstWord, mode: 'insensitive' } },
                    { category: { contains: firstWord, mode: 'insensitive' } }
                  ]
                },
                {
                  OR: [
                    { url: { contains: 'austin', mode: 'insensitive' } },
                    { url: { contains: 'texas', mode: 'insensitive' } },
                    { url: { contains: 'travis', mode: 'insensitive' } }
                  ]
                },
                { isActive: true }
              ]
            }
          });
        }
      }
      
      // Fallback: If no Austin/Texas layer found, use any matching layer
      if (!layer) {
        console.log(`No Austin/Texas layer found for "${name}", falling back to any match`);
        
        // Strategy 1: Exact match on category
        layer = await prisma.mapServerRegistry.findFirst({
          where: {
            category: { equals: name, mode: 'insensitive' },
            isActive: true
          }
        });
        
        // Strategy 2: Exact match on serviceName
        if (!layer) {
          layer = await prisma.mapServerRegistry.findFirst({
            where: {
              serviceName: { equals: name, mode: 'insensitive' },
              isActive: true
            }
          });
        }
        
        // Strategy 3: Try matching first word before underscore/space
        if (!layer) {
          const firstWord = name.split(/[_\s]/)[0];
          if (firstWord && firstWord.length > 0 && firstWord !== name) {
            layer = await prisma.mapServerRegistry.findFirst({
              where: {
                category: { equals: firstWord, mode: 'insensitive' },
                isActive: true
              }
            });
          }
        }
        
        // Strategy 4: Partial match on category
        if (!layer) {
          layer = await prisma.mapServerRegistry.findFirst({
            where: {
              category: { contains: name, mode: 'insensitive' },
              isActive: true
            }
          });
        }
        
        // Strategy 5: Partial match on serviceName
        if (!layer) {
          layer = await prisma.mapServerRegistry.findFirst({
            where: {
              serviceName: { contains: name, mode: 'insensitive' },
              isActive: true
            }
          });
        }
      }
      
      if (layer) {
        // Build endpoint URL - layer.url should be the MapServer URL
        // If it's a service root, append /0 for layer 0, or use layerId if available
        let endpoint = layer.url;
        if (layer.layerId !== null && layer.layerId !== undefined) {
          // URL might be service root, append layer ID
          endpoint = `${layer.url.replace(/\/$/, '')}/${layer.layerId}`;
        } else if (!endpoint.match(/\/\d+\/?$/)) {
          // If URL doesn't end with a number, assume layer 0
          endpoint = `${endpoint.replace(/\/$/, '')}/0`;
        }
        
        const isAustinLayer = endpoint.toLowerCase().includes('austin') || 
                              endpoint.toLowerCase().includes('texas') || 
                              endpoint.toLowerCase().includes('travis');
        
        console.log(`Found layer for "${name}": ${endpoint} ${isAustinLayer ? '(Austin/Texas)' : '(Other)'}`);
        
        return res.json({ 
          success: true, 
          layer: {
            id: layer.id,
            name: layer.serviceName || name,
            displayName: layer.serviceName || layer.category,
            endpoint: endpoint,
            category: layer.category,
            url: layer.url
          }
        });
      } else {
        return res.json({ success: false, error: 'Layer not found' });
      }
    }
    
    // Return all layers grouped by category
    const layers = await prisma.mapServerRegistry.findMany({
      orderBy: [{ category: 'asc' }, { serviceName: 'asc' }]
    });
    
    res.json({ success: true, layers });
    
  } catch (error) {
    console.error('GIS layers error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
