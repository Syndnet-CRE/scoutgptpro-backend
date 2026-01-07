import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/deals - List deals with filters
router.get('/', async (req, res) => {
  try {
    const { userId, stage, priority, search, limit = 50, offset = 0 } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const where = { userId };
    if (stage) where.stage = stage;
    if (priority) where.priority = priority;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { propertyAddress: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    const [deals, total] = await Promise.all([
      prisma.deal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset)
      }),
      prisma.deal.count({ where })
    ]);
    
    res.json({ deals, total, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (error) {
    console.error('[Deals] List error:', error);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

// GET /api/deals/:id - Get single deal with activities
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deal = await prisma.deal.findUnique({
      where: { id },
      include: { activities: { orderBy: { completedAt: 'desc' }, take: 20 } }
    });
    
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    res.json(deal);
  } catch (error) {
    console.error('[Deals] Get error:', error);
    res.status(500).json({ error: 'Failed to fetch deal' });
  }
});

// POST /api/deals - Create new deal
router.post('/', async (req, res) => {
  try {
    const {
      userId,
      title,
      stage = 'PIPELINE',
      priority = 'MEDIUM',
      value,
      propertyId,
      propertyAddress,
      propertyCity,
      propertyState,
      propertyZip,
      propertyType,
      contactName,
      contactEmail,
      contactPhone,
      contactCompany,
      notes,
      source,
      sourceQuery
    } = req.body;
    
    if (!userId || !title) {
      return res.status(400).json({ error: 'userId and title are required' });
    }
    
    const deal = await prisma.deal.create({
      data: {
        userId,
        title,
        stage,
        value: value ? parseFloat(value) : null,
        purchasePrice: value ? parseFloat(value) : null,
        propertyId,
        notes,
        metadata: source ? { source, sourceQuery, propertyAddress, propertyCity, propertyState, propertyZip, propertyType, contactName, contactEmail, contactPhone, contactCompany } : { propertyAddress, propertyCity, propertyState, propertyZip, propertyType, contactName, contactEmail, contactPhone, contactCompany },
        activities: {
          create: {
            userId,
            type: 'created',
            subject: 'Deal created',
            description: `Deal "${title}" was created`,
          }
        }
      },
      include: { activities: true }
    });
    
    res.status(201).json(deal);
  } catch (error) {
    console.error('[Deals] Create error:', error);
    res.status(500).json({ error: 'Failed to create deal' });
  }
});

// PUT /api/deals/:id - Update deal
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, ...updateData } = req.body;
    
    const existing = await prisma.deal.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    const stageChanged = updateData.stage && updateData.stage !== existing.stage;
    
    const deal = await prisma.deal.update({
      where: { id },
      data: {
        ...updateData,
        value: updateData.value ? parseFloat(updateData.value) : existing.purchasePrice,
        purchasePrice: updateData.value ? parseFloat(updateData.value) : existing.purchasePrice,
        ...(stageChanged ? {
          activities: {
            create: {
              userId: userId || existing.userId,
              type: 'stage_change',
              subject: 'Stage changed',
              description: `Stage changed from ${existing.stage} to ${updateData.stage}`,
            }
          }
        } : {})
      },
      include: { activities: { orderBy: { completedAt: 'desc' }, take: 5 } }
    });
    
    res.json(deal);
  } catch (error) {
    console.error('[Deals] Update error:', error);
    res.status(500).json({ error: 'Failed to update deal' });
  }
});

// PATCH /api/deals/:id/stage - Change stage only
router.patch('/:id/stage', async (req, res) => {
  try {
    const { id } = req.params;
    const { stage, userId, notes } = req.body;
    
    if (!stage) {
      return res.status(400).json({ error: 'stage is required' });
    }
    
    const existing = await prisma.deal.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    if (existing.stage === stage) {
      return res.json({ message: 'Stage unchanged', deal: existing });
    }
    
    const deal = await prisma.deal.update({
      where: { id },
      data: {
        stage,
        activities: {
          create: {
            userId: userId || existing.userId,
            type: 'stage_change',
            subject: 'Stage changed',
            description: notes || `Stage changed from ${existing.stage} to ${stage}`,
          }
        }
      },
      include: { activities: { orderBy: { completedAt: 'desc' }, take: 5 } }
    });
    
    res.json({
      id: deal.id,
      stage: deal.stage,
      previousStage: existing.stage,
      updatedAt: deal.updatedAt
    });
  } catch (error) {
    console.error('[Deals] Stage change error:', error);
    res.status(500).json({ error: 'Failed to change stage' });
  }
});

// DELETE /api/deals/:id - Delete deal
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const existing = await prisma.deal.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    await prisma.deal.delete({ where: { id } });
    
    res.json({ success: true, id });
  } catch (error) {
    console.error('[Deals] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete deal' });
  }
});

// GET /api/deals/:id/activities - Get deal activities
router.get('/:id/activities', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;
    
    const activities = await prisma.activity.findMany({
      where: { dealId: id },
      orderBy: { completedAt: 'desc' },
      take: parseInt(limit)
    });
    
    res.json(activities);
  } catch (error) {
    console.error('[Deals] Activities error:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// POST /api/deals/:id/activities - Add activity to deal
router.post('/:id/activities', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, type = 'note', subject, description } = req.body;
    
    if (!userId || !subject) {
      return res.status(400).json({ error: 'userId and subject are required' });
    }
    
    const activity = await prisma.activity.create({
      data: {
        dealId: id,
        userId,
        type,
        subject,
        description
      }
    });
    
    res.status(201).json(activity);
  } catch (error) {
    console.error('[Deals] Add activity error:', error);
    res.status(500).json({ error: 'Failed to add activity' });
  }
});

export default router;
