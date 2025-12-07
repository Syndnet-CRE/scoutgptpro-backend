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

// POST /api/mapservers/search
router.post('/search', async (req, res) => {
  try {
    const { query, bounds, categories, maxResults = 5 } = req.body;
    
    // Use shared service
    const result = await searchMapServers({ query, bounds, categories, maxResults });
    
    res.json(result);
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
