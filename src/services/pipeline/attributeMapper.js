// src/services/pipeline/attributeMapper.js
// Step 7: Map abstract filter attributes to concrete SQL conditions

import { mapFilter, getMapping } from '../../config/attributeMap.js';

/**
 * Map an array of abstract filters to SQL-ready conditions
 *
 * @param {array} filters - Array of filter objects from intent
 * @returns {array} - Array of mapped conditions
 */
export function mapAttributes(filters) {
  if (!Array.isArray(filters) || filters.length === 0) {
    return [];
  }

  const mapped = [];
  const spatialFilters = [];

  for (const filter of filters) {
    const result = mapFilter(filter);

    if (!result) {
      console.warn(`[attributeMapper] Skipping unknown filter: ${filter.attribute}`);
      continue;
    }

    if (result.type === 'spatial') {
      spatialFilters.push({
        ...result,
        originalFilter: filter
      });
    } else {
      mapped.push({
        ...result,
        originalFilter: filter
      });
    }
  }

  return {
    conditions: mapped,
    spatial: spatialFilters
  };
}

/**
 * Build SQL condition string from a mapped filter
 *
 * @param {object} mappedFilter - Mapped filter object
 * @param {number} paramIndex - Current parameter index
 * @returns {{ sql: string, values: any[], nextIndex: number }}
 */
export function buildCondition(mappedFilter, paramIndex) {
  const { column, operator, value } = mappedFilter;

  switch (operator) {
    case 'BETWEEN':
      if (Array.isArray(value) && value.length === 2) {
        return {
          sql: `${column} BETWEEN $${paramIndex} AND $${paramIndex + 1}`,
          values: [value[0], value[1]],
          nextIndex: paramIndex + 2
        };
      }
      break;

    case 'IN':
      if (Array.isArray(value)) {
        const placeholders = value.map((_, i) => `$${paramIndex + i}`).join(', ');
        return {
          sql: `${column} IN (${placeholders})`,
          values: value,
          nextIndex: paramIndex + value.length
        };
      }
      break;

    case 'LIKE':
    case 'ILIKE':
      return {
        sql: `${column} ${operator} $${paramIndex}`,
        values: [`%${value}%`],
        nextIndex: paramIndex + 1
      };

    case '=':
    case '>':
    case '<':
    case '>=':
    case '<=':
    case '!=':
    case '<>':
    default:
      return {
        sql: `${column} ${operator} $${paramIndex}`,
        values: [value],
        nextIndex: paramIndex + 1
      };
  }

  // Fallback
  return {
    sql: `${column} = $${paramIndex}`,
    values: [value],
    nextIndex: paramIndex + 1
  };
}

/**
 * Build SQL for spatial filter (opportunity zones, etc.)
 *
 * @param {object} spatialFilter - Spatial filter config
 * @param {string} parcelGeomColumn - Parcel geometry column
 * @returns {string} - SQL condition fragment
 */
export function buildSpatialFilterSQL(spatialFilter, parcelGeomColumn = 'geom_centroid') {
  switch (spatialFilter.table) {
    case 'opportunity_zones':
      return `
        EXISTS (
          SELECT 1 FROM opportunity_zones oz
          WHERE ST_Intersects(${parcelGeomColumn}, oz.geometry)
        )
      `;

    case 'census_tracts':
      return `
        EXISTS (
          SELECT 1 FROM census_tracts ct
          WHERE ST_Intersects(${parcelGeomColumn}, ct.geometry)
        )
      `;

    default:
      console.warn(`[attributeMapper] Unknown spatial table: ${spatialFilter.table}`);
      return 'TRUE';
  }
}

/**
 * Normalize filter values to lowercase where needed
 * (asset_class, owner_entity_type, owner_segment require lowercase)
 */
export function normalizeFilterValues(filters) {
  const lowercaseColumns = ['asset_class', 'owner_entity_type', 'owner_segment'];

  return filters.map(filter => {
    if (lowercaseColumns.includes(filter.column)) {
      if (typeof filter.value === 'string') {
        return { ...filter, value: filter.value.toLowerCase() };
      }
      if (Array.isArray(filter.value)) {
        return {
          ...filter,
          value: filter.value.map(v => typeof v === 'string' ? v.toLowerCase() : v)
        };
      }
    }
    return filter;
  });
}

/**
 * Get summary of mapped filters for logging
 */
export function summarizeFilters(mappedResult) {
  const { conditions, spatial } = mappedResult;

  const summary = [];

  for (const cond of conditions) {
    summary.push(`${cond.column} ${cond.operator} ${JSON.stringify(cond.value)}`);
  }

  for (const sp of spatial) {
    summary.push(`SPATIAL: ${sp.table}`);
  }

  return summary.join(', ');
}

export default {
  mapAttributes,
  buildCondition,
  buildSpatialFilterSQL,
  normalizeFilterValues,
  summarizeFilters
};
