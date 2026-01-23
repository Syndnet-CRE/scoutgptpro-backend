// src/routes/dealroomsV2.js
// Enhanced Deal Rooms API for investor demo

import express from 'express';
import {
  createDealRoom,
  getDealRoom,
  getDealRoomByToken,
  listDealRooms,
  updateDealRoom,
  generateShareLink,
  attachArtifact,
  getDealRoomArtifacts,
  getDealRoomActivity,
  deleteDealRoom,
  promoteFromStaging
} from '../services/dealrooms/index.js';

const router = express.Router();

/**
 * GET /api/v2/deal-rooms
 * List all deal rooms
 */
router.get('/', async (req, res) => {
  try {
    const { status, stage, limit, offset } = req.query;

    const result = await listDealRooms({
      status,
      stage,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('[GET /api/v2/deal-rooms] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to list deal rooms' });
  }
});

/**
 * POST /api/v2/deal-rooms
 * Create a new deal room
 */
router.post('/', async (req, res) => {
  try {
    const { parcelId, propertyData, name, userId } = req.body;

    if (!parcelId) {
      return res.status(400).json({
        success: false,
        error: 'parcelId is required'
      });
    }

    const dealRoom = await createDealRoom({
      parcelId,
      propertyData,
      name,
      userId
    });

    res.status(201).json({
      success: true,
      dealRoom
    });

  } catch (error) {
    console.error('[POST /api/v2/deal-rooms] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to create deal room' });
  }
});

/**
 * POST /api/v2/deal-rooms/from-staging
 * Promote a staged property to a deal room
 */
router.post('/from-staging', async (req, res) => {
  try {
    const { stagingId, userId } = req.body;

    if (!stagingId) {
      return res.status(400).json({
        success: false,
        error: 'stagingId is required'
      });
    }

    const dealRoom = await promoteFromStaging(stagingId, userId);

    res.status(201).json({
      success: true,
      dealRoom
    });

  } catch (error) {
    console.error('[POST /api/v2/deal-rooms/from-staging] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/deal-rooms/share/:token
 * Get deal room by share token (public access)
 */
router.get('/share/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const dealRoom = await getDealRoomByToken(token);

    if (!dealRoom) {
      return res.status(404).json({
        success: false,
        error: 'Deal room not found or sharing disabled'
      });
    }

    // Also get artifacts for shared view
    const artifacts = await getDealRoomArtifacts(dealRoom.id);

    res.json({
      success: true,
      dealRoom,
      artifacts
    });

  } catch (error) {
    console.error('[GET /api/v2/deal-rooms/share/:token] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to get deal room' });
  }
});

/**
 * GET /api/v2/deal-rooms/:id
 * Get a single deal room by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const dealRoom = await getDealRoom(id);

    if (!dealRoom) {
      return res.status(404).json({
        success: false,
        error: 'Deal room not found'
      });
    }

    res.json({
      success: true,
      dealRoom
    });

  } catch (error) {
    console.error('[GET /api/v2/deal-rooms/:id] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to get deal room' });
  }
});

/**
 * PATCH /api/v2/deal-rooms/:id
 * Update a deal room
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, ...updates } = req.body;

    const dealRoom = await updateDealRoom(id, updates, userId);

    if (!dealRoom) {
      return res.status(404).json({
        success: false,
        error: 'Deal room not found'
      });
    }

    res.json({
      success: true,
      dealRoom
    });

  } catch (error) {
    console.error('[PATCH /api/v2/deal-rooms/:id] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to update deal room' });
  }
});

/**
 * DELETE /api/v2/deal-rooms/:id
 * Delete a deal room
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await deleteDealRoom(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Deal room not found'
      });
    }

    res.json({
      success: true,
      deleted
    });

  } catch (error) {
    console.error('[DELETE /api/v2/deal-rooms/:id] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to delete deal room' });
  }
});

/**
 * POST /api/v2/deal-rooms/:id/share
 * Generate or regenerate share link
 */
router.post('/:id/share', async (req, res) => {
  try {
    const { id } = req.params;
    const { expiresIn, public: isPublic } = req.body;

    const shareInfo = await generateShareLink(id, { expiresIn, public: isPublic });

    if (!shareInfo) {
      return res.status(404).json({
        success: false,
        error: 'Deal room not found'
      });
    }

    res.json({
      success: true,
      ...shareInfo
    });

  } catch (error) {
    console.error('[POST /api/v2/deal-rooms/:id/share] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to generate share link' });
  }
});

/**
 * GET /api/v2/deal-rooms/:id/artifacts
 * Get all artifacts attached to a deal room
 */
router.get('/:id/artifacts', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify deal room exists
    const dealRoom = await getDealRoom(id);
    if (!dealRoom) {
      return res.status(404).json({
        success: false,
        error: 'Deal room not found'
      });
    }

    const artifacts = await getDealRoomArtifacts(id);

    res.json({
      success: true,
      count: artifacts.length,
      artifacts
    });

  } catch (error) {
    console.error('[GET /api/v2/deal-rooms/:id/artifacts] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to get artifacts' });
  }
});

/**
 * POST /api/v2/deal-rooms/:id/artifacts
 * Attach an artifact to a deal room
 */
router.post('/:id/artifacts', async (req, res) => {
  try {
    const { id } = req.params;
    const { artifactId, userId } = req.body;

    if (!artifactId) {
      return res.status(400).json({
        success: false,
        error: 'artifactId is required'
      });
    }

    const attachment = await attachArtifact(id, artifactId, userId);

    res.status(201).json({
      success: true,
      attachment
    });

  } catch (error) {
    console.error('[POST /api/v2/deal-rooms/:id/artifacts] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/deal-rooms/:id/activity
 * Get activity log for a deal room
 */
router.get('/:id/activity', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit } = req.query;

    // Verify deal room exists
    const dealRoom = await getDealRoom(id);
    if (!dealRoom) {
      return res.status(404).json({
        success: false,
        error: 'Deal room not found'
      });
    }

    const activity = await getDealRoomActivity(id, {
      limit: limit ? parseInt(limit, 10) : 50
    });

    res.json({
      success: true,
      count: activity.length,
      activity
    });

  } catch (error) {
    console.error('[GET /api/v2/deal-rooms/:id/activity] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to get activity' });
  }
});

export default router;
