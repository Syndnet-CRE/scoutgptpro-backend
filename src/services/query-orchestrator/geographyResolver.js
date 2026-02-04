/**
 * Geography Resolver Service
 * Converts location references to spatial query parameters
 */

// In-memory cache for geocoding results
const geocodeCache = new Map();

// Travis County ZIP code bounding boxes [minLng, minLat, maxLng, maxLat]
const TRAVIS_ZIP_BBOXES = {
  '78701': [-97.7550, 30.2600, -97.7350, 30.2800],
  '78702': [-97.7350, 30.2500, -97.7050, 30.2800],
  '78703': [-97.7850, 30.2700, -97.7500, 30.3100],
  '78704': [-97.7800, 30.2200, -97.7400, 30.2600],
  '78705': [-97.7550, 30.2800, -97.7250, 30.3050],
  '78721': [-97.7050, 30.2600, -97.6700, 30.2900],
  '78722': [-97.7250, 30.2800, -97.7000, 30.3000],
  '78723': [-97.7000, 30.2900, -97.6600, 30.3300],
  '78724': [-97.6600, 30.2700, -97.6100, 30.3200],
  '78725': [-97.6700, 30.2200, -97.6200, 30.2700],
  '78726': [-97.8500, 30.4100, -97.7900, 30.4600],
  '78727': [-97.7200, 30.4200, -97.6700, 30.4600],
  '78728': [-97.6900, 30.4400, -97.6400, 30.4900],
  '78729': [-97.7700, 30.4500, -97.7200, 30.4900],
  '78730': [-97.8200, 30.3600, -97.7700, 30.4100],
  '78731': [-97.7800, 30.3200, -97.7300, 30.3700],
  '78732': [-97.9000, 30.3800, -97.8300, 30.4300],
  '78733': [-97.8700, 30.3000, -97.8100, 30.3600],
  '78734': [-97.9500, 30.3800, -97.8800, 30.4500],
  '78735': [-97.8700, 30.2200, -97.8100, 30.2800],
  '78736': [-97.9200, 30.2000, -97.8500, 30.2600],
  '78737': [-97.9500, 30.1500, -97.8700, 30.2200],
  '78738': [-97.9800, 30.2800, -97.9000, 30.3500],
  '78739': [-97.8800, 30.1700, -97.8200, 30.2300],
  '78741': [-97.7400, 30.2100, -97.7000, 30.2500],
  '78742': [-97.7000, 30.2200, -97.6500, 30.2600],
  '78744': [-97.7600, 30.1600, -97.7100, 30.2100],
  '78745': [-97.8100, 30.1800, -97.7500, 30.2300],
  '78746': [-97.8300, 30.2600, -97.7800, 30.3100],
  '78747': [-97.7400, 30.1200, -97.6800, 30.1700],
  '78748': [-97.8400, 30.1400, -97.7700, 30.1900],
  '78749': [-97.8600, 30.2000, -97.8000, 30.2500],
  '78750': [-97.7700, 30.4000, -97.7200, 30.4500],
  '78751': [-97.7350, 30.3050, -97.7100, 30.3300],
  '78752': [-97.7100, 30.3150, -97.6800, 30.3450],
  '78753': [-97.6900, 30.3350, -97.6400, 30.3800],
  '78754': [-97.6600, 30.3400, -97.6100, 30.3900],
  '78756': [-97.7450, 30.3200, -97.7200, 30.3450],
  '78757': [-97.7400, 30.3400, -97.7100, 30.3700],
  '78758': [-97.7200, 30.3700, -97.6800, 30.4100],
  '78759': [-97.7700, 30.3900, -97.7200, 30.4300]
};

// Known Austin landmarks with coordinates [lng, lat]
const AUSTIN_LANDMARKS = {
  'downtown': { coords: [-97.7431, 30.2672], label: 'Downtown Austin' },
  'downtown austin': { coords: [-97.7431, 30.2672], label: 'Downtown Austin' },
  'capitol': { coords: [-97.7404, 30.2747], label: 'Texas State Capitol' },
  'ut': { coords: [-97.7341, 30.2849], label: 'UT Austin' },
  'ut austin': { coords: [-97.7341, 30.2849], label: 'UT Austin' },
  'university': { coords: [-97.7341, 30.2849], label: 'UT Austin' },
  'domain': { coords: [-97.7195, 30.4021], label: 'The Domain' },
  'the domain': { coords: [-97.7195, 30.4021], label: 'The Domain' },
  'mueller': { coords: [-97.7025, 30.2988], label: 'Mueller' },
  'south congress': { coords: [-97.7503, 30.2482], label: 'South Congress' },
  'soco': { coords: [-97.7503, 30.2482], label: 'South Congress' },
  'east austin': { coords: [-97.7150, 30.2650], label: 'East Austin' },
  'zilker': { coords: [-97.7729, 30.2669], label: 'Zilker Park' },
  'barton springs': { coords: [-97.7710, 30.2640], label: 'Barton Springs' },
  'airport': { coords: [-97.6664, 30.1975], label: 'Austin Airport' },
  'abia': { coords: [-97.6664, 30.1975], label: 'Austin Airport' },
  'arboretum': { coords: [-97.7450, 30.3900], label: 'The Arboretum' },
  'round rock': { coords: [-97.6789, 30.5083], label: 'Round Rock' },
  'pflugerville': { coords: [-97.6200, 30.4393], label: 'Pflugerville' },
  'cedar park': { coords: [-97.8203, 30.5052], label: 'Cedar Park' },
  'lakeway': { coords: [-97.9795, 30.3635], label: 'Lakeway' },
  'bee cave': { coords: [-97.9428, 30.3085], label: 'Bee Cave' },
  'westlake': { coords: [-97.8017, 30.2977], label: 'West Lake Hills' }
};

/**
 * Parse distance from text like "1 mile" or "5 km"
 * @returns {number|null} Distance in meters
 */
function parseDistance(text) {
  if (!text) return null;
  
  const patterns = [
    { regex: /(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)/i, multiplier: 1609.34 },
    { regex: /(\d+(?:\.\d+)?)\s*(?:km|kilometer|kilometers)/i, multiplier: 1000 },
    { regex: /(\d+(?:\.\d+)?)\s*(?:m|meter|meters)(?!\w)/i, multiplier: 1 },
    { regex: /(\d+(?:\.\d+)?)\s*(?:ft|foot|feet)/i, multiplier: 0.3048 },
    { regex: /(\d+(?:\.\d+)?)\s*(?:block|blocks)/i, multiplier: 100 }
  ];
  
  for (const { regex, multiplier } of patterns) {
    const match = text.match(regex);
    if (match) {
      return parseFloat(match[1]) * multiplier;
    }
  }
  
  return null;
}

/**
 * Extract ZIP code from text
 */
function extractZipCode(text) {
  const match = text.match(/\b(78[0-9]{3})\b/);
  return match ? match[1] : null;
}

/**
 * Find landmark match in text
 */
function findLandmark(text) {
  const normalized = text.toLowerCase().trim();
  
  // Direct match
  if (AUSTIN_LANDMARKS[normalized]) {
    return AUSTIN_LANDMARKS[normalized];
  }
  
  // Partial matches
  for (const [key, value] of Object.entries(AUSTIN_LANDMARKS)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  
  return null;
}

/**
 * Geocode an address using Nominatim
 */
async function geocodeAddress(address) {
  const cacheKey = address.toLowerCase().trim();
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }
  
  try {
    const encoded = encodeURIComponent(address + ', Austin, TX');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`,
      {
        headers: { 'User-Agent': 'ScoutGPT/1.0' },
        signal: controller.signal
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data && data.length > 0) {
      const result = {
        coords: [parseFloat(data[0].lon), parseFloat(data[0].lat)],
        label: data[0].display_name,
        source: 'nominatim'
      };
      geocodeCache.set(cacheKey, result);
      return result;
    }
  } catch (error) {
    console.warn('[GeographyResolver] Geocoding failed:', error.message);
  }
  
  return null;
}

/**
 * Main geography resolution function
 * 
 * @param {string} locationRef - Location reference text
 * @param {object} options - Optional parameters
 * @returns {Promise<object|null>} Resolved geography
 */
export async function resolveGeography(locationRef, options = {}) {
  if (!locationRef || typeof locationRef !== 'string') {
    return null;
  }
  
  const text = locationRef.toLowerCase().trim();
  const defaultDistance = options.defaultDistance || 5000;
  
  // 1. Try ZIP code
  const zipCode = extractZipCode(text);
  if (zipCode && TRAVIS_ZIP_BBOXES[zipCode]) {
    const bbox = TRAVIS_ZIP_BBOXES[zipCode];
    return {
      type: 'bbox',
      coordinates: bbox,
      label: `ZIP code ${zipCode}`,
      confidence: 0.95,
      source: 'zip_lookup'
    };
  }
  
  // 2. Try landmark
  const landmark = findLandmark(text);
  if (landmark) {
    const distance = parseDistance(text) || defaultDistance;
    return {
      type: 'point',
      coordinates: landmark.coords,
      distance_meters: distance,
      label: landmark.label,
      confidence: 0.9,
      source: 'landmark'
    };
  }
  
  // 3. Try geocoding
  const geocoded = await geocodeAddress(text);
  if (geocoded) {
    return {
      type: 'point',
      coordinates: geocoded.coords,
      distance_meters: defaultDistance,
      label: geocoded.label,
      confidence: 0.7,
      source: 'geocoded'
    };
  }
  
  return null;
}

/**
 * Convert resolved geography to PostGIS WHERE clause
 */
export function toSpatialCondition(geography, geometryColumn = 'geom_centroid') {
  if (!geography) return null;
  
  if (geography.type === 'bbox') {
    const [minLng, minLat, maxLng, maxLat] = geography.coordinates;
    return {
      clause: `ST_Intersects(${geometryColumn}, ST_MakeEnvelope($1, $2, $3, $4, 4326))`,
      params: [minLng, minLat, maxLng, maxLat]
    };
  }
  
  if (geography.type === 'point') {
    const [lng, lat] = geography.coordinates;
    const distance = geography.distance_meters || 5000;
    return {
      clause: `ST_DWithin(${geometryColumn}::geography, ST_Point($1, $2)::geography, $3)`,
      params: [lng, lat, distance]
    };
  }
  
  return null;
}

export default { resolveGeography, toSpatialCondition, TRAVIS_ZIP_BBOXES, AUSTIN_LANDMARKS };
