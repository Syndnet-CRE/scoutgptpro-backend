// src/services/staging/index.js
// CRM Staging service - manages properties before promoting to Deal Rooms

import pool from '../../db/pool.js';

/**
 * Add a single property to staging
 */
export async function addToStaging({ userId, sessionId, parcelId, propertyData, sourceQuery, notes }) {
  const result = await pool.query(`
    INSERT INTO crm_staging (user_id, session_id, parcel_id, property_data, source_query, notes, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'staged')
    ON CONFLICT (id) DO UPDATE SET
      property_data = EXCLUDED.property_data,
      source_query = COALESCE(EXCLUDED.source_query, crm_staging.source_query),
      notes = COALESCE(EXCLUDED.notes, crm_staging.notes),
      status = 'staged'
    RETURNING *
  `, [userId || 'anonymous', sessionId, parcelId, JSON.stringify(propertyData || {}), sourceQuery, notes]);

  console.log(`[staging] Added parcel ${parcelId} to staging`);
  return result.rows[0];
}

/**
 * Bulk add multiple properties to staging
 */
export async function bulkAddToStaging({ userId, sessionId, properties, sourceQuery }) {
  if (!properties || properties.length === 0) {
    return { added: 0, items: [] };
  }

  const client = await pool.connect();
  const results = [];

  try {
    await client.query('BEGIN');

    for (const prop of properties) {
      const result = await client.query(`
        INSERT INTO crm_staging (user_id, session_id, parcel_id, property_data, source_query, status)
        VALUES ($1, $2, $3, $4, $5, 'staged')
        ON CONFLICT (id) DO UPDATE SET
          property_data = EXCLUDED.property_data,
          source_query = COALESCE(EXCLUDED.source_query, crm_staging.source_query),
          status = 'staged'
        RETURNING *
      `, [userId || 'anonymous', sessionId, prop.parcel_id || prop.parcelId, JSON.stringify(prop), sourceQuery]);

      results.push(result.rows[0]);
    }

    await client.query('COMMIT');
    console.log(`[staging] Bulk added ${results.length} properties to staging`);

    return { added: results.length, items: results };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Remove property from staging
 */
export async function removeFromStaging({ stagingId, userId, parcelId }) {
  let query, params;

  if (stagingId) {
    query = 'DELETE FROM crm_staging WHERE id = $1 RETURNING *';
    params = [stagingId];
  } else if (userId && parcelId) {
    query = 'DELETE FROM crm_staging WHERE user_id = $1 AND parcel_id = $2 RETURNING *';
    params = [userId, parcelId];
  } else {
    throw new Error('Must provide stagingId or (userId + parcelId)');
  }

  const result = await pool.query(query, params);

  if (result.rows.length === 0) {
    return null;
  }

  console.log(`[staging] Removed item from staging: ${result.rows[0].parcel_id}`);
  return result.rows[0];
}

/**
 * Get all staged properties for a user/session
 */
export async function getStaged({ userId, sessionId, status = 'staged', limit = 100 }) {
  const conditions = [];
  const values = [];
  let paramIndex = 1;

  if (userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    values.push(userId);
  }

  if (sessionId) {
    conditions.push(`session_id = $${paramIndex++}`);
    values.push(sessionId);
  }

  if (status) {
    conditions.push(`status = $${paramIndex++}`);
    values.push(status);
  }

  values.push(limit);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(`
    SELECT
      id,
      user_id,
      session_id,
      parcel_id,
      property_data,
      source_query,
      status,
      notes,
      added_at
    FROM crm_staging
    ${whereClause}
    ORDER BY added_at DESC
    LIMIT $${paramIndex}
  `, values);

  return result.rows;
}

/**
 * Update staging item (e.g., add notes, change status)
 */
export async function updateStagingItem(stagingId, updates) {
  const allowedFields = ['notes', 'status', 'property_data'];
  const setters = [];
  const values = [stagingId];
  let paramIndex = 2;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      const dbValue = key === 'property_data' ? JSON.stringify(value) : value;
      setters.push(`${key} = $${paramIndex++}`);
      values.push(dbValue);
    }
  }

  if (setters.length === 0) {
    throw new Error('No valid fields to update');
  }

  const result = await pool.query(`
    UPDATE crm_staging
    SET ${setters.join(', ')}
    WHERE id = $1
    RETURNING *
  `, values);

  return result.rows[0] || null;
}

/**
 * Clear all staged items for a user/session
 */
export async function clearStaging({ userId, sessionId }) {
  let query, params;

  if (userId) {
    query = 'DELETE FROM crm_staging WHERE user_id = $1 RETURNING id';
    params = [userId];
  } else if (sessionId) {
    query = 'DELETE FROM crm_staging WHERE session_id = $1 RETURNING id';
    params = [sessionId];
  } else {
    throw new Error('Must provide userId or sessionId');
  }

  const result = await pool.query(query, params);
  console.log(`[staging] Cleared ${result.rows.length} items from staging`);

  return { cleared: result.rows.length };
}

export default {
  addToStaging,
  bulkAddToStaging,
  removeFromStaging,
  getStaged,
  updateStagingItem,
  clearStaging
};
