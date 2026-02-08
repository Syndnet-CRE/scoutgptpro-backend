/**
 * Result Enrichment Service
 * Enriches query results with computed fields, rankings, and insights
 * Updated for ATTOM columns
 */

function calculateValuePerAcre(property) {
  const acres = parseFloat(property.lot_acres) || 0;
  const value = parseFloat(property.market_value_total) || 0;
  if (acres === 0 || value === 0) return null;
  return value / acres;
}

function calculateMotivationScore(property) {
  let score = 50;
  const factors = [];

  // Tax delinquency +25
  if (property.tax_delinquent_year != null) {
    score += 25;
    factors.push('tax-delinquent');
  }

  // Absentee owner +15
  const propCity = (property.address_city || '').toLowerCase();
  // If owner_occupied is false, they're absentee
  if (property.owner_occupied === false) {
    score += 15;
    factors.push('absentee-owner');
  }

  // Vacant land (no improvements) +10
  const improvementValue = parseFloat(property.market_value_improve) || 0;
  if (improvementValue === 0) {
    score += 10;
    factors.push('vacant-land');
  }

  // Low value per acre +10
  const valuePerAcre = calculateValuePerAcre(property);
  if (valuePerAcre && valuePerAcre < 30000) {
    score += 10;
    factors.push('potentially-undervalued');
  }

  // Large lot +5
  const acres = parseFloat(property.lot_acres) || 0;
  if (acres > 1) {
    score += 5;
    factors.push('large-lot');
  }

  // Corporate/trust ownership +5
  if (property.company_flag === true) {
    score += 5;
    factors.push('entity-owned');
  } else {
    const ownerLower = (property.owner1_name || '').toLowerCase();
    if (ownerLower.includes('llc') || ownerLower.includes('trust') || 
        ownerLower.includes('corp') || ownerLower.includes('inc') || 
        ownerLower.includes('estate')) {
      score += 5;
      factors.push('entity-owned');
    }
  }

  return {
    score: Math.min(score, 100),
    factors
  };
}

function getOpportunityFlags(property) {
  const flags = [];

  const valuePerAcre = calculateValuePerAcre(property);
  if (valuePerAcre && valuePerAcre < 50000) {
    flags.push('potentially-undervalued');
  }

  if (property.tax_delinquent_year != null) {
    flags.push('tax-delinquent');
  }

  const improvementValue = parseFloat(property.market_value_improve) || 0;
  if (improvementValue === 0) {
    flags.push('vacant-land');
  }

  const acres = parseFloat(property.lot_acres) || 0;
  if (acres > 1) {
    flags.push('large-lot');
  }

  if (property.owner_occupied === false) {
    flags.push('absentee-owner');
  }

  return flags;
}

function enrichProperty(property, index, allResults) {
  const enriched = { ...property };

  enriched.value_per_acre = calculateValuePerAcre(property);
  
  const motivation = calculateMotivationScore(property);
  enriched.motivation_score = motivation.score;
  enriched.motivation_factors = motivation.factors;
  
  enriched.opportunity_flags = getOpportunityFlags(property);

  if (allResults && allResults.length > 1) {
    const sortedByValuePerAcre = [...allResults]
      .filter(p => calculateValuePerAcre(p) !== null)
      .sort((a, b) => calculateValuePerAcre(a) - calculateValuePerAcre(b));
    enriched.value_per_acre_rank = sortedByValuePerAcre.findIndex(p => 
      String(p.attom_id || p.parcel_id) === String(property.attom_id || property.parcel_id)
    ) + 1;
    enriched.value_per_acre_percentile = enriched.value_per_acre_rank 
      ? Math.round((enriched.value_per_acre_rank / sortedByValuePerAcre.length) * 100) 
      : null;

    const sortedByMotivation = [...allResults]
      .filter(p => calculateMotivationScore(p).score !== null)
      .sort((a, b) => calculateMotivationScore(b).score - calculateMotivationScore(a).score);
    enriched.motivation_rank = sortedByMotivation.findIndex(p => 
      String(p.attom_id || p.parcel_id) === String(property.attom_id || property.parcel_id)
    ) + 1;
    enriched.motivation_percentile = enriched.motivation_rank 
      ? Math.round((enriched.motivation_rank / sortedByMotivation.length) * 100) 
      : null;
  }

  return enriched;
}

function calculateSummaryStats(results) {
  if (!results || results.length === 0) return null;

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
    if (property.lot_acres) stats.total_acres += parseFloat(property.lot_acres) || 0;
    if (property.market_value_total) stats.total_value += parseFloat(property.market_value_total) || 0;

    if (property.tax_delinquent_year != null) stats.tax_delinquent_count++;
    
    const improvementValue = parseFloat(property.market_value_improve) || 0;
    if (improvementValue === 0) stats.vacant_land_count++;
    
    if (property.owner_occupied === false) {
      stats.absentee_owner_count++;
    }

    const vpa = calculateValuePerAcre(property);
    if (vpa !== null) valuePerAcreValues.push(vpa);

    const motivation = calculateMotivationScore(property);
    motivationScores.push(motivation.score);
  }

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

export function enrichResults(results, options = {}) {
  if (!Array.isArray(results)) return { error: 'Results must be an array' };

  if (results.length === 0) {
    return { properties: [], summary: null, enriched_at: new Date().toISOString() };
  }

  const enrichedProperties = results.map((property, index) => 
    enrichProperty(property, index, results)
  );

  const summary = calculateSummaryStats(enrichedProperties);

  if (options.sortBy === 'motivation') {
    enrichedProperties.sort((a, b) => (b.motivation_score || 0) - (a.motivation_score || 0));
  } else if (options.sortBy === 'value_per_acre') {
    enrichedProperties.sort((a, b) => {
      const aVpa = a.value_per_acre || Infinity;
      const bVpa = b.value_per_acre || Infinity;
      return aVpa - bVpa;
    });
  }

  return {
    properties: enrichedProperties,
    summary,
    enriched_at: new Date().toISOString(),
    enrichment_version: '2.0'
  };
}

export function getTopOpportunities(enrichedResults, limit = 10) {
  if (!enrichedResults || !enrichedResults.properties) return [];

  return enrichedResults.properties
    .filter(p => p.motivation_score && p.motivation_score >= 60)
    .sort((a, b) => (b.motivation_score || 0) - (a.motivation_score || 0))
    .slice(0, limit)
    .map(p => ({
      parcel_id: String(p.attom_id),
      address: p.address_full,
      motivation_score: p.motivation_score,
      motivation_factors: p.motivation_factors,
      opportunity_flags: p.opportunity_flags,
      value_per_acre: p.value_per_acre,
      market_value: parseFloat(p.market_value_total) || 0,
      acres: parseFloat(p.lot_acres) || 0
    }));
}

export default { enrichResults, getTopOpportunities };