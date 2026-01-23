// src/services/dealrooms/index.js
// Deal Room service - manages property deal rooms and sharing

import pool from '../../db/pool.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

/**
 * Create a new deal room from a staged or searched property
 */
export async function createDealRoom({ parcelId, propertyData, name, userId }) {
  // Generate a unique share token
  const shareToken = crypto.randomBytes(16).toString('hex');

  const result = await pool.query(`
    INSERT INTO deal_rooms (parcel_id, property_data, name, share_token, status, stage)
    VALUES ($1, $2, $3, $4, 'active', 'research')
    ON CONFLICT (parcel_id) DO UPDATE SET
      property_data = EXCLUDED.property_data,
      name = COALESCE(EXCLUDED.name, deal_rooms.name),
      status = 'active'
    RETURNING *
  `, [parcelId, JSON.stringify(propertyData || {}), name || `Deal Room - ${parcelId}`, shareToken]);

  const dealRoom = result.rows[0];

  // Log activity
  await logActivity(dealRoom.id, 'created', userId || 'system', {
    parcel_id: parcelId,
    name: dealRoom.name
  });

  console.log(`[dealrooms] Created deal room ${dealRoom.id} for parcel ${parcelId}`);
  return dealRoom;
}

/**
 * Get a single deal room by ID
 */
export async function getDealRoom(dealRoomId) {
  const result = await pool.query(`
    SELECT
      dr.*,
      (SELECT COUNT(*) FROM deal_room_artifacts WHERE deal_room_id = dr.id) as artifact_count,
      (SELECT COUNT(*) FROM deal_room_members WHERE deal_room_id = dr.id) as member_count
    FROM deal_rooms dr
    WHERE dr.id = $1
  `, [dealRoomId]);

  return result.rows[0] || null;
}

/**
 * Get deal room by share token (for public access)
 */
export async function getDealRoomByToken(shareToken) {
  const result = await pool.query(`
    SELECT *
    FROM deal_rooms
    WHERE share_token = $1
      AND (share_settings->>'public')::boolean = true
  `, [shareToken]);

  return result.rows[0] || null;
}

/**
 * List all deal rooms (optionally filtered by status)
 */
export async function listDealRooms({ status, stage, limit = 50, offset = 0 }) {
  const conditions = [];
  const values = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`status = $${paramIndex++}`);
    values.push(status);
  }

  if (stage) {
    conditions.push(`stage = $${paramIndex++}`);
    values.push(stage);
  }

  values.push(limit, offset);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(`
    SELECT
      dr.*,
      (SELECT COUNT(*) FROM deal_room_artifacts WHERE deal_room_id = dr.id) as artifact_count
    FROM deal_rooms dr
    ${whereClause}
    ORDER BY dr.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, values);

  // Get total count
  const countResult = await pool.query(`
    SELECT COUNT(*) as total FROM deal_rooms ${whereClause}
  `, values.slice(0, -2));

  return {
    dealRooms: result.rows,
    total: parseInt(countResult.rows[0].total),
    limit,
    offset
  };
}

/**
 * Update deal room
 */
export async function updateDealRoom(dealRoomId, updates, userId) {
  const allowedFields = ['name', 'status', 'stage', 'share_settings', 'property_data'];
  const setters = [];
  const values = [dealRoomId];
  let paramIndex = 2;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      const dbValue = (key === 'share_settings' || key === 'property_data')
        ? JSON.stringify(value)
        : value;
      setters.push(`${key} = $${paramIndex++}`);
      values.push(dbValue);
    }
  }

  if (setters.length === 0) {
    throw new Error('No valid fields to update');
  }

  // Handle closed status
  if (updates.status === 'closed_won' || updates.status === 'closed_lost') {
    setters.push(`closed_at = NOW()`);
  }

  const result = await pool.query(`
    UPDATE deal_rooms
    SET ${setters.join(', ')}, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, values);

  if (result.rows[0]) {
    // Log stage change
    if (updates.stage) {
      await logActivity(dealRoomId, 'stage_changed', userId, { new_stage: updates.stage });
    }
    if (updates.status) {
      await logActivity(dealRoomId, 'status_changed', userId, { new_status: updates.status });
    }
  }

  return result.rows[0] || null;
}

/**
 * Generate/regenerate share link
 */
export async function generateShareLink(dealRoomId, { expiresIn, public: isPublic = true } = {}) {
  const newToken = crypto.randomBytes(16).toString('hex');

  const shareSettings = {
    public: isPublic,
    generated_at: new Date().toISOString()
  };

  if (expiresIn) {
    shareSettings.expires_at = new Date(Date.now() + expiresIn * 1000).toISOString();
  }

  const result = await pool.query(`
    UPDATE deal_rooms
    SET share_token = $2, share_settings = $3, updated_at = NOW()
    WHERE id = $1
    RETURNING id, share_token, share_settings
  `, [dealRoomId, newToken, JSON.stringify(shareSettings)]);

  if (!result.rows[0]) {
    return null;
  }

  await logActivity(dealRoomId, 'share_link_generated', 'system', { public: isPublic });

  return {
    dealRoomId,
    shareToken: newToken,
    shareUrl: `/deal-room/share/${newToken}`,
    settings: shareSettings
  };
}

/**
 * Attach an artifact to a deal room
 */
export async function attachArtifact(dealRoomId, artifactId, addedBy) {
  // Verify deal room exists
  const dealRoom = await getDealRoom(dealRoomId);
  if (!dealRoom) {
    throw new Error(`Deal room not found: ${dealRoomId}`);
  }

  const result = await pool.query(`
    INSERT INTO deal_room_artifacts (deal_room_id, artifact_id, added_by)
    VALUES ($1, $2, $3)
    ON CONFLICT DO NOTHING
    RETURNING *
  `, [dealRoomId, artifactId, addedBy || 'system']);

  if (result.rows[0]) {
    await logActivity(dealRoomId, 'artifact_attached', addedBy, { artifact_id: artifactId });
    console.log(`[dealrooms] Attached artifact ${artifactId} to deal room ${dealRoomId}`);
  }

  return result.rows[0] || null;
}

/**
 * Get artifacts for a deal room
 */
export async function getDealRoomArtifacts(dealRoomId) {
  const result = await pool.query(`
    SELECT
      dra.*,
      a.artifact_type,
      a.file_format,
      a.file_size_bytes,
      a.status as artifact_status,
      a.created_at as artifact_created_at
    FROM deal_room_artifacts dra
    LEFT JOIN artifacts a ON a.artifact_id::text = dra.artifact_id
    WHERE dra.deal_room_id = $1
    ORDER BY dra.added_at DESC
  `, [dealRoomId]);

  return result.rows;
}

/**
 * Log activity in a deal room
 */
async function logActivity(dealRoomId, action, actor, metadata = {}) {
  try {
    await pool.query(`
      INSERT INTO deal_room_activity (deal_room_id, action, actor, metadata)
      VALUES ($1, $2, $3, $4)
    `, [dealRoomId, action, actor || 'system', JSON.stringify(metadata)]);
  } catch (error) {
    console.error('[dealrooms] Failed to log activity:', error.message);
  }
}

/**
 * Get activity log for a deal room
 */
export async function getDealRoomActivity(dealRoomId, { limit = 50 } = {}) {
  const result = await pool.query(`
    SELECT *
    FROM deal_room_activity
    WHERE deal_room_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `, [dealRoomId, limit]);

  return result.rows;
}

/**
 * Delete a deal room
 */
export async function deleteDealRoom(dealRoomId) {
  // Cascades to artifacts, members, activity via foreign keys
  const result = await pool.query(`
    DELETE FROM deal_rooms WHERE id = $1 RETURNING id, parcel_id
  `, [dealRoomId]);

  if (result.rows[0]) {
    console.log(`[dealrooms] Deleted deal room ${dealRoomId}`);
  }

  return result.rows[0] || null;
}

/**
 * Promote staged property to deal room
 */
export async function promoteFromStaging(stagingId, userId) {
  // Get staging item
  const stagingResult = await pool.query(`
    SELECT * FROM crm_staging WHERE id = $1
  `, [stagingId]);

  if (stagingResult.rows.length === 0) {
    throw new Error(`Staging item not found: ${stagingId}`);
  }

  const staged = stagingResult.rows[0];

  // Create deal room
  const dealRoom = await createDealRoom({
    parcelId: staged.parcel_id,
    propertyData: staged.property_data,
    name: `Deal - ${staged.parcel_id}`,
    userId
  });

  // Mark staging item as promoted
  await pool.query(`
    UPDATE crm_staging SET status = 'promoted' WHERE id = $1
  `, [stagingId]);

  return dealRoom;
}

export default {
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
};
