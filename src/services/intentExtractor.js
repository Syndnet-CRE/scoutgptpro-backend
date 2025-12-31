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
1. assetTypes: MUST be an array of strings. Extract property types mentioned and map to exact values:
   - "self storage", "self-storage", "storage" → ["self_storage"]
   - "multifamily", "multi-family", "apartment", "apartments", "condo" → ["multifamily"]
   - "retail", "shopping", "mall", "strip mall" → ["retail"]
   - "industrial", "warehouse", "distribution" → ["industrial"]
   - "office", "office building" → ["office"]
   - "land", "vacant land" → ["land"]
   - "hotel", "motel", "hospitality" → ["hospitality"]
   - "mobile home", "mobile home park" → ["mobile_home_park"]
   
   Examples:
   - Query: "self storage facilities" → assetTypes: ["self_storage"]
   - Query: "apartments and condos" → assetTypes: ["multifamily"]
   - Query: "retail stores" → assetTypes: ["retail"]

2. geo.mode: 
   - "state" if query mentions Texas or state-wide
   - "bbox" if specific coordinates/area mentioned
   - "county" if counties mentioned

3. hardFilters: Extract explicit numeric filters (price, acres, year built)

4. ownerSegment: MUST be exact string value. Map natural language to exact segment keys:
   - "mom and pop", "mom & pop", "mom-pop", "mom pop", "small owner", "individual owner" → "mom_pop"
   - "small operator", "small portfolio", "6-25 properties" → "small_operator"
   - "institutional", "institution", "large portfolio", "200+ properties" → "institutional"
   - "local owner", "local", "Texas-based" → "local_owner"
   - "tired landlord", "long hold", "15+ years" → "tired_landlord"
   
   Examples:
   - Query: "mom and pop owned" → ownerSegment: "mom_pop"
   - Query: "small operators" → ownerSegment: "small_operator"
   - Query: "institutional owners" → ownerSegment: "institutional"

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
 * Normalize asset type name to standard format
 */
function normalizeAssetType(type) {
  if (!type) return null;
  
  const normalized = type.toLowerCase().trim();
  
  // Map variations to standard names
  const assetTypeMap = {
    'self storage': 'self_storage',
    'self-storage': 'self_storage',
    'storage': 'self_storage',
    'multifamily': 'multifamily',
    'multi-family': 'multifamily',
    'multi family': 'multifamily',
    'apartment': 'multifamily',
    'apartments': 'multifamily',
    'condo': 'multifamily',
    'condominium': 'multifamily',
    'retail': 'retail',
    'shopping': 'retail',
    'mall': 'retail',
    'strip mall': 'retail',
    'industrial': 'industrial',
    'warehouse': 'industrial',
    'distribution': 'industrial',
    'manufacturing': 'industrial',
    'office': 'office',
    'office building': 'office',
    'land': 'land',
    'vacant land': 'land',
    'hotel': 'hospitality',
    'motel': 'hospitality',
    'hospitality': 'hospitality',
    'mobile home': 'mobile_home_park',
    'mobile home park': 'mobile_home_park'
  };
  
  // Direct match
  if (assetTypeMap[normalized]) {
    return assetTypeMap[normalized];
  }
  
  // Partial match
  for (const [key, value] of Object.entries(assetTypeMap)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  
  return normalized.replace(/\s+/g, '_'); // Fallback: convert spaces to underscores
}

/**
 * Normalize owner segment to exact segment key
 */
function normalizeOwnerSegment(segment) {
  if (!segment) return undefined;
  
  const normalized = segment.toLowerCase().trim();
  
  // Map variations to exact segment keys
  const segmentMap = {
    'mom_pop': 'mom_pop',
    'mom-pop': 'mom_pop',
    'mom and pop': 'mom_pop',
    'mom & pop': 'mom_pop',
    'mom pop': 'mom_pop',
    'small owner': 'mom_pop',
    'individual owner': 'mom_pop',
    'small_operator': 'small_operator',
    'small operator': 'small_operator',
    'small portfolio': 'small_operator',
    'institutional': 'institutional',
    'institution': 'institutional',
    'large portfolio': 'institutional',
    'local_owner': 'local_owner',
    'local owner': 'local_owner',
    'local': 'local_owner',
    'texas-based': 'local_owner',
    'texas based': 'local_owner',
    'tired_landlord': 'tired_landlord',
    'tired landlord': 'tired_landlord',
    'long hold': 'tired_landlord',
    'long-term owner': 'tired_landlord'
  };
  
  // Direct match
  if (segmentMap[normalized]) {
    return segmentMap[normalized];
  }
  
  // Partial match
  for (const [key, value] of Object.entries(segmentMap)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  
  return undefined; // Return undefined if no match found
}

/**
 * Validate and normalize intent structure
 */
function validateAndNormalizeIntent(intent) {
  // Normalize assetTypes: convert string to array, normalize names
  let assetTypes = [];
  if (Array.isArray(intent.assetTypes)) {
    assetTypes = intent.assetTypes.map(normalizeAssetType).filter(Boolean);
  } else if (typeof intent.assetTypes === 'string') {
    // Convert string to array
    const normalized = normalizeAssetType(intent.assetTypes);
    if (normalized) {
      assetTypes = [normalized];
    }
  }
  
  // Normalize ownerSegment
  const ownerSegment = normalizeOwnerSegment(intent.ownerSegment);
  
  const normalized = {
    assetTypes,
    geo: {
      mode: intent.geo?.mode || 'state',
      states: intent.geo?.states || (intent.geo?.mode === 'state' ? ['TX'] : []),
      bbox: intent.geo?.bbox || undefined,
      counties: intent.geo?.counties || undefined
    },
    hardFilters: intent.hardFilters || {},
    ownerSegment,
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

