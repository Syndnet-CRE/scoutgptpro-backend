// src/services/pipeline/responseBuilder.js
// Step 12: Build final API response

import { normalizeProperties } from '../../utils/normalizeProperty.js';
import { enrichProperty, analyzeDevelopmentFeasibility } from '../enrichment/orchestrator.js';
import { createArtifact } from '../artifacts/index.js';

/**
 * Build API response from pipeline results
 *
 * @param {object} result - Pipeline result object
 * @returns {Promise<object>} - API response object
 */
export async function buildResponse(result) {
  const {
    type,
    // Error response fields
    errors,
    // Clarification response fields
    clarification,
    // Success response fields
    summary,
    resultCount,
    mapData,
    items,
    stats,
    data,
    // Metadata
    metadata
  } = result;

  // Base response structure
  const response = {
    success: type !== 'error',
    type,
    timestamp: new Date().toISOString()
  };

  // Check if this is an analysis intent
  const intent = result.intent;
  const sessionId = result.sessionId;
  const parcelIds = result.parcelIds || [];
  
  const isAnalysisIntent = intent?.intentType && 
    ['analyze_constraints', 'analyze_feasibility', 'compare_properties'].includes(intent.intentType);

  // Add type-specific fields
  switch (type) {
    case 'error':
      return buildErrorResponse(response, errors, metadata);

    case 'clarification_needed':
      return buildClarificationResponse(response, clarification, metadata);

    case 'map_result':
      const mapResponse = buildMapResponse(response, { summary, resultCount, mapData }, metadata);
      
      // If analysis intent, enrich and generate artifact
      if (isAnalysisIntent && sessionId) {
        // Get parcel IDs from mapData if not provided
        const mapParcelIds = parcelIds.length > 0 
          ? parcelIds 
          : (mapData?.geojson?.features || []).slice(0, 5).map(f => f.properties?.parcel_id).filter(Boolean);
        
        if (mapParcelIds.length > 0) {
          return await buildAnalysisResponse(mapResponse, {
            intentType: intent.intentType,
            sessionId,
            parcelIds: mapParcelIds,
            rawQuery: result.rawQuery || '',
            queryIntent: intent
          });
        }
      }
      
      return mapResponse;

    case 'list_result':
      return buildListResponse(response, { summary, resultCount, items }, metadata);

    case 'count_result':
      return buildCountResponse(response, { summary, data, resultCount }, metadata);

    case 'stats_result':
      return buildStatsResponse(response, { summary, stats, resultCount }, metadata);

    case 'analysis_result':
      // Build a map response first, then enrich with analysis
      const analysisMapResponse = buildMapResponse(response, { summary, resultCount, mapData }, metadata);
      analysisMapResponse.type = 'analysis_result';
      
      // Get parcel IDs from results if not already provided
      // mapData has structure { geojson: { features: [...] } }
      const analysisParcelIds = parcelIds.length > 0 
        ? parcelIds 
        : (mapData?.geojson?.features || []).slice(0, 5).map(f => f.properties?.parcel_id).filter(Boolean);
      
      if (analysisParcelIds.length > 0 && sessionId) {
        return await buildAnalysisResponse(analysisMapResponse, {
          intentType: intent?.intentType || 'analyze_constraints',
          sessionId,
          parcelIds: analysisParcelIds,
          rawQuery: result.rawQuery || '',
          queryIntent: intent
        });
      }
      return analysisMapResponse;

    default:
      return {
        ...response,
        ...result,
        metadata
      };
  }
}

/**
 * Build error response
 */
function buildErrorResponse(base, errors, metadata) {
  return {
    ...base,
    success: false,
    errors: Array.isArray(errors) ? errors : [errors],
    message: Array.isArray(errors) ? errors[0] : errors,
    metadata: {
      ...metadata,
      errorCount: Array.isArray(errors) ? errors.length : 1
    }
  };
}

/**
 * Build clarification response
 */
function buildClarificationResponse(base, clarification, metadata) {
  return {
    ...base,
    clarification: {
      question: clarification.question,
      options: clarification.options.map(opt => ({
        label: opt.label,
        value: opt.value
      })),
      ruleId: clarification.ruleId
    },
    message: clarification.question,
    metadata: {
      ...metadata,
      requiresUserInput: true
    }
  };
}

/**
 * Build map result response
 */
function buildMapResponse(base, data, metadata) {
  const { summary, resultCount, mapData } = data;

  return {
    ...base,
    summary,
    message: summary,
    resultCount,
    // Map-specific data
    mapData: {
      geojson: mapData,
      bounds: mapData?.bounds,
      layerId: `query-results-${Date.now()}`
    },
    // Legacy compatibility - normalize to camelCase for frontend
    properties: normalizeProperties(mapData?.features?.map(f => ({
      parcel_id: f.properties.parcel_id,
      situs_address: f.properties.address || f.properties.situs_address,
      owner_name_raw: f.properties.owner || f.properties.owner_name_raw,
      owner_entity_type: f.properties.owner_type || f.properties.owner_entity_type,
      owner_segment: f.properties.owner_segment,
      acres_calc: f.properties.acres || f.properties.acres_calc,
      asset_class: f.properties.asset_class,
      market_value: f.properties.market_value,
      land_value: f.properties.land_value,
      improvement_value: f.properties.improvement_value,
      tax_delinquent_flag: f.properties.tax_delinquent,
      homestead_exemption_flag: f.properties.homestead,
      geom: f.geometry
    })) || []),
    pins: mapData?.features?.slice(0, 100).map(f => ({
      id: f.properties.parcel_id,
      parcelId: f.properties.parcel_id,
      lat: f.geometry?.coordinates?.[1],
      lng: f.geometry?.coordinates?.[0],
      address: f.properties.address,
      propertyType: f.properties.asset_class
    })) || [],
    metadata: {
      ...metadata,
      featureCount: mapData?.features?.length || 0
    }
  };
}

/**
 * Build list result response
 */
function buildListResponse(base, data, metadata) {
  const { summary, resultCount, items } = data;

  return {
    ...base,
    summary,
    message: summary,
    resultCount,
    items,
    metadata
  };
}

/**
 * Build count/aggregation result response
 */
function buildCountResponse(base, data, metadata) {
  const { summary, data: aggData, resultCount } = data;

  return {
    ...base,
    summary,
    message: summary,
    totalCount: resultCount,
    data: aggData,
    metadata
  };
}

/**
 * Build statistics result response
 */
function buildStatsResponse(base, data, metadata) {
  const { summary, stats, resultCount } = data;

  return {
    ...base,
    summary,
    message: summary,
    resultCount,
    stats,
    metadata
  };
}

/**
 * Build analysis response with enrichment and artifact
 */
async function buildAnalysisResponse(mapResponse, options) {
  const { intentType, sessionId, parcelIds, rawQuery, queryIntent } = options;

  try {
    console.log(`[responseBuilder] Processing analysis intent: ${intentType} for ${parcelIds.length} parcels`);

    // Get parcel IDs from the query results (top 5)
    const results = mapResponse.properties || [];
    const topParcelIds = (parcelIds.length > 0 
      ? parcelIds 
      : results.map(r => r.parcel_id || r.parcelId).filter(Boolean)
    ).slice(0, 5);

    if (topParcelIds.length === 0) {
      console.warn('[responseBuilder] No parcel IDs found for analysis');
      return {
        ...mapResponse,
        type: 'analysis_result',
        artifact: {
          type: 'development_analysis',
          analyses: [],
          error: 'No parcels found to analyze'
        }
      };
    }

    console.log(`[responseBuilder] Running development analysis on ${topParcelIds.length} properties`);

    // Run development analysis on each property
    const analyses = await Promise.all(
      topParcelIds.map(id => analyzeDevelopmentFeasibility(id))
    );

    // Filter out any failed analyses
    const validAnalyses = analyses.filter(a => a && !a.error && a.found !== false);

    if (validAnalyses.length === 0) {
      console.warn('[responseBuilder] No valid analyses generated');
      return {
        ...mapResponse,
        type: 'analysis_result',
        artifact: {
          type: 'development_analysis',
          analyses: [],
          error: 'Failed to generate analyses for any properties'
        }
      };
    }

    // Determine artifact type based on intent
    let artifactType = 'development_analysis';
    if (intentType === 'analyze_constraints') {
      artifactType = 'development_analysis'; // Use same generator, focuses on constraints
    } else if (intentType === 'analyze_feasibility') {
      artifactType = 'development_analysis';
    } else if (intentType === 'compare_properties') {
      artifactType = 'development_analysis'; // Compare multiple properties
    }

    // Optionally create PDF artifact for download
    let downloadUrl = null;
    try {
      const artifact = await createArtifact({
        type: artifactType,
        sessionId,
        queryInput: {
          query: rawQuery,
          intentType,
          analyzedAt: new Date().toISOString()
        },
        queryIntent: queryIntent,
        parcelIds: topParcelIds,
        options: {
          intentType,
          includeEnrichment: true
        }
      });

      downloadUrl = `/api/artifacts/${artifact.artifact_id}/download`;
    } catch (artifactError) {
      console.warn('[responseBuilder] Failed to create PDF artifact:', artifactError.message);
      // Continue without download URL
    }

    // Build artifact with analyses
    const artifact = {
      type: artifactType,
      analyses: validAnalyses,
      generatedAt: new Date().toISOString(),
      reactComponent: 'DevelopmentAnalysisArtifact'
    };

    if (downloadUrl) {
      artifact.downloadUrl = downloadUrl;
    }

    // Return analysis result with both map data and artifact
    return {
      ...mapResponse,
      success: true,
      type: 'analysis_result',
      message: `Development analysis complete for ${validAnalyses.length} properties`,
      artifact
    };

  } catch (error) {
    console.error('[responseBuilder] Error generating analysis artifact:', error.message);
    console.error('[responseBuilder] Stack:', error.stack);
    
    // Return map response even if artifact generation fails
    return {
      ...mapResponse,
      type: 'analysis_result',
      artifact: {
        type: 'development_analysis',
        analyses: [],
        error: 'Failed to generate analysis artifact',
        message: error.message
      }
    };
  }
}

/**
 * Build metadata object
 */
export function buildMetadata(options = {}) {
  return {
    intentId: options.intentId,
    executedAt: options.executedAt || new Date().toISOString(),
    queryDurationMs: options.queryDurationMs,
    sqlExecutionMs: options.sqlExecutionMs,
    confidence: options.confidence,
    assumptions: options.assumptions || [],
    warnings: options.warnings || [],
    dataFreshness: options.dataFreshness || 'live'
  };
}

/**
 * Wrap response in standard API envelope
 */
export function wrapResponse(response) {
  return {
    status: response.success ? 'success' : 'error',
    data: response,
    timestamp: new Date().toISOString()
  };
}

export default {
  buildResponse,
  buildMetadata,
  wrapResponse
};
