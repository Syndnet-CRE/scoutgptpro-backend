// src/services/pipeline/executor.js
// Step 9: Execute SQL query against the database

import pg from 'pg';

/**
 * Get database pool
 */
function getDbPool() {
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10
  });
}

/**
 * Execute a parameterized SQL query
 *
 * @param {string} sql - SQL query string
 * @param {array} values - Parameter values
 * @returns {Promise<{ rows: array, executionTime: number, rowCount: number }>}
 */
export async function executeSQL(sql, values) {
  const pool = getDbPool();
  const startTime = Date.now();

  try {
    console.log(`[executor] Executing query with ${values.length} parameters`);

    const result = await pool.query(sql, values);

    const executionTime = Date.now() - startTime;

    console.log(`[executor] Query returned ${result.rows.length} rows in ${executionTime}ms`);

    return {
      rows: result.rows,
      executionTime,
      rowCount: result.rowCount
    };

  } catch (error) {
    console.error(`[executor] Query error: ${error.message}`);
    console.error(`[executor] SQL: ${sql.substring(0, 200)}...`);

    throw new QueryExecutionError(error.message, sql, values);
  } finally {
    await pool.end();
  }
}

/**
 * Execute query with automatic retry on transient failures
 */
export async function executeSQLWithRetry(sql, values, maxRetries = 2) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await executeSQL(sql, values);
    } catch (error) {
      lastError = error;

      // Only retry on transient errors
      if (isTransientError(error) && attempt < maxRetries) {
        console.log(`[executor] Retry attempt ${attempt} after transient error`);
        await sleep(100 * attempt); // Exponential backoff
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

/**
 * Check if error is transient (connection issues, etc.)
 */
function isTransientError(error) {
  const transientCodes = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    '57P01', // admin_shutdown
    '57P02', // crash_shutdown
    '57P03'  // cannot_connect_now
  ];

  return transientCodes.includes(error.code) ||
         error.message?.includes('connection') ||
         error.message?.includes('timeout');
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Custom error class for query execution errors
 */
export class QueryExecutionError extends Error {
  constructor(message, sql, values) {
    super(message);
    this.name = 'QueryExecutionError';
    this.sql = sql;
    this.values = values;
  }
}

/**
 * Execute a count query (optimized for counting)
 */
export async function executeCount(sql, values) {
  // Wrap in count subquery for efficiency
  const countSQL = `SELECT COUNT(*) as total FROM (${sql.replace(/LIMIT \$\d+$/i, '')}) as subq`;

  const pool = getDbPool();
  try {
    const result = await pool.query(countSQL, values.slice(0, -1)); // Remove limit param
    return parseInt(result.rows[0]?.total || 0, 10);
  } finally {
    await pool.end();
  }
}

/**
 * Execute query and stream results (for large result sets)
 */
export async function executeStream(sql, values, onRow) {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    const cursor = client.query(new pg.Cursor(sql, values));

    let rowCount = 0;
    const batchSize = 100;

    const readBatch = () => {
      return new Promise((resolve, reject) => {
        cursor.read(batchSize, (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        });
      });
    };

    let rows;
    while ((rows = await readBatch()).length > 0) {
      for (const row of rows) {
        await onRow(row, rowCount++);
      }
    }

    await cursor.close();
    return rowCount;

  } finally {
    client.release();
    await pool.end();
  }
}

export default {
  executeSQL,
  executeSQLWithRetry,
  executeCount,
  executeStream,
  QueryExecutionError
};
