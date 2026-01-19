// src/routes/sessions.js
// Session management API routes

import express from 'express';
import {
  getSession,
  createSession,
  updateSession,
  deleteSession,
  generateSessionId,
  cleanupExpiredSessions
} from '../services/sessions/index.js';

const router = express.Router();

/**
 * POST /api/sessions
 * Create a new session or get existing one
 */
router.post('/', async (req, res) => {
  try {
    const { sessionId, userId } = req.body;

    // If sessionId provided, try to get existing session first
    if (sessionId) {
      const existing = await getSession(sessionId);
      if (existing) {
        return res.json({
          success: true,
          session: existing,
          isNew: false
        });
      }
    }

    // Create new session
    const newSessionId = sessionId || generateSessionId();
    const session = await createSession(newSessionId, userId || null);

    res.status(201).json({
      success: true,
      session,
      isNew: true
    });
  } catch (error) {
    console.error('[Sessions API] Error creating session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/sessions/:sessionId
 * Get session state
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or expired'
      });
    }

    res.json({
      success: true,
      session
    });
  } catch (error) {
    console.error('[Sessions API] Error getting session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/sessions/:sessionId
 * Update session state (partial update)
 */
router.patch('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { updates } = req.body;

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Updates object required'
      });
    }

    const session = await updateSession(sessionId, updates);

    res.json({
      success: true,
      session
    });
  } catch (error) {
    console.error('[Sessions API] Error updating session:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/sessions/:sessionId/state
 * Replace entire session state
 */
router.put('/:sessionId/state', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { state } = req.body;

    if (!state || typeof state !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'State object required'
      });
    }

    // Import saveSession for full state replacement
    const { saveSession } = await import('../services/sessions/index.js');
    const session = await saveSession(sessionId, state);

    res.json({
      success: true,
      session
    });
  } catch (error) {
    console.error('[Sessions API] Error saving session state:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/sessions/:sessionId
 * Delete a session
 */
router.delete('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const deleted = await deleteSession(sessionId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      message: 'Session deleted'
    });
  } catch (error) {
    console.error('[Sessions API] Error deleting session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sessions/:sessionId/select-parcel
 * Convenience endpoint to select a parcel
 */
router.post('/:sessionId/select-parcel', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { parcelId } = req.body;

    const session = await updateSession(sessionId, {
      selectedParcel: parcelId ? {
        parcelId,
        selectedAt: new Date().toISOString()
      } : null
    });

    res.json({
      success: true,
      session
    });
  } catch (error) {
    console.error('[Sessions API] Error selecting parcel:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sessions/cleanup
 * Admin endpoint to clean up expired sessions
 */
router.post('/cleanup', async (req, res) => {
  try {
    const count = await cleanupExpiredSessions();

    res.json({
      success: true,
      message: `Cleaned up ${count} expired sessions`
    });
  } catch (error) {
    console.error('[Sessions API] Error cleaning up sessions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
