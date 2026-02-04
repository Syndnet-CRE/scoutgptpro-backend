/**
 * Result Enrichment Service
 * Enriches query results with computed fields, rankings, and insights
 */

/**
 * Calculate value per acre for a property
 */
function calculateValuePerAcre(property) {
  if (!property.acres_calc || property.acres_calc === 0) return null;
  if (!property.market_value) return null;
  return property.market_value / property.acres_calc;
}

/**
 * Calculate motivation score for a property
 * Higher score = more motivated seller
 */
function calculateMotivationScore(property) {
  let score = 50; // Base score
  const factors = [];

  // Tax delinquency (strong indicator) +25
  if (property.tax_delinquent_flag === true) {
    score += 25;
    factors.push('tax-delinquent');
  }

  // Absentee owner (mailing city != property city) +15
  const mailCity = (property.mail_city || '').toLowerCase();
  const propCity = (property.situs_address || '').toLowerCase();
  if (mailCity && mailCity !== propCity && mailCity.length > 0 && !mailCity.includes('austin')) {
    score += 15;
    factors.push('absentee-owner');
  }

  // Vacant land (no improvements) +10
  if (!property.improvement_value || property.improvement_value === 0) {
    score += 10;
    factors.push('vacant-land');
  }

  // Low value per acre (potentially undervalued) +10
  const valuePerAcre = calculateValuePerAcre(property);
  if (valuePerAcre && valuePerAcre < 30000) {
    score += 10;
    factors.push('potentially-undervalued');
  }

  // Large lot +5
  if (property.acres_calc && property.acres_calc > 1) {
    score += 5;
    factors.push('large-lot');
  }

  // Corporate/trust ownership (often more motivated) +5
  const ownerLower = (property.owner_name_raw || '').toLowerCase();
  if (ownerLower.includes('llc') || ownerLower.includes('trust') || 
      ownerLower.includes('corp') || ownerLower.includes('inc') || 
      ownerLower.includes('estate')) {
    score += 5;
    factors.push('entity-owned');
  }

  return {
    score: Math.min(score, 100),
    factors
  };
}

/**
 * Determine opportunity flags for a property
 */
function getOpportunityFlags(property) {
  const flags = [];

  // Undervalued
  const valuePerAcre = calculateValuePerAcre(property);
  if (valuePerAcre && valuePerAcre < 50000) {
    flags.push('potentially-undervalued');
  }

  // Tax delinquent
  if (property.tax_delinquent_flag === true) {
    flags.push('tax-delinquent');
  }

  // Vacant land
  if (!property.improvement_value || property.improvement_value === 0) {
    flags.push('vacant-land');
  }

  // Large lot
  if (property.acres_calc && property.acres_calc > 1) {
    flags.push('large-lot');
  }

  // Absentee owner
  const mailCity = (property.mail_city || '').toLowerCase();
  if (mailCity && !mailCity.includes('austin') && mailCity.length > 0) {
    flags.push('absentee-owner');
  }

  return flags;
}

/**
 * Enrich a single property result
 */
function enrichProperty(property, index, allResults) {
  const enriched = { ...property };

  // Computed fields
  enriched.value_per_acre = calculateValuePerAcre(property);
  
  // Motivation score
  const motivation = calculateMotivationScore(property);
  enriched.motivation_score = motivation.score;
  enriched.motivation_factors = motivation.factors;
  
  // Opportunity flags
  enriched.opportunity_flags = getOpportunityFlags(property);

  // Rankings (if we have all results)
  if (allResults && allResults.length > 1) {
    // Rank by value per acre (lower is better for deals)
    const sortedByValuePerAcre = [...allResults]
      .filter(p => calculateValuePerAcre(p) !== null)
      .sort((a, b) => calculateValuePerAcre(a) - calculateValuePerAcre(b));
    enriched.value_per_acre_rank = sortedByValuePerAcre.findIndex(p => p.parcel_id === property.parcel_id) + 1;
    enriched.value_per_acre_percentile = enriched.value_per_acre_rank 
      ? Math.round((enriched.value_per_acre_rank / sortedByValuePerAcre.length) * 100) 
      : null;

    // Rank by motivation score (higher is better)
    const sortedByMotivation = [...allResults]
      .filter(p => calculateMotivationScore(p).score !== null)
      .sort((a, b) => calculateMotivationScore(b).score - calculateMotivationScore(a).score);
    enriched.motivation_rank = sortedByMotivation.findIndex(p => p.parcel_id === property.parcel_id) + 1;
    enriched.motivation_percentile = enriched.motivation_rank 
      ? Math.round((enriched.motivation_rank / sortedByMotivation.length) * 100) 
      : null;
  }

  return enriched;
}

/**
 * Calculate summary statistics for a result set
 */
function calculateSummaryStats(results) {
  if (!results || results.length === 0) {
    return null;
  }

  const stats = {
    total_count: results.length,
    total_acres: 0,
    total_value: 0,
    avg_value_per_acre: null,
    min_value_per_acre: null,
    max_value_per_acre: null,
    median_value_per_acre: null,
    avg_motivation_score: null,
    tax_delinquent_count: 0,
    vacant_land_count: 0,
    absentee_owner_count: 0
  };

  const valuePerAcreValues = [];
  const motivationScores = [];

  for (const property of results) {
    // Totals
    if (property.acres_calc) stats.total_acres += parseFloat(property.acres_calc) || 0;
    if (property.market_value) stats.total_value += parseFloat(property.market_value) || 0;

    // Counts
    if (property.tax_delinquent_flag === true) stats.tax_delinquent_count++;
    if (!property.improvement_value || property.improvement_value === 0) stats.vacant_land_count++;
    
    const mailCity = (property.mail_city || '').toLowerCase();
    if (mailCity && !mailCity.includes('austin') && mailCity.length > 0) {
      stats.absentee_owner_count++;
    }

    // Value per acre
    const vpa = calculateValuePerAcre(property);
    if (vpa !== null) {
      valuePerAcreValues.push(vpa);
    }

    // Motivation score
    const motivation = calculateMotivationScore(property);
    motivationScores.push(motivation.score);
  }

  // Calculate averages and medians
  if (valuePerAcreValues.length > 0) {
    valuePerAcreValues.sort((a, b) => a - b);
    stats.avg_value_per_acre = valuePerAcreValues.reduce((a, b) => a + b, 0) / valuePerAcreValues.length;
    stats.min_value_per_acre = valuePerAcreValues[0];
    stats.max_value_per_acre = valuePerAcreValues[valuePerAcreValues.length - 1];
    const mid = Math.floor(valuePerAcreValues.length / 2);
    stats.median_value_per_acre = valuePerAcreValues.length % 2 === 0
      ? (valuePerAcreValues[mid - 1] + valuePerAcreValues[mid]) / 2
      : valuePerAcreValues[mid];
  }

  if (motivationScores.length > 0) {
    stats.avg_motivation_score = motivationScores.reduce((a, b) => a + b, 0) / motivationScores.length;
  }

  return stats;
}

/**
 * Enrich query results with computed fields, rankings, and statistics
 * 
 * @param {Array} results - Array of property objects from query
 * @param {object} options - Enrichment options
 * @returns {object} Enriched results with metadata
 */
export function enrichResults(results, options = {}) {
  if (!Array.isArray(results)) {
    return { error: 'Results must be an array' };
  }

  if (results.length === 0) {
    return {
      properties: [],
      summary: null,
      enriched_at: new Date().toISOString()
    };
  }

  // Enrich each property
  const enrichedProperties = results.map((property, index) => 
    enrichProperty(property, index, results)
  );

  // Calculate summary statistics
  const summary = calculateSummaryStats(enrichedProperties);

  // Sort by motivation score (highest first) if requested
  if (options.sortBy === 'motivation') {
    enrichedProperties.sort((a, b) => (b.motivation_score || 0) - (a.motivation_score || 0));
  } else if (options.sortBy === 'value_per_acre') {
    enrichedProperties.sort((a, b) => {
      const aVpa = a.value_per_acre || Infinity;
      const bVpa = b.value_per_acre || Infinity;
      return aVpa - bVpa; // Lower value per acre = better deal
    });
  }

  return {
    properties: enrichedProperties,
    summary,
    enriched_at: new Date().toISOString(),
    enrichment_version: '1.0'
  };
}

/**
 * Get top opportunities from enriched results
 */
export function getTopOpportunities(enrichedResults, limit = 10) {
  if (!enrichedResults || !enrichedResults.properties) {
    return [];
  }

  return enrichedResults.properties
    .filter(p => p.motivation_score && p.motivation_score >= 60)
    .sort((a, b) => (b.motivation_score || 0) - (a.motivation_score || 0))
    .slice(0, limit)
    .map(p => ({
      parcel_id: p.parcel_id,
      address: p.situs_address,
      motivation_score: p.motivation_score,
      motivation_factors: p.motivation_factors,
      opportunity_flags: p.opportunity_flags,
      value_per_acre: p.value_per_acre,
      market_value: p.market_value,
      acres: p.acres_calc
    }));
}

export default { enrichResults, getTopOpportunities };
