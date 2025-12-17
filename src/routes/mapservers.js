import express from 'express';
import { PrismaClient } from '@prisma/client';
import { searchMapServers } from '../services/mapserver-service.js';

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

// Get all layer sets grouped by category
router.get('/layer-sets', async (req, res) => {
  try {
    const layerSets = await prisma.layerSet.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }]
    });
    
    // Group by category for frontend
    const grouped = {};
    layerSets.forEach(layer => {
      if (!grouped[layer.category]) {
        grouped[layer.category] = [];
      }
      grouped[layer.category].push({
        id: layer.layerSetId,
        name: layer.name,
        description: layer.description,
        geometryType: layer.geometryType,
        style: layer.style,
        url: layer.primaryLayerUrl,
        featureCount: layer.totalFeatureCount,
        layerCount: layer.layerCount
      });
    });
    
    res.json({
      success: true,
      data: grouped,
      total: layerSets.length
    });
  } catch (error) {
    console.error('Error fetching layer sets:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch layer sets' });
  }
});

// Get single layer set by ID
router.get('/layer-sets/:id', async (req, res) => {
  try {
    const layerSet = await prisma.layerSet.findUnique({
      where: { layerSetId: req.params.id }
    });
    
    if (!layerSet) {
      return res.status(404).json({ success: false, error: 'Layer set not found' });
    }
    
    res.json({
      success: true,
      data: {
        id: layerSet.layerSetId,
        name: layerSet.name,
        category: layerSet.category,
        description: layerSet.description,
        geometryType: layerSet.geometryType,
        style: layerSet.style,
        url: layerSet.primaryLayerUrl,
        alternativeLayers: layerSet.alternativeLayers,
        featureCount: layerSet.totalFeatureCount,
        layerCount: layerSet.layerCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/mapservers/search (for frontend layer loading)
router.get('/search', async (req, res) => {
  try {
    const { 
      category, 
      state, 
      search, 
      limit = 1000, 
      offset = 0 
    } = req.query;
    
    // Build where clause
    const where = {
      isActive: true,
      ...(category && { category }),
      ...(state && { 
        OR: [
          { url: { contains: state, mode: 'insensitive' } },
          { context: { contains: state, mode: 'insensitive' } }
        ]
      }),
      ...(search && {
        OR: [
          { url: { contains: search, mode: 'insensitive' } },
          { serviceName: { contains: search, mode: 'insensitive' } },
          { context: { contains: search, mode: 'insensitive' } }
        ]
      })
    };
    
    // Get total count
    const total = await prisma.mapServerRegistry.count({ where });
    
    // Get paginated results
    const mapservers = await prisma.mapServerRegistry.findMany({
      where,
      take: parseInt(limit),
      skip: parseInt(offset),
      orderBy: { queryCount: 'desc' }
    });
    
    res.json({
      success: true,
      mapservers,
      total
    });
    
  } catch (error) {
    console.error('GET search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/mapservers/search (for AI-powered search with bounds)
router.post('/search', async (req, res) => {
  try {
    const { query, bounds, categories, maxResults = 5 } = req.body;
    
    // Use shared service
    const result = await searchMapServers({ query, bounds, categories, maxResults });
    
    res.json(result);
    
  } catch (error) {
    console.error('POST search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
