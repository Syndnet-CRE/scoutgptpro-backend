/**
 * Query Logger Middleware
 * 
 * Logs incoming queries with timestamp, extracted intent, result count, and execution time
 * Stores last 100 queries in memory for debugging
 */

const queryLog = [];
const MAX_LOG_SIZE = 100;

/**
 * Middleware to log queries
 */
export function queryLogger(req, res, next) {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  
  // Capture original json method
  const originalJson = res.json.bind(res);
  
  // Override json method to capture response
  res.json = function(data) {
    const duration = Date.now() - startTime;
    
    const logEntry = {
      timestamp,
      query: req.body?.query || req.query?.query || 'N/A',
      mode: req.body?.mode || req.query?.mode || 'N/A',
      method: req.method,
      path: req.path,
      duration: `${duration}ms`,
      statusCode: res.statusCode,
      resultCount: data?.properties?.length || data?.count || 0,
      type: data?.type || 'unknown',
      toolCalls: data?.toolCalls?.length || 0,
      intent: data?.intent || null,
      validationErrors: data?.validationErrors || null
    };
    
    // Add to log (keep last 100)
    queryLog.push(logEntry);
    if (queryLog.length > MAX_LOG_SIZE) {
      queryLog.shift();
    }
    
    // Log to console
    console.log(`[Query Logger] ${timestamp} | ${duration}ms | ${logEntry.resultCount} results | ${logEntry.type}`);
    
    // Call original json method
    return originalJson(data);
  };
  
  next();
}

/**
 * Get query log
 */
export function getQueryLog(limit = 50) {
  return queryLog.slice(-limit).reverse(); // Most recent first
}

/**
 * Clear query log
 */
export function clearQueryLog() {
  queryLog.length = 0;
}

export default {
  queryLogger,
  getQueryLog,
  clearQueryLog
};
