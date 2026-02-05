/**
 * Query Builder Service
 * Builds parameterized SQL queries for Prisma $queryRawUnsafe()
 */

import { toSpatialCondition } from './geographyResolver.js';

/**
 * Build a compound property search query
 * Returns SQL string and params array for Prisma $queryRawUnsafe
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
  
  // Build SELECT
  const selectFields = [
    'pft.parcel_id',
    'pft.situs_address',
    'pft.owner_name_raw',
    'pft.owner_entity_type',
    'pft.acres_calc',
    'pft.asset_class',
    'pft.zoning_code',
    'pft.market_value',
    'pft.land_value',
    'pft.improvement_value',
    'pft.assessed_total_value',
    'pft.year_built',
    'pft.building_sqft',
    'pft.tax_delinquent_flag',
    'pft.homestead_exemption_flag',
    'pft.flood_zone',
    'pft.mail_city',
    'pft.mail_zip',
    'pft.land_use_code',
    'pft.land_use_desc',
    'ST_Y(pft.geom_centroid) as lat',
    'ST_X(pft.geom_centroid) as lng',
    'ST_AsGeoJSON(pft.geom_centroid)::json as geometry'
  ];
  
  // Computed fields
  selectFields.push(`
    CASE WHEN pft.acres_calc > 0 
      THEN ROUND((pft.market_value / pft.acres_calc)::numeric, 2)
      ELSE NULL END as value_per_acre
  `);
  
  selectFields.push(`
    CASE WHEN pft.building_sqft > 0 
      THEN ROUND((pft.market_value / pft.building_sqft)::numeric, 2)
      ELSE NULL END as value_per_sqft
  `);
  
  selectFields.push(`
    CASE WHEN pft.market_value > 0 
      THEN ROUND((pft.improvement_value / pft.market_value)::numeric, 3)
      ELSE NULL END as improvement_ratio
  `);
  
  // JOINs
  const joins = [];
  
  if (includeEnrichment) {
    joins.push('LEFT JOIN parcels_travis_enrichment pte ON pft.parcel_id = pte.parcel_id');
    selectFields.push('pte.last_sale_date', 'pte.last_sale_price');
  }
  
  if (includeZoning) {
    joins.push('LEFT JOIN zoning_districts zd ON ST_Intersects(pft.geom_centroid, zd.geometry)');
    selectFields.push(
      'zd.zoning_code as zoning_district_code',
      'zd.zoning_desc as zoning_description'
    );
  }
  
  // WHERE conditions
  
  // Asset class
  if (filters.asset_class) {
    conditions.push(`LOWER(pft.asset_class) = LOWER(${addParam(filters.asset_class)})`);
  }
  
  // Acreage
  if (filters.min_acres !== undefined) {
    conditions.push(`pft.acres_calc >= ${addParam(filters.min_acres)}`);
  }
  if (filters.max_acres !== undefined) {
    conditions.push(`pft.acres_calc <= ${addParam(filters.max_acres)}`);
  }
  
  // Value
  if (filters.min_value !== undefined) {
    conditions.push(`pft.market_value >= ${addParam(filters.min_value)}`);
  }
  if (filters.max_value !== undefined) {
    conditions.push(`pft.market_value <= ${addParam(filters.max_value)}`);
  }
  
  // City (uses situs_address - mail_city is NULL in database)
  if (filters.city) {
    conditions.push(`pft.situs_address ILIKE '%' || ${addParam(filters.city)} || '%'`);
  }
  
  // ZIP (uses situs_address - mail_zip is NULL in database)
  if (filters.zip_code) {
    conditions.push(`pft.situs_address LIKE '%' || ${addParam(filters.zip_code)} || '%'`);
  }
  
  // Zoning
  if (filters.zoning_code) {
    conditions.push(`pft.zoning_code ILIKE ${addParam('%' + filters.zoning_code + '%')}`);
  }
  
  // Owner type
  if (filters.owner_type) {
    const ownerTypeMap = {
      'individual': 'individual',
      'llc': 'llc',
      'corporation': 'corporation',
      'trust': 'trust_estate',
      'government': 'government'
    };
    const mapped = ownerTypeMap[filters.owner_type.toLowerCase()] || filters.owner_type;
    conditions.push(`pft.owner_entity_type = ${addParam(mapped)}`);
  }
  
  // Boolean flags
  if (filters.tax_delinquent === true) {
    conditions.push('pft.tax_delinquent_flag = true');
  }
  if (filters.has_homestead === true) {
    conditions.push('pft.homestead_exemption_flag = true');
  }
  if (filters.has_homestead === false) {
    conditions.push('(pft.homestead_exemption_flag = false OR pft.homestead_exemption_flag IS NULL)');
  }
  
  // Vacant land
  if (filters.is_vacant === true) {
    conditions.push("(pft.asset_class ILIKE '%land%' OR pft.asset_class ILIKE '%vacant%')");
  }
  
  // Flood zone exclusion
  if (filters.exclude_flood_zone === true) {
    conditions.push("(pft.flood_zone IS NULL OR pft.flood_zone = '' OR pft.flood_zone = 'X')");
  }
  
  // Owner name
  if (filters.owner_name) {
    conditions.push(`pft.owner_name_raw ILIKE ${addParam('%' + filters.owner_name + '%')}`);
  }
  
  // Spatial filter
  if (spatial) {
    const spatialCond = toSpatialCondition(spatial, 'pft.geom_centroid');
    if (spatialCond) {
      // Replace $1, $2, etc. with proper parameterized placeholders
      let clause = spatialCond.clause;
      const spatialParams = [...spatialCond.params];
      
      // Replace each $N with the next parameter index
      clause = clause.replace(/\$(\d+)/g, () => {
        return addParam(spatialParams.shift());
      });
      
      conditions.push(clause);
    }
  }
  
  // Ensure geometry exists
  conditions.push('pft.geom_centroid IS NOT NULL');
  
  // ORDER BY
  const sortMap = {
    'value_per_acre': 'value_per_acre',
    'market_value': 'pft.market_value',
    'acres_calc': 'pft.acres_calc',
    'year_built': 'pft.year_built'
  };
  const sortField = sortMap[sort.field] || 'pft.market_value';
  const sortDir = sort.direction === 'ASC' ? 'ASC' : 'DESC';
  
  // Build SQL
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const sql = `
    SELECT ${selectFields.join(', ')}
    FROM parcel_features_travis pft
    ${joins.join(' ')}
    ${whereClause}
    ORDER BY ${sortField} ${sortDir} NULLS LAST
    LIMIT ${addParam(Math.min(limit, 500))}
    ${offset > 0 ? `OFFSET ${addParam(offset)}` : ''}
  `.replace(/\s+/g, ' ').trim();
  
  return { sql, params };
}

export default { buildPropertyQuery };
