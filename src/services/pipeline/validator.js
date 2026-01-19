// src/services/pipeline/validator.js
// Step 3: Validate parsed intent for completeness and correctness

import { getMapping } from '../../config/attributeMap.js';

/**
 * Valid values for enum fields
 */
const VALID_VALUES = {
  geographyType: ['zip', 'county', 'city', 'buffer', 'bbox', 'drawn'],
  spatialOperationType: ['near', 'within', 'intersects'],
  outputType: ['map', 'list', 'count', 'stats'],
  aggregationType: ['count', 'sum', 'avg', 'min', 'max', 'group'],
  operators: ['=', '>', '<', '>=', '<=', 'BETWEEN', 'IN', 'LIKE']
};

/**
 * Validate an intent object
 *
 * @param {object} intent - Parsed intent from interpreter
 * @returns {{ valid: boolean, errors: string[], warnings: string[], sanitized: object }}
 */
export function validateIntent(intent) {
  const errors = [];
  const warnings = [];
  const sanitized = { ...intent };

  // 1. Validate geography
  if (intent.geography) {
    if (intent.geography.type && !VALID_VALUES.geographyType.includes(intent.geography.type)) {
      errors.push(`Invalid geography type: ${intent.geography.type}`);
    }

    if (intent.geography.type === 'zip' && intent.geography.value) {
      // Validate ZIP code format
      const zip = String(intent.geography.value);
      if (!/^\d{5}$/.test(zip)) {
        warnings.push(`ZIP code "${zip}" may not be valid (expected 5 digits)`);
      }
    }

    if (intent.geography.type === 'county' && intent.geography.value) {
      // Validate FIPS code format (5 digits: 2 state + 3 county)
      const fips = String(intent.geography.value);
      if (!/^\d{5}$/.test(fips)) {
        warnings.push(`County FIPS "${fips}" may not be valid`);
      }
    }
  }

  // 2. Validate spatial operation
  if (intent.spatialOperation) {
    if (intent.spatialOperation.type &&
        !VALID_VALUES.spatialOperationType.includes(intent.spatialOperation.type)) {
      errors.push(`Invalid spatial operation type: ${intent.spatialOperation.type}`);
    }

    if (intent.spatialOperation.type === 'near' || intent.spatialOperation.type === 'within') {
      if (!intent.spatialOperation.reference) {
        errors.push('Spatial operation requires a reference (e.g., highway name)');
      }

      if (intent.spatialOperation.distance !== undefined) {
        if (typeof intent.spatialOperation.distance !== 'number' ||
            intent.spatialOperation.distance <= 0) {
          warnings.push('Distance should be a positive number');
          sanitized.spatialOperation = {
            ...sanitized.spatialOperation,
            distance: Math.abs(intent.spatialOperation.distance) || 1
          };
        }

        // Cap distance at reasonable maximum
        if (intent.spatialOperation.distance > 50) {
          warnings.push('Distance capped at 50 miles');
          sanitized.spatialOperation = {
            ...sanitized.spatialOperation,
            distance: 50
          };
        }
      }
    }
  }

  // 3. Validate filters
  if (intent.filters && Array.isArray(intent.filters)) {
    sanitized.filters = [];

    for (const filter of intent.filters) {
      // Check if attribute is known
      const mapping = getMapping(filter.attribute);
      if (!mapping) {
        warnings.push(`Unknown filter attribute: ${filter.attribute}`);
        continue; // Skip unknown filters
      }

      // Validate operator
      if (filter.operator && !VALID_VALUES.operators.includes(filter.operator)) {
        warnings.push(`Invalid operator "${filter.operator}" for ${filter.attribute}`);
        filter.operator = '='; // Default to equals
      }

      // Validate BETWEEN has array value
      if (filter.operator === 'BETWEEN') {
        if (!Array.isArray(filter.value) || filter.value.length !== 2) {
          warnings.push(`BETWEEN operator requires [min, max] array for ${filter.attribute}`);
          continue;
        }
      }

      // Validate numeric values for numeric columns
      // Skip this check if the mapping has a predefined value (e.g., "vacant" has value: 0)
      const hasPredefinedValue = mapping.value !== undefined;
      if (!hasPredefinedValue && mapping.column && ['acres_calc', 'market_value', 'land_value', 'improvement_value'].includes(mapping.column)) {
        if (filter.operator === 'BETWEEN') {
          if (typeof filter.value[0] !== 'number' || typeof filter.value[1] !== 'number') {
            warnings.push(`Numeric range expected for ${filter.attribute}`);
            continue;
          }
        } else if (filter.value !== undefined && typeof filter.value !== 'number') {
          warnings.push(`Numeric value expected for ${filter.attribute}`);
          continue;
        }
      }

      sanitized.filters.push(filter);
    }
  }

  // 4. Validate output
  if (intent.output && !VALID_VALUES.outputType.includes(intent.output)) {
    warnings.push(`Invalid output type: ${intent.output}, defaulting to "map"`);
    sanitized.output = 'map';
  }

  // 5. Validate aggregation
  if (intent.aggregation) {
    if (intent.aggregation.type &&
        !VALID_VALUES.aggregationType.includes(intent.aggregation.type)) {
      warnings.push(`Invalid aggregation type: ${intent.aggregation.type}`);
      sanitized.aggregation = null;
    }
  }

  // 6. Validate limit
  if (intent.limit !== undefined) {
    if (typeof intent.limit !== 'number' || intent.limit < 1) {
      sanitized.limit = 50;
    } else if (intent.limit > 500) {
      warnings.push('Limit capped at 500');
      sanitized.limit = 500;
    }
  }

  // 7. Check for required geography (can be relaxed)
  if (!intent.geography && !intent.spatialOperation) {
    warnings.push('No geography specified - will use default (Travis County)');
    sanitized.geography = {
      type: 'county',
      value: '48453',
      displayName: 'Travis County'
    };
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitized
  };
}

/**
 * Check if intent has minimum required information
 */
export function hasMinimumIntent(intent) {
  // Must have at least one of:
  // - Geography
  // - Spatial operation
  // - Filter
  // - Aggregation

  if (intent.geography?.type) return true;
  if (intent.spatialOperation?.reference) return true;
  if (intent.filters?.length > 0) return true;
  if (intent.aggregation?.type) return true;

  return false;
}

export default {
  validateIntent,
  hasMinimumIntent
};
