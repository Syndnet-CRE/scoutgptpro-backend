/**
 * Intent Extractor Service
 * Uses Claude API to extract DiscoverIntent JSON from natural language queries
 */

const DISCOVER_INTENT_SCHEMA = {
  assetTypes: "string[]",
  geo: {
    mode: "state|bbox|county",
    states: "string[] (optional)",
    bbox: "number[4] (optional)",
    counties: "string[] (optional)"
  },
  hardFilters: {
    priceMin: "number (optional)",
    priceMax: "number (optional)",
    acresMin: "number (optional)",
    acresMax: "number (optional)",
    yearBuiltMin: "number (optional)",
    yearBuiltMax: "number (optional)",
    ownershipFlags: "string[] (optional)"
  },
  ownerSegment: "string (optional)",
  softPreferences: {
    popMin: "number (optional)",
    incomeMin: "number (optional)",
    maxFloodPct: "number (optional)"
  },
  requiredSignals: "string[] (optional)",
  limit: "number (optional, default 100)"
};

const INTENT_EXTRACTION_PROMPT = `You are a real estate discovery intent extractor. Extract structured intent from natural language queries about property discovery in Texas.

Schema:
${JSON.stringify(DISCOVER_INTENT_SCHEMA, null, 2)}

Rules:
1. assetTypes: Extract property types mentioned (e.g., "self storage", "multifamily", "retail", "office", "industrial", "land")
2. geo.mode: 
   - "state" if query mentions Texas or state-wide
   - "bbox" if specific coordinates/area mentioned
   - "county" if counties mentioned
3. hardFilters: Extract explicit numeric filters (price, acres, year built)
4. ownerSegment: Extract owner characteristics (e.g., "mom_pop", "small_operator", "institutional", "local_owner", "tired_landlord")
5. softPreferences: Extract preferences that can be scored but aren't hard filters
6. requiredSignals: Extract specific data requirements (e.g., "has_poi", "traffic_data")

Return ONLY valid JSON matching the schema. No markdown, no explanation, just JSON.`;

/**
 * Extract DiscoverIntent from natural language query
 */
export async function extractDiscoverIntent(queryText, anthropicClient) {
  try {
    const response = await anthropicClient.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `${INTENT_EXTRACTION_PROMPT}\n\nQuery: "${queryText}"\n\nExtract intent JSON:`
        }
      ]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Extract JSON from response (handle markdown code blocks)
    let jsonText = content.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    const intent = JSON.parse(jsonText);

    // Validate and normalize
    return validateAndNormalizeIntent(intent);
  } catch (error) {
    console.error('Intent extraction error:', error);
    // Return default intent for Texas
    return {
      assetTypes: [],
      geo: { mode: 'state', states: ['TX'] },
      hardFilters: {},
      softPreferences: {},
      requiredSignals: [],
      limit: 100
    };
  }
}

/**
 * Validate and normalize intent structure
 */
function validateAndNormalizeIntent(intent) {
  const normalized = {
    assetTypes: Array.isArray(intent.assetTypes) ? intent.assetTypes : [],
    geo: {
      mode: intent.geo?.mode || 'state',
      states: intent.geo?.states || (intent.geo?.mode === 'state' ? ['TX'] : []),
      bbox: intent.geo?.bbox || undefined,
      counties: intent.geo?.counties || undefined
    },
    hardFilters: intent.hardFilters || {},
    ownerSegment: intent.ownerSegment || undefined,
    softPreferences: intent.softPreferences || {},
    requiredSignals: Array.isArray(intent.requiredSignals) ? intent.requiredSignals : [],
    limit: intent.limit || 100
  };

  // Ensure Texas scope
  if (normalized.geo.mode === 'state' && normalized.geo.states.length === 0) {
    normalized.geo.states = ['TX'];
  }

  return normalized;
}

