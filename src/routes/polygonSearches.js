import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/polygon-searches - Create new polygon search
router.post('/polygon-searches', async (req, res) => {
  try {
    const { name, polygonGeoJSON, messages, filters, areaAcres, centroidLat, centroidLng, description } = req.body;
    
    if (!polygonGeoJSON) {
      return res.status(400).json({ 
        success: false, 
        error: 'polygonGeoJSON is required' 
      });
    }
    
    const search = await prisma.polygonSearch.create({
      data: {
        name: name || 'Untitled Search',
        description: description || null,
        polygonGeoJSON,
        messages: messages || [],
        filters: filters || {},
        areaAcres: areaAcres || null,
        centroidLat: centroidLat || null,
        centroidLng: centroidLng || null
      }
    });
    
    res.json({ success: true, search });
  } catch (error) {
    console.error('Create polygon search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/polygon-searches - List user's polygon searches
router.get('/polygon-searches', async (req, res) => {
  try {
    const { limit = 20, includeArchived = false } = req.query;
    
    const searches = await prisma.polygonSearch.findMany({
      where: includeArchived === 'true' ? {} : { isArchived: false },
      orderBy: { lastAccessedAt: 'desc' },
      take: parseInt(limit),
      select: {
        id: true,
        name: true,
        description: true,
        areaAcres: true,
        centroidLat: true,
        centroidLng: true,
        createdAt: true,
        updatedAt: true,
        lastAccessedAt: true,
        isArchived: true,
        messages: true // To get message count
      }
    });
    
    // Add message count and remove full messages from response
    const searchesWithCount = searches.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      areaAcres: s.areaAcres,
      centroidLat: s.centroidLat,
      centroidLng: s.centroidLng,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      lastAccessedAt: s.lastAccessedAt,
      isArchived: s.isArchived,
      messageCount: Array.isArray(s.messages) ? s.messages.length : 0
    }));
    
    res.json({ success: true, searches: searchesWithCount });
  } catch (error) {
    console.error('List polygon searches error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/polygon-searches/:id - Get single polygon search with full data
router.get('/polygon-searches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const search = await prisma.polygonSearch.findUnique({
      where: { id }
    });
    
    if (!search) {
      return res.status(404).json({ success: false, error: 'Polygon search not found' });
    }
    
    // Update lastAccessedAt
    const updated = await prisma.polygonSearch.update({
      where: { id },
      data: { lastAccessedAt: new Date() }
    });
    
    res.json({ success: true, search: updated });
  } catch (error) {
    console.error('Get polygon search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/polygon-searches/:id - Update polygon search (name, messages, filters)
router.put('/polygon-searches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, messages, filters, isArchived } = req.body;
    
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (messages !== undefined) updateData.messages = messages;
    if (filters !== undefined) updateData.filters = filters;
    if (isArchived !== undefined) updateData.isArchived = isArchived;
    
    const search = await prisma.polygonSearch.update({
      where: { id },
      data: updateData
    });
    
    res.json({ success: true, search });
  } catch (error) {
    console.error('Update polygon search error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Polygon search not found' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/polygon-searches/:id/messages - Append messages to existing search
router.post('/polygon-searches/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { messages: newMessages } = req.body;
    
    if (!Array.isArray(newMessages) || newMessages.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'messages must be a non-empty array' 
      });
    }
    
    const existing = await prisma.polygonSearch.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Polygon search not found' });
    }
    
    const currentMessages = Array.isArray(existing.messages) ? existing.messages : [];
    const updatedMessages = [...currentMessages, ...newMessages];
    
    const search = await prisma.polygonSearch.update({
      where: { id },
      data: { 
        messages: updatedMessages,
        lastAccessedAt: new Date()
      }
    });
    
    res.json({ 
      success: true, 
      messageCount: updatedMessages.length,
      search 
    });
  } catch (error) {
    console.error('Append messages error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/polygon-searches/:id - Delete polygon search
router.delete('/polygon-searches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.polygonSearch.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete polygon search error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Polygon search not found' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;




