import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/deal-rooms/:id/assumptions - Get current user's assumptions
router.get('/:id/assumptions', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const assumptions = await prisma.buyerAssumptions.findUnique({
      where: { dealRoomId_userId: { dealRoomId: id, userId } }
    });
    
    // Return empty defaults if no assumptions exist
    res.json(assumptions || {
      dealRoomId: id,
      userId,
      purchasePrice: null,
      capExAssumption: null,
      exitCap: null,
      holdPeriod: null,
      notes: null
    });
  } catch (error) {
    console.error('[BuyerAssumptions] Get error:', error);
    res.status(500).json({ error: 'Failed to fetch assumptions' });
  }
});

// PUT /api/deal-rooms/:id/assumptions - Update current user's assumptions
router.put('/:id/assumptions', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, purchasePrice, capExAssumption, exitCap, holdPeriod, notes } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const assumptions = await prisma.buyerAssumptions.upsert({
      where: { dealRoomId_userId: { dealRoomId: id, userId } },
      update: {
        purchasePrice,
        capExAssumption,
        exitCap,
        holdPeriod,
        notes,
        updatedAt: new Date()
      },
      create: {
        dealRoomId: id,
        userId,
        purchasePrice,
        capExAssumption,
        exitCap,
        holdPeriod,
        notes
      }
    });
    
    res.json(assumptions);
  } catch (error) {
    console.error('[BuyerAssumptions] Update error:', error);
    res.status(500).json({ error: 'Failed to update assumptions' });
  }
});

export default router;
