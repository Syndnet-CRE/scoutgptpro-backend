/**
 * Normalizes database field names to frontend-expected names
 * Single source of truth for field mapping
 */
export function normalizeProperty(raw) {
  if (!raw) return null;
  
  // If already normalized (has camelCase fields), return as-is
  if (raw.address && !raw.situs_address) return raw;
  
  return {
    // Core identifiers
    id: raw.parcel_id || raw.id,
    parcelId: raw.parcel_id || raw.parcelId,
    
    // Display fields
    address: raw.situs_address || raw.address || '',
    owner: raw.owner_name_raw || raw.owner || '',
    acres: parseFloat(raw.acres_calc) || parseFloat(raw.acres) || 0,
    propertyType: raw.asset_class || raw.propertyType || 'unknown',
    assetClass: raw.asset_class || raw.assetClass || 'unknown',
    
    // Values
    marketValue: parseFloat(raw.market_value) || parseFloat(raw.marketValue) || 0,
    assessedValue: parseFloat(raw.assessed_total_value) || parseFloat(raw.assessedValue) || 0,
    landValue: parseFloat(raw.land_value) || parseFloat(raw.landValue) || 0,
    improvementValue: parseFloat(raw.improvement_value) || parseFloat(raw.improvementValue) || 0,
    
    // Flags
    taxDelinquent: raw.tax_delinquent_flag ?? raw.taxDelinquent ?? false,
    homesteadExemption: raw.homestead_exemption_flag ?? raw.homesteadExemption ?? false,
    
    // Owner details
    ownerEntityType: raw.owner_entity_type || raw.ownerEntityType || '',
    ownerSegment: raw.owner_segment || raw.ownerSegment || '',
    
    // Location
    coordinates: raw.geom?.coordinates || raw.coordinates || null,
    geometry: raw.geom || raw.geometry || null,
    
    // Preserve original for debugging
    _raw: raw
  };
}

export function normalizeProperties(rawArray) {
  if (!Array.isArray(rawArray)) return [];
  return rawArray.map(normalizeProperty).filter(Boolean);
}
