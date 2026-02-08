// src/services/propertyCard.js
// Clean-slate property card service — queries 8 ATTOM tables
// Created: Feb 8, 2026

import pool from '../db/pool.js';

// ═══════════════════════════════════════════════════════════════════
// CORE SQL — 8-table JOIN (assessor + parcels + 6 enrichment tables)
// ═══════════════════════════════════════════════════════════════════

const PROPERTY_CARD_SQL = `
  SELECT 
    -- Identity
    a.attom_id,
    a.apn_formatted AS apn,
    a.address_full,
    a.address_city AS city,
    a.address_state AS state,
    a.address_zip AS zip,
    'Travis' AS county,
    a.latitude,
    a.longitude,
    
    -- Classification
    a.property_use_group AS property_class,
    a.property_use_standard AS property_subtype,
    a.zoned_code_local AS zoning_code,
    
    -- Physical
    a.lot_sqft,
    a.lot_acres,
    a.building_sqft,
    a.year_built,
    a.units_count AS units,
    a.bedrooms_count AS bedrooms,
    a.bath_count AS bathrooms,
    a.stories_count AS stories,
    
    -- Valuation
    a.market_value_total,
    a.assessed_total,
    a.market_value_land AS assessed_land,
    a.market_value_improve AS assessed_improvements,
    a.tax_billed_amount AS tax_amount,
    
    -- Ownership
    a.owner1_name AS owner_name,
    a.owner_type_desc,
    a.company_flag,
    a.owner_occupied,
    a.last_sale_date,
    a.last_sale_price,
    a.prior_sale_date,
    a.prior_sale_price,
    a.tax_delinquent_year,
    a.homestead_exempt,
    
    -- Loan (from attom_loan_model — already working, keep existing columns)
    lm.currentfirstpositionopenloanamount AS openloan1amount,
    lm.currentfirstpositionopenloaninterestrate AS openloan1interestrate,
    lm.currentfirstpositionopenloantype AS openloan1loantype,
    NULL AS openloan2amount,
    NULL AS openloan3amount,
    lm.currentfirstpositionopenloanlendernamefirst AS lendernamefirstposition,
    
    -- Rental AVM (from attom_rental_avm — bigint join, numeric columns)
    r_avm.estimatedrentalvalue AS est_rent,
    r_avm.estimatedminrentalvalue AS est_rent_low,
    r_avm.estimatedmaxrentalvalue AS est_rent_high,
    
    -- Climate Risk (from attom_climate_change_risk — bigint join, text columns)
    cr.heatriskscore AS heat_risk,
    cr.stormriskscore AS storm_risk,
    cr.wildfireriskscore AS wildfire_risk,
    cr.droughtriskscore AS drought_risk,
    cr.floodriskscore AS flood_risk_score,
    cr.totalrisk AS climate_total_risk,
    cr.floodfemarisk AS fema_flood_zone,
    
    -- Flood Zone (from attom_boundary_floodzones — bigint join)
    fz.geoid AS flood_zone_geoid,
    fz.geotype AS flood_zone_type,
    
    -- Preforeclosure (already working — keep existing LATERAL subquery)
    pf.preforeclosure_type,
    pf.preforeclosure_date,
    pf.preforeclosure_default_amount,
    pf.preforeclosure_auction_date,
    pf.preforeclosure_lender,
    
    -- Building Permits (aggregated — bigint join, text columns)
    bp.permit_count,
    bp.latest_permit_date,
    bp.latest_permit_type,
    bp.latest_permit_value,
    
    -- Geometry
    ST_AsGeoJSON(p.geom)::json AS geometry

  FROM attom_assessor a
  
  LEFT JOIN attom_parcels p 
    ON a.apn_formatted = p.apn

  LEFT JOIN attom_loan_model lm 
    ON lm.attomid = a.attom_id

  LEFT JOIN attom_rental_avm r_avm 
    ON r_avm.attomid = a.attom_id

  LEFT JOIN attom_climate_change_risk cr 
    ON cr.attomid = a.attom_id

  LEFT JOIN attom_boundary_floodzones fz 
    ON fz.attomid = a.attom_id

  LEFT JOIN LATERAL (
    SELECT 
      foreclosure_recording_date AS preforeclosure_date,
      default_amount AS preforeclosure_default_amount,
      auction_date AS preforeclosure_auction_date,
      lender_name AS preforeclosure_lender,
      CASE 
        WHEN auction_date IS NOT NULL THEN 'NOS'
        WHEN default_amount IS NOT NULL THEN 'NOD'
        ELSE 'LIS'
      END AS preforeclosure_type
    FROM attom_preforeclosure
    WHERE attom_id = a.attom_id
    ORDER BY foreclosure_recording_date DESC
    LIMIT 1
  ) pf ON TRUE

  LEFT JOIN LATERAL (
    SELECT 
      COUNT(*)::int AS permit_count,
      MAX(effectivedate) AS latest_permit_date,
      (ARRAY_AGG(type ORDER BY effectivedate DESC NULLS LAST))[1] AS latest_permit_type,
      (ARRAY_AGG(jobvalue ORDER BY effectivedate DESC NULLS LAST))[1] AS latest_permit_value
    FROM attom_building_permit
    WHERE attomid = a.attom_id
  ) bp ON TRUE
`;

// ═══════════════════════════════════════════════════════════════════
// NORMALIZE — Convert raw SQL row to clean camelCase API response
// ═══════════════════════════════════════════════════════════════════

function normalizePropertyCard(row) {
  if (!row) return null;

  // Parse numeric values safely (handles TEXT columns from P1 tables)
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const int = (v) => { const n = parseInt(v); return isNaN(n) ? null : n; };

  const avmValue = num(row.market_value_total) || null;
  const buildingSqft = num(row.building_sqft);
  const lotAcres = num(row.lot_acres);
  const units = int(row.units);

  // Loan calculations
  const loan1 = num(row.openloan1amount) || 0;
  const loan2 = num(row.openloan2amount) || 0;
  const loan3 = num(row.openloan3amount) || 0;
  const totalLoanBalance = loan1 + loan2 + loan3;
  const loanCount = (loan1 > 0 ? 1 : 0) + (loan2 > 0 ? 1 : 0) + (loan3 > 0 ? 1 : 0);

  // Rental / Cap rate
  const estRent = num(row.est_rent) || null;
  const estRentLow = num(row.est_rent_low) || null;
  const estRentHigh = num(row.est_rent_high) || null;
  const estCapRate = (avmValue && estRent) ? ((estRent * 12 * 0.65) / avmValue) : null;

  // AVM confidence
  const avmConfidence = null;

  // Owner type derivation
  const ownerName = row.owner_name || '';
  let ownerType = row.owner_type_desc || 'Individual';
  if (/LLC/i.test(ownerName)) ownerType = 'LLC';
  else if (/INC|CORP/i.test(ownerName)) ownerType = 'Corporation';
  else if (/TRUST/i.test(ownerName)) ownerType = 'Trust';
  else if (/\bLP\b|LTD/i.test(ownerName)) ownerType = 'Partnership';
  else if (row.company_flag) ownerType = 'Corporation';

  // Years owned
  const yearsOwned = row.last_sale_date
    ? Math.floor((Date.now() - new Date(row.last_sale_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  // Distress signals
  const signals = [];
  if (row.preforeclosure_type === 'LIS') {
    signals.push({ type: 'distress', label: 'Lis Pendens', date: row.preforeclosure_date, severity: 'critical' });
  }
  if (row.preforeclosure_type === 'NOS') {
    signals.push({ type: 'distress', label: 'Notice of Sale', date: row.preforeclosure_date, severity: 'critical' });
  }
  if (row.preforeclosure_type === 'NOD') {
    signals.push({ type: 'distress', label: 'Notice of Default', date: row.preforeclosure_date, severity: 'critical' });
  }
  if (row.auction_date && new Date(row.auction_date) >= new Date()) {
    signals.push({ type: 'distress', label: 'Upcoming Auction', date: row.auction_date, severity: 'critical' });
  }
  if (row.tax_delinquent_year) {
    signals.push({ type: 'distress', label: `Tax Delinquent (${row.tax_delinquent_year})`, date: null, severity: 'warning' });
  }
  const isDistressed = signals.length > 0;

  // Motivation score
  let motivationScore = 0;
  if (isDistressed) motivationScore += 40;
  if (row.tax_delinquent_year) motivationScore += 15;
  if (!row.owner_occupied) motivationScore += 10;
  if (yearsOwned && yearsOwned >= 20) motivationScore += 15;
  if (totalLoanBalance > 0 && avmValue && (totalLoanBalance / avmValue) > 0.8) motivationScore += 20;
  motivationScore = Math.min(motivationScore, 100);

  // Climate risk — use flood_risk_score (numeric) instead of flood_zone_geoid (hash)
  const climateScore = num(row.climate_total_risk);
  const floodRiskScore = num(row.flood_risk_score);
  const heatRisk = num(row.heat_risk);
  const stormRisk = num(row.storm_risk);
  const wildfireRisk = num(row.wildfire_risk);
  const droughtRisk = num(row.drought_risk);
  const floodRisk = floodRiskScore >= 70 ? 'High' : floodRiskScore >= 40 ? 'Moderate' : floodRiskScore >= 10 ? 'Low' : 'Minimal';

  return {
    // Identity
    attomId: String(row.attom_id),
    parcelId: String(row.attom_id),
    apn: row.apn,
    addressFull: row.address_full,
    city: row.city,
    state: row.state || 'TX',
    zip: row.zip,
    county: row.county || 'Travis',
    latitude: num(row.latitude),
    longitude: num(row.longitude),

    // Classification
    propertyClass: row.property_class,
    propertySubtype: row.property_subtype,
    zoningCode: row.zoning_code,

    // Physical
    lotSqft: num(row.lot_sqft),
    lotAcres,
    buildingSqft,
    yearBuilt: int(row.year_built),
    units,
    bedrooms: int(row.bedrooms),
    bathrooms: num(row.bathrooms),
    stories: num(row.stories),

    // Valuation
    avmValue,
    avmConfidence,
    marketValueTotal: num(row.market_value_total),
    assessedTotal: num(row.assessed_total),
    assessedLand: num(row.assessed_land),
    assessedImprovements: num(row.assessed_improvements),
    taxAmount: num(row.tax_amount),
    pricePerSqft: buildingSqft && avmValue ? Math.round(avmValue / buildingSqft) : null,
    pricePerAcre: lotAcres && avmValue ? Math.round(avmValue / lotAcres) : null,
    pricePerUnit: units && avmValue ? Math.round(avmValue / units) : null,

    // Ownership
    ownerName: row.owner_name,
    ownerType,
    ownerOccupied: row.owner_occupied || false,
    isAbsentee: !row.owner_occupied,
    yearsOwned,
    acquisitionDate: row.last_sale_date,
    acquisitionPrice: num(row.last_sale_price),
    priorSaleDate: row.prior_sale_date,
    priorSalePrice: num(row.prior_sale_price),
    homesteadExempt: row.homestead_exempt || false,
    taxDelinquentYear: row.tax_delinquent_year ? String(row.tax_delinquent_year) : null,

    // Distress
    distress: {
      isDistressed,
      signals,
      motivationScore,
      motivationLevel: motivationScore >= 70 ? 'High' : motivationScore >= 40 ? 'Medium' : motivationScore > 0 ? 'Low' : 'None'
    },

    // Financials
    financials: {
      equityAvailable: avmValue && totalLoanBalance ? avmValue - totalLoanBalance : null,
      ltv: avmValue && totalLoanBalance ? Math.round((totalLoanBalance / avmValue) * 1000) / 1000 : null,
      estCapRate,
      estRent,
      rentRangeLow: estRentLow,
      rentRangeHigh: estRentHigh,
      loanCount,
      totalLoanBalance: totalLoanBalance || null,
      firstLoanRate: num(row.openloan1interestrate),
      firstLoanType: row.openloan1loantype || null,
      lender: row.lendernamefirstposition || null
    },

    // GIS / Risk
    gis: {
      floodRiskScore,
      floodRisk,
      femaFloodZone: row.fema_flood_zone || null,
      floodZoneType: row.flood_zone_type || null,
      climateRiskScore: climateScore,
      heatRisk,
      stormRisk,
      wildfireRisk,
      droughtRisk,
      inOpportunityZone: false // future spatial join
    },

    // Permits
    permits: {
      count: int(row.permit_count) || 0,
      latestDate: row.latest_permit_date || null,
      latestType: row.latest_permit_type || null,
      latestValue: num(row.latest_permit_value)
    },

    // Scores
    scores: {
      motivation: motivationScore,
      developmentPotential: null, // future
      investmentScore: null       // future
    },

    // Geometry (for map rendering)
    geometry: row.geometry || (
      row.latitude && row.longitude
        ? { type: 'Point', coordinates: [num(row.longitude), num(row.latitude)] }
        : null
    )
  };
}

// ═══════════════════════════════════════════════════════════════════
// API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Get property card for a single property by ATTOM ID
 */
async function getPropertyCard(attomId) {
  const query = PROPERTY_CARD_SQL + ` WHERE a.attom_id = $1`;
  const { rows } = await pool.query(query, [parseInt(attomId)]);
  if (rows.length === 0) return null;
  return normalizePropertyCard(rows[0]);
}

/**
 * Get property card by APN (resolves APN to ATTOM ID first)
 */
async function getPropertyCardByApn(apn) {
  // First resolve APN to attom_id
  const resolveQuery = `
    SELECT attom_id FROM attom_assessor
    WHERE apn_formatted = $1
    LIMIT 1
  `;
  const { rows } = await pool.query(resolveQuery, [apn]);
  
  if (rows.length === 0) {
    // Try matching with common variations:
    // Some APNs have leading zeros stripped or dashes
    const fuzzyQuery = `
      SELECT attom_id FROM attom_assessor
      WHERE REPLACE(REPLACE(apn_formatted, '-', ''), ' ', '') = REPLACE(REPLACE($1, '-', ''), ' ', '')
      LIMIT 1
    `;
    const fuzzyResult = await pool.query(fuzzyQuery, [apn]);
    if (fuzzyResult.rows.length === 0) return null;
    return getPropertyCard(fuzzyResult.rows[0].attom_id);
  }
  
  return getPropertyCard(rows[0].attom_id);
}

/**
 * Get property cards for multiple properties (batch)
 * Max 50 per request
 */
async function getPropertyCardsBatch(attomIds) {
  if (!attomIds || attomIds.length === 0) return [];
  const ids = attomIds.slice(0, 50).map(id => parseInt(id)).filter(id => !isNaN(id));
  if (ids.length === 0) return [];

  const query = PROPERTY_CARD_SQL + ` WHERE a.attom_id = ANY($1::bigint[])`;
  const { rows } = await pool.query(query, [ids]);
  return rows.map(normalizePropertyCard);
}

/**
 * Search properties with filters — returns GeoJSON FeatureCollection
 * This is the function used by the search_properties tool handler
 */
async function searchProperties(filters = {}, bbox = null, limit = 50) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (filters.zip_code) {
    conditions.push(`a.address_zip = $${paramIndex++}`);
    params.push(String(filters.zip_code));
  }
  if (filters.city) {
    conditions.push(`a.address_city ILIKE $${paramIndex++}`);
    params.push(`%${filters.city}%`);
  }
  if (filters.min_acres) {
    conditions.push(`a.lot_acres >= $${paramIndex++}`);
    params.push(filters.min_acres);
  }
  if (filters.max_acres) {
    conditions.push(`a.lot_acres <= $${paramIndex++}`);
    params.push(filters.max_acres);
  }
  if (filters.min_value) {
    conditions.push(`a.market_value_total >= $${paramIndex++}`);
    params.push(filters.min_value);
  }
  if (filters.max_value) {
    conditions.push(`a.market_value_total <= $${paramIndex++}`);
    params.push(filters.max_value);
  }
  if (filters.asset_class) {
    conditions.push(`a.property_use_group ILIKE $${paramIndex++}`);
    params.push(`%${filters.asset_class}%`);
  }
  if (filters.zoning_code) {
    conditions.push(`a.zoned_code_local ILIKE $${paramIndex++}`);
    params.push(`%${filters.zoning_code}%`);
  }
  if (filters.is_vacant) {
    conditions.push(`(a.building_sqft IS NULL OR a.building_sqft = 0)`);
  }
  if (filters.has_homestead) {
    conditions.push(`a.homestead_exempt = true`);
  }
  if (filters.is_tax_delinquent) {
    conditions.push(`a.tax_delinquent_year IS NOT NULL`);
  }
  if (bbox && bbox.length === 4) {
    conditions.push(`a.longitude BETWEEN $${paramIndex} AND $${paramIndex + 2}`);
    conditions.push(`a.latitude BETWEEN $${paramIndex + 1} AND $${paramIndex + 3}`);
    params.push(bbox[0], bbox[1], bbox[2], bbox[3]);
    paramIndex += 4;
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);

  const query = `
    SELECT 
      a.attom_id AS "parcelId",
      a.address_full AS "address",
      a.owner1_name AS "owner",
      a.lot_acres AS "acres",
      a.market_value_total AS "marketValue",
      a.property_use_group AS "assetClass",
      CASE WHEN a.lot_acres > 0 
        THEN ROUND(a.market_value_total / a.lot_acres, 2) 
        ELSE NULL END AS "valuePerAcre",
      CASE WHEN a.market_value_total > 0 AND a.market_value_improve IS NOT NULL
        THEN ROUND(a.market_value_improve / a.market_value_total, 4) 
        ELSE NULL END AS "improvementRatio",
      a.latitude,
      a.longitude,
      a.address_city AS "city",
      a.address_zip AS "zip",
      a.zoned_code_local AS "zoning",
      a.year_built AS "yearBuilt",
      a.building_sqft AS "buildingSqft",
      a.units_count AS "units",
      a.last_sale_date AS "lastSaleDate",
      a.last_sale_price AS "lastSalePrice",
      a.tax_billed_amount AS "taxAmount",
      a.tax_delinquent_year AS "taxDelinquentYear",
      a.owner_occupied AS "ownerOccupied",
      a.homestead_exempt AS "homesteadExempt",
      ST_AsGeoJSON(p.geom)::json AS geometry
    FROM attom_assessor a
    LEFT JOIN attom_parcels p ON a.apn_formatted = p.apn
    ${whereClause}
    ORDER BY a.market_value_total DESC NULLS LAST
    LIMIT ${safeLimit}
  `;

  const { rows } = await pool.query(query, params);

  return {
    type: 'FeatureCollection',
    features: rows.map(row => ({
      type: 'Feature',
      geometry: row.geometry || (
        row.latitude && row.longitude
          ? { type: 'Point', coordinates: [parseFloat(row.longitude), parseFloat(row.latitude)] }
          : null
      ),
      properties: {
        parcelId: String(row.parcelId),
        address: row.address,
        owner: row.owner,
        acres: parseFloat(row.acres) || null,
        marketValue: parseFloat(row.marketValue) || null,
        assetClass: row.assetClass,
        valuePerAcre: parseFloat(row.valuePerAcre) || null,
        improvementRatio: parseFloat(row.improvementRatio) || null,
        city: row.city,
        zip: row.zip,
        zoning: row.zoning,
        yearBuilt: row.yearBuilt ? parseInt(row.yearBuilt) : null,
        buildingSqft: parseFloat(row.buildingSqft) || null,
        units: row.units ? parseInt(row.units) : null,
        lastSaleDate: row.lastSaleDate,
        lastSalePrice: parseFloat(row.lastSalePrice) || null,
        taxAmount: parseFloat(row.taxAmount) || null,
        taxDelinquentYear: row.taxDelinquentYear ? parseInt(row.taxDelinquentYear) : null,
        ownerOccupied: row.ownerOccupied,
        homesteadExempt: row.homesteadExempt
      }
    })),
    metadata: {
      count: rows.length,
      source: 'attom_assessor',
      query_filters: filters
    }
  };
}

/**
 * Get full property details for a single property by ATTOM ID
 * Used by the get_property tool handler
 */
async function getPropertyDetail(attomId) {
  const card = await getPropertyCard(attomId);
  if (!card) return null;
  
  // Return same structure but wrap for tool handler compatibility
  return {
    ...card,
    // Legacy compatibility aliases
    parcel_id: card.parcelId,
    address: card.addressFull,
    owner: card.ownerName,
    acres: card.lotAcres,
    market_value: card.avmValue || card.marketValueTotal,
    asset_class: card.propertyClass,
    year_built: card.yearBuilt,
    building_sqft: card.buildingSqft,
    zoning_code: card.zoningCode,
    tax_delinquent: !!card.taxDelinquentYear,
    homestead: card.homesteadExempt,
    last_sale_date: card.acquisitionDate,
    last_sale_price: card.acquisitionPrice
  };
}


export { 
  getPropertyCard, 
  getPropertyCardsBatch, 
  getPropertyCardByApn,
  searchProperties, 
  getPropertyDetail,
  normalizePropertyCard
};