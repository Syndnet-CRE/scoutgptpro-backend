// src/routes/chat.js
// Chat endpoint with Claude tool-use loop and write-back integration

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { TOOLS } from '../tools/index.js';
import { routeToolCall } from '../services/mcp/tool-router.js';
import {
  createClaudeSession,
  addClaudeMessage,
  storeParcelEnrichment,
  endClaudeSession,
  getClaudeSession
} from '../services/claude-writeback/index.js';
import { extractEnrichments } from '../services/claude-writeback/enrichment-extractor.js';
import { getSchemaPromptSection } from '../services/query-orchestrator/schemaContext.js';
import { normalizeProperty } from '../utils/normalizeProperty.js';

const router = express.Router();

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

const MODEL = 'claude-sonnet-4-20250514';
const MAX_ITERATIONS = 10;

const getSystemPrompt = () => `You are ScoutGPT, an AI assistant for real estate investors analyzing properties in Travis County, Texas.

## Your Data Sources
- Property database with 372,000+ parcels (parcel_features_travis)
- GIS layers: flood zones, zoning, utilities, permits
- Web search for market news and current information
- OpenStreetMap for nearby amenities

## Your Capabilities
1. Search properties by location, size, value, type, and distress signals
2. Get detailed property information including ownership, values, and zoning
3. Analyze development feasibility with constraints and recommendations
4. Search the web for market news and recent activity
5. Find nearby amenities and assess walkability
6. Display GIS layers on the map
7. Generate professional reports and analyses

## Response Guidelines
- Be concise and direct
- When showing properties, mention count and key characteristics
- When analyzing, highlight constraints and opportunities
- For reports, generate artifacts the user can view and download
- If a query is ambiguous, ask for clarification

## Important
- Use intelligent_property_search for ALL property searches - it handles natural language, location context, and complex filters
- Use search_properties only for simple filter-only queries with known exact values (deprecated, prefer intelligent_property_search)
- Use analyze_property for feasibility questions
- Use generate_artifact when user wants reports or downloadable content
- Use web_search for market conditions or current news
- Property values are in USD, acreage is in acres
- To find vacant land, use asset_class='land' filter. To find unimproved parcels, search for properties where improvement_value is 0 or very low

${getSchemaPromptSection()}`;

/**
 * POST /api/chat
 * Main chat endpoint with Claude tool-use and write-back
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { messages, sessionId, claudeSessionId: existingClaudeSessionId } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required'
      });
    }

    // Get the latest user message
    const userMessage = messages[messages.length - 1];
    if (userMessage.role !== 'user') {
      return res.status(400).json({
        success: false,
        error: 'Last message must be from user'
      });
    }

    console.log(`[Chat] Session: ${sessionId}, Messages: ${messages.length}`);

    // Create or retrieve Claude session for write-back
    let claudeSessionId = existingClaudeSessionId;
    let isNewSession = false;
    
    if (!claudeSessionId) {
      try {
        const session = await createClaudeSession({
          sessionId,
          model: MODEL,
          systemPrompt: getSystemPrompt()
        });
        claudeSessionId = session.id;
        isNewSession = true;
        console.log(`[Chat] Created new Claude session: ${claudeSessionId}`);
      } catch (writeError) {
        console.error('[Chat] Failed to create Claude session:', writeError);
        // Continue processing - don't block the chat
      }
    }

    // Store the user message (non-blocking)
    if (claudeSessionId) {
      try {
        await addClaudeMessage({
          claudeSessionId,
          role: 'user',
          content: userMessage.content
        });
      } catch (writeError) {
        console.error('[Chat] Failed to store user message:', writeError);
        // Continue processing - don't block the chat
      }
    }

    // Prepare messages for Claude API
    const claudeMessages = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    // Tool-use loop
    let mapDataCollections = [];
    let artifact = null;
    let iterations = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let allToolUses = [];
    let enrichmentsDiscovered = [];

    // Initial API call
    let response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: getSystemPrompt(),
      tools: TOOLS,
      messages: claudeMessages
    });

    // Track token usage
    totalInputTokens += response.usage?.input_tokens || 0;
    totalOutputTokens += response.usage?.output_tokens || 0;

    while (response.stop_reason === 'tool_use' && iterations < MAX_ITERATIONS) {
      iterations++;
      console.log(`[Chat] Tool-use iteration ${iterations}`);

      // Extract tool use blocks
      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');
      const toolResults = [];

      for (const toolUse of toolUseBlocks) {
        console.log(`[Chat] Executing tool: ${toolUse.name}`);
        
        // Track tool use
        allToolUses.push({
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input
        });

        try {
          const result = await routeToolCall(toolUse.name, toolUse.input);
          
          // Capture map data and artifacts
          const MAP_TOOLS = ['search_properties', 'intelligent_property_search', 'get_gis_layers'];
          if (MAP_TOOLS.includes(toolUse.name)) {
            if (result && result.type === 'FeatureCollection') {
              mapDataCollections.push(result);
              console.log(`[Chat] Captured mapData collection with ${result.features?.length || 0} features`);
            }
          }
          if (toolUse.name === 'generate_artifact') {
            artifact = result;
            console.log(`[Chat] Captured artifact: ${artifact.type}`);
          }

          // Extract enrichments from tool result
          try {
            const newEnrichments = extractEnrichments(toolUse.name, toolUse.input, result);
            enrichmentsDiscovered.push(...newEnrichments);
          } catch (enrichError) {
            console.error('[Chat] Failed to extract enrichments:', enrichError);
            // Continue - enrichment extraction is non-critical
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result)
          });
        } catch (err) {
          console.error(`[Chat] Tool error: ${toolUse.name}`, err.message);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: err.message }),
            is_error: true
          });
        }
      }

      // Continue conversation with tool results
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: getSystemPrompt(),
        tools: TOOLS,
        messages: [
          ...claudeMessages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults }
        ]
      });

      // Track token usage
      totalInputTokens += response.usage?.input_tokens || 0;
      totalOutputTokens += response.usage?.output_tokens || 0;
    }

    // Extract final text response
    const textBlocks = response.content.filter(block => block.type === 'text');
    const message = textBlocks.map(b => b.text).join('\n');

    // Store assistant message with tool uses and token counts (non-blocking)
    if (claudeSessionId) {
      try {
        await addClaudeMessage({
          claudeSessionId,
          role: 'assistant',
          content: message,
          toolUses: allToolUses.length > 0 ? allToolUses : null,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens
        });
      } catch (writeError) {
        console.error('[Chat] Failed to store assistant message:', writeError);
        // Continue - don't block the response
      }

      // Store any enrichments discovered (non-blocking)
      for (const enrichment of enrichmentsDiscovered) {
        try {
          await storeParcelEnrichment({
            ...enrichment,
            claudeSessionId
          });
        } catch (enrichError) {
          console.error('[Chat] Failed to store enrichment:', enrichError);
          // Continue - enrichment storage is non-critical
        }
      }
    }

    // Merge mapData collections
    let mapData = null;
    if (mapDataCollections.length === 1) {
      mapData = mapDataCollections[0];
    } else if (mapDataCollections.length > 1) {
      mapData = {
        type: 'FeatureCollection',
        features: mapDataCollections.flatMap(fc => fc.features || []),
        metadata: {
          sources: mapDataCollections.map((fc, i) => ({
            index: i,
            count: (fc.features || []).length,
            ...(fc.metadata || {})
          }))
        }
      };
    }

    // Normalize feature properties to camelCase
    if (mapData && mapData.features) {
      mapData.features = mapData.features.map(f => ({
        ...f,
        properties: normalizeProperty(f.properties)
      }));
    }

    // Build response
    const chatResponse = {
      success: true,
      message,
      sessionId: sessionId || 'default',
      ...(claudeSessionId && { claudeSessionId }),
      ...(mapData && { mapData }),
      ...(artifact && { artifact }),
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        iterations
      }
    };

    console.log(`[Chat] Response: ${message.slice(0, 100)}... mapData: ${!!mapData} (${mapDataCollections.length} collections), artifact: ${!!artifact}`);
    
    res.json(chatResponse);

  } catch (err) {
    console.error('[Chat] Error:', err);
    
    // Log error details
    if (err.response) {
      console.error('[Chat] API Response:', err.response.data);
    }

    res.status(500).json({
      success: false,
      error: 'Chat processing failed',
      details: err.message
    });
  }
});

/**
 * GET /api/chat/session/:claudeSessionId
 * Retrieve a Claude session with all messages
 */
router.get('/session/:claudeSessionId', async (req, res) => {
  try {
    const { claudeSessionId } = req.params;
    
    const session = await getClaudeSession(claudeSessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    return res.json({
      success: true,
      session
    });
  } catch (error) {
    console.error('[Chat] Get session error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve session',
      details: error.message
    });
  }
});

/**
 * POST /api/chat/session/:claudeSessionId/end
 * End a Claude session
 */
router.post('/session/:claudeSessionId/end', async (req, res) => {
  try {
    const { claudeSessionId } = req.params;
    
    const session = await endClaudeSession(claudeSessionId);

    return res.json({
      success: true,
      session
    });
  } catch (error) {
    console.error('[Chat] End session error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to end session',
      details: error.message
    });
  }
});

export default router;
