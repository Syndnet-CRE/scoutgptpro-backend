// src/services/pipeline/responseBuilder.js
// Step 12: Build final API response

import { normalizeProperties } from '../../utils/normalizeProperty.js';

/**
 * Build API response from pipeline results
 *
 * @param {object} result - Pipeline result object
 * @returns {object} - API response object
 */
export function buildResponse(result) {
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

  // Add type-specific fields
  switch (type) {
    case 'error':
      return buildErrorResponse(response, errors, metadata);

    case 'clarification_needed':
      return buildClarificationResponse(response, clarification, metadata);

    case 'map_result':
      return buildMapResponse(response, { summary, resultCount, mapData }, metadata);

    case 'list_result':
      return buildListResponse(response, { summary, resultCount, items }, metadata);

    case 'count_result':
      return buildCountResponse(response, { summary, data, resultCount }, metadata);

    case 'stats_result':
      return buildStatsResponse(response, { summary, stats, resultCount }, metadata);

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
