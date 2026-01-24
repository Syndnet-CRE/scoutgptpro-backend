// src/services/pipeline/interpreter.js
// Step 2: Use LLM to interpret query into structured intent

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

/**
 * System prompt for intent extraction
 */
const INTENT_EXTRACTION_PROMPT = `You are a real estate query intent extractor. Extract structured intent from natural language property search queries.

OUTPUT FORMAT (JSON only, no markdown, no explanation):
{
  "intentType": null | "analyze_constraints" | "analyze_feasibility" | "compare_properties",
  "geography": {
    "type": "zip" | "county" | "city" | "buffer" | "bbox" | null,
    "value": "<value>",
    "displayName": "<human readable name>"
  },
  "spatialOperation": {
    "type": "near" | "within" | "intersects" | null,
    "reference": "<reference name like I-35, US-183>",
    "distance": <number>,
    "unit": "miles" | "feet" | "meters"
  },
  "filters": [
    {
      "attribute": "<attribute name>",
      "operator": "=" | ">" | "<" | ">=" | "<=" | "BETWEEN" | "IN",
      "value": <value or [min, max] for BETWEEN>
    }
  ],
  "aggregation": {
    "type": "count" | "sum" | "avg" | "min" | "max" | "group" | null,
    "groupBy": ["<field>"],
    "metric": "<field>"
  },
  "output": "map" | "list" | "count" | "stats",
  "limit": <number, default 50>,
  "assumptions": ["<any assumptions made>"],
  "ambiguities": ["<any unclear aspects>"]
}

GEOGRAPHY RULES:
- 5-digit number → type: "zip", value: "<the number>"
- "Travis County" → type: "county", value: "48453"
- "near I-35" → spatialOperation with type: "near", reference: "I-35"
- "within 2 miles of US-183" → spatialOperation with distance: 2, unit: "miles"

FILTER MAPPING:
- "vacant" → attribute: "vacant"
- "land" → attribute: "land"
- "commercial" → attribute: "commercial"
- "over 5 acres" → attribute: "acres", operator: ">", value: 5
- "2-5 acres" → attribute: "acres", operator: "BETWEEN", value: [2, 5]
- "under $500k" → attribute: "market_value", operator: "<", value: 500000
- "tax delinquent" → attribute: "tax_delinquent"
- "LLC owned" → attribute: "llc"
- "absentee owners" → attribute: "absentee"
- "mom and pop" → attribute: "mom_pop"
- "opportunity zone" → attribute: "opportunity_zone"

AGGREGATION RULES:
- "how many" → aggregation.type: "count"
- "average value" → aggregation.type: "avg", metric: "market_value"
- "by ZIP code" → aggregation.groupBy: ["mail_zip"]
- "count by asset class" → aggregation.type: "count", groupBy: ["asset_class"]

AMBIGUITY DETECTION:
- If query contains "nearby", "near me", "around here", "close to" WITHOUT a specific reference point (address, highway, landmark), add "ambiguous_location" to ambiguities array
- Do NOT assume active geography for "nearby" - always flag it as ambiguous if no explicit reference

OUTPUT RULES:
- Property search → output: "map"
- "count" or "how many" → output: "count"
- "list" or "show me" → output: "list"
- Statistics request → output: "stats"

INTENT TYPE RULES:
- "What are the development constraints?" → intentType: "analyze_constraints"
- "What constraints exist?" → intentType: "analyze_constraints"
- "Is this land developable?" → intentType: "analyze_feasibility"
- "Can this be developed?" → intentType: "analyze_feasibility"
- "Development feasibility" → intentType: "analyze_feasibility"
- "Compare these properties" → intentType: "compare_properties"
- "Compare properties" → intentType: "compare_properties"
- "How do these compare?" → intentType: "compare_properties"
- For analysis queries, still include geography/filters to find relevant properties, but set intentType appropriately
- If intentType is set, output should still be "map" to show properties on map

Return ONLY valid JSON. No markdown, no explanation.`;

/**
 * Interpret a natural language query into structured intent
 *
 * @param {string} query - Contextualized query string
 * @param {string} contextPrompt - Additional context about session state
 * @returns {Promise<{intent: object, confidence: number, tokensUsed: number}>}
 */
export async function interpretQuery(query, contextPrompt = '') {
  const startTime = Date.now();

  try {
    const userPrompt = contextPrompt
      ? `${contextPrompt}\n\nQuery: "${query}"\n\nExtract intent JSON:`
      : `Query: "${query}"\n\nExtract intent JSON:`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: INTENT_EXTRACTION_PROMPT,
      messages: [{
        role: 'user',
        content: userPrompt
      }]
    });

    // Extract JSON from response
    let jsonText = response.content[0].text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    // Parse intent
    let intent;
    try {
      intent = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('[interpreter] Failed to parse intent JSON:', parseError.message);
      console.error('[interpreter] Raw response:', jsonText.substring(0, 500));

      // Return minimal intent on parse failure
      return {
        intent: {
          filters: [],
          output: 'map',
          limit: 50,
          ambiguities: ['Failed to parse LLM response'],
          parseError: true
        },
        confidence: 0.1,
        tokensUsed: response.usage?.input_tokens + response.usage?.output_tokens || 0,
        durationMs: Date.now() - startTime
      };
    }

    // Calculate confidence score
    const confidence = calculateConfidence(intent);

    // Normalize intent structure (pass query for post-processing)
    const normalizedIntent = normalizeIntent(intent, query);

    console.log(`[interpreter] Extracted intent with confidence ${confidence.toFixed(2)}, ambiguities: ${normalizedIntent.ambiguities.join(', ') || 'none'}`);

    return {
      intent: normalizedIntent,
      confidence,
      tokensUsed: response.usage?.input_tokens + response.usage?.output_tokens || 0,
      durationMs: Date.now() - startTime
    };

  } catch (error) {
    console.error('[interpreter] Error:', error.message);
    throw error;
  }
}

/**
 * Calculate confidence score based on intent completeness
 */
function calculateConfidence(intent) {
  let score = 0.5; // Base score

  // Has geography or spatial operation
  if (intent.geography?.type || intent.spatialOperation?.reference) {
    score += 0.2;
  }

  // Has filters
  if (intent.filters?.length > 0) {
    score += 0.1;
  }

  // Has clear output mode
  if (intent.output) {
    score += 0.05;
  }

  // Penalize for ambiguities
  if (intent.ambiguities?.length > 0) {
    score -= 0.1 * Math.min(intent.ambiguities.length, 3);
  }

  // Penalize for assumptions
  if (intent.assumptions?.length > 0) {
    score -= 0.05 * Math.min(intent.assumptions.length, 2);
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Normalize intent structure to ensure consistent format
 */
function normalizeIntent(intent, originalQuery = '') {
  const normalized = {
    intentType: intent.intentType || null,
    geography: intent.geography || null,
    spatialOperation: intent.spatialOperation || null,
    filters: Array.isArray(intent.filters) ? intent.filters : [],
    aggregation: intent.aggregation || null,
    output: intent.output || 'map',
    limit: Math.min(Math.max(intent.limit || 50, 1), 500),
    assumptions: intent.assumptions || [],
    ambiguities: intent.ambiguities || []
  };

  // Post-processing: Force ambiguity detection for "nearby" without explicit reference
  const query = (originalQuery || '').toLowerCase();
  const nearbyPatterns = ['nearby', 'near me', 'around here', 'close to', 'close by', 'in the area'];
  const hasNearbyWithoutRef = nearbyPatterns.some(p => query.includes(p)) &&
    !normalized.spatialOperation?.reference &&
    !normalized.geography?.type;

  if (hasNearbyWithoutRef && !normalized.ambiguities.includes('ambiguous_location')) {
    console.log('[interpreter] Post-processing: Detected "nearby" without reference, adding ambiguity');
    normalized.ambiguities.push('ambiguous_location');
  }

  return normalized;
}

export default {
  interpretQuery
};
