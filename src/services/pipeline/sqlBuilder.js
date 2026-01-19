// src/services/pipeline/sqlBuilder.js
// Step 8: Build parameterized SQL query from resolved intent

import { buildCondition, buildSpatialFilterSQL, normalizeFilterValues } from './attributeMapper.js';

/**
 * Default columns to select for property queries
 */
const DEFAULT_COLUMNS = [
  'parcel_id',
  'situs_address',
  'owner_name_raw',
  'owner_entity_type',
  'owner_segment',
  'acres_calc',
  'asset_class',
  'market_value',
  'land_value',
  'improvement_value',
  'tax_delinquent_flag',
  'homestead_exemption_flag',
  'mail_zip',
  'county_fips',
  'ST_AsGeoJSON(geom_centroid)::json as geom'
];

/**
 * Columns for aggregation queries
 */
const AGGREGATION_COLUMNS = {
  count: 'COUNT(*)',
  sum: (field) => `SUM(${field})`,
  avg: (field) => `ROUND(AVG(${field})::numeric, 2)`,
  min: (field) => `MIN(${field})`,
  max: (field) => `MAX(${field})`
};

/**
 * Allowed groupBy columns
 */
const ALLOWED_GROUP_BY = [
  'mail_zip',
  'asset_class',
  'owner_entity_type',
  'owner_segment',
  'tax_delinquent_flag',
  'homestead_exemption_flag',
  'county_fips'
];

/**
 * Allowed aggregation metric fields
 */
const ALLOWED_METRICS = [
  'market_value',
  'land_value',
  'improvement_value',
  'acres_calc'
];

/**
 * Build SQL query from resolved intent and mapped filters
 *
 * @param {object} intent - Resolved intent object
 * @param {object} mappedFilters - Result from attributeMapper
 * @returns {{ sql: string, values: any[], isAggregation: boolean }}
 */
export function buildSQL(intent, mappedFilters) {
  // Check if this is an aggregation query
  if (intent.aggregation?.type) {
    return buildAggregationSQL(intent, mappedFilters);
  }

  return buildSelectSQL(intent, mappedFilters);
}

/**
 * Build standard SELECT query
 */
function buildSelectSQL(intent, mappedFilters) {
  const conditions = [];
  const values = [];
  let paramIndex = 1;

  // Normalize filter values
  const normalizedConditions = normalizeFilterValues(mappedFilters.conditions || []);

  // 1. Geography filter (bbox)
  if (intent.geography?.bbox) {
    const [minLng, minLat, maxLng, maxLat] = intent.geography.bbox;
    conditions.push(`ST_Intersects(geom_centroid, ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326))`);
    values.push(minLng, minLat, maxLng, maxLat);
    paramIndex += 4;
  }

  // 2. County filter
  if (intent.geography?.type === 'county' && intent.geography?.value) {
    conditions.push(`county_fips = $${paramIndex}`);
    values.push(intent.geography.value);
    paramIndex++;
  }

  // 3. Spatial reference filter (near highway, etc.)
  if (intent.spatialOperation?.resolvedName && intent.spatialOperation?.distanceMeters) {
    conditions.push(`
      ST_DWithin(
        geom_centroid::geography,
        (SELECT geometry::geography FROM reference_geometries WHERE name = $${paramIndex}),
        $${paramIndex + 1}
      )
    `);
    values.push(intent.spatialOperation.resolvedName, intent.spatialOperation.distanceMeters);
    paramIndex += 2;
  }

  // 4. Attribute filters
  for (const filter of normalizedConditions) {
    const { sql, values: filterValues, nextIndex } = buildCondition(filter, paramIndex);
    conditions.push(sql);
    values.push(...filterValues);
    paramIndex = nextIndex;
  }

  // 5. Spatial attribute filters (opportunity zones, etc.)
  for (const spatialFilter of (mappedFilters.spatial || [])) {
    const spatialSQL = buildSpatialFilterSQL(spatialFilter);
    conditions.push(spatialSQL);
  }

  // 6. Build WHERE clause
  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  // 7. Limit
  const limit = Math.min(intent.limit || 50, 500);
  values.push(limit);

  // 8. Build full query
  const sql = `
    SELECT ${DEFAULT_COLUMNS.join(', ')}
    FROM parcel_features_travis
    ${whereClause}
    ORDER BY acres_calc DESC
    LIMIT $${paramIndex}
  `.trim();

  return {
    sql,
    values,
    isAggregation: false,
    debug: {
      conditionCount: conditions.length,
      parameterCount: values.length
    }
  };
}

/**
 * Build aggregation (GROUP BY) query
 */
function buildAggregationSQL(intent, mappedFilters) {
  const conditions = [];
  const values = [];
  let paramIndex = 1;

  // Normalize filter values
  const normalizedConditions = normalizeFilterValues(mappedFilters.conditions || []);

  // 1. Geography filter
  if (intent.geography?.bbox) {
    const [minLng, minLat, maxLng, maxLat] = intent.geography.bbox;
    conditions.push(`ST_Intersects(geom_centroid, ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326))`);
    values.push(minLng, minLat, maxLng, maxLat);
    paramIndex += 4;
  }

  // 2. County filter
  if (intent.geography?.type === 'county' && intent.geography?.value) {
    conditions.push(`county_fips = $${paramIndex}`);
    values.push(intent.geography.value);
    paramIndex++;
  }

  // 3. Spatial reference filter
  if (intent.spatialOperation?.resolvedName && intent.spatialOperation?.distanceMeters) {
    conditions.push(`
      ST_DWithin(
        geom_centroid::geography,
        (SELECT geometry::geography FROM reference_geometries WHERE name = $${paramIndex}),
        $${paramIndex + 1}
      )
    `);
    values.push(intent.spatialOperation.resolvedName, intent.spatialOperation.distanceMeters);
    paramIndex += 2;
  }

  // 4. Attribute filters
  for (const filter of normalizedConditions) {
    const { sql, values: filterValues, nextIndex } = buildCondition(filter, paramIndex);
    conditions.push(sql);
    values.push(...filterValues);
    paramIndex = nextIndex;
  }

  // 5. Spatial attribute filters
  for (const spatialFilter of (mappedFilters.spatial || [])) {
    conditions.push(buildSpatialFilterSQL(spatialFilter));
  }

  // 6. Build SELECT columns for aggregation
  const selectCols = [];
  const agg = intent.aggregation;

  // Group by columns
  const groupBy = (agg.groupBy || []).filter(col => ALLOWED_GROUP_BY.includes(col));
  selectCols.push(...groupBy);

  // Aggregation metrics
  if (agg.type === 'count') {
    selectCols.push('COUNT(*) as count');
  } else if (agg.type && agg.metric && ALLOWED_METRICS.includes(agg.metric)) {
    const aggFunc = AGGREGATION_COLUMNS[agg.type];
    if (typeof aggFunc === 'function') {
      selectCols.push(`${aggFunc(agg.metric)} as ${agg.type}_${agg.metric}`);
    }
  }

  // Default to count if no metrics
  if (selectCols.length === groupBy.length) {
    selectCols.push('COUNT(*) as count');
  }

  // 7. Build query
  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const groupByClause = groupBy.length > 0
    ? `GROUP BY ${groupBy.join(', ')}`
    : '';

  const orderByClause = groupBy.length > 0
    ? `ORDER BY count DESC`
    : '';

  const limit = Math.min(intent.limit || 100, 1000);
  values.push(limit);

  const sql = `
    SELECT ${selectCols.join(', ')}
    FROM parcel_features_travis
    ${whereClause}
    ${groupByClause}
    ${orderByClause}
    LIMIT $${paramIndex}
  `.trim();

  return {
    sql,
    values,
    isAggregation: true,
    groupBy,
    debug: {
      conditionCount: conditions.length,
      parameterCount: values.length
    }
  };
}

/**
 * Format SQL for logging (substitute parameters)
 */
export function formatSQLForLogging(sql, values) {
  let formatted = sql;
  values.forEach((value, index) => {
    const placeholder = `$${index + 1}`;
    const displayValue = typeof value === 'string' ? `'${value}'` : String(value);
    formatted = formatted.replace(placeholder, displayValue);
  });
  return formatted;
}

export default {
  buildSQL,
  formatSQLForLogging,
  DEFAULT_COLUMNS
};
