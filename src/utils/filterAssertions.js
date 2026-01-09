/**
 * Filter Assertions
 * 
 * Server-side assertions to guarantee filter correctness
 * Logs warnings if assertions fail (doesn't throw, just logs for debugging)
 */

/**
 * Assert acres filter correctness
 * 
 * @param {Array} results - Property results
 * @param {number|null} min - Minimum acres
 * @param {number|null} max - Maximum acres
 */
export function assertAcresFilter(results, min, max) {
  if (!results || results.length === 0) return;
  
  const violations = [];
  
  for (const prop of results) {
    const acres = parseFloat(prop.acres_calc);
    
    if (isNaN(acres)) {
      violations.push({
        parcel_id: prop.parcel_id,
        reason: 'acres_calc is NaN',
        value: prop.acres_calc
      });
      continue;
    }
    
    if (min !== null && min !== undefined && acres < min) {
      violations.push({
        parcel_id: prop.parcel_id,
        reason: `acres_calc (${acres}) < min (${min})`,
        value: acres
      });
    }
    
    if (max !== null && max !== undefined && acres > max) {
      violations.push({
        parcel_id: prop.parcel_id,
        reason: `acres_calc (${acres}) > max (${max})`,
        value: acres
      });
    }
  }
  
  if (violations.length > 0) {
    console.warn(`[Filter Assertion] Acres filter violation: ${violations.length} of ${results.length} results failed`);
    console.warn(`  Filter: acres_min=${min}, acres_max=${max}`);
    console.warn(`  Sample violations:`, violations.slice(0, 3));
  }
}

/**
 * Assert asset_class filter correctness
 * 
 * @param {Array} results - Property results
 * @param {string} assetClass - Expected asset class
 */
export function assertAssetClassFilter(results, assetClass) {
  if (!results || results.length === 0) return;
  if (!assetClass) return;
  
  const violations = results.filter(prop => prop.asset_class !== assetClass);
  
  if (violations.length > 0) {
    console.warn(`[Filter Assertion] Asset class filter violation: ${violations.length} of ${results.length} results failed`);
    console.warn(`  Expected: ${assetClass}`);
    console.warn(`  Sample violations:`, violations.slice(0, 3).map(p => ({
      parcel_id: p.parcel_id,
      asset_class: p.asset_class
    })));
  }
}

/**
 * Assert owner_segment filter correctness
 * 
 * @param {Array} results - Property results
 * @param {string} segment - Expected owner segment
 */
export function assertOwnerSegmentFilter(results, segment) {
  if (!results || results.length === 0) return;
  if (!segment) return;
  
  const violations = results.filter(prop => prop.owner_segment !== segment);
  
  if (violations.length > 0) {
    console.warn(`[Filter Assertion] Owner segment filter violation: ${violations.length} of ${results.length} results failed`);
    console.warn(`  Expected: ${segment}`);
    console.warn(`  Sample violations:`, violations.slice(0, 3).map(p => ({
      parcel_id: p.parcel_id,
      owner_segment: p.owner_segment
    })));
  }
}

/**
 * Assert market value filter correctness
 * 
 * @param {Array} results - Property results
 * @param {number|null} min - Minimum market value
 * @param {number|null} max - Maximum market value
 */
export function assertMarketValueFilter(results, min, max) {
  if (!results || results.length === 0) return;
  
  const violations = [];
  
  for (const prop of results) {
    const value = parseFloat(prop.market_value);
    
    if (isNaN(value) || value === null) {
      // Skip null values - they're valid
      continue;
    }
    
    if (min !== null && min !== undefined && value < min) {
      violations.push({
        parcel_id: prop.parcel_id,
        reason: `market_value (${value}) < min (${min})`,
        value: value
      });
    }
    
    if (max !== null && max !== undefined && value > max) {
      violations.push({
        parcel_id: prop.parcel_id,
        reason: `market_value (${value}) > max (${max})`,
        value: value
      });
    }
  }
  
  if (violations.length > 0) {
    console.warn(`[Filter Assertion] Market value filter violation: ${violations.length} of ${results.length} results failed`);
    console.warn(`  Filter: market_value_min=${min}, market_value_max=${max}`);
    console.warn(`  Sample violations:`, violations.slice(0, 3));
  }
}

/**
 * Assert owner_entity_type filter correctness
 * 
 * @param {Array} results - Property results
 * @param {string} entityType - Expected entity type
 */
export function assertOwnerEntityTypeFilter(results, entityType) {
  if (!results || results.length === 0) return;
  if (!entityType) return;
  
  const violations = results.filter(prop => prop.owner_entity_type !== entityType);
  
  if (violations.length > 0) {
    console.warn(`[Filter Assertion] Owner entity type filter violation: ${violations.length} of ${results.length} results failed`);
    console.warn(`  Expected: ${entityType}`);
    console.warn(`  Sample violations:`, violations.slice(0, 3).map(p => ({
      parcel_id: p.parcel_id,
      owner_entity_type: p.owner_entity_type
    })));
  }
}

/**
 * Assert tax_delinquent filter correctness
 * 
 * @param {Array} results - Property results
 * @param {boolean} expected - Expected tax delinquent flag
 */
export function assertTaxDelinquentFilter(results, expected) {
  if (!results || results.length === 0) return;
  if (expected !== true) return; // Only assert if we're filtering for delinquent
  
  const violations = results.filter(prop => !prop.tax_delinquent_flag);
  
  if (violations.length > 0) {
    console.warn(`[Filter Assertion] Tax delinquent filter violation: ${violations.length} of ${results.length} results failed`);
    console.warn(`  Expected: tax_delinquent_flag = true`);
    console.warn(`  Sample violations:`, violations.slice(0, 3).map(p => ({
      parcel_id: p.parcel_id,
      tax_delinquent_flag: p.tax_delinquent_flag
    })));
  }
}

export default {
  assertAcresFilter,
  assertAssetClassFilter,
  assertOwnerSegmentFilter,
  assertMarketValueFilter,
  assertOwnerEntityTypeFilter,
  assertTaxDelinquentFilter
};
