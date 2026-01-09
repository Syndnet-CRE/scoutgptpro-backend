/**
 * ZIP Code Resolver Service
 * 
 * Resolves Travis County ZIP codes and city names to bounding boxes
 * Used to convert ZIP codes in user queries to spatial filters
 */

/**
 * Travis County ZIP Code to Bounding Box Mapping
 * Format: [minLng, minLat, maxLng, maxLat]
 * 
 * Source: Approximate bounding boxes for Austin-area ZIP codes
 * Note: These are approximate and may need refinement
 */
export const TRAVIS_ZIP_BBOXES = {
  // Downtown/Central Austin
  '78701': [-97.7600, 30.2600, -97.7300, 30.2800], // Downtown
  '78702': [-97.7200, 30.2500, -97.6900, 30.2800], // East Austin
  '78703': [-97.7700, 30.2700, -97.7400, 30.3000], // West Austin
  '78704': [-97.7600, 30.2200, -97.7200, 30.2600], // South Austin
  '78705': [-97.7400, 30.2800, -97.7100, 30.3100], // UT/Campus
  
  // North Austin
  '78721': [-97.7000, 30.2800, -97.6700, 30.3100], // North Austin
  '78722': [-97.7200, 30.2800, -97.6900, 30.3100], // North Central
  '78723': [-97.7000, 30.3100, -97.6700, 30.3400], // North Austin
  '78724': [-97.6800, 30.2800, -97.6500, 30.3100], // Northeast
  '78725': [-97.6600, 30.2500, -97.6300, 30.2800], // East Austin
  '78726': [-97.8000, 30.4000, -97.7700, 30.4300], // Northwest
  '78727': [-97.8000, 30.3700, -97.7700, 30.4000], // Northwest
  '78728': [-97.8300, 30.4000, -97.8000, 30.4300], // Northwest
  '78729': [-97.8000, 30.3400, -97.7700, 30.3700], // Northwest
  '78730': [-97.8300, 30.3700, -97.8000, 30.4000], // Northwest
  '78731': [-97.7700, 30.3000, -97.7400, 30.3300], // Northwest Hills
  '78732': [-97.9000, 30.3500, -97.8700, 30.3800], // Lake Travis
  '78733': [-97.9000, 30.3200, -97.8700, 30.3500], // Lake Travis
  '78734': [-97.9300, 30.3500, -97.9000, 30.3800], // Lake Travis
  '78735': [-97.8300, 30.2000, -97.8000, 30.2300], // Southwest
  '78736': [-97.8600, 30.2000, -97.8300, 30.2300], // Southwest
  '78737': [-97.8900, 30.1700, -97.8600, 30.2000], // Southwest
  '78738': [-97.9200, 30.2000, -97.8900, 30.2300], // Southwest
  '78739': [-97.8600, 30.2300, -97.8300, 30.2600], // Southwest
  '78741': [-97.7200, 30.2000, -97.6900, 30.2300], // South Austin
  '78744': [-97.7500, 30.1700, -97.7200, 30.2000], // South Austin
  '78745': [-97.7800, 30.2000, -97.7500, 30.2300], // South Austin
  '78746': [-97.8100, 30.2300, -97.7800, 30.2600], // West Austin
  '78747': [-97.7200, 30.1400, -97.6900, 30.1700], // Southeast
  '78748': [-97.7500, 30.1400, -97.7200, 30.1700], // Southeast
  '78749': [-97.7800, 30.1700, -97.7500, 30.2000], // Southwest
  '78750': [-97.8000, 30.3000, -97.7700, 30.3300], // Northwest
  '78751': [-97.7400, 30.3100, -97.7100, 30.3400], // North Central
  '78752': [-97.7000, 30.3100, -97.6700, 30.3400], // Northeast
  '78753': [-97.6800, 30.3400, -97.6500, 30.3700], // Northeast
  '78754': [-97.7000, 30.3400, -97.6700, 30.3700], // Northeast
  '78756': [-97.7400, 30.3000, -97.7100, 30.3300], // North Central
  '78757': [-97.7400, 30.3400, -97.7100, 30.3700], // North Central
  '78758': [-97.7000, 30.3700, -97.6700, 30.4000], // Northeast
  '78759': [-97.7700, 30.3300, -97.7400, 30.3600], // Northwest (Research Blvd area)
  
  // Surrounding areas
  '78660': [-97.9500, 30.4000, -97.9200, 30.4300], // Pflugerville
  '78664': [-97.9800, 30.3500, -97.9500, 30.3800], // Round Rock (partial)
  '78681': [-97.9200, 30.2300, -97.8900, 30.2600], // Spicewood
};

/**
 * City/Neighborhood to Bounding Box Mapping
 */
export const TRAVIS_CITY_BBOXES = {
  'austin': [-97.9000, 30.1400, -97.6300, 30.4300], // Full Austin area
  'downtown austin': [-97.7600, 30.2600, -97.7300, 30.2800],
  'northwest austin': [-97.8300, 30.3000, -97.7700, 30.4000],
  'northeast austin': [-97.7000, 30.2800, -97.6500, 30.4000],
  'south austin': [-97.7800, 30.1400, -97.7200, 30.2600],
  'southwest austin': [-97.9200, 30.1400, -97.8000, 30.2600],
  'east austin': [-97.7200, 30.2500, -97.6800, 30.3100],
  'west austin': [-97.8100, 30.2300, -97.7400, 30.3300],
  'pflugerville': [-97.9500, 30.4000, -97.9200, 30.4300],
  'round rock': [-97.9800, 30.3500, -97.9200, 30.4300], // Partial (extends into Williamson)
};

/**
 * Check if value is a valid 5-digit ZIP code
 */
export function isZipCode(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return false;
  }
  
  const zipStr = String(value).trim();
  return /^\d{5}$/.test(zipStr);
}

/**
 * Check if value is a valid bounding box array
 */
export function isValidBbox(value) {
  if (!Array.isArray(value)) {
    return false;
  }
  
  if (value.length !== 4) {
    return false;
  }
  
  return value.every(v => typeof v === 'number' && !isNaN(v));
}

/**
 * Resolve ZIP code to bounding box
 * 
 * @param {string|number} zipCode - 5-digit ZIP code
 * @returns {number[]|null} Bounding box [minLng, minLat, maxLng, maxLat] or null
 */
export function resolveZipToBbox(zipCode) {
  if (!isZipCode(zipCode)) {
    return null;
  }
  
  const zipStr = String(zipCode).trim();
  return TRAVIS_ZIP_BBOXES[zipStr] || null;
}

/**
 * Resolve city name to bounding box
 * 
 * @param {string} cityName - City or neighborhood name
 * @returns {number[]|null} Bounding box [minLng, minLat, maxLng, maxLat] or null
 */
export function resolveCityToBbox(cityName) {
  if (!cityName || typeof cityName !== 'string') {
    return null;
  }
  
  const cityLower = cityName.toLowerCase().trim();
  return TRAVIS_CITY_BBOXES[cityLower] || null;
}

/**
 * Preprocess tool input to resolve ZIP codes in bbox field
 * 
 * This function handles the case where Claude passes a ZIP code as a string
 * in the bbox field instead of a proper [minLng, minLat, maxLng, maxLat] array.
 * 
 * @param {Object} toolInput - Tool input object from Claude
 * @returns {Object} Processed tool input with resolved bbox
 */
export function preprocessToolInput(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') {
    return toolInput;
  }
  
  const processed = { ...toolInput };
  
  // Check if bbox is a ZIP code string
  if (toolInput.bbox) {
    // If bbox is a string, try to resolve as ZIP code
    if (typeof toolInput.bbox === 'string') {
      const resolvedBbox = resolveZipToBbox(toolInput.bbox);
      if (resolvedBbox) {
        processed.bbox = resolvedBbox;
        processed._bboxResolvedFrom = `ZIP ${toolInput.bbox}`;
      } else {
        // Try as city name
        const cityBbox = resolveCityToBbox(toolInput.bbox);
        if (cityBbox) {
          processed.bbox = cityBbox;
          processed._bboxResolvedFrom = `city "${toolInput.bbox}"`;
        } else {
          // Invalid - remove bbox to avoid SQL errors
          console.warn(`[zipCodeResolver] Could not resolve bbox value: ${toolInput.bbox}`);
          delete processed.bbox;
        }
      }
    }
    // If bbox is an array but invalid, try to fix or remove
    else if (Array.isArray(toolInput.bbox)) {
      if (!isValidBbox(toolInput.bbox)) {
        console.warn(`[zipCodeResolver] Invalid bbox array: ${JSON.stringify(toolInput.bbox)}`);
        delete processed.bbox;
      }
    }
  }
  
  // Also check for zip_code field (if added to tool schema)
  if (toolInput.zip_code && !toolInput.bbox) {
    const resolvedBbox = resolveZipToBbox(toolInput.zip_code);
    if (resolvedBbox) {
      processed.bbox = resolvedBbox;
      processed._bboxResolvedFrom = `ZIP ${toolInput.zip_code}`;
    }
  }
  
  return processed;
}

/**
 * Get all available ZIP codes
 */
export function getAvailableZipCodes() {
  return Object.keys(TRAVIS_ZIP_BBOXES).sort();
}

/**
 * Get all available city names
 */
export function getAvailableCities() {
  return Object.keys(TRAVIS_CITY_BBOXES).sort();
}

export default {
  TRAVIS_ZIP_BBOXES,
  TRAVIS_CITY_BBOXES,
  isZipCode,
  isValidBbox,
  resolveZipToBbox,
  resolveCityToBbox,
  preprocessToolInput,
  getAvailableZipCodes,
  getAvailableCities
};
