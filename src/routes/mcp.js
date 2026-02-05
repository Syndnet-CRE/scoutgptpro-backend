/**
 * MCP Status and Management Routes
 */

import express from 'express';
import mcpManager from '../services/mcp/server-manager.js';
import { getToolRouting } from '../services/mcp/tool-router.js';

const router = express.Router();

/**
 * GET /api/mcp/status
 * Get MCP server connection status
 */
router.get('/status', async (req, res) => {
  try {
    res.json({
      success: true,
      servers: mcpManager.getStatus(),
      toolRouting: getToolRouting()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/mcp/health
 * Get MCP server health with latency testing
 */
router.get('/health', async (req, res) => {
  const servers = ['property-data', 'sql', 'gis'];
  const results = {};
  
  for (const server of servers) {
    const start = Date.now();
    try {
      // Attempt to list tools from each MCP server
      const tools = await mcpManager.listTools(server);
      results[server] = {
        status: 'healthy',
        tools: tools.length,
        latencyMs: Date.now() - start
      };
    } catch (err) {
      results[server] = {
        status: 'unhealthy',
        error: err.message,
        latencyMs: Date.now() - start
      };
    }
  }
  
  const allHealthy = Object.values(results).every(r => r.status === 'healthy');
  res.json({ 
    status: allHealthy ? 'healthy' : 'degraded',
    servers: results,
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/mcp/reconnect/:serverName
 * Reconnect a specific MCP server
 */
router.post('/reconnect/:serverName', async (req, res) => {
  try {
    const { serverName } = req.params;
    
    await mcpManager.reconnectServer(serverName);
    
    res.json({
      success: true,
      status: mcpManager.getStatus()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
