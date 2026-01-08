import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// Access tier hierarchy for checking permissions
const ACCESS_HIERARCHY = ['PUBLIC_PREVIEW', 'REGISTERED', 'NDA_REQUIRED', 'VERIFIED', 'INVITE_ONLY'];

const hasAccess = (userTier, requiredTier) => {
  const userLevel = ACCESS_HIERARCHY.indexOf(userTier);
  const requiredLevel = ACCESS_HIERARCHY.indexOf(requiredTier);
  return userLevel >= requiredLevel;
};

// GET /api/deal-rooms/:id/documents - List documents
router.get('/:id/documents', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    
    // Get user's access level
    let userTier = 'PUBLIC_PREVIEW';
    if (userId) {
      const access = await prisma.dealUserAccess.findUnique({
        where: { dealRoomId_userId: { dealRoomId: id, userId } }
      });
      if (access) userTier = access.accessTier;
      
      // Check if owner
      const dealRoom = await prisma.dealRoom.findUnique({
        where: { id },
        select: { ownerId: true }
      });
      if (dealRoom?.ownerId === userId) userTier = 'INVITE_ONLY'; // Owner has full access
    }
    
    const documents = await prisma.dealDocument.findMany({
      where: { dealRoomId: id },
      orderBy: [{ folder: 'asc' }, { createdAt: 'desc' }]
    });
    
    // Filter by access and mark locked docs
    const filteredDocs = documents.map(doc => ({
      ...doc,
      isLocked: !hasAccess(userTier, doc.accessTier),
      fileUrl: hasAccess(userTier, doc.accessTier) ? doc.fileUrl : null
    }));
    
    res.json({ documents: filteredDocs });
  } catch (error) {
    console.error('[DealRoomDocuments] List error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// POST /api/deal-rooms/:id/documents - Upload document metadata
router.post('/:id/documents', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, folder, name, fileUrl, fileType, fileSize, accessTier, canDownload } = req.body;
    
    if (!userId || !folder || !name || !fileUrl) {
      return res.status(400).json({ error: 'userId, folder, name, and fileUrl are required' });
    }
    
    // Verify user is owner
    const dealRoom = await prisma.dealRoom.findUnique({
      where: { id },
      select: { ownerId: true }
    });
    
    if (dealRoom?.ownerId !== userId) {
      return res.status(403).json({ error: 'Only the owner can upload documents' });
    }
    
    const document = await prisma.dealDocument.create({
      data: {
        dealRoomId: id,
        folder,
        name,
        fileUrl,
        fileType,
        fileSize,
        accessTier: accessTier || 'REGISTERED',
        canDownload: canDownload !== false,
        uploadedBy: userId
      }
    });
    
    await prisma.dealActivityLog.create({
      data: {
        dealRoomId: id,
        userId,
        action: 'document_uploaded',
        details: { documentId: document.id, name, folder }
      }
    });
    
    res.status(201).json(document);
  } catch (error) {
    console.error('[DealRoomDocuments] Upload error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// DELETE /api/deal-rooms/:id/documents/:docId - Delete document
router.delete('/:id/documents/:docId', async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { userId } = req.body;
    
    // Verify user is owner
    const dealRoom = await prisma.dealRoom.findUnique({
      where: { id },
      select: { ownerId: true }
    });
    
    if (dealRoom?.ownerId !== userId) {
      return res.status(403).json({ error: 'Only the owner can delete documents' });
    }
    
    await prisma.dealDocument.delete({
      where: { id: docId }
    });
    
    await prisma.dealActivityLog.create({
      data: {
        dealRoomId: id,
        userId,
        action: 'document_deleted',
        details: { documentId: docId }
      }
    });
    
    res.json({ success: true, id: docId });
  } catch (error) {
    console.error('[DealRoomDocuments] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// POST /api/deal-rooms/:id/documents/:docId/view - Log document view
router.post('/:id/documents/:docId/view', async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    await prisma.dealActivityLog.create({
      data: {
        dealRoomId: id,
        userId,
        action: 'document_viewed',
        details: { documentId: docId }
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('[DealRoomDocuments] Log view error:', error);
    res.status(500).json({ error: 'Failed to log view' });
  }
});

// POST /api/deal-rooms/:id/documents/:docId/download - Log document download
router.post('/:id/documents/:docId/download', async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    await prisma.dealActivityLog.create({
      data: {
        dealRoomId: id,
        userId,
        action: 'document_downloaded',
        details: { documentId: docId }
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('[DealRoomDocuments] Log download error:', error);
    res.status(500).json({ error: 'Failed to log download' });
  }
});

// ==================== MEDIA ROUTES ====================

// GET /api/deal-rooms/:id/media - List media
router.get('/:id/media', async (req, res) => {
  try {
    const { id } = req.params;
    
    const media = await prisma.dealMedia.findMany({
      where: { dealRoomId: id },
      orderBy: [{ mediaType: 'asc' }, { createdAt: 'desc' }]
    });
    
    res.json({ media });
  } catch (error) {
    console.error('[DealRoomDocuments] List media error:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// POST /api/deal-rooms/:id/media - Upload media metadata
router.post('/:id/media', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, mediaType, tag, name, url, thumbnailUrl } = req.body;
    
    if (!userId || !mediaType || !url) {
      return res.status(400).json({ error: 'userId, mediaType, and url are required' });
    }
    
    // Verify user is owner
    const dealRoom = await prisma.dealRoom.findUnique({
      where: { id },
      select: { ownerId: true }
    });
    
    if (dealRoom?.ownerId !== userId) {
      return res.status(403).json({ error: 'Only the owner can upload media' });
    }
    
    const media = await prisma.dealMedia.create({
      data: {
        dealRoomId: id,
        mediaType,
        tag,
        name,
        url,
        thumbnailUrl,
        uploadedBy: userId
      }
    });
    
    res.status(201).json(media);
  } catch (error) {
    console.error('[DealRoomDocuments] Upload media error:', error);
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

// DELETE /api/deal-rooms/:id/media/:mediaId - Delete media
router.delete('/:id/media/:mediaId', async (req, res) => {
  try {
    const { id, mediaId } = req.params;
    const { userId } = req.body;
    
    // Verify user is owner
    const dealRoom = await prisma.dealRoom.findUnique({
      where: { id },
      select: { ownerId: true }
    });
    
    if (dealRoom?.ownerId !== userId) {
      return res.status(403).json({ error: 'Only the owner can delete media' });
    }
    
    await prisma.dealMedia.delete({
      where: { id: mediaId }
    });
    
    res.json({ success: true, id: mediaId });
  } catch (error) {
    console.error('[DealRoomDocuments] Delete media error:', error);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

export default router;
