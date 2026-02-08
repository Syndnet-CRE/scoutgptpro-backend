/**
 * MCP Tool Router
 * Routes tool calls to MCP servers or fallback handlers
 */

import mcpManager from './server-manager.js';
import { executeTool as fallbackExecuteTool } from '../../tools/index.js';

/**
 * Tool to MCP Server mapping
 */
const TOOL_SERVER_MAP = {
  // Property-data MCP tools → Local handlers
  'search_properties': null,     // Local handler → propertyCard.js (ATTOM JOINs)
  'get_property': null,           // Local handler → propertyCard.js (ATTOM detail)
  'get_enrichment': null,         // Local handler
  'bulk_properties': null,        // Local handler
  
  // SQL MCP tools → Local handlers  
  'execute_query': null,          // Local handler
  'execute_sql': null,            // Local handler (new Claude tool name)
  'get_table_schema': null,
  'spatial_query': null,
  'list_tables': null,
  
  // GIS MCP tools
  'get_gis_layers': null,  // Use local fallback handler with layer registry
  'buffer_geometry': 'gis',
  'get_zoning': 'gis',
  'interpret_zoning': 'gis',
  'get_layer_features': 'gis',
  
  // Tools that use fallback (no MCP server)
  'analyze_property': null,  // Uses orchestrator service
  'web_search': null,        // Uses Brave API directly
  'get_osm_nearby': null,    // Uses direct DB query
  'generate_artifact': null  // Uses artifact service
};

/**
 * Route a tool call to the appropriate MCP server or fallback
 * @param {string} toolName - Name of the tool to call
 * @param {Object} toolInput - Input arguments for the tool
 * @param {Object} options - Options
 * @param {boolean} options.forceFallback - Force fallback even if MCP available
 * @returns {Promise<Object>} Tool result
 */
export async function routeToolCall(toolName, toolInput, options = {}) {
  const { forceFallback = false } = options;
  
  const serverName = TOOL_SERVER_MAP[toolName];
  
  // If no MCP server mapped, use fallback
  if (!serverName || forceFallback) {
    console.log(`[ToolRouter] Using fallback for ${toolName}`);
    return fallbackExecuteTool(toolName, toolInput);
  }

  // Check if MCP server is connected
  if (!mcpManager.isConnected(serverName)) {
    console.log(`[ToolRouter] MCP server ${serverName} not connected, using fallback for ${toolName}`);
    return fallbackExecuteTool(toolName, toolInput);
  }

  // Try MCP call with fallback on error
  try {
    console.log(`[ToolRouter] Routing ${toolName} to MCP server ${serverName}`);
    const result = await mcpManager.callTool(serverName, toolName, toolInput);
    
    // MCP returns content in a specific format, extract it
    if (result.content && Array.isArray(result.content)) {
      // Find text content
      const textContent = result.content.find(c => c.type === 'text');
      if (textContent) {
        try {
          return JSON.parse(textContent.text);
        } catch {
          return { text: textContent.text };
        }
      }
      return result.content;
    }
    
    return result;
  } catch (error) {
    console.error(`[ToolRouter] MCP call failed for ${toolName}, falling back:`, error.message);
    return fallbackExecuteTool(toolName, toolInput);
  }
}

/**
 * Get tool routing information
 */
export function getToolRouting() {
  const routing = {};
  for (const [tool, server] of Object.entries(TOOL_SERVER_MAP)) {
    routing[tool] = {
      server: server || 'fallback',
      connected: server ? mcpManager.isConnected(server) : true
    };
  }
  return routing;
}

export default { routeToolCall, getToolRouting };
