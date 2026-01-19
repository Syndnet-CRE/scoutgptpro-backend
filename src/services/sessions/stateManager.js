// src/services/sessions/stateManager.js
// Session state management utilities

/**
 * Session state structure:
 * {
 *   activeGeography: {
 *     type: "zip" | "county" | "drawn" | "buffer",
 *     value: "78702" | "Travis" | <GeoJSON>,
 *     displayName: "78702 (East Austin)"
 *   },
 *   activeResultSet: {
 *     parcelIds: ["123", "456", ...],
 *     intentId: "int_abc123",
 *     retrievedAt: "2026-01-18T22:00:00Z",
 *     query: "Show me vacant land...",
 *     resultCount: 47
 *   },
 *   selectedParcel: {
 *     parcelId: "123",
 *     selectedAt: "2026-01-18T22:01:00Z"
 *   },
 *   drawnGeometries: [
 *     { id: "draw_1", geometry: <GeoJSON>, createdAt: "..." }
 *   ],
 *   queryHistory: [
 *     { intentId: "...", query: "...", resultCount: 17, timestamp: "..." }
 *   ],
 *   pendingClarification: null | { intent, question, options }
 * }
 */

const MAX_QUERY_HISTORY = 10;
const MAX_DRAWN_GEOMETRIES = 5;
const MAX_RESULT_SET_PARCELS = 1000;

/**
 * Create a default empty session state
 */
export function createDefaultState() {
  return {
    activeGeography: null,
    activeResultSet: null,
    selectedParcel: null,
    drawnGeometries: [],
    queryHistory: [],
    pendingClarification: null
  };
}

/**
 * Merge partial updates into existing state
 * @param {object} currentState - Current session state
 * @param {object} updates - Partial updates to apply
 * @returns {object} - Merged state
 */
export function mergeState(currentState, updates) {
  const merged = { ...currentState };

  // Handle each field explicitly to prevent deep object issues
  if (updates.activeGeography !== undefined) {
    merged.activeGeography = updates.activeGeography;
  }

  if (updates.activeResultSet !== undefined) {
    merged.activeResultSet = updates.activeResultSet;
  }

  if (updates.selectedParcel !== undefined) {
    merged.selectedParcel = updates.selectedParcel;
  }

  if (updates.drawnGeometries !== undefined) {
    merged.drawnGeometries = updates.drawnGeometries;
  }

  if (updates.queryHistory !== undefined) {
    merged.queryHistory = updates.queryHistory;
  }

  if (updates.pendingClarification !== undefined) {
    merged.pendingClarification = updates.pendingClarification;
  }

  return merged;
}

/**
 * Validate session state structure
 * @param {object} state - State to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateState(state) {
  const errors = [];

  if (typeof state !== 'object' || state === null) {
    return { valid: false, errors: ['State must be an object'] };
  }

  // Validate activeGeography
  if (state.activeGeography !== null) {
    if (typeof state.activeGeography !== 'object') {
      errors.push('activeGeography must be an object or null');
    } else {
      const validTypes = ['zip', 'county', 'drawn', 'buffer', 'bbox'];
      if (state.activeGeography.type && !validTypes.includes(state.activeGeography.type)) {
        errors.push(`activeGeography.type must be one of: ${validTypes.join(', ')}`);
      }
    }
  }

  // Validate activeResultSet
  if (state.activeResultSet !== null) {
    if (typeof state.activeResultSet !== 'object') {
      errors.push('activeResultSet must be an object or null');
    } else {
      if (state.activeResultSet.parcelIds && !Array.isArray(state.activeResultSet.parcelIds)) {
        errors.push('activeResultSet.parcelIds must be an array');
      }
      if (state.activeResultSet.parcelIds && state.activeResultSet.parcelIds.length > MAX_RESULT_SET_PARCELS) {
        errors.push(`activeResultSet.parcelIds exceeds max of ${MAX_RESULT_SET_PARCELS}`);
      }
    }
  }

  // Validate selectedParcel
  if (state.selectedParcel !== null) {
    if (typeof state.selectedParcel !== 'object') {
      errors.push('selectedParcel must be an object or null');
    } else if (!state.selectedParcel.parcelId) {
      errors.push('selectedParcel must have parcelId');
    }
  }

  // Validate drawnGeometries
  if (!Array.isArray(state.drawnGeometries)) {
    errors.push('drawnGeometries must be an array');
  } else if (state.drawnGeometries.length > MAX_DRAWN_GEOMETRIES) {
    errors.push(`drawnGeometries exceeds max of ${MAX_DRAWN_GEOMETRIES}`);
  }

  // Validate queryHistory
  if (!Array.isArray(state.queryHistory)) {
    errors.push('queryHistory must be an array');
  } else if (state.queryHistory.length > MAX_QUERY_HISTORY) {
    errors.push(`queryHistory exceeds max of ${MAX_QUERY_HISTORY}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Add a query to history
 * @param {object} state - Current state
 * @param {object} queryRecord - Query record to add
 * @returns {object} - Updated state
 */
export function addToQueryHistory(state, queryRecord) {
  const newHistory = [
    {
      intentId: queryRecord.intentId,
      query: queryRecord.query,
      resultCount: queryRecord.resultCount,
      timestamp: new Date().toISOString()
    },
    ...(state.queryHistory || [])
  ].slice(0, MAX_QUERY_HISTORY);

  return {
    ...state,
    queryHistory: newHistory
  };
}

/**
 * Set the active result set
 * @param {object} state - Current state
 * @param {object} resultSet - Result set to store
 * @returns {object} - Updated state
 */
export function setActiveResultSet(state, resultSet) {
  return {
    ...state,
    activeResultSet: {
      parcelIds: resultSet.parcelIds.slice(0, MAX_RESULT_SET_PARCELS),
      intentId: resultSet.intentId,
      retrievedAt: new Date().toISOString(),
      query: resultSet.query,
      resultCount: resultSet.parcelIds.length
    },
    // Clear selected parcel when new results come in
    selectedParcel: null
  };
}

/**
 * Set the selected parcel
 * @param {object} state - Current state
 * @param {string} parcelId - Parcel ID to select
 * @returns {object} - Updated state
 */
export function setSelectedParcel(state, parcelId) {
  return {
    ...state,
    selectedParcel: parcelId ? {
      parcelId,
      selectedAt: new Date().toISOString()
    } : null
  };
}

/**
 * Set active geography
 * @param {object} state - Current state
 * @param {object} geography - Geography object
 * @returns {object} - Updated state
 */
export function setActiveGeography(state, geography) {
  return {
    ...state,
    activeGeography: geography
  };
}

/**
 * Add a drawn geometry
 * @param {object} state - Current state
 * @param {object} geometry - GeoJSON geometry
 * @returns {object} - Updated state
 */
export function addDrawnGeometry(state, geometry) {
  const newGeometries = [
    {
      id: `draw_${Date.now()}`,
      geometry,
      createdAt: new Date().toISOString()
    },
    ...(state.drawnGeometries || [])
  ].slice(0, MAX_DRAWN_GEOMETRIES);

  return {
    ...state,
    drawnGeometries: newGeometries
  };
}

/**
 * Remove a drawn geometry
 * @param {object} state - Current state
 * @param {string} geometryId - ID of geometry to remove
 * @returns {object} - Updated state
 */
export function removeDrawnGeometry(state, geometryId) {
  return {
    ...state,
    drawnGeometries: (state.drawnGeometries || []).filter(g => g.id !== geometryId)
  };
}

/**
 * Set pending clarification
 * @param {object} state - Current state
 * @param {object} clarification - Clarification object
 * @returns {object} - Updated state
 */
export function setPendingClarification(state, clarification) {
  return {
    ...state,
    pendingClarification: clarification
  };
}

/**
 * Clear pending clarification
 * @param {object} state - Current state
 * @returns {object} - Updated state
 */
export function clearPendingClarification(state) {
  return {
    ...state,
    pendingClarification: null
  };
}

/**
 * Get context for query interpretation
 * Extracts relevant context from session state for LLM
 * @param {object} state - Session state
 * @returns {object} - Context object
 */
export function getQueryContext(state) {
  return {
    hasActiveGeography: !!state.activeGeography,
    activeGeographyType: state.activeGeography?.type,
    activeGeographyDisplay: state.activeGeography?.displayName,
    hasActiveResults: !!state.activeResultSet,
    activeResultCount: state.activeResultSet?.resultCount || 0,
    hasSelectedParcel: !!state.selectedParcel,
    selectedParcelId: state.selectedParcel?.parcelId,
    hasDrawnGeometries: (state.drawnGeometries?.length || 0) > 0,
    recentQueries: (state.queryHistory || []).slice(0, 3).map(q => q.query)
  };
}

export default {
  createDefaultState,
  mergeState,
  validateState,
  addToQueryHistory,
  setActiveResultSet,
  setSelectedParcel,
  setActiveGeography,
  addDrawnGeometry,
  removeDrawnGeometry,
  setPendingClarification,
  clearPendingClarification,
  getQueryContext
};
