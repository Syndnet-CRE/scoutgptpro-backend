// src/routes/staging.js
// API routes for CRM staging (pre-deal room property management)

import express from 'express';
import {
  addToStaging,
  bulkAddToStaging,
  removeFromStaging,
  getStaged,
  updateStagingItem,
  clearStaging
} from '../services/staging/index.js';

const router = express.Router();

/**
 * GET /api/staging
 * Get all staged properties for a user/session
 */
router.get('/', async (req, res) => {
  try {
    const { userId, sessionId, status, limit } = req.query;

    if (!userId && !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'userId or sessionId is required'
      });
    }

    const staged = await getStaged({
      userId,
      sessionId,
      status,
      limit: limit ? parseInt(limit, 10) : 100
    });

    res.json({
      success: true,
      count: staged.length,
      staged
    });

  } catch (error) {
    console.error('[GET /api/staging] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to get staged items' });
  }
});

/**
 * POST /api/staging
 * Add a single property to staging
 */
router.post('/', async (req, res) => {
  try {
    const { userId, sessionId, parcelId, propertyData, sourceQuery, notes } = req.body;

    if (!parcelId) {
      return res.status(400).json({
        success: false,
        error: 'parcelId is required'
      });
    }

    const staged = await addToStaging({
      userId,
      sessionId,
      parcelId,
      propertyData,
      sourceQuery,
      notes
    });

    res.status(201).json({
      success: true,
      staged
    });

  } catch (error) {
    console.error('[POST /api/staging] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to add to staging' });
  }
});

/**
 * POST /api/staging/bulk
 * Add multiple properties to staging
 */
router.post('/bulk', async (req, res) => {
  try {
    const { userId, sessionId, properties, sourceQuery } = req.body;

    if (!properties || !Array.isArray(properties) || properties.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'properties array is required'
      });
    }

    const result = await bulkAddToStaging({
      userId,
      sessionId,
      properties,
      sourceQuery
    });

    res.status(201).json({
      success: true,
      added: result.added,
      items: result.items
    });

  } catch (error) {
    console.error('[POST /api/staging/bulk] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to bulk add to staging' });
  }
});

/**
 * PATCH /api/staging/:id
 * Update a staging item (notes, status, etc.)
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updated = await updateStagingItem(id, updates);

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Staging item not found'
      });
    }

    res.json({
      success: true,
      staged: updated
    });

  } catch (error) {
    console.error('[PATCH /api/staging/:id] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to update staging item' });
  }
});

/**
 * DELETE /api/staging/:id
 * Remove a single item from staging
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const removed = await removeFromStaging({ stagingId: id });

    if (!removed) {
      return res.status(404).json({
        success: false,
        error: 'Staging item not found'
      });
    }

    res.json({
      success: true,
      removed
    });

  } catch (error) {
    console.error('[DELETE /api/staging/:id] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to remove from staging' });
  }
});

/**
 * DELETE /api/staging/clear
 * Clear all staged items for a user/session
 */
router.delete('/clear', async (req, res) => {
  try {
    const { userId, sessionId } = req.body;

    if (!userId && !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'userId or sessionId is required'
      });
    }

    const result = await clearStaging({ userId, sessionId });

    res.json({
      success: true,
      cleared: result.cleared
    });

  } catch (error) {
    console.error('[DELETE /api/staging/clear] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to clear staging' });
  }
});

export default router;
