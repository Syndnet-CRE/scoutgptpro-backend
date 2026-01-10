/**
 * Build deterministic SQL query against parcel_features_travis
 */
function buildParcelQuery(intent) {
  const conditions = [];
  const values = [];
  let paramIndex = 1;
  
  // County filter
  if (intent.geo?.county_fips) {
    conditions.push(`county_fips = $${paramIndex}`);
    values.push(intent.geo.county_fips);
    paramIndex++;
  }
  
  // Bbox spatial filter
  if (intent.geo?.bbox && Array.isArray(intent.geo.bbox) && intent.geo.bbox.length === 4) {
    const [minLng, minLat, maxLng, maxLat] = intent.geo.bbox;
    conditions.push(`ST_Intersects(geom_centroid, ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326))`);
    values.push(minLng, minLat, maxLng, maxLat);
    paramIndex += 4;
  }
  
  // Filter: acres_min
  if (intent.filters?.acres_min !== null && intent.filters?.acres_min !== undefined) {
    conditions.push(`acres_calc >= $${paramIndex}`);
    values.push(intent.filters.acres_min);
    paramIndex++;
  }
  
  // Filter: acres_max
  if (intent.filters?.acres_max !== null && intent.filters?.acres_max !== undefined) {
    conditions.push(`acres_calc <= $${paramIndex}`);
    values.push(intent.filters.acres_max);
    paramIndex++;
  }
  
  // Filter: asset_class
  if (intent.filters?.asset_class) {
    conditions.push(`asset_class = $${paramIndex}`);
    values.push(intent.filters.asset_class);
    paramIndex++;
  }
  
  // Filter: owner_entity_type
  if (intent.filters?.owner_entity_type) {
    conditions.push(`owner_entity_type = $${paramIndex}`);
    values.push(intent.filters.owner_entity_type);
    paramIndex++;
  }
  
  // Filter: owner_segment
  if (intent.filters?.owner_segment) {
    conditions.push(`owner_segment = $${paramIndex}`);
    values.push(intent.filters.owner_segment);
    paramIndex++;
  }
  
  // Filter: tax_delinquent
  if (intent.filters?.tax_delinquent === true) {
    conditions.push(`tax_delinquent_flag = $${paramIndex}`);
    values.push(true);
    paramIndex++;
  }
  
  // Filter: market_value_min
  if (intent.filters?.market_value_min !== null && intent.filters?.market_value_min !== undefined) {
    conditions.push(`market_value >= $${paramIndex}`);
    values.push(intent.filters.market_value_min);
    paramIndex++;
  }
  
  // Filter: market_value_max
  if (intent.filters?.market_value_max !== null && intent.filters?.market_value_max !== undefined) {
    conditions.push(`market_value <= $${paramIndex}`);
    values.push(intent.filters.market_value_max);
    paramIndex++;
  }
  
  // Limit
  const limit = Math.min(Math.max(intent.limit || 50, 1), 200);
  values.push(limit);
  
  // Build WHERE clause
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Build SQL
  const sql = `
    SELECT 
      parcel_id,
      situs_address,
      owner_name_raw,
      owner_entity_type,
      owner_segment,
      acres_calc,
      asset_class,
      market_value,
      tax_delinquent_flag,
      county_fips,
      ST_AsGeoJSON(geom_centroid)::json as geom
    FROM parcel_features_travis
    ${whereClause}
    ORDER BY acres_calc
    LIMIT $${paramIndex}
  `;
  
  // Build debug SQL (with values substituted)
  const sqlDebug = sql.replace(/\$\d+/g, (match) => {
    const idx = parseInt(match.substring(1)) - 1;
    return JSON.stringify(values[idx]);
  });
  
  return {
    query: sql,
    values: values,
    sql: sqlDebug
  };
}
