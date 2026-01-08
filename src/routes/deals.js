import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/deals - List deals with filters
router.get('/', async (req, res) => {
  try {
    const { userId, stage, search, limit = 50, offset = 0 } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const where = { userId };
    if (stage) where.stage = stage;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } }
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
      dealType,
      purchasePrice,
      offerPrice,
      closingDate,
      seller,
      buyer,
      probability,
      lostReason,
      notes,
      propertyId,
      metadata
    } = req.body;
    
    if (!userId || !title) {
      return res.status(400).json({ error: 'userId and title are required' });
    }
    
    // Store any extra fields (like propertyAddress, contactName, etc.) in metadata
    const metadataObj = metadata || {};
    const extraFields = {};
    if (req.body.propertyAddress) extraFields.propertyAddress = req.body.propertyAddress;
    if (req.body.propertyCity) extraFields.propertyCity = req.body.propertyCity;
    if (req.body.propertyState) extraFields.propertyState = req.body.propertyState;
    if (req.body.propertyZip) extraFields.propertyZip = req.body.propertyZip;
    if (req.body.propertyType) extraFields.propertyType = req.body.propertyType;
    if (req.body.contactName) extraFields.contactName = req.body.contactName;
    if (req.body.contactEmail) extraFields.contactEmail = req.body.contactEmail;
    if (req.body.contactPhone) extraFields.contactPhone = req.body.contactPhone;
    if (req.body.contactCompany) extraFields.contactCompany = req.body.contactCompany;
    if (req.body.source) extraFields.source = req.body.source;
    if (req.body.sourceQuery) extraFields.sourceQuery = req.body.sourceQuery;
    
    const deal = await prisma.deal.create({
      data: {
        userId,
        title,
        stage,
        dealType,
        purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null,
        offerPrice: offerPrice ? parseFloat(offerPrice) : null,
        closingDate: closingDate ? new Date(closingDate) : null,
        seller,
        buyer,
        probability: probability ? parseInt(probability) : null,
        lostReason,
        notes,
        propertyId,
        metadata: Object.keys(extraFields).length > 0 ? { ...metadataObj, ...extraFields } : metadataObj
      },
      include: { activities: true }
    });
    
    // Create activity for deal creation
    await prisma.activity.create({
      data: {
        userId,
        dealId: deal.id,
        type: 'created',
        subject: 'Deal created',
        description: `Deal "${title}" was created`
      }
    });
    
    // Fetch deal with activities
    const dealWithActivities = await prisma.deal.findUnique({
      where: { id: deal.id },
      include: { activities: true }
    });
    
    res.status(201).json(dealWithActivities);
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
    
    // Only include valid Deal model fields
    const validUpdateData = {};
    if (updateData.title !== undefined) validUpdateData.title = updateData.title;
    if (updateData.stage !== undefined) validUpdateData.stage = updateData.stage;
    if (updateData.dealType !== undefined) validUpdateData.dealType = updateData.dealType;
    if (updateData.purchasePrice !== undefined) validUpdateData.purchasePrice = updateData.purchasePrice ? parseFloat(updateData.purchasePrice) : null;
    if (updateData.offerPrice !== undefined) validUpdateData.offerPrice = updateData.offerPrice ? parseFloat(updateData.offerPrice) : null;
    if (updateData.closingDate !== undefined) validUpdateData.closingDate = updateData.closingDate ? new Date(updateData.closingDate) : null;
    if (updateData.seller !== undefined) validUpdateData.seller = updateData.seller;
    if (updateData.buyer !== undefined) validUpdateData.buyer = updateData.buyer;
    if (updateData.probability !== undefined) validUpdateData.probability = updateData.probability ? parseInt(updateData.probability) : null;
    if (updateData.lostReason !== undefined) validUpdateData.lostReason = updateData.lostReason;
    if (updateData.notes !== undefined) validUpdateData.notes = updateData.notes;
    if (updateData.propertyId !== undefined) validUpdateData.propertyId = updateData.propertyId;
    if (updateData.metadata !== undefined) validUpdateData.metadata = updateData.metadata;
    
    // Handle value field - map to purchasePrice
    if (updateData.value !== undefined) {
      validUpdateData.purchasePrice = updateData.value ? parseFloat(updateData.value) : null;
    }
    
    const deal = await prisma.deal.update({
      where: { id },
      data: validUpdateData,
      include: { activities: { orderBy: { completedAt: 'desc' }, take: 5 } }
    });
    
    // Create activity if stage changed
    if (stageChanged) {
      await prisma.activity.create({
        data: {
          userId: userId || existing.userId,
          dealId: id,
          type: 'stage_change',
          subject: 'Stage changed',
          description: `Stage changed from ${existing.stage} to ${updateData.stage}`
        }
      });
      
      // Fetch updated deal with activities
      const updatedDeal = await prisma.deal.findUnique({
        where: { id },
        include: { activities: { orderBy: { completedAt: 'desc' }, take: 5 } }
      });
      return res.json(updatedDeal);
    }
    
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

// DELETE /api/deals/activities/:activityId - Delete activity
router.delete('/activities/:activityId', async (req, res) => {
  try {
    const { activityId } = req.params;
    
    // Check if activity exists
    const activity = await prisma.activity.findUnique({
      where: { id: activityId }
    });
    
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    // Delete the activity
    await prisma.activity.delete({
      where: { id: activityId }
    });
    
    console.log(`Activity deleted: ${activityId}`);
    
    res.json({ success: true, id: activityId });
  } catch (error) {
    console.error('Error deleting activity:', error);
    res.status(500).json({ error: 'Failed to delete activity' });
  }
});

export default router;
