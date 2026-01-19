// src/services/pipeline/clarifier.js
// Step 4: Determine if clarification is needed and generate questions

/**
 * Clarification rules
 * Each rule has a condition and a clarification response
 */
const CLARIFICATION_RULES = [
  {
    id: 'missing_geography',
    condition: (intent, confidence) =>
      !intent.geography?.type && !intent.spatialOperation?.reference,
    question: "I need to know the location. Which area are you interested in?",
    options: [
      { label: "Travis County", value: { type: 'county', value: '48453' } },
      { label: "A specific ZIP code", value: { type: 'zip', prompt: true } },
      { label: "Near a highway", value: { type: 'spatial', prompt: true } },
      { label: "Use current map view", value: { type: 'viewport' } }
    ],
    priority: 1
  },
  {
    id: 'missing_distance',
    condition: (intent) =>
      intent.spatialOperation?.reference &&
      intent.spatialOperation?.type === 'near' &&
      !intent.spatialOperation?.distance,
    question: (intent) => `How far from ${intent.spatialOperation.reference}?`,
    options: [
      { label: "Within 1 mile", value: { distance: 1, unit: 'miles' } },
      { label: "Within 2 miles", value: { distance: 2, unit: 'miles' } },
      { label: "Within 5 miles", value: { distance: 5, unit: 'miles' } },
      { label: "Within 10 miles", value: { distance: 10, unit: 'miles' } }
    ],
    priority: 2
  },
  {
    id: 'ambiguous_nearby',
    condition: (intent) =>
      intent.ambiguities?.includes('ambiguous_location') ||
      intent.ambiguities?.some(a => a.includes('nearby') || a.includes('location')),
    question: "Near what location? Please specify a reference point.",
    options: [
      { label: "Travis County (entire county)", value: { type: 'county', value: '48453' } },
      { label: "Specific ZIP code", value: { type: 'zip', prompt: true } },
      { label: "Near a highway (I-35, US-183)", value: { type: 'spatial', prompt: true } },
      { label: "Current map view", value: { type: 'viewport' } }
    ],
    priority: 2
  },
  {
    id: 'ambiguous_asset_class',
    condition: (intent) =>
      intent.ambiguities?.includes('asset_class') ||
      intent.ambiguities?.some(a => a.includes('property type')),
    question: "What type of property are you looking for?",
    options: [
      { label: "Residential", value: { attribute: 'asset_class', value: 'residential' } },
      { label: "Commercial", value: { attribute: 'asset_class', value: 'commercial' } },
      { label: "Industrial", value: { attribute: 'asset_class', value: 'industrial' } },
      { label: "Vacant Land", value: { attribute: 'asset_class', value: 'land' } },
      { label: "Any type", value: null }
    ],
    priority: 3
  },
  {
    id: 'ambiguous_size',
    condition: (intent) =>
      intent.filters?.some(f => f.attribute === 'acres' && f.value === undefined),
    question: "What size range are you looking for?",
    options: [
      { label: "Under 1 acre", value: { attribute: 'acres', operator: '<', value: 1 } },
      { label: "1-5 acres", value: { attribute: 'acres', operator: 'BETWEEN', value: [1, 5] } },
      { label: "5-20 acres", value: { attribute: 'acres', operator: 'BETWEEN', value: [5, 20] } },
      { label: "Over 20 acres", value: { attribute: 'acres', operator: '>', value: 20 } },
      { label: "Any size", value: null }
    ],
    priority: 3
  },
  {
    id: 'low_confidence',
    condition: (intent, confidence) => confidence < 0.4,
    question: "I'm not sure I understood your query. Could you clarify what you're looking for?",
    options: [
      { label: "Properties for sale", value: { output: 'map' } },
      { label: "Property statistics", value: { output: 'stats' } },
      { label: "Count of properties", value: { output: 'count' } },
      { label: "Let me rephrase", value: { rephrase: true } }
    ],
    priority: 0
  }
];

/**
 * Check if clarification is needed and return clarification request
 *
 * @param {object} intent - Parsed intent
 * @param {number} confidence - Confidence score (0-1)
 * @returns {{ needed: boolean, clarification?: object }}
 */
export function checkClarification(intent, confidence = 1) {
  // Sort rules by priority (lower = more important)
  const sortedRules = [...CLARIFICATION_RULES].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (rule.condition(intent, confidence)) {
      const question = typeof rule.question === 'function'
        ? rule.question(intent)
        : rule.question;

      return {
        needed: true,
        clarification: {
          ruleId: rule.id,
          question,
          options: rule.options
        }
      };
    }
  }

  return { needed: false };
}

/**
 * Apply user's clarification response to intent
 *
 * @param {object} intent - Original intent
 * @param {string} ruleId - ID of the clarification rule
 * @param {object} response - User's selected response value
 * @returns {object} - Updated intent
 */
export function applyClarification(intent, ruleId, response) {
  if (!response) return intent;

  const updatedIntent = { ...intent };

  switch (ruleId) {
    case 'missing_geography':
    case 'ambiguous_nearby':
      if (response.type === 'county' || response.type === 'zip') {
        updatedIntent.geography = {
          type: response.type,
          value: response.value,
          displayName: response.type === 'county' ? 'Travis County' : `ZIP ${response.value}`
        };
      } else if (response.type === 'spatial') {
        // Will need additional prompt for reference
        updatedIntent.spatialOperation = {
          type: 'near',
          reference: null, // To be filled
          distance: 1,
          unit: 'miles'
        };
      } else if (response.type === 'viewport') {
        updatedIntent.geography = {
          type: 'bbox',
          value: null, // Will use current viewport
          displayName: 'Current map view'
        };
      }
      break;

    case 'missing_distance':
      if (updatedIntent.spatialOperation) {
        updatedIntent.spatialOperation = {
          ...updatedIntent.spatialOperation,
          distance: response.distance,
          unit: response.unit
        };
      }
      break;

    case 'ambiguous_asset_class':
    case 'ambiguous_size':
      if (response && response.attribute) {
        updatedIntent.filters = updatedIntent.filters || [];
        // Remove any existing filter for this attribute
        updatedIntent.filters = updatedIntent.filters.filter(
          f => f.attribute !== response.attribute
        );
        // Add new filter
        updatedIntent.filters.push(response);
      }
      break;

    case 'low_confidence':
      if (response.output) {
        updatedIntent.output = response.output;
      }
      if (response.rephrase) {
        // Signal that user wants to rephrase
        updatedIntent.needsRephrase = true;
      }
      break;
  }

  // Clear ambiguities that have been resolved
  updatedIntent.ambiguities = (updatedIntent.ambiguities || []).filter(
    a => !isAmbiguityResolved(a, ruleId)
  );

  return updatedIntent;
}

/**
 * Check if an ambiguity is resolved by a rule
 */
function isAmbiguityResolved(ambiguity, ruleId) {
  const ambiguityRuleMap = {
    'asset_class': 'ambiguous_asset_class',
    'property type': 'ambiguous_asset_class',
    'size': 'ambiguous_size',
    'acres': 'ambiguous_size',
    'ambiguous_location': 'ambiguous_nearby',
    'nearby': 'ambiguous_nearby',
    'location': 'ambiguous_nearby'
  };

  return ambiguityRuleMap[ambiguity] === ruleId;
}

/**
 * Get all clarification rules (for documentation/testing)
 */
export function getClarificationRules() {
  return CLARIFICATION_RULES.map(rule => ({
    id: rule.id,
    priority: rule.priority,
    question: typeof rule.question === 'function' ? '<dynamic>' : rule.question,
    optionCount: rule.options.length
  }));
}

export default {
  checkClarification,
  applyClarification,
  getClarificationRules
};
