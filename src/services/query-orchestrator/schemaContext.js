/**
 * Schema Context Service
 * Provides accurate schema information to prevent Claude hallucinations
 */

export function getSchemaContext() {
  return {
    primaryTable: 'parcel_features_travis',
    rowCount: '372,000+',
    
    columns: {
      // Primary key
      parcel_id: { type: 'TEXT', nullable: false, description: 'Unique parcel identifier' },
      
      // Location
      situs_address: { type: 'TEXT', nullable: true, description: 'Full property address (contains city and ZIP - use this for filtering)' },
      mail_city: { type: 'TEXT', nullable: true, description: 'City from mailing address (NULL in database - use situs_address instead)' },
      mail_zip: { type: 'TEXT', nullable: true, description: 'ZIP code from mailing address (NULL in database - use situs_address instead)' },
      geom_centroid: { type: 'GEOMETRY(Point, 4326)', nullable: true, description: 'PostGIS point for spatial queries' },
      county_fips: { type: 'TEXT', nullable: true, description: 'County FIPS code (48453 = Travis)' },
      
      // Owner information
      owner_name_raw: { type: 'TEXT', nullable: true, description: 'Owner name as recorded' },
      owner_name_norm: { type: 'TEXT', nullable: true, description: 'Normalized owner name' },
      owner_entity_type: { 
        type: 'TEXT', 
        nullable: true, 
        description: 'Type of owner entity',
        validValues: ['individual', 'llc', 'corporation', 'trust_estate', 'government', 'unknown']
      },
      
      // Property characteristics
      acres_calc: { type: 'NUMERIC', nullable: true, description: 'Calculated acreage' },
      asset_class: { 
        type: 'TEXT', 
        nullable: true, 
        description: 'Property classification',
        validValues: ['residential', 'commercial', 'industrial', 'land', 'agricultural', 'unknown']
      },
      zoning_code: { type: 'TEXT', nullable: true, description: 'Zoning designation code' },
      year_built: { type: 'INTEGER', nullable: true, description: 'Year structure was built' },
      building_sqft: { type: 'INTEGER', nullable: true, description: 'Building square footage' },
      land_use_code: { type: 'TEXT', nullable: true, description: 'Land use code' },
      land_use_desc: { type: 'TEXT', nullable: true, description: 'Land use description' },
      
      // Values
      market_value: { type: 'NUMERIC', nullable: true, description: 'Total market value' },
      land_value: { type: 'NUMERIC', nullable: true, description: 'Land value only' },
      improvement_value: { type: 'NUMERIC', nullable: true, description: 'Improvement value' },
      assessed_total_value: { type: 'NUMERIC', nullable: true, description: 'Assessed value for taxation' },
      
      // Flags
      tax_delinquent_flag: { type: 'BOOLEAN', nullable: true, description: 'True if taxes are delinquent' },
      homestead_exemption_flag: { type: 'BOOLEAN', nullable: true, description: 'True if homestead exemption claimed' },
      
      // Additional data
      flood_zone: { type: 'TEXT', nullable: true, description: 'FEMA flood zone designation' },
      last_sale_date: { type: 'DATE', nullable: true, description: 'Date of last sale' },
      last_sale_price: { type: 'NUMERIC', nullable: true, description: 'Price of last sale' }
    },
    
    // Columns that DO NOT EXIST - prevent hallucinations
    nonExistentColumns: [
      'city',           // Use: mail_city
      'zip_code',       // Use: mail_zip
      'situs_city',     // Use: mail_city
      'situs_zip',      // Use: mail_zip
      'is_vacant',      // Use: asset_class = 'land'
      'property_type',  // Use: asset_class
      'owner_type',     // Use: owner_entity_type
      'value',          // Use: market_value
      'size',           // Use: acres_calc or building_sqft
      'address'         // Use: situs_address
    ],
    
    // Common filter patterns
    filterPatterns: {
      cityFilter: "situs_address ILIKE '%{city}%'",
      zipFilter: "situs_address LIKE '%{zip}%'",
      vacantLand: "asset_class ILIKE '%land%' OR asset_class ILIKE '%vacant%'",
      distressed: "tax_delinquent_flag = true",
      ownerTypeFilter: "owner_entity_type = '{type}'",
      acreageRange: "acres_calc BETWEEN {min} AND {max}",
      valueRange: "market_value BETWEEN {min} AND {max}"
    },
    
    // Related tables for JOINs
    relatedTables: {
      parcels_travis: {
        joinKey: 'parcel_id',
        purpose: 'Full parcel geometry (MultiPolygon)',
        columns: ['parcel_id', 'geom']
      },
      parcels_travis_enrichment: {
        joinKey: 'parcel_id', 
        purpose: 'Additional TCAD enrichment data',
        columns: ['parcel_id', 'last_sale_date', 'last_sale_price']
      },
      zoning_districts: {
        joinType: 'SPATIAL',
        joinCondition: 'ST_Intersects(pft.geom_centroid, zd.geometry)',
        purpose: 'Zoning district information',
        columns: ['zoning_code', 'zoning_desc', 'overlay', 'geometry']
      }
    },
    
    // Spatial query helpers
    spatialPatterns: {
      withinDistance: "ST_DWithin(geom_centroid::geography, ST_Point({lng}, {lat})::geography, {meters})",
      withinBbox: "ST_Intersects(geom_centroid, ST_MakeEnvelope({minLng}, {minLat}, {maxLng}, {maxLat}, 4326))",
      asGeoJSON: "ST_AsGeoJSON(geom_centroid)::json"
    }
  };
}

/**
 * Get schema context formatted for Claude system prompt
 */
export function getSchemaPromptSection() {
  const schema = getSchemaContext();
  
  return `
## Database Schema Reference

**Primary Table:** ${schema.primaryTable} (${schema.rowCount} properties)

### Available Columns for Filtering:
${Object.entries(schema.columns).map(([col, info]) => 
  `- ${col} (${info.type}): ${info.description}${info.validValues ? ` [Values: ${info.validValues.join(', ')}]` : ''}`
).join('\n')}

### CRITICAL - These columns DO NOT EXIST (use alternatives):
${schema.nonExistentColumns.map(col => `- ${col}`).join('\n')}

### Correct Filter Patterns:
- Filter by city: Use situs_address ILIKE '%{city}%' (mail_city is NULL in database)
- Filter by ZIP: Use situs_address LIKE '%{zip}%' (mail_zip is NULL in database)
- Find vacant land: asset_class ILIKE '%land%'
- Find distressed: tax_delinquent_flag = true

### Spatial Query Patterns:
- Within distance: ${schema.spatialPatterns.withinDistance}
- Within bbox: ${schema.spatialPatterns.withinBbox}
`;
}

export default { getSchemaContext, getSchemaPromptSection };
