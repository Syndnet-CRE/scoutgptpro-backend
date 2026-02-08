/**
 * Query Builder Service
 * Builds parameterized SQL queries for Prisma $queryRawUnsafe()
 * Updated for ATTOM tables
 */

import { toSpatialCondition } from './geographyResolver.js';

/**
 * Build a compound property search query against attom_assessor
 */
export function buildPropertyQuery(options = {}) {
  const {
    filters = {},
    spatial = null,
    sort = { field: 'market_value', direction: 'DESC' },
    limit = 50,
    offset = 0,
    includeEnrichment = true,
    includeZoning = false
  } = options;
  
  const conditions = [];
  const params = [];
  let paramIndex = 1;
  
  const addParam = (value) => {
    params.push(value);
    return `$${paramIndex++}`;
  };
  
  // Build SELECT from attom_assessor (aliased as a)
  const selectFields = [
    'a.attom_id',
    'a.address_full',
    'a.address_city',
    'a.address_zip',
    'a.owner1_name',
    'a.owner_type_desc',
    'a.lot_acres',
    'a.property_use_group',
    'a.property_use_standard',
    'a.zoned_code_local',
    'a.market_value_total',
    'a.market_value_land',
    'a.market_value_improve',
    'a.year_built',
    'a.building_sqft',
    'a.bedrooms_count',
    'a.bath_count',
    'a.tax_delinquent_year',
    'a.homestead_exempt',
    'a.company_flag',
    'a.last_sale_date',
    'a.last_sale_price',
    'a.latitude as lat',
    'a.longitude as lng',
    'ST_AsGeoJSON(ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326))::json as geometry'
  ];
  
  // Computed fields
  selectFields.push(`
    CASE WHEN a.lot_acres > 0 
      THEN ROUND((a.market_value_total / a.lot_acres)::numeric, 2)
      ELSE NULL END as value_per_acre
  `);
  
  selectFields.push(`
    CASE WHEN a.building_sqft > 0 
      THEN ROUND((a.market_value_total / a.building_sqft)::numeric, 2)
      ELSE NULL END as value_per_sqft
  `);
  
  selectFields.push(`
    CASE WHEN a.market_value_total > 0 
      THEN ROUND((a.market_value_improve / a.market_value_total)::numeric, 3)
      ELSE NULL END as improvement_ratio
  `);
  
  // JOINs
  const joins = [];
  
  // NOTE: includeEnrichment previously joined parcels_travis_enrichment for last_sale_date/price.
  // attom_assessor already has last_sale_date and last_sale_price — no join needed.
  
  if (includeZoning) {
    // Spatial join to zoning uses a point constructed from lat/lng
    joins.push('LEFT JOIN zoning_districts zd ON ST_Intersects(ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326), zd.geometry)');
    selectFields.push(
      'zd.zoning_code as zoning_district_code',
      'zd.zoning_desc as zoning_description'
    );
  }
  
  // WHERE conditions
  
  // Asset class / property use group
  if (filters.asset_class) {
    conditions.push(`a.property_use_group ILIKE ${addParam('%' + filters.asset_class + '%')}`);
  }
  
  // Acreage
  if (filters.min_acres !== undefined) {
    conditions.push(`a.lot_acres >= ${addParam(filters.min_acres)}`);
  }
  if (filters.max_acres !== undefined) {
    conditions.push(`a.lot_acres <= ${addParam(filters.max_acres)}`);
  }
  
  // Value
  if (filters.min_value !== undefined) {
    conditions.push(`a.market_value_total >= ${addParam(filters.min_value)}`);
  }
  if (filters.max_value !== undefined) {
    conditions.push(`a.market_value_total <= ${addParam(filters.max_value)}`);
  }
  
  // City — attom_assessor has a proper address_city column
  if (filters.city) {
    conditions.push(`a.address_city ILIKE ${addParam('%' + filters.city + '%')}`);
  }
  
  // ZIP — attom_assessor has address_zip
  if (filters.zip_code) {
    conditions.push(`a.address_zip LIKE ${addParam(filters.zip_code + '%')}`);
  }
  
  // Zoning
  if (filters.zoning_code) {
    conditions.push(`a.zoned_code_local ILIKE ${addParam('%' + filters.zoning_code + '%')}`);
  }
  
  // Owner type
  if (filters.owner_type) {
    conditions.push(`a.owner_type_desc ILIKE ${addParam('%' + filters.owner_type + '%')}`);
  }
  
  // Boolean flags
  if (filters.tax_delinquent === true) {
    conditions.push('a.tax_delinquent_year IS NOT NULL');
  }
  if (filters.has_homestead === true) {
    conditions.push('a.homestead_exempt = true');
  }
  if (filters.has_homestead === false) {
    conditions.push('(a.homestead_exempt = false OR a.homestead_exempt IS NULL)');
  }
  
  // Vacant land
  if (filters.is_vacant === true) {
    conditions.push("(a.property_use_group ILIKE '%vacant%' OR a.property_use_group ILIKE '%land%')");
  }
  
  // Flood zone exclusion — not available in attom_assessor directly
  // Skip for now (filters.exclude_flood_zone)
  
  // Owner name
  if (filters.owner_name) {
    conditions.push(`a.owner1_name ILIKE ${addParam('%' + filters.owner_name + '%')}`);
  }
  
  // Spatial filter
  if (spatial) {
    if (spatial.type === 'bbox') {
      // Use coordinate columns directly — fast
      const [minLng, minLat, maxLng, maxLat] = spatial.coordinates;
      conditions.push(`a.longitude BETWEEN ${addParam(minLng)} AND ${addParam(maxLng)}`);
      conditions.push(`a.latitude BETWEEN ${addParam(minLat)} AND ${addParam(maxLat)}`);
    } else if (spatial.type === 'point') {
      // Use ST_DWithin with constructed point — slower but accurate for radius
      const [lng, lat] = spatial.coordinates;
      const distance = spatial.distance_meters || 5000;
      conditions.push(`ST_DWithin(ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography, ST_Point(${addParam(lng)}, ${addParam(lat)})::geography, ${addParam(distance)})`);
    }
  }
  
  // Ensure coordinates exist
  conditions.push('a.latitude IS NOT NULL AND a.longitude IS NOT NULL');
  
  // ORDER BY
  const sortMap = {
    'value_per_acre': 'value_per_acre',
    'market_value': 'a.market_value_total',
    'acres_calc': 'a.lot_acres',      // Keep old sort name working
    'lot_acres': 'a.lot_acres',
    'year_built': 'a.year_built'
  };
  const sortField = sortMap[sort.field] || 'a.market_value_total';
  const sortDir = sort.direction === 'ASC' ? 'ASC' : 'DESC';
  
  // Build SQL
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const sql = `
    SELECT ${selectFields.join(', ')}
    FROM attom_assessor a
    ${joins.join(' ')}
    ${whereClause}
    ORDER BY ${sortField} ${sortDir} NULLS LAST
    LIMIT ${addParam(Math.min(limit, 500))}
    ${offset > 0 ? `OFFSET ${addParam(offset)}` : ''}
  `.replace(/\s+/g, ' ').trim();
  
  return { sql, params };
}

export default { buildPropertyQuery };