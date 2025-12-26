import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/deals - List user deals (filter by stage)
router.get('/', async (req, res) => {
  try {
    const { userId, stage } = req.query;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const where = { userId };
    if (stage) where.stage = stage;

    const deals = await prisma.deal.findMany({
      where,
      include: {
        property: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, deals });
  } catch (error) {
    console.error('Error fetching deals:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/deals - Create deal
router.post('/', async (req, res) => {
  try {
    const {
      userId,
      propertyId,
      listingId,
      name,
      stage = 'PIPELINE',
      askingPrice,
      offerPrice,
      notes
    } = req.body;

    if (!userId || !name) {
      return res.status(400).json({
        success: false,
        error: 'userId and name are required'
      });
    }

    const deal = await prisma.deal.create({
      data: {
        userId,
        propertyId,
        listingId,
        name,
        stage,
        purchasePrice: askingPrice ? parseFloat(askingPrice) : null,
        offerPrice: offerPrice ? parseFloat(offerPrice) : null,
        notes
      },
      include: {
        property: true
      }
    });

    res.status(201).json({ success: true, deal });
  } catch (error) {
    console.error('Error creating deal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/deals/:id - Update deal
router.patch('/:id', async (req, res) => {
  try {
    const { name, stage, askingPrice, offerPrice, notes } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (stage) updateData.stage = stage;
    if (askingPrice !== undefined) updateData.purchasePrice = parseFloat(askingPrice);
    if (offerPrice !== undefined) updateData.offerPrice = parseFloat(offerPrice);
    if (notes !== undefined) updateData.notes = notes;

    const deal = await prisma.deal.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        property: true
      }
    });

    res.json({ success: true, deal });
  } catch (error) {
    console.error('Error updating deal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/deals/:id/stage - Change stage
router.post('/:id/stage', async (req, res) => {
  try {
    const { stage } = req.body;

    const validStages = ['PIPELINE', 'ACTIVE', 'UNDERWRITING', 'PENDING', 'CLOSED', 'HOLD'];
    if (!stage || !validStages.includes(stage)) {
      return res.status(400).json({
        success: false,
        error: `stage must be one of: ${validStages.join(', ')}`
      });
    }

    const deal = await prisma.deal.update({
      where: { id: req.params.id },
      data: { stage },
      include: {
        property: true
      }
    });

    res.json({ success: true, deal });
  } catch (error) {
    console.error('Error updating deal stage:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/deals/:id - Delete deal
router.delete('/:id', async (req, res) => {
  try {
    await prisma.deal.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true, message: 'Deal deleted' });
  } catch (error) {
    console.error('Error deleting deal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

