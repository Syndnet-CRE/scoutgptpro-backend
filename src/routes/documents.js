import express from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import upload from '../middleware/upload.js';

const router = express.Router();
const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, '../../uploads');

// Helper function to validate deal exists
const validateDeal = async (dealId) => {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true }
  });
  if (!deal) {
    throw new Error('Deal not found');
  }
  return deal;
};

// GET /api/deals/:dealId/documents - List documents for a deal
router.get('/deals/:dealId/documents', async (req, res) => {
  try {
    const { dealId } = req.params;
    const { category } = req.query;
    
    // Validate deal exists
    await validateDeal(dealId);
    
    const where = { dealId };
    if (category) {
      const validCategories = ['contracts', 'financials', 'inspections', 'legal', 'other'];
      if (!validCategories.includes(category.toLowerCase())) {
        return res.status(400).json({ 
          error: `Invalid category. Must be one of: ${validCategories.join(', ')}` 
        });
      }
      where.category = category.toLowerCase();
    }
    
    const documents = await prisma.document.findMany({
      where,
      orderBy: { uploadedAt: 'desc' }
    });
    
    res.json(documents);
  } catch (error) {
    console.error('[Documents] List error:', error);
    if (error.message === 'Deal not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// POST /api/deals/:dealId/documents - Upload document
router.post('/deals/:dealId/documents', upload.single('file'), async (req, res) => {
  try {
    const { dealId } = req.params;
    const { userId, category, description } = req.body;
    
    if (!userId) {
      // Clean up uploaded file if validation fails
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'userId is required' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }
    
    // Validate deal exists
    await validateDeal(dealId);
    
    // Validate category if provided
    if (category) {
      const validCategories = ['contracts', 'financials', 'inspections', 'legal', 'other'];
      if (!validCategories.includes(category.toLowerCase())) {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ 
          error: `Invalid category. Must be one of: ${validCategories.join(', ')}` 
        });
      }
    }
    
    // Create document record
    const document = await prisma.document.create({
      data: {
        userId,
        dealId,
        filename: req.file.originalname,
        fileUrl: `/uploads/${req.file.filename}`,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        category: category ? category.toLowerCase() : 'other',
        description: description || null
      }
    });
    
    res.status(201).json(document);
  } catch (error) {
    console.error('[Documents] Upload error:', error);
    
    // Clean up uploaded file if database operation fails
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('[Documents] Failed to clean up file:', unlinkError);
      }
    }
    
    if (error.message === 'Deal not found') {
      return res.status(404).json({ error: error.message });
    }
    
    // Handle multer errors
    if (error.message === 'File type not allowed. Allowed types: PDF, DOC, DOCX, XLS, XLSX, JPG, JPEG, PNG') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB' });
    }
    
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// GET /api/documents/:id/download - Download document file
router.get('/documents/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    
    const document = await prisma.document.findUnique({
      where: { id }
    });
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Extract filename from fileUrl (e.g., /uploads/1234567890-filename.pdf)
    const filename = path.basename(document.fileUrl);
    const filePath = path.join(uploadDir, filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }
    
    // Set headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${document.filename}"`);
    res.setHeader('Content-Type', document.fileType);
    
    // Send file
    res.sendFile(filePath);
  } catch (error) {
    console.error('[Documents] Download error:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// DELETE /api/deals/:dealId/documents/:docId - Delete document
router.delete('/deals/:dealId/documents/:docId', async (req, res) => {
  try {
    const { dealId, docId } = req.params;
    
    // Validate deal exists
    await validateDeal(dealId);
    
    // Check if document exists and belongs to this deal
    const document = await prisma.document.findUnique({
      where: { id: docId }
    });
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    if (document.dealId !== dealId) {
      return res.status(400).json({ error: 'Document does not belong to this deal' });
    }
    
    // Extract filename from fileUrl
    const filename = path.basename(document.fileUrl);
    const filePath = path.join(uploadDir, filename);
    
    // Delete file from filesystem
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (unlinkError) {
        console.error('[Documents] Failed to delete file:', unlinkError);
        // Continue with database deletion even if file deletion fails
      }
    }
    
    // Delete database record
    await prisma.document.delete({
      where: { id: docId }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Documents] Delete error:', error);
    if (error.message === 'Deal not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Error handler for multer errors
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB' });
    }
    return res.status(400).json({ error: `Upload error: ${error.message}` });
  }
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  next();
});

export default router;
