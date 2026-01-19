// src/services/pipeline/intentLogger.js
// Log query intents for debugging and analytics

import pg from 'pg';

/**
 * Get database pool
 */
function getDbPool() {
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3
  });
}

/**
 * Log a parsed intent to the database
 *
 * @param {object} params - Intent logging parameters
 * @returns {Promise<string>} - Generated intent ID
 */
export async function logIntent(params) {
  const {
    sessionId,
    rawQuery,
    contextualQuery,
    intent,
    confidence,
    tokensUsed
  } = params;

  const pool = getDbPool();

  try {
    const result = await pool.query(`
      INSERT INTO query_intents (
        session_id,
        raw_query,
        contextualized_query,
        intent,
        confidence,
        ambiguities,
        llm_tokens_used,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING intent_id
    `, [
      sessionId,
      rawQuery,
      contextualQuery || rawQuery,
      JSON.stringify(intent),
      confidence,
      JSON.stringify(intent.ambiguities || []),
      tokensUsed
    ]);

    return result.rows[0].intent_id;

  } catch (error) {
    console.error('[intentLogger] Error logging intent:', error.message);
    // Return a generated ID even if logging fails
    return `int_local_${Date.now()}`;
  } finally {
    await pool.end();
  }
}

/**
 * Update intent with execution results
 *
 * @param {string} intentId - Intent ID to update
 * @param {object} results - Execution results
 */
export async function updateIntentResults(intentId, results) {
  const {
    isValid,
    validationErrors,
    executionDurationMs,
    resultCount
  } = results;

  const pool = getDbPool();

  try {
    await pool.query(`
      UPDATE query_intents
      SET
        is_valid = $2,
        validation_errors = $3,
        executed_at = NOW(),
        execution_duration_ms = $4,
        result_count = $5
      WHERE intent_id = $1
    `, [
      intentId,
      isValid,
      validationErrors ? JSON.stringify(validationErrors) : null,
      executionDurationMs,
      resultCount
    ]);

  } catch (error) {
    console.error('[intentLogger] Error updating intent:', error.message);
  } finally {
    await pool.end();
  }
}

/**
 * Get recent intents for a session
 */
export async function getRecentIntents(sessionId, limit = 10) {
  const pool = getDbPool();

  try {
    const result = await pool.query(`
      SELECT
        intent_id,
        raw_query,
        confidence,
        result_count,
        created_at
      FROM query_intents
      WHERE session_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [sessionId, limit]);

    return result.rows;

  } catch (error) {
    console.error('[intentLogger] Error getting intents:', error.message);
    return [];
  } finally {
    await pool.end();
  }
}

/**
 * Get intent analytics for a time period
 */
export async function getIntentAnalytics(hours = 24) {
  const pool = getDbPool();

  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_queries,
        AVG(confidence) as avg_confidence,
        AVG(execution_duration_ms) as avg_duration_ms,
        SUM(result_count) as total_results,
        COUNT(CASE WHEN confidence < 0.5 THEN 1 END) as low_confidence_count,
        COUNT(CASE WHEN is_valid = false THEN 1 END) as invalid_count
      FROM query_intents
      WHERE created_at > NOW() - $1 * INTERVAL '1 hour'
    `, [hours]);

    return result.rows[0];

  } catch (error) {
    console.error('[intentLogger] Error getting analytics:', error.message);
    return null;
  } finally {
    await pool.end();
  }
}

export default {
  logIntent,
  updateIntentResults,
  getRecentIntents,
  getIntentAnalytics
};
