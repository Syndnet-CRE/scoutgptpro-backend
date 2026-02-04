// src/services/census/index.js
// Census Bureau API integration for demographic data

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env file if not already loaded
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const CENSUS_API_KEY = process.env.CENSUS_API_KEY;

// Debug: Log if API key is missing (only in development)
if (!CENSUS_API_KEY && process.env.NODE_ENV !== 'production') {
  console.warn('[Census Service] CENSUS_API_KEY not found in environment variables');
}

const CENSUS_BASE_URL = 'https://api.census.gov/data';
const ACS_YEAR = '2022';
const ACS_DATASET = 'acs/acs5';
const CENSUS_GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';

const DEMOGRAPHIC_VARS = {
  'B01003_001E': 'total_population',
  'B19013_001E': 'median_household_income',
  'B01002_001E': 'median_age',
  'B25001_001E': 'total_housing_units',
  'B25002_002E': 'occupied_housing_units',
  'B25002_003E': 'vacant_housing_units',
  'B25003_002E': 'owner_occupied_units',
  'B25003_003E': 'renter_occupied_units',
  'B25077_001E': 'median_home_value',
  'B25064_001E': 'median_gross_rent'
};

/**
 * Get census tract GEOID from coordinates using Census Geocoder API
 * 
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<object>} Object with state, county, and tract FIPS codes
 */
export async function getCensusTractFromCoords(lat, lng) {
  if (!lat || !lng) {
    throw new Error('Latitude and longitude are required');
  }

  try {
    // Census Geocoder API format: x=longitude&y=latitude&benchmark=Public_AR_Current&vintage=Current_Current&format=json
    const url = new URL(CENSUS_GEOCODER_URL);
    url.searchParams.set('x', lng.toString()); // Note: x is longitude
    url.searchParams.set('y', lat.toString()); // Note: y is latitude
    url.searchParams.set('benchmark', 'Public_AR_Current');
    url.searchParams.set('vintage', 'Current_Current');
    url.searchParams.set('format', 'json');

    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Census Geocoder API failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    if (!data || !data.result || !data.result.geographies) {
      throw new Error('Invalid response from Census Geocoder API');
    }

    const geographies = data.result.geographies;
    
    // Get census tract information
    const tracts = geographies['Census Tracts'];
    if (!tracts || tracts.length === 0) {
      throw new Error('No census tract found for coordinates');
    }

    const tract = tracts[0];
    const geoid = tract.GEOID;
    
    // Extract FIPS codes from GEOID (11 digits: 2 state + 3 county + 6 tract)
    const stateFips = geoid.substring(0, 2);
    const countyFips = geoid.substring(2, 5);
    const tractFips = geoid.substring(5, 11);

    return {
      state: stateFips,
      county: countyFips,
      tract: tractFips,
      geoid: geoid,
      name: tract.NAME || null
    };
  } catch (error) {
    console.error('[Census] Error getting tract from coordinates:', error);
    throw new Error(`Failed to get census tract: ${error.message}`);
  }
}

/**
 * Fetch demographic data from Census ACS API
 * 
 * @param {string} state - State FIPS code (2 digits)
 * @param {string} county - County FIPS code (3 digits)
 * @param {string} tract - Census tract FIPS code (6 digits)
 * @returns {Promise<object>} Demographic data object
 */
export async function getDemographicData(state, county, tract) {
  if (!state || !county || !tract) {
    throw new Error('State, county, and tract FIPS codes are required');
  }

  try {
    // Build variable list
    const variables = Object.keys(DEMOGRAPHIC_VARS).join(',');
    
    // Census API URL format: /data/{year}/{dataset}?get={variables}&for=tract:{tract}&in=state:{state}+county:{county}
    // Note: API key is optional for public Census data, but recommended for higher rate limits
    const url = new URL(`${CENSUS_BASE_URL}/${ACS_YEAR}/${ACS_DATASET}`);
    url.searchParams.set('get', variables);
    url.searchParams.set('for', `tract:${tract}`);
    url.searchParams.set('in', `state:${state} county:${county}`);
    
    // Add API key if available (optional but recommended)
    if (CENSUS_API_KEY) {
      url.searchParams.set('key', CENSUS_API_KEY);
    }

    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Census API failed: ${response.status} ${errorText.substring(0, 500)}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      throw new Error(`Census API returned non-JSON response: ${text.substring(0, 500)}`);
    }

    const data = await response.json();
    
    // Census API returns array format: [headers, values]
    if (!Array.isArray(data) || data.length < 2) {
      throw new Error('Invalid response format from Census API');
    }

    const headers = data[0];
    const values = data[1];

    // Map values to object
    const result = {};
    headers.forEach((header, index) => {
      const value = values[index];
      
      // Convert numeric strings to numbers, handle null/empty
      if (header in DEMOGRAPHIC_VARS) {
        const fieldName = DEMOGRAPHIC_VARS[header];
        const numValue = value === null || value === '' || value === '-999999999' 
          ? null 
          : parseInt(value, 10);
        result[fieldName] = isNaN(numValue) ? null : numValue;
      } else if (header === 'state') {
        result.state_fips = value;
      } else if (header === 'county') {
        result.county_fips = value;
      } else if (header === 'tract') {
        result.tract_fips = value;
      }
    });

    // Calculate derived fields
    if (result.total_housing_units && result.occupied_housing_units) {
      result.vacancy_rate = result.total_housing_units > 0 
        ? ((result.total_housing_units - result.occupied_housing_units) / result.total_housing_units * 100).toFixed(2)
        : null;
    }

    if (result.occupied_housing_units && result.owner_occupied_units) {
      result.owner_occupancy_rate = result.occupied_housing_units > 0
        ? ((result.owner_occupied_units / result.occupied_housing_units) * 100).toFixed(2)
        : null;
    }

    if (result.occupied_housing_units && result.renter_occupied_units) {
      result.renter_occupancy_rate = result.occupied_housing_units > 0
        ? ((result.renter_occupied_units / result.occupied_housing_units) * 100).toFixed(2)
        : null;
    }

    // Build GEOID
    result.geoid = `${result.state_fips}${result.county_fips}${result.tract_fips}`;

    return result;
  } catch (error) {
    console.error('[Census] Error fetching demographic data:', error);
    throw new Error(`Failed to fetch demographic data: ${error.message}`);
  }
}

/**
 * Get demographics for a location by coordinates
 * Combines FCC API (for tract lookup) and Census API (for demographics)
 * 
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<object>} Complete demographic data with location info
 */
export async function getDemographicsForLocation(lat, lng) {
  try {
    // Step 1: Get census tract from coordinates
    const tractInfo = await getCensusTractFromCoords(lat, lng);
    
    // Step 2: Get demographic data
    // tractInfo.tract is already 6 digits from Census Geocoder
    const demographics = await getDemographicData(
      tractInfo.state,
      tractInfo.county,
      tractInfo.tract
    );

    // Combine results
    return {
      location: {
        latitude: lat,
        longitude: lng,
        geoid: tractInfo.geoid,
        state_fips: tractInfo.state,
        county_fips: tractInfo.county,
        tract_fips: tractInfo.tract,
        tract_name: tractInfo.name || null
      },
      demographics: {
        ...demographics,
        data_year: ACS_YEAR,
        data_source: 'US Census Bureau ACS 5-Year Estimates'
      }
    };
  } catch (error) {
    console.error('[Census] Error getting demographics for location:', error);
    throw error;
  }
}
