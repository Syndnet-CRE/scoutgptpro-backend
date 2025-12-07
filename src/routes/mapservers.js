import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/mapservers/categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.mapServerRegistry.groupBy({
      by: ['category'],
      _count: true,
      where: { isActive: true }
    });
    
    res.json({
      success: true,
      categories: categories.map(c => ({
        name: c.category,
        count: c._count
      })).sort((a, b) => b.count - a.count)
    });
  } catch (error) {
    console.error('Categories error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/mapservers/search
router.post('/search', async (req, res) => {
  try {
    const { query, bounds, categories, maxResults = 5 } = req.body;
    
    console.log(`🔍 MapServer search: "${query}"`);
    
    // Build where clause
    const where = {
      isActive: true,
      ...(categories?.length > 0 && { category: { in: categories } })
    };
    
    // Query database
    const servers = await prisma.mapServerRegistry.findMany({
      where,
      take: maxResults,
      orderBy: { queryCount: 'desc' }
    });
    
    console.log(`📊 Found ${servers.length} MapServers`);
    
    // Fetch features from each MapServer
    const results = await Promise.all(
      servers.map(server => fetchFeatures(server, bounds))
    );
    
    // Update query statistics
    await Promise.all(
      servers.map(server => 
        prisma.mapServerRegistry.update({
          where: { id: server.id },
          data: {
            lastQueried: new Date(),
            queryCount: { increment: 1 }
          }
        })
      )
    );
    
    const successfulServers = results.filter(r => r.features.length > 0);
    console.log(`✅ ${successfulServers.length} servers returned data`);
    
    res.json({
      success: true,
      query,
      servers: successfulServers
    });
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function fetchFeatures(server, bounds) {
  try {
    const queryUrl = new URL(`${server.url}/query`);
    queryUrl.searchParams.set('f', 'geojson');
    queryUrl.searchParams.set('returnGeometry', 'true');
    queryUrl.searchParams.set('outFields', '*');
    
    if (bounds) {
      queryUrl.searchParams.set('geometry', JSON.stringify({
        xmin: bounds.west,
        ymin: bounds.south,
        xmax: bounds.east,
        ymax: bounds.north,
        spatialReference: { wkid: 4326 }
      }));
      queryUrl.searchParams.set('geometryType', 'esriGeometryEnvelope');
      queryUrl.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
    } else {
      queryUrl.searchParams.set('where', '1=1');
      queryUrl.searchParams.set('resultRecordCount', '100');
    }
    
    const response = await fetch(queryUrl.toString(), {
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      console.warn(`⚠️ MapServer ${server.url} returned ${response.status}`);
      return { 
        serverId: server.id, 
        url: server.url, 
        category: server.category, 
        features: [] 
      };
    }
    
    const data = await response.json();
    
    return {
      serverId: server.id,
      url: server.url,
      category: server.category,
      serviceName: server.serviceName,
      features: data.features || [],
      geometryType: server.geometryType
    };
    
  } catch (error) {
    console.warn(`⚠️ Error fetching ${server.url}:`, error.message);
    return { 
      serverId: server.id, 
      url: server.url, 
      category: server.category, 
      features: [] 
    };
  }
}

export default router;
