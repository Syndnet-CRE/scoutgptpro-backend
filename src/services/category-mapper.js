/**
 * Maps query keywords to MapServer categories
 * Returns matching categories based on natural language query
 */

// Category keyword mappings
const CATEGORY_KEYWORDS = {
  'Zoning': [
    'zoning', 'zone', 'zones', 'land use', 'planning', 'comprehensive plan',
    'future land use', 'overlay', 'district', 'designation', 'rezoning'
  ],
  'Parcels': [
    'parcel', 'parcels', 'lot', 'lots', 'property', 'properties', 
    'tax parcel', 'plat', 'subdivision', 'land parcel', 'cadastral'
  ],
  'Floodplain': [
    'flood', 'floodplain', 'flood zone', 'fema', 'flood map', '100-year flood',
    'floodway', 'flood hazard', 'base flood elevation', 'bfe', 'firm'
  ],
  'Sewer Utilities': [
    'sewer', 'wastewater', 'sanitary sewer', 'sewer line', 'sewer main',
    'sewage', 'sewer system', 'wastewater collection', 'sewer infrastructure'
  ],
  'Water Utilities': [
    'water', 'water line', 'water main', 'water system', 'water distribution',
    'potable water', 'water infrastructure', 'waterline', 'water service'
  ],
  'Gas Utilities': [
    'gas', 'natural gas', 'gas line', 'gas main', 'gas service',
    'gas distribution', 'gas infrastructure', 'gas utility'
  ],
  'Buildings': [
    'building', 'buildings', 'structure', 'structures', 'footprint',
    'building footprint', 'constructed', 'improvements'
  ],
  'Wetlands': [
    'wetland', 'wetlands', 'marsh', 'swamp', 'bog', 'riparian',
    'aquatic resource', 'jurisdictional wetland', 'waters of the us', 'wotus'
  ],
  'Permits': [
    'permit', 'permits', 'permission', 'authorization', 'approval',
    'building permit', 'construction permit', 'development permit'
  ],
  'Final Extraction': [
    'extraction', 'mining', 'quarry', 'gravel', 'sand', 'mineral',
    'aggregate', 'excavation'
  ]
};

/**
 * Extract MapServer categories from a natural language query
 * @param {string} query - Natural language query
 * @returns {string[]} - Array of matching category names
 */
export function extractCategories(query) {
  if (!query) return [];
  
  const queryLower = query.toLowerCase();
  const matchedCategories = [];
  const matches = {}; // Track which keywords matched for logging
  
  // Check each category's keywords
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const matchedKeywords = keywords.filter(keyword => 
      queryLower.includes(keyword.toLowerCase())
    );
    
    if (matchedKeywords.length > 0) {
      matchedCategories.push(category);
      matches[category] = matchedKeywords;
    }
  }
  
  // Log matches for debugging
  if (matchedCategories.length > 0) {
    console.log(`🎯 Category extraction from query: "${query}"`);
    matchedCategories.forEach(category => {
      console.log(`   ✓ ${category}: matched keywords [${matches[category].join(', ')}]`);
    });
  } else {
    console.log(`⚠️ No specific categories detected in query: "${query}"`);
    console.log(`   Will search all categories`);
  }
  
  return matchedCategories;
}

/**
 * Get all available categories
 * @returns {string[]} - Array of all category names
 */
export function getAllCategories() {
  return Object.keys(CATEGORY_KEYWORDS);
}

/**
 * Check if a query is asking for infrastructure/utilities
 * @param {string} query - Natural language query
 * @returns {boolean}
 */
export function isInfrastructureQuery(query) {
  const infraKeywords = [
    'utility', 'utilities', 'infrastructure', 'sewer', 'water', 'gas',
    'electric', 'power', 'telecom', 'fiber', 'line', 'main', 'pipe'
  ];
  
  const queryLower = query.toLowerCase();
  return infraKeywords.some(keyword => queryLower.includes(keyword));
}

/**
 * Check if a query is asking for regulatory/planning data
 * @param {string} query - Natural language query
 * @returns {boolean}
 */
export function isRegulatoryQuery(query) {
  const regKeywords = [
    'zoning', 'zone', 'permit', 'regulation', 'restriction', 'overlay',
    'planning', 'land use', 'comprehensive plan', 'flood', 'wetland'
  ];
  
  const queryLower = query.toLowerCase();
  return regKeywords.some(keyword => queryLower.includes(keyword));
}


