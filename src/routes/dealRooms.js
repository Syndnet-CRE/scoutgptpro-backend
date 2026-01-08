import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/deal-rooms - List all deal rooms for user
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const dealRooms = await prisma.dealRoom.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' }
    });
    
    res.json({ dealRooms });
  } catch (error) {
    console.error('[DealRooms] List error:', error);
    res.status(500).json({ error: 'Failed to fetch deal rooms' });
  }
});

// POST /api/deal-rooms - Create new deal room
router.post('/', async (req, res) => {
  try {
    const { userId, title, assetType, location } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const dealRoom = await prisma.dealRoom.create({
      data: {
        ownerId: userId,
        title: title || 'Untitled Deal Room',
        assetType,
        location,
        status: 'inbound',
        mapState: {
          center: [-97.7431, 30.2672],
          zoom: 12,
          bearing: 0,
          pitch: 0,
          style: 'mapbox://styles/mapbox/streets-v12',
          activeLayers: [],
          selectedFeatureIds: [],
          drawnGeometries: { type: 'FeatureCollection', features: [] }
        }
      }
    });
    
    res.status(201).json(dealRoom);
  } catch (error) {
    console.error('[DealRooms] Create error:', error);
    res.status(500).json({ error: 'Failed to create deal room' });
  }
});

// GET /api/deal-rooms/:id - Get single deal room
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const dealRoom = await prisma.dealRoom.findUnique({
      where: { id }
    });
    
    if (!dealRoom) {
      return res.status(404).json({ error: 'Deal room not found' });
    }
    
    res.json(dealRoom);
  } catch (error) {
    console.error('[DealRooms] Get error:', error);
    res.status(500).json({ error: 'Failed to fetch deal room' });
  }
});

// PATCH /api/deal-rooms/:id - Update deal room
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Remove fields that shouldn't be updated
    delete updates.id;
    delete updates.ownerId;
    delete updates.createdAt;
    
    const dealRoom = await prisma.dealRoom.update({
      where: { id },
      data: {
        ...updates,
        updatedAt: new Date()
      }
    });
    
    res.json(dealRoom);
  } catch (error) {
    console.error('[DealRooms] Update error:', error);
    res.status(500).json({ error: 'Failed to update deal room' });
  }
});

// DELETE /api/deal-rooms/:id - Delete deal room
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.dealRoom.delete({
      where: { id }
    });
    
    res.json({ success: true, id });
  } catch (error) {
    console.error('[DealRooms] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete deal room' });
  }
});

export default router;
