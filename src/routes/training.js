/**
 * Training Data Export Routes
 */

import express from 'express';
import { exportTrainingData } from '../services/claude-writeback/index.js';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/training/export
 * Export Claude conversations as JSONL for fine-tuning
 */
router.post('/export', async (req, res) => {
  try {
    const { sessionIds, startDate, endDate, exportedBy } = req.body;

    const { jsonl, log } = await exportTrainingData({
      sessionIds,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      exportedBy
    });

    // Return JSONL as downloadable file
    res.setHeader('Content-Type', 'application/jsonl');
    res.setHeader('Content-Disposition', `attachment; filename="training_export_${log.id}.jsonl"`);
    res.send(jsonl);
  } catch (error) {
    console.error('Training export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export training data',
      details: error.message
    });
  }
});

/**
 * GET /api/training/exports
 * List past exports
 */
router.get('/exports', async (req, res) => {
  try {
    const exports = await prisma.trainingExportLog.findMany({
      orderBy: { exportedAt: 'desc' },
      take: 50
    });

    res.json({
      success: true,
      exports
    });
  } catch (error) {
    console.error('List exports error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list exports',
      details: error.message
    });
  }
});

export default router;
