import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/deal-rooms/:id/access - Get user's access level
router.get('/:id/access', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const access = await prisma.dealUserAccess.findUnique({
      where: { dealRoomId_userId: { dealRoomId: id, userId } }
    });
    
    const dealRoom = await prisma.dealRoom.findUnique({
      where: { id },
      select: { accessTier: true, ndaRequired: true, ownerId: true }
    });
    
    res.json({
      userAccess: access,
      dealRequirements: dealRoom,
      isOwner: dealRoom?.ownerId === userId
    });
  } catch (error) {
    console.error('[DealRoomAccess] Get access error:', error);
    res.status(500).json({ error: 'Failed to fetch access' });
  }
});

// POST /api/deal-rooms/:id/request-access - Request access
router.post('/:id/request-access', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, requestedTier } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const access = await prisma.dealUserAccess.upsert({
      where: { dealRoomId_userId: { dealRoomId: id, userId } },
      update: { 
        ndaStatus: 'REQUESTED',
        requestedAt: new Date()
      },
      create: {
        dealRoomId: id,
        userId,
        accessTier: 'PUBLIC_PREVIEW',
        ndaStatus: 'REQUESTED',
        requestedAt: new Date()
      }
    });
    
    await prisma.dealActivityLog.create({
      data: {
        dealRoomId: id,
        userId,
        action: 'access_requested',
        details: { requestedTier }
      }
    });
    
    res.json(access);
  } catch (error) {
    console.error('[DealRoomAccess] Request access error:', error);
    res.status(500).json({ error: 'Failed to request access' });
  }
});

// POST /api/deal-rooms/:id/approve-access - Approve access (owner only)
router.post('/:id/approve-access', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, approvedTier, approvedBy } = req.body;
    
    if (!userId || !approvedBy) {
      return res.status(400).json({ error: 'userId and approvedBy are required' });
    }
    
    // Verify approver is owner
    const dealRoom = await prisma.dealRoom.findUnique({
      where: { id },
      select: { ownerId: true }
    });
    
    if (dealRoom?.ownerId !== approvedBy) {
      return res.status(403).json({ error: 'Only the owner can approve access' });
    }
    
    const access = await prisma.dealUserAccess.update({
      where: { dealRoomId_userId: { dealRoomId: id, userId } },
      data: {
        accessTier: approvedTier || 'REGISTERED',
        ndaStatus: 'SIGNED',
        approvedAt: new Date(),
        approvedBy
      }
    });
    
    await prisma.dealActivityLog.create({
      data: {
        dealRoomId: id,
        userId,
        action: 'access_approved',
        details: { approvedTier, approvedBy }
      }
    });
    
    res.json(access);
  } catch (error) {
    console.error('[DealRoomAccess] Approve access error:', error);
    res.status(500).json({ error: 'Failed to approve access' });
  }
});

// POST /api/deal-rooms/:id/nda/sign - Sign NDA
router.post('/:id/nda/sign', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, signerName, signerEmail, ipAddress } = req.body;
    
    if (!userId || !signerName) {
      return res.status(400).json({ error: 'userId and signerName are required' });
    }
    
    const signature = await prisma.ndaSignature.create({
      data: {
        dealRoomId: id,
        userId,
        signerName,
        signerEmail,
        ipAddress,
        ndaVersionHash: 'v1.0'
      }
    });
    
    await prisma.dealUserAccess.upsert({
      where: { dealRoomId_userId: { dealRoomId: id, userId } },
      update: { 
        ndaStatus: 'SIGNED',
        accessTier: 'NDA_REQUIRED'
      },
      create: {
        dealRoomId: id,
        userId,
        ndaStatus: 'SIGNED',
        accessTier: 'NDA_REQUIRED'
      }
    });
    
    await prisma.dealActivityLog.create({
      data: {
        dealRoomId: id,
        userId,
        action: 'nda_signed',
        details: { signerName, signerEmail }
      }
    });
    
    res.json(signature);
  } catch (error) {
    console.error('[DealRoomAccess] Sign NDA error:', error);
    res.status(500).json({ error: 'Failed to sign NDA' });
  }
});

// GET /api/deal-rooms/:id/activity - Get activity log
router.get('/:id/activity', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;
    
    const activities = await prisma.dealActivityLog.findMany({
      where: { dealRoomId: id },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });
    
    res.json({ activities });
  } catch (error) {
    console.error('[DealRoomAccess] Get activity error:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

export default router;
