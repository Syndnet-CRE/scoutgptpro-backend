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
