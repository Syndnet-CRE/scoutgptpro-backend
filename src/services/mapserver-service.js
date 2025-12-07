import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Search MapServers and fetch GeoJSON features
 * @param {Object} params - Search parameters
 * @param {string} params.query - Search query
 * @param {Object} params.bounds - Geographic bounds {north, south, east, west}
 * @param {string[]} params.categories - Filter by categories
 * @param {number} params.maxResults - Maximum number of servers to query
 * @returns {Promise<Object>} Search results with servers and features
 */
export async function searchMapServers({ query, bounds, categories, maxResults = 5 }) {
  try {
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
    
    console.log(`📊 Found ${servers.length} MapServers in database`);
    
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
    
    return {
      success: true,
      query,
      servers: successfulServers
    };
    
  } catch (error) {
    console.error('❌ MapServer search error:', error);
    throw error;
  }
}

/**
 * Fetch GeoJSON features from an ArcGIS MapServer
 * @param {Object} server - MapServer registry entry
 * @param {Object} bounds - Geographic bounds
 * @returns {Promise<Object>} Server data with features
 */
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

