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
