// src/config/attributeMap.js
// Maps abstract natural language concepts to concrete database columns

/**
 * Attribute mapping configuration
 * Format: abstract_term → { column, operator, value?, transform?, aliases? }
 */
export const ATTRIBUTE_MAP = {

  // ============================================
  // VACANCY / IMPROVEMENT STATUS
  // ============================================
  'vacant': {
    column: 'improvement_value',
    operator: '=',
    value: 0,
    description: 'No improvements (improvement_value = 0)',
    aliases: ['unimproved', 'raw land', 'undeveloped']
  },
  'improved': {
    column: 'improvement_value',
    operator: '>',
    value: 0,
    description: 'Has improvements (improvement_value > 0)',
    aliases: ['developed', 'built']
  },

  // ============================================
  // ASSET CLASS / LAND USE
  // ============================================
  'residential': {
    column: 'asset_class',
    operator: '=',
    value: 'residential',
    aliases: ['home', 'house', 'housing', 'sfr', 'single family']
  },
  'commercial': {
    column: 'asset_class',
    operator: '=',
    value: 'commercial',
    aliases: ['retail', 'office', 'business']
  },
  'industrial': {
    column: 'asset_class',
    operator: '=',
    value: 'industrial',
    aliases: ['warehouse', 'manufacturing', 'flex']
  },
  'land': {
    column: 'asset_class',
    operator: '=',
    value: 'land',
    aliases: ['vacant land', 'raw land', 'lot']
  },
  'mixed': {
    column: 'asset_class',
    operator: '=',
    value: 'mixed',
    aliases: ['mixed use', 'mixed-use']
  },

  // ============================================
  // OWNER ENTITY TYPE
  // ============================================
  'individual': {
    column: 'owner_entity_type',
    operator: '=',
    value: 'person',
    aliases: ['person', 'personal', 'private owner']
  },
  'llc': {
    column: 'owner_entity_type',
    operator: '=',
    value: 'llc',
    aliases: ['limited liability', 'llc owned']
  },
  'corporation': {
    column: 'owner_entity_type',
    operator: '=',
    value: 'corp',
    aliases: ['corp', 'corporate', 'inc', 'company']
  },
  'trust': {
    column: 'owner_entity_type',
    operator: '=',
    value: 'trust_estate',
    aliases: ['estate', 'trust owned', 'family trust']
  },

  // ============================================
  // OWNER SEGMENT
  // ============================================
  'mom_pop': {
    column: 'owner_segment',
    operator: '=',
    value: 'mom_pop',
    aliases: ['mom and pop', 'mom & pop', 'small owner', 'individual owner']
  },
  'small_operator': {
    column: 'owner_segment',
    operator: '=',
    value: 'small_operator',
    aliases: ['small investor', 'small portfolio', 'local investor']
  },
  'institutional': {
    column: 'owner_segment',
    operator: '=',
    value: 'institutional',
    aliases: ['large owner', 'institution', 'fund', 'reit', 'private equity']
  },
  'absentee': {
    column: 'owner_segment',
    operator: '=',
    value: 'absentee',
    aliases: ['out of state', 'non-local', 'absentee owner', 'out-of-state']
  },
  'local_owner': {
    column: 'owner_segment',
    operator: '=',
    value: 'local_owner',
    aliases: ['local', 'in-state', 'local investor']
  },

  // ============================================
  // DISTRESS SIGNALS
  // ============================================
  'tax_delinquent': {
    column: 'tax_delinquent_flag',
    operator: '=',
    value: true,
    aliases: ['delinquent taxes', 'back taxes', 'tax lien', 'unpaid taxes']
  },
  'homestead': {
    column: 'homestead_exemption_flag',
    operator: '=',
    value: true,
    aliases: ['homestead exemption', 'owner occupied', 'primary residence']
  },
  'non_homestead': {
    column: 'homestead_exemption_flag',
    operator: '=',
    value: false,
    aliases: ['no homestead', 'investor owned', 'rental', 'investment property']
  },

  // ============================================
  // VALUE RANGES (dynamic - use with operator/value)
  // ============================================
  'market_value': {
    column: 'market_value',
    operators: ['>', '<', '>=', '<=', '=', 'BETWEEN'],
    description: 'Market value from appraisal'
  },
  'assessed_value': {
    column: 'assessed_total_value',
    operators: ['>', '<', '>=', '<=', '=', 'BETWEEN'],
    description: 'Assessed value for tax purposes'
  },
  'land_value': {
    column: 'land_value',
    operators: ['>', '<', '>=', '<=', '=', 'BETWEEN'],
    description: 'Land value component'
  },

  // ============================================
  // SIZE (dynamic - use with operator/value)
  // ============================================
  'acres': {
    column: 'acres_calc',
    operators: ['>', '<', '>=', '<=', '=', 'BETWEEN'],
    description: 'Lot size in acres'
  },
  'sqft': {
    column: 'acres_calc',
    operators: ['>', '<', '>=', '<=', '=', 'BETWEEN'],
    transform: (sqft) => sqft / 43560,  // Convert sqft to acres
    description: 'Lot size (converted from sqft to acres)'
  },

  // ============================================
  // SPATIAL (special handling)
  // ============================================
  'opportunity_zone': {
    column: null,
    spatial: true,
    table: 'opportunity_zones',
    description: 'Located in a Qualified Opportunity Zone'
  },
  'near_highway': {
    column: null,
    spatial: true,
    table: 'reference_geometries',
    featureType: 'highway',
    description: 'Near a highway reference geometry'
  }
};

/**
 * Get mapping for an abstract attribute
 * @param {string} attribute - Abstract attribute name
 * @returns {object|null} - Mapping object or null
 */
export function getMapping(attribute) {
  const normalized = attribute.toLowerCase().replace(/[_\s-]+/g, '_');

  // Direct match
  if (ATTRIBUTE_MAP[normalized]) {
    return ATTRIBUTE_MAP[normalized];
  }

  // Check aliases
  for (const [key, mapping] of Object.entries(ATTRIBUTE_MAP)) {
    if (mapping.aliases?.some(alias =>
      alias.toLowerCase().replace(/[_\s-]+/g, '_') === normalized
    )) {
      return { ...mapping, matchedAs: key };
    }
  }

  return null;
}

/**
 * Map an abstract filter to SQL condition
 * @param {object} filter - { attribute, operator?, value? }
 * @returns {object|null} - { column, operator, value, type } or null
 */
export function mapFilter(filter) {
  const { attribute, operator, value } = filter;

  const mapping = getMapping(attribute);
  if (!mapping) {
    console.warn(`[attributeMap] Unknown attribute: ${attribute}`);
    return null;
  }

  // Handle spatial filters specially
  if (mapping.spatial) {
    return {
      type: 'spatial',
      table: mapping.table,
      featureType: mapping.featureType,
      description: mapping.description
    };
  }

  // Determine final value
  let finalValue = mapping.value !== undefined ? mapping.value : value;
  if (mapping.transform && value !== undefined) {
    finalValue = mapping.transform(value);
  }

  // Determine final operator
  const finalOperator = mapping.operator || operator || '=';

  return {
    type: 'condition',
    column: mapping.column,
    operator: finalOperator,
    value: finalValue,
    description: mapping.description
  };
}

/**
 * Get all available attributes for documentation
 */
export function getAvailableAttributes() {
  return Object.entries(ATTRIBUTE_MAP).map(([key, mapping]) => ({
    name: key,
    column: mapping.column,
    description: mapping.description,
    aliases: mapping.aliases || []
  }));
}

export default {
  ATTRIBUTE_MAP,
  getMapping,
  mapFilter,
  getAvailableAttributes
};
