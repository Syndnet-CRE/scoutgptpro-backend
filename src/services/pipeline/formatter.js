// src/services/pipeline/formatter.js
// Step 10: Format query results for output

/**
 * Format query results based on output mode
 *
 * @param {array} rows - Raw database rows
 * @param {string} outputMode - 'map' | 'list' | 'count' | 'stats'
 * @param {object} options - Additional formatting options
 * @returns {object} - Formatted results
 */
export function formatResults(rows, outputMode = 'map', options = {}) {
  switch (outputMode) {
    case 'map':
      return formatForMap(rows, options);
    case 'list':
      return formatForList(rows, options);
    case 'count':
      return formatForCount(rows, options);
    case 'stats':
      return formatForStats(rows, options);
    default:
      return formatForMap(rows, options);
  }
}

/**
 * Format results for map display (GeoJSON FeatureCollection)
 */
function formatForMap(rows, options = {}) {
  const features = rows.map(row => ({
    type: 'Feature',
    geometry: row.geom || null,
    properties: {
      parcel_id: row.parcel_id,
      address: row.situs_address,
      owner: row.owner_name_raw,
      owner_type: row.owner_entity_type,
      owner_segment: row.owner_segment,
      acres: parseFloat(row.acres_calc) || 0,
      asset_class: row.asset_class,
      market_value: parseFloat(row.market_value) || 0,
      land_value: parseFloat(row.land_value) || 0,
      improvement_value: parseFloat(row.improvement_value) || 0,
      tax_delinquent: row.tax_delinquent_flag === true,
      homestead: row.homestead_exemption_flag === true,
      zip: row.mail_zip,
      county_fips: row.county_fips
    }
  }));

  // Calculate bounds
  const bounds = calculateBounds(features);

  // Generate summary
  const summary = generateSummary(rows, options.intent);

  return {
    type: 'map_result',
    summary,
    mapData: {
      type: 'FeatureCollection',
      features,
      bounds
    },
    resultCount: rows.length
  };
}

/**
 * Format results for list display
 */
function formatForList(rows, options = {}) {
  const items = rows.map(row => ({
    parcel_id: row.parcel_id,
    address: row.situs_address || 'No address',
    owner: row.owner_name_raw || 'Unknown',
    acres: parseFloat(row.acres_calc)?.toFixed(2) || '0',
    asset_class: formatAssetClass(row.asset_class),
    market_value: formatCurrency(row.market_value),
    flags: getPropertyFlags(row),
    coordinates: row.geom?.coordinates || null
  }));

  return {
    type: 'list_result',
    summary: `Found ${rows.length} properties`,
    items,
    resultCount: rows.length
  };
}

/**
 * Format results for count/aggregation display
 */
function formatForCount(rows, options = {}) {
  // For aggregation results, rows contain grouped data
  if (rows.length > 0 && rows[0].count !== undefined) {
    const totalCount = rows.reduce((sum, row) => sum + parseInt(row.count || 0, 10), 0);

    return {
      type: 'count_result',
      summary: `Total: ${totalCount.toLocaleString()} properties`,
      data: rows,
      totalCount,
      groupCount: rows.length
    };
  }

  // Simple count
  return {
    type: 'count_result',
    summary: `Found ${rows.length} properties`,
    totalCount: rows.length
  };
}

/**
 * Format results for statistics display
 */
function formatForStats(rows, options = {}) {
  if (rows.length === 0) {
    return {
      type: 'stats_result',
      summary: 'No data to analyze',
      stats: {}
    };
  }

  // Calculate statistics
  const acres = rows.map(r => parseFloat(r.acres_calc) || 0).filter(v => v > 0);
  const values = rows.map(r => parseFloat(r.market_value) || 0).filter(v => v > 0);

  const stats = {
    count: rows.length,
    acres: {
      min: Math.min(...acres),
      max: Math.max(...acres),
      avg: average(acres),
      total: sum(acres)
    },
    market_value: {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: average(values),
      total: sum(values)
    },
    by_asset_class: groupBy(rows, 'asset_class'),
    by_owner_type: groupBy(rows, 'owner_entity_type'),
    tax_delinquent_count: rows.filter(r => r.tax_delinquent_flag === true).length
  };

  return {
    type: 'stats_result',
    summary: `Statistics for ${rows.length} properties`,
    stats,
    resultCount: rows.length
  };
}

/**
 * Calculate bounding box from features
 */
function calculateBounds(features) {
  if (features.length === 0) return null;

  let minLng = Infinity, minLat = Infinity;
  let maxLng = -Infinity, maxLat = -Infinity;

  for (const feature of features) {
    const coords = feature.geometry?.coordinates;
    if (!coords) continue;

    const [lng, lat] = coords;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  if (minLng === Infinity) return null;

  // Add padding
  const lngPad = (maxLng - minLng) * 0.1 || 0.01;
  const latPad = (maxLat - minLat) * 0.1 || 0.01;

  return [
    [minLng - lngPad, minLat - latPad],
    [maxLng + lngPad, maxLat + latPad]
  ];
}

/**
 * Generate natural language summary
 */
function generateSummary(rows, intent) {
  const count = rows.length;
  const parts = [`Found ${count.toLocaleString()} ${count === 1 ? 'property' : 'properties'}`];

  if (intent?.geography?.displayName) {
    parts.push(`in ${intent.geography.displayName}`);
  }

  if (intent?.spatialOperation?.displayName) {
    parts.push(`near ${intent.spatialOperation.displayName}`);
  }

  return parts.join(' ');
}

/**
 * Format asset class for display
 */
function formatAssetClass(assetClass) {
  const labels = {
    'residential': 'Residential',
    'commercial': 'Commercial',
    'industrial': 'Industrial',
    'land': 'Vacant Land',
    'mixed': 'Mixed Use',
    'unknown': 'Unknown'
  };
  return labels[assetClass] || assetClass || 'Unknown';
}

/**
 * Format currency value
 */
function formatCurrency(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return '$0';
  return '$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Get property flags for display
 */
function getPropertyFlags(row) {
  const flags = [];
  if (row.tax_delinquent_flag === true) flags.push('Tax Delinquent');
  if (row.homestead_exemption_flag === true) flags.push('Homestead');
  if (row.owner_segment === 'absentee') flags.push('Absentee Owner');
  return flags;
}

// Utility functions
function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function average(arr) {
  if (arr.length === 0) return 0;
  return sum(arr) / arr.length;
}

function groupBy(rows, field) {
  const groups = {};
  for (const row of rows) {
    const key = row[field] || 'unknown';
    groups[key] = (groups[key] || 0) + 1;
  }
  return groups;
}

export default {
  formatResults,
  calculateBounds,
  generateSummary
};
