/**
 * Normalizes database field names to frontend-expected names
 * Single source of truth for field mapping
 */
export function normalizeProperty(raw) {
  if (!raw) return null;
  
  // Helper: grab first non-null value
  const pick = (...keys) => {
    for (const k of keys) {
      if (raw[k] !== undefined && raw[k] !== null) return raw[k];
    }
    return null;
  };

  return {
    // Core identifiers
    id: pick('parcelId', 'parcel_id', 'id'),
    parcelId: pick('parcelId', 'parcel_id', 'id'),
    
    // Display fields
    address: pick('address', 'situs_address') || '',
    owner: pick('owner', 'owner_name_raw') || '',
    ownerType: pick('ownerType', 'owner_type', 'owner_entity_type') || '',
    acres: parseFloat(pick('acres', 'acres_calc')) || 0,
    assetClass: pick('assetClass', 'asset_class') || 'unknown',
    
    // Values
    marketValue: parseFloat(pick('marketValue', 'market_value')) || 0,
    assessedValue: parseFloat(pick('assessedValue', 'assessed_total_value')) || 0,
    landValue: parseFloat(pick('landValue', 'land_value')) || 0,
    improvementValue: parseFloat(pick('improvementValue', 'improvement_value')) || 0,
    valuePerAcre: parseFloat(pick('valuePerAcre', 'value_per_acre')) || 0,
    valuePerSqft: parseFloat(pick('valuePerSqft', 'value_per_sqft')) || 0,
    improvementRatio: parseFloat(pick('improvementRatio', 'improvement_ratio')) || 0,
    
    // Flags
    taxDelinquent: pick('taxDelinquent', 'tax_delinquent', 'tax_delinquent_flag') ?? false,
    hasHomestead: pick('hasHomestead', 'homestead', 'homestead_exemption_flag') ?? false,
    
    // Zoning & GIS
    zoningCode: pick('zoningCode', 'zoning_code') || '',
    zoningDescription: pick('zoningDescription', 'zoning_description') || '',
    floodZone: pick('floodZone', 'flood_zone') || '',
    
    // Building
    yearBuilt: pick('yearBuilt', 'year_built') || null,
    buildingSqft: parseFloat(pick('buildingSqft', 'building_sqft')) || 0,
    
    // Scoring
    motivationScore: parseFloat(pick('motivationScore', 'motivation_score')) || 0,
    motivationFactors: pick('motivationFactors', 'motivation_factors') || null,
    opportunityFlags: pick('opportunityFlags', 'opportunity_flags') || null,
    
    // Location
    lat: parseFloat(pick('lat')) || null,
    lng: parseFloat(pick('lng')) || null,
    coordinates: pick('coordinates') || null,
    geometry: pick('geometry', 'geom') || null
  };
}

export function normalizeProperties(rawArray) {
  if (!Array.isArray(rawArray)) return [];
  return rawArray.map(normalizeProperty).filter(Boolean);
}
