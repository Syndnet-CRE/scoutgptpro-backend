/**
 * Normalizes raw database rows into a stable API contract
 * Single source of truth for property field names
 * 
 * Database columns → API contract:
 *   parcel_id → parcelId
 *   situs_address → address  
 *   owner_name_raw → owner
 *   acres_calc → acres
 *   market_value → marketValue
 *   assessed_value/assessed_total_value → assessedValue
 *   asset_class → assetClass
 *   land_value → landValue
 *   improvement_value → improvementValue
 *   year_built → yearBuilt
 *   building_sqft → buildingSqft
 *   homestead_exemption_flag → hasHomestead
 *   tax_delinquent_flag → isTaxDelinquent
 *   owner_entity_type → ownerType
 *   zoning_code → zoningCode (if joined)
 *   flood_zone → floodZone (if joined)
 *   geom_centroid → DO NOT include in normalized output
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

  // Get base values for computed fields
  const acres = parseFloat(pick('acres', 'acres_calc')) || 0;
  const marketValue = parseFloat(pick('marketValue', 'market_value')) || 0;
  const improvementValue = parseFloat(pick('improvementValue', 'improvement_value')) || 0;

  return {
    // Core identifiers
    parcelId: pick('parcelId', 'parcel_id', 'id') || '',
    
    // Display fields
    address: pick('address', 'situs_address') || '',
    owner: pick('owner', 'owner_name_raw') || '',
    acres: acres,
    assetClass: pick('assetClass', 'asset_class') || 'unknown',
    
    // Values (always include as null if missing, don't omit)
    marketValue: marketValue,
    assessedValue: parseFloat(pick('assessedValue', 'assessed_value', 'assessed_total_value')) || null,
    landValue: parseFloat(pick('landValue', 'land_value')) || null,
    improvementValue: improvementValue,
    
    // Computed fields
    valuePerAcre: (marketValue > 0 && acres > 0) ? Math.round(marketValue / acres) : null,
    improvementRatio: (marketValue > 0 && improvementValue > 0) ? Math.round((improvementValue / marketValue) * 100) / 100 : null,
    
    // Building details
    yearBuilt: pick('yearBuilt', 'year_built') || null,
    buildingSqft: parseFloat(pick('buildingSqft', 'building_sqft')) || null,
    
    // Flags (use ?? to preserve false values)
    hasHomestead: pick('hasHomestead', 'homestead', 'homestead_exemption_flag') ?? false,
    isTaxDelinquent: pick('isTaxDelinquent', 'taxDelinquent', 'tax_delinquent', 'tax_delinquent_flag') ?? false,
    
    // Owner details  
    ownerType: pick('ownerType', 'owner_type', 'owner_entity_type') || '',
    
    // GIS fields (if joined)
    zoningCode: pick('zoningCode', 'zoning_code') || null,
    floodZone: pick('floodZone', 'flood_zone') || null,
    
    // Location (exclude geom_centroid as requested)
    latitude: parseFloat(pick('latitude', 'lat')) || null,
    longitude: parseFloat(pick('longitude', 'lng')) || null,
    geometry: pick('geometry', 'geom') || null
  };
}

export function normalizeProperties(rawArray) {
  if (!Array.isArray(rawArray)) return [];
  return rawArray.map(normalizeProperty).filter(Boolean);
}
