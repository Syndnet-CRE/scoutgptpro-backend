// src/services/pipeline/index.js
// Main orchestrator for Boris's 12-step query pipeline

import { injectContext, buildContextPrompt } from './contextInjector.js';
import { interpretQuery } from './interpreter.js';
import { validateIntent, hasMinimumIntent } from './validator.js';
import { checkClarification, applyClarification } from './clarifier.js';
import { resolveGeography } from './geographyResolver.js';
import { resolveSpatialReference } from './spatialResolver.js';
import { mapAttributes, summarizeFilters } from './attributeMapper.js';
import { buildSQL, formatSQLForLogging } from './sqlBuilder.js';
import { executeSQL } from './executor.js';
import { formatResults } from './formatter.js';
import { updateSession, updateSessionForClarification } from './sessionUpdater.js';
import { buildResponse, buildMetadata } from './responseBuilder.js';
import { logIntent, updateIntentResults } from './intentLogger.js';
import { getSession, createSession, saveSession } from '../sessions/index.js';

/**
 * Execute a natural language query through the 12-step pipeline
 *
 * @param {string} rawQuery - User's natural language query
 * @param {string} sessionId - Session identifier
 * @param {object} context - Additional context (selected parcel, bounds, etc.)
 * @returns {Promise<object>} - Query response
 */
export async function executeQuery(rawQuery, sessionId, context = {}) {
  const startTime = Date.now();
  let intentId = null;

  console.log(`[Pipeline] Starting query: "${rawQuery.substring(0, 50)}..."`);

  // Get or create session
  let session = await getSession(sessionId);
  if (!session) {
    session = await createSession(sessionId);
    console.log(`[Pipeline] Created new session: ${sessionId}`);
  }

  try {
    // ========================================
    // Step 1: CONTEXT INJECTION
    // ========================================
    const contextResult = injectContext(rawQuery, session.state, context);
    const contextPrompt = buildContextPrompt(session.state);

    console.log(`[Pipeline] Step 1: Context injected (${contextResult.injections.length} injections)`);

    // ========================================
    // Step 2: INTERPRET (LLM)
    // ========================================
    const { intent, confidence, tokensUsed, durationMs } = await interpretQuery(
      contextResult.contextualized,
      contextPrompt
    );

    console.log(`[Pipeline] Step 2: Interpreted with confidence ${confidence.toFixed(2)}`);

    // Log intent to database
    intentId = await logIntent({
      sessionId,
      rawQuery,
      contextualQuery: contextResult.contextualized,
      intent,
      confidence,
      tokensUsed
    });
    intent.intentId = intentId;

    // ========================================
    // Step 3: VALIDATE INTENT
    // ========================================
    const validation = validateIntent(intent);

    console.log(`[Pipeline] Step 3: Validation ${validation.valid ? 'PASSED' : 'FAILED'} (${validation.errors.length} errors, ${validation.warnings.length} warnings)`);

    if (!validation.valid) {
      await updateIntentResults(intentId, {
        isValid: false,
        validationErrors: validation.errors,
        executionDurationMs: Date.now() - startTime,
        resultCount: 0
      });

      return buildResponse({
        type: 'error',
        errors: validation.errors,
        metadata: buildMetadata({
          intentId,
          queryDurationMs: Date.now() - startTime,
          confidence
        })
      });
    }

    // Use sanitized intent from validation
    const validatedIntent = validation.sanitized;

    // ========================================
    // Step 4: CLARIFICATION CHECK
    // ========================================
    if (confidence < 0.5 || validatedIntent.ambiguities?.length > 0) {
      const clarificationResult = checkClarification(validatedIntent, confidence);

      if (clarificationResult.needed) {
        console.log(`[Pipeline] Step 4: Clarification needed - ${clarificationResult.clarification.ruleId}`);

        // Update session with pending clarification
        const updatedState = updateSessionForClarification(
          session.state,
          clarificationResult.clarification,
          validatedIntent
        );
        await saveSession(sessionId, updatedState);

        return buildResponse({
          type: 'clarification_needed',
          clarification: clarificationResult.clarification,
          metadata: buildMetadata({
            intentId,
            queryDurationMs: Date.now() - startTime,
            confidence
          })
        });
      }
    }

    console.log(`[Pipeline] Step 4: No clarification needed`);

    // ========================================
    // Step 5: RESOLVE GEOGRAPHY
    // ========================================
    if (validatedIntent.geography && !validatedIntent.geography.resolved) {
      validatedIntent.geography = await resolveGeography(validatedIntent.geography);
      console.log(`[Pipeline] Step 5: Geography resolved to ${validatedIntent.geography?.displayName || 'bbox'}`);
    } else {
      console.log(`[Pipeline] Step 5: Geography already resolved or not needed`);
    }

    // ========================================
    // Step 6: RESOLVE SPATIAL REFERENCE
    // ========================================
    if (validatedIntent.spatialOperation?.reference) {
      validatedIntent.spatialOperation = await resolveSpatialReference(validatedIntent.spatialOperation);

      if (validatedIntent.spatialOperation.error) {
        return buildResponse({
          type: 'error',
          errors: [`Could not find reference: "${validatedIntent.spatialOperation.reference}"`],
          metadata: buildMetadata({
            intentId,
            queryDurationMs: Date.now() - startTime,
            confidence
          })
        });
      }

      console.log(`[Pipeline] Step 6: Spatial reference resolved to ${validatedIntent.spatialOperation.resolvedName}`);
    } else {
      console.log(`[Pipeline] Step 6: No spatial reference to resolve`);
    }

    // ========================================
    // Step 7: MAP ATTRIBUTES
    // ========================================
    const mappedFilters = mapAttributes(validatedIntent.filters);

    console.log(`[Pipeline] Step 7: Mapped ${mappedFilters.conditions?.length || 0} conditions, ${mappedFilters.spatial?.length || 0} spatial filters`);

    // ========================================
    // Step 8: BUILD SQL
    // ========================================
    const { sql, values, isAggregation, debug: sqlDebug } = buildSQL(validatedIntent, mappedFilters);

    console.log(`[Pipeline] Step 8: Built SQL with ${sqlDebug.parameterCount} parameters`);

    // ========================================
    // Step 9: EXECUTE QUERY
    // ========================================
    const { rows, executionTime, rowCount } = await executeSQL(sql, values);

    console.log(`[Pipeline] Step 9: Executed in ${executionTime}ms, returned ${rows.length} rows`);

    // ========================================
    // Step 10: FORMAT RESULTS
    // ========================================
    const formatted = formatResults(rows, validatedIntent.output, { intent: validatedIntent });

    console.log(`[Pipeline] Step 10: Formatted as ${formatted.type}`);

    // ========================================
    // Step 11: UPDATE SESSION
    // ========================================
    const parcelIds = rows.map(r => r.parcel_id).filter(Boolean);
    const updatedState = updateSession(session.state, {
      intent: validatedIntent,
      parcelIds,
      query: rawQuery,
      intentId
    });
    await saveSession(sessionId, updatedState);

    console.log(`[Pipeline] Step 11: Session updated`);

    // Update intent with results
    await updateIntentResults(intentId, {
      isValid: true,
      executionDurationMs: Date.now() - startTime,
      resultCount: rows.length
    });

    // ========================================
    // Step 12: BUILD RESPONSE
    // ========================================
    const response = buildResponse({
      ...formatted,
      metadata: buildMetadata({
        intentId,
        executedAt: new Date().toISOString(),
        queryDurationMs: Date.now() - startTime,
        sqlExecutionMs: executionTime,
        confidence,
        assumptions: validatedIntent.assumptions,
        warnings: validation.warnings
      })
    });

    console.log(`[Pipeline] Step 12: Response built - ${response.resultCount} results in ${Date.now() - startTime}ms`);

    return response;

  } catch (error) {
    console.error(`[Pipeline] Error: ${error.message}`);

    // Update intent with error if we have an ID
    if (intentId) {
      await updateIntentResults(intentId, {
        isValid: false,
        validationErrors: [error.message],
        executionDurationMs: Date.now() - startTime,
        resultCount: 0
      });
    }

    return buildResponse({
      type: 'error',
      errors: [error.message],
      metadata: buildMetadata({
        intentId,
        queryDurationMs: Date.now() - startTime
      })
    });
  }
}

/**
 * Continue query after user provides clarification
 *
 * @param {string} sessionId - Session ID
 * @param {string} ruleId - Clarification rule ID
 * @param {object} response - User's selected response
 * @returns {Promise<object>} - Query response
 */
export async function continueWithClarification(sessionId, ruleId, response) {
  const session = await getSession(sessionId);

  if (!session?.state?.pendingClarification) {
    return buildResponse({
      type: 'error',
      errors: ['No pending clarification found']
    });
  }

  const { intent: pendingIntent, question } = session.state.pendingClarification;

  // Apply clarification to intent
  const resolvedIntent = applyClarification(pendingIntent, ruleId, response);

  // Re-run pipeline from step 5 (skip interpretation)
  console.log(`[Pipeline] Continuing with clarification: ${ruleId}`);

  // For simplicity, we'll reconstruct a query and run through the pipeline
  // In a production system, you might want to cache and resume from the specific step
  const reconstructedQuery = session.state.queryHistory?.[0]?.query || question;

  return executeQuery(reconstructedQuery, sessionId, {
    resolvedIntent,
    skipInterpretation: true
  });
}

export {
  // Re-export individual step functions for testing/advanced use
  injectContext,
  interpretQuery,
  validateIntent,
  checkClarification,
  resolveGeography,
  resolveSpatialReference,
  mapAttributes,
  buildSQL,
  executeSQL,
  formatResults,
  updateSession,
  buildResponse
};

export default {
  executeQuery,
  continueWithClarification
};
