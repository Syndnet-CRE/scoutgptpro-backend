// src/services/enrichment/orchestrator.js

import pool from '../../db/pool.js';
import { webSearch, searchMarketData } from '../webSearch/index.js';
import { interpretZoning, getParcelConstraints } from '../zoning/interpreter.js';

/**
 * Enrich a property with data from all available sources
 * @param {string} parcelId - Parcel ID
 * @param {object} options - Enrichment options
 */
export async function enrichProperty(parcelId, options = {}) {
  const {
    includeGIS = true,
    includeOSM = true,
    includeWeb = true,
    osmRadius = 0.5 // miles
  } = options;
  
  const enrichment = {
    parcelId,
    enrichedAt: new Date().toISOString(),
    sources: []
  };
  
  // 1. DATABASE: Get base property data
  const dbResult = await pool.query(`
    SELECT * FROM parcel_features_travis WHERE parcel_id = $1
  `, [parcelId]);
  
  if (dbResult.rows.length === 0) {
    return { found: false, error: 'Parcel not found' };
  }
  
  enrichment.property = dbResult.rows[0];
  enrichment.sources.push('database');
  
  // 2. GIS: Get zoning constraints and overlays
  if (includeGIS) {
    try {
      const constraints = await getParcelConstraints(parcelId, pool);
      enrichment.zoning = constraints;
      enrichment.sources.push('gis');
      
      // Get flood zone info from gis_floodplain_austin table
      const floodResult = await pool.query(`
        SELECT zone_code as flood_zone, zone_desc as flood_zone_desc
        FROM gis_floodplain_austin
        WHERE ST_Intersects(geometry, (
          SELECT geom_centroid FROM parcel_features_travis WHERE parcel_id = $1
        ))
        LIMIT 1
      `, [parcelId]);
      
      if (floodResult.rows.length > 0) {
        enrichment.floodZone = floodResult.rows[0];
      }
    } catch (e) {
      console.warn('[enrichment] GIS query failed:', e.message);
    }
  }
  
  // 3. OSM: Get nearby POIs and amenities
  if (includeOSM) {
    try {
      const osmResult = await pool.query(`
        SELECT name, category, subcategory, address, phone, website,
               ST_Distance(
                 geom::geography,
                 (SELECT geom_centroid::geography FROM parcel_features_travis WHERE parcel_id = $1)
               ) / 1609.34 as distance_miles
        FROM osm_pois_travis
        WHERE ST_DWithin(
          geom::geography,
          (SELECT geom_centroid::geography FROM parcel_features_travis WHERE parcel_id = $1),
          $2 * 1609.34  -- Convert miles to meters
        )
        ORDER BY distance_miles
        LIMIT 20
      `, [parcelId, osmRadius]);
      
      enrichment.nearbyPOIs = osmResult.rows;
      enrichment.sources.push('osm');
      
      // Categorize POIs
      enrichment.nearbyAmenities = categorizePOIs(osmResult.rows);
    } catch (e) {
      console.warn('[enrichment] OSM query failed:', e.message);
    }
  }
  
  // 4. WEB: Get market data and news
  if (includeWeb) {
    try {
      const address = enrichment.property.situs_address;
      const zip = enrichment.property.mail_zip;
      const location = address || `Austin TX ${zip}`;
      
      const webData = await searchMarketData(location, 
        enrichment.property.asset_class || 'commercial'
      );
      
      enrichment.webData = webData;
      enrichment.sources.push('web');
    } catch (e) {
      console.warn('[enrichment] Web search failed:', e.message);
    }
  }
  
  return enrichment;
}

/**
 * Categorize POIs into useful groups
 */
function categorizePOIs(pois) {
  const categories = {
    retail: [],
    dining: [],
    services: [],
    transit: [],
    education: [],
    healthcare: [],
    recreation: [],
    other: []
  };
  
  for (const poi of pois) {
    const cat = poi.category?.toLowerCase() || '';
    const subcat = poi.subcategory?.toLowerCase() || '';
    
    if (cat.includes('retail') || cat.includes('shop')) {
      categories.retail.push(poi);
    } else if (cat.includes('restaurant') || cat.includes('food') || cat.includes('cafe')) {
      categories.dining.push(poi);
    } else if (cat.includes('transit') || cat.includes('bus') || cat.includes('rail')) {
      categories.transit.push(poi);
    } else if (cat.includes('school') || cat.includes('education')) {
      categories.education.push(poi);
    } else if (cat.includes('health') || cat.includes('medical') || cat.includes('hospital')) {
      categories.healthcare.push(poi);
    } else if (cat.includes('park') || cat.includes('recreation') || cat.includes('gym')) {
      categories.recreation.push(poi);
    } else if (cat.includes('service') || cat.includes('bank') || cat.includes('post')) {
      categories.services.push(poi);
    } else {
      categories.other.push(poi);
    }
  }
  
  return categories;
}

/**
 * Generate development feasibility analysis
 */
export async function analyzeDevelopmentFeasibility(parcelId) {
  const enriched = await enrichProperty(parcelId, {
    includeGIS: true,
    includeOSM: true,
    includeWeb: true,
    osmRadius: 1.0
  });
  
  if (!enriched.found && enriched.error) {
    return enriched;
  }
  
  const analysis = {
    parcelId,
    property: enriched.property,
    
    // Zoning Analysis
    zoningAnalysis: {
      currentZoning: enriched.zoning?.zoningCode,
      constraints: enriched.zoning?.constraints,
      developmentPotential: enriched.zoning?.zoning?.developmentPotential,
      summary: enriched.zoning?.zoning?.summary
    },
    
    // Site Characteristics
    siteCharacteristics: {
      acres: enriched.property.acres_calc,
      floodZone: enriched.floodZone?.flood_zone || enriched.property?.flood_zone || 'Unknown',
      currentUse: enriched.property.asset_class,
      improvements: enriched.property.improvement_value > 0 ? 'Improved' : 'Vacant/Unimproved'
    },
    
    // Location Analysis
    locationAnalysis: {
      nearbyRetail: enriched.nearbyAmenities?.retail?.length || 0,
      nearbyDining: enriched.nearbyAmenities?.dining?.length || 0,
      nearbyTransit: enriched.nearbyAmenities?.transit?.length || 0,
      walkabilityIndicator: calculateWalkability(enriched.nearbyAmenities)
    },
    
    // Market Context
    marketContext: enriched.webData || {},
    
    // Sources Used
    dataSources: enriched.sources,
    
    // Generated Timestamp
    analyzedAt: new Date().toISOString()
  };
  
  // Generate recommendation
  analysis.recommendation = generateRecommendation(analysis);
  
  return analysis;
}

function calculateWalkability(amenities) {
  if (!amenities) return 'Unknown';
  
  const total = Object.values(amenities).reduce((sum, arr) => sum + arr.length, 0);
  
  if (total >= 15) return 'High';
  if (total >= 8) return 'Medium';
  if (total >= 3) return 'Low';
  return 'Very Low';
}

function generateRecommendation(analysis) {
  const factors = [];
  
  // Zoning
  if (analysis.zoningAnalysis.developmentPotential?.includes('high')) {
    factors.push('✅ High-density development allowed');
  }
  
  // Flood zone
  if (analysis.siteCharacteristics.floodZone === 'X' || 
      analysis.siteCharacteristics.floodZone === 'Unknown') {
    factors.push('✅ Not in flood zone');
  } else {
    factors.push('⚠️ Flood zone considerations');
  }
  
  // Improvements
  if (analysis.siteCharacteristics.improvements === 'Vacant/Unimproved') {
    factors.push('✅ Vacant land - no demolition needed');
  }
  
  // Walkability
  if (analysis.locationAnalysis.walkabilityIndicator === 'High') {
    factors.push('✅ Excellent walkability');
  }
  
  return {
    factors,
    summary: factors.length >= 3 
      ? 'Strong development candidate' 
      : factors.length >= 2 
        ? 'Moderate development potential'
        : 'Further analysis recommended'
  };
}

export default {
  enrichProperty,
  analyzeDevelopmentFeasibility
};
