// src/services/webSearch/index.js
// Web search service for enriching property data with external information

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY;
const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';

/**
 * Search the web for information using Brave Search API
 * 
 * @param {string} query - Search query
 * @param {object} options - Search options
 * @param {number} options.count - Number of results to return (default: 5)
 * @param {string} options.freshness - Time filter: 'pd' (past day), 'pw' (past week), 'pm' (past month), 'py' (past year)
 * @returns {Promise<object>} Search results with source information
 */
export async function webSearch(query, options = {}) {
  const { count = 5, freshness = 'pw' } = options; // pw = past week by default
  
  if (!BRAVE_API_KEY) {
    console.warn('[webSearch] No Brave API key configured - web search disabled');
    return { 
      results: [], 
      source: 'none',
      error: 'BRAVE_SEARCH_API_KEY not configured'
    };
  }
  
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return { results: [], source: 'none', error: 'Invalid query' };
  }
  
  try {
    const url = new URL(BRAVE_SEARCH_URL);
    url.searchParams.set('q', query.trim());
    url.searchParams.set('count', Math.min(count, 20)); // Brave API max is 20
    url.searchParams.set('freshness', freshness);
    
    const response = await fetch(url, {
      headers: {
        'X-Subscription-Token': BRAVE_API_KEY,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Brave search failed: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();
    
    // Transform Brave API response to consistent format
    const results = (data.web?.results || []).map(r => ({
      title: r.title || 'Untitled',
      url: r.url || '',
      description: r.description || '',
      publishedDate: r.age || null,
      metaUrl: r.meta_url || null
    }));
    
    return {
      results,
      source: 'brave',
      query: query.trim(),
      count: results.length
    };
  } catch (error) {
    console.error('[webSearch] Error:', error.message);
    return { 
      results: [], 
      source: 'error', 
      error: error.message,
      query: query.trim()
    };
  }
}

/**
 * Search for real estate market data for a specific location
 * 
 * @param {string} location - Location (address, ZIP code, or area name)
 * @param {string} propertyType - Property type (commercial, land, residential, etc.)
 * @param {object} options - Additional search options
 * @returns {Promise<object>} Aggregated market data from multiple searches
 */
export async function searchMarketData(location, propertyType = 'commercial', options = {}) {
  if (!location || typeof location !== 'string') {
    return {
      marketNews: [],
      developmentNews: [],
      zoningNews: [],
      error: 'Invalid location'
    };
  }
  
  const { freshness = 'pm' } = options; // Past month for market data
  
  // Construct targeted search queries
  const queries = [
    `${location} ${propertyType} real estate market 2024 2025`,
    `${location} commercial development news`,
    `${location} zoning changes development`
  ];
  
  try {
    const results = await Promise.all(
      queries.map(q => webSearch(q, { count: 3, freshness }))
    );
    
    return {
      marketNews: results[0].results || [],
      developmentNews: results[1].results || [],
      zoningNews: results[2].results || [],
      searchedAt: new Date().toISOString(),
      location,
      propertyType
    };
  } catch (error) {
    console.error('[webSearch] Error in searchMarketData:', error);
    return {
      marketNews: [],
      developmentNews: [],
      zoningNews: [],
      error: error.message,
      location,
      propertyType
    };
  }
}

/**
 * Enrich a property object with web search data
 * 
 * @param {object} property - Property object (must have address or location info)
 * @param {object} options - Search options
 * @returns {Promise<object>} Property object with webEnrichment field added
 */
export async function enrichPropertyWithWeb(property, options = {}) {
  if (!property || typeof property !== 'object') {
    return property;
  }
  
  // Extract location information from property
  const address = property.address || property.situs_address || property.siteAddress;
  const zip = property.zip || property.mail_zip || property.siteZip;
  const city = property.city || property.siteCity;
  const state = property.state || property.siteState || 'TX';
  
  // Build location string
  let location = address;
  if (!location && city) {
    location = `${city} ${state}`;
  }
  if (!location && zip) {
    location = `Austin TX ${zip}`;
  }
  if (!location) {
    location = 'Austin TX'; // Default fallback
  }
  
  // Determine property type
  const propertyType = property.propertyType || 
                       property.assetClass || 
                       property.asset_class || 
                       'commercial';
  
  // Search for market data
  const webData = await searchMarketData(location, propertyType, options);
  
  return {
    ...property,
    webEnrichment: {
      searchedAt: new Date().toISOString(),
      location,
      propertyType,
      ...webData
    }
  };
}

/**
 * Search for property-specific information (sales, listings, news)
 * 
 * @param {string} address - Property address
 * @param {string} parcelId - Optional parcel ID
 * @returns {Promise<object>} Property-specific search results
 */
export async function searchPropertyInfo(address, parcelId = null) {
  if (!address) {
    return { results: [], error: 'Address required' };
  }
  
  const queries = [
    `"${address}" real estate`,
    `"${address}" property sale`,
    parcelId ? `parcel ${parcelId} ${address}` : null
  ].filter(Boolean);
  
  try {
    const results = await Promise.all(
      queries.map(q => webSearch(q, { count: 5, freshness: 'py' })) // Past year for property info
    );
    
    return {
      propertySearches: results,
      address,
      parcelId,
      searchedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('[webSearch] Error in searchPropertyInfo:', error);
    return {
      propertySearches: [],
      error: error.message,
      address,
      parcelId
    };
  }
}

export default {
  webSearch,
  searchMarketData,
  enrichPropertyWithWeb,
  searchPropertyInfo
};
