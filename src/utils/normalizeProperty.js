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
  const acres = parseFloat(pick('acres', 'acres_calc', 'lot_acres')) || 0;
  const marketValue = parseFloat(pick('marketValue', 'market_value', 'market_value_total')) || 0;
  const improvementValue = parseFloat(pick('improvementValue', 'improvement_value', 'market_value_improve')) || 0;

  return {
    // Core identifiers — add attom_id
    parcelId: pick('parcelId', 'parcel_id', 'attom_id', 'id') || '',
    
    // Display fields — add ATTOM columns
    address: pick('address', 'situs_address', 'address_full') || '',
    owner: pick('owner', 'owner_name_raw', 'owner1_name') || '',
    acres: acres,
    assetClass: pick('assetClass', 'asset_class', 'property_use_group') || 'unknown',
    
    // Values
    marketValue: marketValue,
    assessedValue: parseFloat(pick('assessedValue', 'assessed_value', 'assessed_total_value')) || null,
    landValue: parseFloat(pick('landValue', 'land_value', 'market_value_land')) || null,
    improvementValue: improvementValue,
    
    // Computed fields
    valuePerAcre: (marketValue > 0 && acres > 0) ? Math.round(marketValue / acres) : null,
    improvementRatio: (marketValue > 0 && improvementValue > 0) ? Math.round((improvementValue / marketValue) * 100) / 100 : null,
    
    // Building details
    yearBuilt: pick('yearBuilt', 'year_built') || null,
    buildingSqft: parseFloat(pick('buildingSqft', 'building_sqft')) || null,
    bedrooms: parseInt(pick('bedrooms', 'bedrooms_count')) || null,
    bathrooms: parseFloat(pick('bathrooms', 'bath_count')) || null,
    stories: parseFloat(pick('stories', 'stories_count')) || null,
    
    // Flags — add ATTOM columns
    hasHomestead: pick('hasHomestead', 'homestead', 'homestead_exemption_flag', 'homestead_exempt') ?? false,
    isTaxDelinquent: (() => {
      const val = pick('isTaxDelinquent', 'taxDelinquent', 'tax_delinquent', 'tax_delinquent_flag', 'tax_delinquent_year');
      if (typeof val === 'boolean') return val;
      if (val !== null && val !== undefined) return true; // tax_delinquent_year is set = delinquent
      return false;
    })(),

    // Owner details — add ATTOM columns
    ownerType: pick('ownerType', 'owner_type', 'owner_entity_type', 'owner_type_desc') || '',
    
    // GIS fields
    zoningCode: pick('zoningCode', 'zoning_code', 'zoned_code_local') || null,
    floodZone: pick('floodZone', 'flood_zone') || null,

    // Sales data (new)
    lastSaleDate: pick('lastSaleDate', 'last_sale_date') || null,
    lastSalePrice: parseFloat(pick('lastSalePrice', 'last_sale_price')) || null,

    // Rental data (new, from attom_rental_avm join)
    estimatedRent: parseFloat(pick('estimatedRent', 'estimatedrentalvalue')) || null,

    // Loan data (new, from attom_loan_model join)
    loanAmount: parseFloat(pick('loanAmount', 'currentfirstpositionopenloanamount')) || null,
    ltv: parseFloat(pick('ltv')) || null,
    availableEquity: parseFloat(pick('availableEquity', 'availableequity')) || null,
    
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
