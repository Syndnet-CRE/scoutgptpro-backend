// src/services/sessions/index.js
// Session management service for ScoutGPT

import pg from 'pg';
import { createDefaultState, mergeState, validateState } from './stateManager.js';

/**
 * Get database pool connection
 */
function getDbPool() {
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5
  });
}

/**
 * Generate a unique session ID
 */
export function generateSessionId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `sess_${timestamp}_${random}`;
}

/**
 * Get a session by ID
 * @param {string} sessionId - The session ID
 * @returns {Promise<object|null>} - Session object or null if not found
 */
export async function getSession(sessionId) {
  if (!sessionId) return null;

  const pool = getDbPool();
  try {
    const result = await pool.query(
      `SELECT session_id, user_id, created_at, last_active_at, expires_at, state
       FROM sessions
       WHERE session_id = $1 AND expires_at > NOW()`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    // Update last_active_at
    await pool.query(
      `UPDATE sessions SET last_active_at = NOW() WHERE session_id = $1`,
      [sessionId]
    );

    return {
      sessionId: result.rows[0].session_id,
      userId: result.rows[0].user_id,
      createdAt: result.rows[0].created_at,
      lastActiveAt: result.rows[0].last_active_at,
      expiresAt: result.rows[0].expires_at,
      state: result.rows[0].state
    };
  } catch (error) {
    console.error('[SessionService] Error getting session:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Create a new session
 * @param {string} sessionId - Optional session ID (will generate if not provided)
 * @param {string} userId - Optional user ID for authenticated users
 * @returns {Promise<object>} - Created session object
 */
export async function createSession(sessionId = null, userId = null) {
  const pool = getDbPool();
  const id = sessionId || generateSessionId();
  const defaultState = createDefaultState();

  try {
    const result = await pool.query(
      `INSERT INTO sessions (session_id, user_id, state)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id) DO UPDATE SET
         last_active_at = NOW(),
         expires_at = NOW() + INTERVAL '24 hours'
       RETURNING session_id, user_id, created_at, last_active_at, expires_at, state`,
      [id, userId, JSON.stringify(defaultState)]
    );

    console.log(`[SessionService] Created session: ${id}`);

    return {
      sessionId: result.rows[0].session_id,
      userId: result.rows[0].user_id,
      createdAt: result.rows[0].created_at,
      lastActiveAt: result.rows[0].last_active_at,
      expiresAt: result.rows[0].expires_at,
      state: result.rows[0].state
    };
  } catch (error) {
    console.error('[SessionService] Error creating session:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Update session state
 * @param {string} sessionId - The session ID
 * @param {object} updates - State updates to apply
 * @returns {Promise<object>} - Updated session object
 */
export async function updateSession(sessionId, updates) {
  const pool = getDbPool();

  try {
    // Get current state
    const current = await pool.query(
      `SELECT state FROM sessions WHERE session_id = $1`,
      [sessionId]
    );

    if (current.rows.length === 0) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Merge updates
    const currentState = current.rows[0].state;
    const newState = mergeState(currentState, updates);

    // Validate state
    const validation = validateState(newState);
    if (!validation.valid) {
      throw new Error(`Invalid state: ${validation.errors.join(', ')}`);
    }

    // Update
    const result = await pool.query(
      `UPDATE sessions
       SET state = $1, last_active_at = NOW(), expires_at = NOW() + INTERVAL '24 hours'
       WHERE session_id = $2
       RETURNING session_id, user_id, created_at, last_active_at, expires_at, state`,
      [JSON.stringify(newState), sessionId]
    );

    console.log(`[SessionService] Updated session: ${sessionId}`);

    return {
      sessionId: result.rows[0].session_id,
      userId: result.rows[0].user_id,
      createdAt: result.rows[0].created_at,
      lastActiveAt: result.rows[0].last_active_at,
      expiresAt: result.rows[0].expires_at,
      state: result.rows[0].state
    };
  } catch (error) {
    console.error('[SessionService] Error updating session:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Save session state (complete replacement)
 * @param {string} sessionId - The session ID
 * @param {object} state - Complete state object to save
 * @returns {Promise<object>} - Updated session object
 */
export async function saveSession(sessionId, state) {
  const pool = getDbPool();

  try {
    // Validate state
    const validation = validateState(state);
    if (!validation.valid) {
      throw new Error(`Invalid state: ${validation.errors.join(', ')}`);
    }

    const result = await pool.query(
      `UPDATE sessions
       SET state = $1, last_active_at = NOW(), expires_at = NOW() + INTERVAL '24 hours'
       WHERE session_id = $2
       RETURNING session_id, user_id, created_at, last_active_at, expires_at, state`,
      [JSON.stringify(state), sessionId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return {
      sessionId: result.rows[0].session_id,
      userId: result.rows[0].user_id,
      createdAt: result.rows[0].created_at,
      lastActiveAt: result.rows[0].last_active_at,
      expiresAt: result.rows[0].expires_at,
      state: result.rows[0].state
    };
  } catch (error) {
    console.error('[SessionService] Error saving session:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Delete a session
 * @param {string} sessionId - The session ID
 * @returns {Promise<boolean>} - True if deleted, false if not found
 */
export async function deleteSession(sessionId) {
  const pool = getDbPool();

  try {
    const result = await pool.query(
      `DELETE FROM sessions WHERE session_id = $1 RETURNING session_id`,
      [sessionId]
    );

    const deleted = result.rows.length > 0;
    if (deleted) {
      console.log(`[SessionService] Deleted session: ${sessionId}`);
    }

    return deleted;
  } catch (error) {
    console.error('[SessionService] Error deleting session:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Clean up expired sessions
 * @returns {Promise<number>} - Number of sessions deleted
 */
export async function cleanupExpiredSessions() {
  const pool = getDbPool();

  try {
    const result = await pool.query(
      `DELETE FROM sessions WHERE expires_at < NOW() RETURNING session_id`
    );

    const count = result.rows.length;
    if (count > 0) {
      console.log(`[SessionService] Cleaned up ${count} expired sessions`);
    }

    return count;
  } catch (error) {
    console.error('[SessionService] Error cleaning up sessions:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Get or create a session
 * @param {string} sessionId - The session ID
 * @param {string} userId - Optional user ID
 * @returns {Promise<object>} - Session object
 */
export async function getOrCreateSession(sessionId, userId = null) {
  let session = await getSession(sessionId);
  if (!session) {
    session = await createSession(sessionId, userId);
  }
  return session;
}

export default {
  generateSessionId,
  getSession,
  createSession,
  updateSession,
  saveSession,
  deleteSession,
  cleanupExpiredSessions,
  getOrCreateSession
};
