// src/services/pipeline/contextInjector.js
// Step 1: Inject session context into raw query

/**
 * Pronoun patterns that indicate reference to session state
 */
const PRONOUN_PATTERNS = {
  selectedParcel: [
    /\b(this property|this parcel|it|this one)\b/i,
    /\b(the property|the parcel|selected)\b/i
  ],
  activeResults: [
    /\b(these|those|them|the results|the properties)\b/i,
    /\b(this list|these parcels|the list)\b/i
  ],
  drawnArea: [
    /\b(this area|the area|here|this region)\b/i,
    /\b(drawn area|my selection|selected area)\b/i
  ],
  previousQuery: [
    /\b(like before|same as|similar|again)\b/i,
    /\b(the same|repeat|redo)\b/i
  ]
};

/**
 * Inject session context into a raw query
 *
 * @param {string} rawQuery - User's original query
 * @param {object} sessionState - Current session state
 * @param {object} context - Additional context (selectedParcel from click, bounds, etc.)
 * @returns {string} - Contextualized query
 */
export function injectContext(rawQuery, sessionState, context = {}) {
  let contextualQuery = rawQuery;
  const injections = [];

  // Check for selected parcel reference
  if (hasPatternMatch(rawQuery, PRONOUN_PATTERNS.selectedParcel)) {
    const parcelId = context.selectedParcel?.parcelId ||
                     sessionState.selectedParcel?.parcelId;

    if (parcelId) {
      contextualQuery = contextualQuery.replace(
        PRONOUN_PATTERNS.selectedParcel[0],
        `parcel ${parcelId}`
      );
      injections.push({ type: 'selectedParcel', value: parcelId });
    }
  }

  // Check for active results reference
  if (hasPatternMatch(rawQuery, PRONOUN_PATTERNS.activeResults)) {
    const resultSet = sessionState.activeResultSet;

    if (resultSet?.parcelIds?.length > 0) {
      // Don't replace, but note that we're filtering within results
      injections.push({
        type: 'activeResults',
        count: resultSet.parcelIds.length,
        intentId: resultSet.intentId
      });
    }
  }

  // Check for drawn area reference
  if (hasPatternMatch(rawQuery, PRONOUN_PATTERNS.drawnArea)) {
    const drawnGeometries = sessionState.drawnGeometries || [];

    if (drawnGeometries.length > 0) {
      const latest = drawnGeometries[0];
      injections.push({
        type: 'drawnGeometry',
        geometryId: latest.id
      });
    } else if (sessionState.activeGeography) {
      // Fall back to active geography
      injections.push({
        type: 'activeGeography',
        geography: sessionState.activeGeography
      });
    }
  }

  // Check for previous query reference
  if (hasPatternMatch(rawQuery, PRONOUN_PATTERNS.previousQuery)) {
    const history = sessionState.queryHistory || [];

    if (history.length > 0) {
      const lastQuery = history[0];
      injections.push({
        type: 'previousQuery',
        query: lastQuery.query,
        intentId: lastQuery.intentId
      });
    }
  }

  // Inject current bounds if provided
  if (context.bounds && !sessionState.activeGeography) {
    injections.push({
      type: 'viewportBounds',
      bounds: context.bounds
    });
  }

  // Return result with metadata
  return {
    original: rawQuery,
    contextualized: contextualQuery,
    injections,
    hasContext: injections.length > 0
  };
}

/**
 * Check if query matches any pattern in array
 */
function hasPatternMatch(query, patterns) {
  return patterns.some(pattern => pattern.test(query));
}

/**
 * Build context string for LLM prompt
 * @param {object} sessionState - Session state
 * @returns {string} - Context description for LLM
 */
export function buildContextPrompt(sessionState) {
  const parts = [];

  if (sessionState.selectedParcel) {
    parts.push(`Selected parcel: ${sessionState.selectedParcel.parcelId}`);
  }

  if (sessionState.activeResultSet) {
    parts.push(`Active result set: ${sessionState.activeResultSet.resultCount} properties from query "${sessionState.activeResultSet.query}"`);
  }

  if (sessionState.activeGeography) {
    parts.push(`Active geography: ${sessionState.activeGeography.displayName || sessionState.activeGeography.type}`);
  }

  if (sessionState.drawnGeometries?.length > 0) {
    parts.push(`Drawn geometries: ${sessionState.drawnGeometries.length}`);
  }

  if (parts.length === 0) {
    return 'No active context.';
  }

  return `Current context:\n- ${parts.join('\n- ')}`;
}

export default {
  injectContext,
  buildContextPrompt
};
