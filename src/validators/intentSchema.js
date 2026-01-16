/**
 * Intent Schema Validator
 * 
 * Validates extracted intent JSON from Claude to ensure filter correctness
 */

import { z } from 'zod';

/**
 * Zod schema for extracted intent
 */
const IntentSchema = z.object({
  geo: z.object({
    county_fips: z.string().optional().nullable(),
    bbox: z.array(z.number()).length(4).optional().nullable()
  }).optional(),
  
  filters: z.object({
    acres_min: z.number().min(0).optional().nullable(),
    acres_max: z.number().min(0).optional().nullable(),
    asset_class: z.union([
      z.enum(['residential', 'commercial', 'land', 'industrial', 'mixed', 'unknown']),
      z.array(z.enum(['residential', 'commercial', 'land', 'industrial', 'mixed', 'unknown']))
    ]).optional().nullable(),
    owner_entity_type: z.union([
      z.enum(['person', 'llc', 'corp', 'trust_estate', 'unknown']),
      z.array(z.enum(['person', 'llc', 'corp', 'trust_estate', 'unknown']))
    ]).optional().nullable(),
    owner_segment: z.union([
      z.enum(['mom_pop', 'small_operator', 'institutional', 'local_owner', 'absentee', 'trust_estate', 'unknown']),
      z.array(z.enum(['mom_pop', 'small_operator', 'institutional', 'local_owner', 'absentee', 'trust_estate', 'unknown']))
    ]).optional().nullable(),
    tax_delinquent: z.boolean().optional().nullable(),
    market_value_min: z.number().min(0).optional().nullable(),
    market_value_max: z.number().min(0).optional().nullable(),
    owner_name_search: z.string().optional().nullable(),
    address_search: z.string().optional().nullable()
  }).optional(),
  
  limit: z.number().int().min(1).max(200).optional().default(50)
}).passthrough(); // Allow extra fields but validate known ones

/**
 * Validate intent and return sanitized version
 * 
 * @param {Object} intent - Extracted intent from Claude
 * @returns {{ valid: boolean, errors: string[], sanitized: Object }}
 */
export function validateIntent(intent) {
  const errors = [];
  let sanitized = {};
  
  try {
    // Validate with Zod
    const result = IntentSchema.safeParse(intent);
    
    if (!result.success) {
      // Collect validation errors
      if (result.error && Array.isArray(result.error.errors)) {
        result.error.errors.forEach(err => {
          errors.push(`${err.path.join('.')}: ${err.message}`);
        });
      } else {
        errors.push('Validation failed: ' + (result.error?.message || 'Unknown error'));
      }
      
      // Try to sanitize partial data
      sanitized = {
        geo: {
          county_fips: intent?.geo?.county_fips || null,
          bbox: Array.isArray(intent?.geo?.bbox) && intent.geo.bbox.length === 4 
            ? intent.geo.bbox.map(n => typeof n === 'number' ? n : parseFloat(n)).filter(n => !isNaN(n))
            : null
        },
        filters: {
          acres_min: typeof intent?.filters?.acres_min === 'number' && intent.filters.acres_min >= 0 
            ? intent.filters.acres_min : null,
          acres_max: typeof intent?.filters?.acres_max === 'number' && intent.filters.acres_max >= 0 
            ? intent.filters.acres_max : null,
          asset_class: (() => {
            const value = intent?.filters?.asset_class;
            if (!value) return null;
            const validValues = ['residential', 'commercial', 'land', 'industrial', 'mixed', 'unknown'];
            if (Array.isArray(value)) {
              const filtered = value.filter(v => validValues.includes(v));
              return filtered.length > 0 ? filtered : null;
            }
            return validValues.includes(value) ? value : null;
          })(),
          owner_entity_type: (() => {
            const value = intent?.filters?.owner_entity_type;
            if (!value) return null;
            const validValues = ['person', 'llc', 'corp', 'trust_estate', 'unknown'];
            if (Array.isArray(value)) {
              const filtered = value.filter(v => validValues.includes(v));
              return filtered.length > 0 ? filtered : null;
            }
            return validValues.includes(value) ? value : null;
          })(),
          owner_segment: (() => {
            const value = intent?.filters?.owner_segment;
            if (!value) return null;
            const validValues = ['mom_pop', 'small_operator', 'institutional', 'local_owner', 'absentee', 'trust_estate', 'unknown'];
            if (Array.isArray(value)) {
              const filtered = value.filter(v => validValues.includes(v));
              return filtered.length > 0 ? filtered : null;
            }
            return validValues.includes(value) ? value : null;
          })(),
          tax_delinquent: typeof intent?.filters?.tax_delinquent === 'boolean' 
            ? intent.filters.tax_delinquent : null,
          market_value_min: typeof intent?.filters?.market_value_min === 'number' && intent.filters.market_value_min >= 0 
            ? intent.filters.market_value_min : null,
          market_value_max: typeof intent?.filters?.market_value_max === 'number' && intent.filters.market_value_max >= 0 
            ? intent.filters.market_value_max : null,
          owner_name_search: typeof intent?.filters?.owner_name_search === 'string' && intent.filters.owner_name_search.trim().length > 0
            ? intent.filters.owner_name_search.trim() : null,
          address_search: typeof intent?.filters?.address_search === 'string' && intent.filters.address_search.trim().length > 0
            ? intent.filters.address_search.trim() : null
        },
        limit: typeof intent?.limit === 'number' && intent.limit >= 1 && intent.limit <= 200
          ? Math.min(Math.max(intent.limit, 1), 200)
          : 50
      };
      
      return { valid: false, errors, sanitized };
    }
    
    // Validation passed
    sanitized = result.data;
    return { valid: true, errors: [], sanitized };
    
  } catch (error) {
    errors.push(`Validation error: ${error.message}`);
    
    // Return minimal sanitized object
    sanitized = {
      geo: { county_fips: null, bbox: null },
      filters: {},
      limit: 50
    };
    
    return { valid: false, errors, sanitized };
  }
}

/**
 * Validate acres range
 */
export function validateAcresRange(min, max) {
  if (min !== null && max !== null && min > max) {
    return { valid: false, error: 'acres_min cannot be greater than acres_max' };
  }
  return { valid: true };
}

/**
 * Validate market value range
 */
export function validateMarketValueRange(min, max) {
  if (min !== null && max !== null && min > max) {
    return { valid: false, error: 'market_value_min cannot be greater than market_value_max' };
  }
  return { valid: true };
}

export default {
  validateIntent,
  validateAcresRange,
  validateMarketValueRange
};
