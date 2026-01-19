// src/services/pipeline/sessionUpdater.js
// Step 11: Update session state with query results

import {
  addToQueryHistory,
  setActiveResultSet,
  setActiveGeography,
  setPendingClarification,
  clearPendingClarification
} from '../sessions/stateManager.js';

/**
 * Update session state after successful query execution
 *
 * @param {object} currentState - Current session state
 * @param {object} queryResult - Query result data
 * @returns {object} - Updated session state
 */
export function updateSession(currentState, queryResult) {
  let updatedState = { ...currentState };

  const {
    intent,
    parcelIds,
    query,
    intentId
  } = queryResult;

  // 1. Set active result set
  if (parcelIds && parcelIds.length > 0) {
    updatedState = setActiveResultSet(updatedState, {
      parcelIds,
      intentId,
      query
    });
  }

  // 2. Update active geography if query specified one
  if (intent?.geography && intent.geography.resolved) {
    updatedState = setActiveGeography(updatedState, {
      type: intent.geography.type,
      value: intent.geography.value || intent.geography.bbox,
      displayName: intent.geography.displayName
    });
  }

  // 3. Add to query history
  updatedState = addToQueryHistory(updatedState, {
    intentId,
    query,
    resultCount: parcelIds?.length || 0
  });

  // 4. Clear any pending clarification
  if (updatedState.pendingClarification) {
    updatedState = clearPendingClarification(updatedState);
  }

  return updatedState;
}

/**
 * Update session state when clarification is needed
 *
 * @param {object} currentState - Current session state
 * @param {object} clarification - Clarification request
 * @param {object} pendingIntent - Intent that needs clarification
 * @returns {object} - Updated session state
 */
export function updateSessionForClarification(currentState, clarification, pendingIntent) {
  return setPendingClarification(currentState, {
    intent: pendingIntent,
    question: clarification.question,
    options: clarification.options,
    ruleId: clarification.ruleId,
    timestamp: new Date().toISOString()
  });
}

/**
 * Update session state after clarification response
 *
 * @param {object} currentState - Current session state
 * @param {object} resolvedIntent - Intent with clarification applied
 * @returns {object} - Updated session state
 */
export function updateSessionAfterClarification(currentState) {
  return clearPendingClarification(currentState);
}

/**
 * Get state diff for logging
 */
export function getStateDiff(oldState, newState) {
  const diff = {};

  if (oldState.activeResultSet?.intentId !== newState.activeResultSet?.intentId) {
    diff.activeResultSet = {
      old: oldState.activeResultSet?.intentId,
      new: newState.activeResultSet?.intentId,
      newCount: newState.activeResultSet?.resultCount
    };
  }

  if (oldState.activeGeography?.displayName !== newState.activeGeography?.displayName) {
    diff.activeGeography = {
      old: oldState.activeGeography?.displayName,
      new: newState.activeGeography?.displayName
    };
  }

  if (oldState.queryHistory?.length !== newState.queryHistory?.length) {
    diff.queryHistoryLength = {
      old: oldState.queryHistory?.length || 0,
      new: newState.queryHistory?.length || 0
    };
  }

  return diff;
}

export default {
  updateSession,
  updateSessionForClarification,
  updateSessionAfterClarification,
  getStateDiff
};
