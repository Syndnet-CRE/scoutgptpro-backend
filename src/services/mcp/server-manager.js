/**
 * MCP Server Manager
 * Manages MCP server lifecycle and communication
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get home directory with fallback
const HOME = process.env.HOME || process.env.USERPROFILE || '/Users/braydonirwin';

/**
 * MCP Server Configuration
 */
const MCP_SERVER_CONFIGS = {
  'property-data': {
    command: 'node',
    args: [path.join(HOME, 'scoutgpt-ops/mcp-servers/property-mcp/src/index.js')],
    env: {
      DATABASE_URL: process.env.DATABASE_URL
    },
    description: 'Property data queries and enrichment'
  },
  'sql': {
    command: 'node',
    args: [path.join(HOME, 'scoutgpt-ops/mcp-servers/sql-mcp/src/index.js')],
    env: {
      DATABASE_URL: process.env.DATABASE_URL
    },
    description: 'Direct SQL queries with spatial support'
  },
  'gis': {
    command: 'node',
    args: [path.join(HOME, 'scoutgpt-ops/mcp-servers/gis-mcp/src/index.js')],
    env: {
      DATABASE_URL: process.env.DATABASE_URL
    },
    description: 'GIS operations and spatial queries'
  }
};

/**
 * MCP Server Manager Class
 */
class MCPServerManager {
  constructor() {
    this.clients = new Map();
    this.transports = new Map();
    this.connectionStatus = new Map();
    this.initialized = false;
  }

  /**
   * Initialize all configured MCP servers
   */
  async initialize() {
    if (this.initialized) {
      console.log('[MCP] Already initialized');
      return;
    }

    console.log('[MCP] Initializing MCP servers...');

    for (const [serverName, config] of Object.entries(MCP_SERVER_CONFIGS)) {
      try {
        await this.connectServer(serverName, config);
      } catch (error) {
        console.error(`[MCP] Failed to connect to ${serverName}:`, error.message);
        this.connectionStatus.set(serverName, { connected: false, error: error.message });
      }
    }

    this.initialized = true;
    console.log('[MCP] Initialization complete');
  }

  /**
   * Connect to a single MCP server
   */
  async connectServer(serverName, config) {
    console.log(`[MCP] Connecting to ${serverName}...`);

    const serverPath = config.args[0];
    console.log(`[MCP] Server path for ${serverName}: ${serverPath}`);

    // Check if server script exists
    if (!serverPath) {
      throw new Error(`Server path is undefined for ${serverName}`);
    }

    if (!fs.existsSync(serverPath)) {
      throw new Error(`Server script not found: ${serverPath}`);
    }

    // Create MCP client with stdio transport
    // The transport spawns the process itself
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...process.env, ...config.env },
      stderr: 'pipe'  // Capture stderr for logging
    });

    const client = new Client({
      name: 'scoutgpt-backend',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    // Handle transport errors
    transport.onerror = (error) => {
      console.error(`[MCP] ${serverName} transport error:`, error);
      this.connectionStatus.set(serverName, { connected: false, error: error.message });
    };

    transport.onclose = () => {
      console.log(`[MCP] ${serverName} transport closed`);
      this.connectionStatus.set(serverName, { connected: false, disconnectedAt: new Date() });
      this.clients.delete(serverName);
      this.transports.delete(serverName);
    };

    // Connect to the server with timeout
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });

    await Promise.race([connectPromise, timeoutPromise]);

    // Store references
    this.clients.set(serverName, client);
    this.transports.set(serverName, transport);
    this.connectionStatus.set(serverName, { connected: true, connectedAt: new Date() });

    console.log(`[MCP] Connected to ${serverName}`);

    // List available tools
    try {
      const tools = await client.listTools();
      console.log(`[MCP] ${serverName} tools:`, tools.tools?.map(t => t.name).join(', ') || 'none');
    } catch (error) {
      console.warn(`[MCP] Failed to list tools for ${serverName}:`, error.message);
    }

    return client;
  }

  /**
   * Call a tool on an MCP server
   */
  async callTool(serverName, toolName, args) {
    const client = this.clients.get(serverName);
    
    if (!client) {
      const status = this.connectionStatus.get(serverName);
      throw new Error(`MCP server ${serverName} not connected: ${status?.error || 'Unknown error'}`);
    }

    console.log(`[MCP] Calling ${serverName}.${toolName} with args:`, JSON.stringify(args).slice(0, 200));

    try {
      const result = await client.callTool({
        name: toolName,
        arguments: args
      });

      console.log(`[MCP] ${serverName}.${toolName} returned successfully`);
      return result;
    } catch (error) {
      console.error(`[MCP] ${serverName}.${toolName} failed:`, error);
      throw error;
    }
  }

  /**
   * Check if a server is connected
   */
  isConnected(serverName) {
    return this.connectionStatus.get(serverName)?.connected || false;
  }

  /**
   * Get connection status for all servers
   */
  getStatus() {
    const status = {};
    for (const [name, state] of this.connectionStatus) {
      status[name] = state;
    }
    return status;
  }

  /**
   * Disconnect a specific server
   */
  async disconnectServer(serverName) {
    const client = this.clients.get(serverName);
    const transport = this.transports.get(serverName);

    if (client) {
      try {
        await client.close();
      } catch (error) {
        console.error(`[MCP] Error closing ${serverName} client:`, error);
      }
      this.clients.delete(serverName);
    }

    if (transport) {
      try {
        await transport.close();
      } catch (error) {
        console.error(`[MCP] Error closing ${serverName} transport:`, error);
      }
      this.transports.delete(serverName);
    }

    this.connectionStatus.set(serverName, { connected: false, disconnectedAt: new Date() });
    console.log(`[MCP] Disconnected from ${serverName}`);
  }

  /**
   * Shutdown all servers
   */
  async shutdown() {
    console.log('[MCP] Shutting down all servers...');
    
    for (const serverName of this.clients.keys()) {
      await this.disconnectServer(serverName);
    }

    this.initialized = false;
    console.log('[MCP] Shutdown complete');
  }

  /**
   * Reconnect a specific server
   */
  async reconnectServer(serverName) {
    await this.disconnectServer(serverName);
    const config = MCP_SERVER_CONFIGS[serverName];
    if (config) {
      await this.connectServer(serverName, config);
    }
  }
}

// Singleton instance
const mcpManager = new MCPServerManager();

export default mcpManager;
export { MCPServerManager, MCP_SERVER_CONFIGS };
