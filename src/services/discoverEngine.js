/**
 * Discovery Engine Service
 * Builds SQL queries and scores candidates based on DiscoverIntent
 */

/**
 * Build SQL query from DiscoverIntent
 */
export function buildDiscoverQuery(intent, geo, limit = 100) {
  const params = [];
  let paramIndex = 1;

  // Base query - start with properties table
  let sql = `
    SELECT 
      p."parcelId",
      p.address,
      p.city,
      p.state,
      p."propertyType",
      p.acres,
      p."mktValue",
      p."landValue",
      p."yearBuilt",
      p.latitude,
      p.longitude,
      p.owner,
      p."ownerName",
      p."isAbsentee",
      p."motivationScore"
    FROM properties p
  `;

  // Owner segment filter - need to adjust SQL structure
  let hasOwnerJoin = false;
  if (intent.ownerSegment) {
    sql += `
      INNER JOIN owner_properties op ON op."parcelId" = p."parcelId"
      INNER JOIN owners o ON o.id = op."ownerId"
      INNER JOIN owner_features_tx oft ON oft."ownerId" = o.id
    `;
    hasOwnerJoin = true;
  }

  sql += ` WHERE 1=1`;

  // Texas scope - always filter to Texas
  sql += ` AND p.state = 'TX'`;
  
  // Owner segment filter condition
  if (intent.ownerSegment && hasOwnerJoin) {
    // Apply segment rules via SQL
    if (intent.ownerSegment === 'mom_pop') {
      sql += ` AND oft."parcelCountTx" <= 5 AND o."isCorporate" = false`;
    } else if (intent.ownerSegment === 'small_operator') {
      sql += ` AND oft."parcelCountTx" >= 6 AND oft."parcelCountTx" <= 25`;
    } else if (intent.ownerSegment === 'institutional') {
      sql += ` AND (oft."parcelCountTx" >= 200 OR (o."isCorporate" = true AND oft."totalAssessedValueTx" >= 50000000))`;
    } else if (intent.ownerSegment === 'local_owner') {
      sql += ` AND oft."outOfState" = false`;
    } else if (intent.ownerSegment === 'tired_landlord') {
      sql += ` AND oft."avgHoldYears" >= 15`;
    }
  }

  // Asset type filter
  if (intent.assetTypes && intent.assetTypes.length > 0) {
    const assetTypesLower = intent.assetTypes.map(at => at.toLowerCase());
    sql += ` AND LOWER(p."propertyType") = ANY($${paramIndex}::text[])`;
    params.push(assetTypesLower);
    paramIndex++;
  }

  // Hard filters
  if (intent.hardFilters) {
    if (intent.hardFilters.priceMin) {
      sql += ` AND p."mktValue" >= $${paramIndex}`;
      params.push(intent.hardFilters.priceMin);
      paramIndex++;
    }
    if (intent.hardFilters.priceMax) {
      sql += ` AND p."mktValue" <= $${paramIndex}`;
      params.push(intent.hardFilters.priceMax);
      paramIndex++;
    }
    if (intent.hardFilters.acresMin) {
      sql += ` AND p.acres >= $${paramIndex}`;
      params.push(intent.hardFilters.acresMin);
      paramIndex++;
    }
    if (intent.hardFilters.acresMax) {
      sql += ` AND p.acres <= $${paramIndex}`;
      params.push(intent.hardFilters.acresMax);
      paramIndex++;
    }
    if (intent.hardFilters.yearBuiltMin) {
      sql += ` AND p."yearBuilt" >= $${paramIndex}`;
      params.push(intent.hardFilters.yearBuiltMin);
      paramIndex++;
    }
    if (intent.hardFilters.yearBuiltMax) {
      sql += ` AND p."yearBuilt" <= $${paramIndex}`;
      params.push(intent.hardFilters.yearBuiltMax);
      paramIndex++;
    }
    if (intent.hardFilters.ownershipFlags?.includes('absentee')) {
      sql += ` AND p."isAbsentee" = true`;
    }
  }

  // Owner segment filter - need to adjust SQL structure
  let hasOwnerJoin = false;
  if (intent.ownerSegment) {
    sql = sql.replace('FROM properties p', `
      FROM properties p
      INNER JOIN owner_properties op ON op."parcelId" = p."parcelId"
      INNER JOIN owners o ON o.id = op."ownerId"
      INNER JOIN owner_segments os ON os."segmentKey" = $${paramIndex}
    `);
    sql += ` AND os."segmentKey" = $${paramIndex}`;
    params.push(intent.ownerSegment);
    paramIndex++;
    hasOwnerJoin = true;
  }

  // Geo filters
  if (geo?.bbox && Array.isArray(geo.bbox) && geo.bbox.length === 4) {
    sql += ` AND p.longitude >= $${paramIndex} AND p.longitude <= $${paramIndex + 1}`;
    sql += ` AND p.latitude >= $${paramIndex + 2} AND p.latitude <= $${paramIndex + 3}`;
    params.push(geo.bbox[0], geo.bbox[2], geo.bbox[1], geo.bbox[3]);
    paramIndex += 4;
  }

  if (intent.geo?.counties && intent.geo.counties.length > 0) {
    sql += ` AND LOWER(p.county) = ANY($${paramIndex}::text[])`;
    params.push(intent.geo.counties.map(c => c.toLowerCase()));
    paramIndex++;
  }

  // Order by motivation score or market value as fallback
  sql += ` ORDER BY p."motivationScore" DESC NULLS LAST, p."mktValue" DESC NULLS LAST`;

  // Limit
  sql += ` LIMIT $${paramIndex}`;
  params.push(limit * 2); // Get more candidates for scoring

  return { sql, params };
}

/**
 * Score candidates based on intent and scoring model
 */
export async function scoreCandidates(candidates, intent, scoringModel, prisma) {
  if (!candidates || candidates.length === 0) {
    return [];
  }

  // Get enrichment data for candidates
  const parcelIds = candidates.map(c => c.parcelId);
  const enrichments = await prisma.txEnrichmentRollup.findMany({
    where: { parcelId: { in: parcelIds } }
  });

  const enrichmentMap = new Map(enrichments.map(e => [e.parcelId, e]));

  // Get owner features if owner segment is requested
  let ownerFeaturesMap = new Map();
  if (intent.ownerSegment) {
    const ownerProperties = await prisma.ownerProperty.findMany({
      where: { parcelId: { in: parcelIds } },
      include: {
        owner: {
          include: {
            features: true
          }
        }
      }
    });

    ownerProperties.forEach(op => {
      if (op.owner?.features) {
        ownerFeaturesMap.set(op.parcelId, op.owner.features);
      }
    });
  }

  // Score each candidate
  const scored = candidates.map(candidate => {
    const enrichment = enrichmentMap.get(candidate.parcelId);
    const ownerFeatures = ownerFeaturesMap.get(candidate.parcelId);

    const breakdown = {};
    let score = 0;
    const reasons = [];

    // Use scoring model if available
    if (scoringModel?.weights) {
      const weights = scoringModel.weights;

      // Location scoring
      if (weights.location && enrichment) {
        if (weights.location.pop_1mi && enrichment.pop1mi) {
          const popScore = Math.min(enrichment.pop1mi / 10000, 1) * (weights.location.pop_1mi || 0);
          score += popScore;
          breakdown.popScore = popScore;
          if (popScore > 0) reasons.push(`Population within 1mi: ${enrichment.pop1mi}`);
        }

        if (weights.location.med_income_1mi && enrichment.medIncome1mi) {
          const incomeScore = Math.min(enrichment.medIncome1mi / 100000, 1) * (weights.location.med_income_1mi || 0);
          score += incomeScore;
          breakdown.incomeScore = incomeScore;
          if (incomeScore > 0) reasons.push(`Median income within 1mi: $${enrichment.medIncome1mi}`);
        }
      }

      // Owner scoring
      if (weights.owner && ownerFeatures) {
        if (weights.owner.mom_pop_bonus && intent.ownerSegment === 'mom_pop') {
          score += weights.owner.mom_pop_bonus;
          breakdown.momPopBonus = weights.owner.mom_pop_bonus;
          reasons.push('Mom & pop owner');
        }

        if (weights.owner.tired_landlord_bonus && ownerFeatures.avgHoldYears >= 15) {
          score += weights.owner.tired_landlord_bonus;
          breakdown.tiredLandlordBonus = weights.owner.tired_landlord_bonus;
          reasons.push(`Long hold period: ${ownerFeatures.avgHoldYears} years`);
        }
      }

      // Property scoring
      if (weights.property) {
        if (weights.property.acres && candidate.acres) {
          const acresScore = Math.min(candidate.acres / 10, 1) * (weights.property.acres || 0);
          score += acresScore;
          breakdown.acresScore = acresScore;
          if (acresScore > 0) reasons.push(`${candidate.acres} acres`);
        }
      }
    } else {
      // Default scoring if no model
      if (candidate.motivationScore) {
        score += candidate.motivationScore / 100;
        breakdown.motivationScore = candidate.motivationScore / 100;
        reasons.push(`Motivation score: ${candidate.motivationScore}`);
      }

      if (candidate.isAbsentee) {
        score += 0.1;
        breakdown.absenteeBonus = 0.1;
        reasons.push('Absentee owner');
      }

      if (enrichment?.pop1mi && enrichment.pop1mi > 5000) {
        score += 0.1;
        breakdown.popBonus = 0.1;
        reasons.push(`Good population density: ${enrichment.pop1mi}`);
      }
    }

    // Apply soft preferences
    if (intent.softPreferences) {
      if (intent.softPreferences.popMin && enrichment?.pop1mi) {
        if (enrichment.pop1mi >= intent.softPreferences.popMin) {
          score += 0.05;
          reasons.push(`Meets population preference: ${enrichment.pop1mi}`);
        }
      }

      if (intent.softPreferences.incomeMin && enrichment?.medIncome1mi) {
        if (enrichment.medIncome1mi >= intent.softPreferences.incomeMin) {
          score += 0.05;
          reasons.push(`Meets income preference: $${enrichment.medIncome1mi}`);
        }
      }

      if (intent.softPreferences.maxFloodPct && enrichment?.floodPct) {
        if (enrichment.floodPct <= intent.softPreferences.maxFloodPct) {
          score += 0.05;
          reasons.push(`Low flood risk: ${enrichment.floodPct * 100}%`);
        }
      }
    }

    return {
      ...candidate,
      score: Math.max(0, Math.min(1, score)), // Normalize to 0-1
      reasons,
      breakdown
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored;
}

