/**
 * Schema Context Service
 * Provides accurate ATTOM schema information to prevent Claude hallucinations
 */

export function getSchemaContext() {
  return {
    primaryTable: 'attom_assessor',
    rowCount: '444,000+',
    
    columns: {
      // Primary key
      attom_id: { type: 'BIGINT', nullable: false, description: 'Unique ATTOM property identifier (PK)' },
      
      // Location
      address_full: { type: 'TEXT', nullable: true, description: 'Full property address' },
      address_city: { type: 'TEXT', nullable: true, description: 'City name (use for city filtering)' },
      address_state: { type: 'VARCHAR(2)', nullable: true, description: 'State abbreviation' },
      address_zip: { type: 'VARCHAR(10)', nullable: true, description: 'ZIP code (use for ZIP filtering)' },
      latitude: { type: 'NUMERIC', nullable: true, description: 'Latitude coordinate' },
      longitude: { type: 'NUMERIC', nullable: true, description: 'Longitude coordinate' },
      fips: { type: 'VARCHAR', nullable: true, description: 'County FIPS code (48453 = Travis)' },
      
      // Owner information
      owner1_name: { type: 'TEXT', nullable: true, description: 'Primary owner name' },
      owner2_name: { type: 'TEXT', nullable: true, description: 'Secondary owner name' },
      owner_type_desc: { type: 'TEXT', nullable: true, description: 'Owner type description' },
      company_flag: { type: 'BOOLEAN', nullable: true, description: 'True if owner is a company' },
      owner_occupied: { type: 'BOOLEAN', nullable: true, description: 'True if owner-occupied' },
      
      // Property characteristics
      lot_acres: { type: 'NUMERIC', nullable: true, description: 'Lot size in acres' },
      lot_sqft: { type: 'NUMERIC', nullable: true, description: 'Lot size in square feet' },
      property_use_group: { 
        type: 'TEXT', nullable: true, 
        description: 'Property type/classification (replaces asset_class)',
        validValues: ['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'VACANT LAND', 'AGRICULTURAL']
      },
      property_use_standard: { type: 'TEXT', nullable: true, description: 'Standardized property use code' },
      zoned_code_local: { type: 'TEXT', nullable: true, description: 'Local zoning code' },
      year_built: { type: 'INTEGER', nullable: true, description: 'Year structure was built' },
      building_sqft: { type: 'NUMERIC', nullable: true, description: 'Building square footage' },
      bedrooms_count: { type: 'INTEGER', nullable: true, description: 'Number of bedrooms' },
      bath_count: { type: 'NUMERIC', nullable: true, description: 'Number of bathrooms' },
      stories_count: { type: 'NUMERIC', nullable: true, description: 'Number of stories' },
      
      // Values
      market_value_total: { type: 'NUMERIC', nullable: true, description: 'Total market value' },
      market_value_land: { type: 'NUMERIC', nullable: true, description: 'Land value only' },
      market_value_improve: { type: 'NUMERIC', nullable: true, description: 'Improvement (building) value' },
      assessed_total: { type: 'NUMERIC', nullable: true, description: 'Assessed value for taxation' },
      tax_billed_amount: { type: 'NUMERIC', nullable: true, description: 'Annual tax billed' },
      
      // Tax flags
      tax_delinquent_year: { type: 'INTEGER', nullable: true, description: 'Year of tax delinquency (NOT NULL = delinquent)' },
      homestead_exempt: { type: 'BOOLEAN', nullable: true, description: 'True if homestead exemption claimed' },
      
      // Sales
      last_sale_date: { type: 'DATE', nullable: true, description: 'Date of last sale' },
      last_sale_price: { type: 'NUMERIC', nullable: true, description: 'Price of last sale' },
      prior_sale_date: { type: 'DATE', nullable: true, description: 'Date of prior sale' },
      prior_sale_price: { type: 'NUMERIC', nullable: true, description: 'Price of prior sale' }
    },
    
    // Columns that DO NOT EXIST - prevent hallucinations
    nonExistentColumns: [
      'parcel_id',          // Use: attom_id
      'situs_address',      // Use: address_full
      'owner_name_raw',     // Use: owner1_name
      'acres_calc',         // Use: lot_acres
      'asset_class',        // Use: property_use_group
      'market_value',       // Use: market_value_total
      'land_value',         // Use: market_value_land
      'improvement_value',  // Use: market_value_improve
      'tax_delinquent_flag',// Use: tax_delinquent_year IS NOT NULL
      'homestead_exemption_flag', // Use: homestead_exempt
      'geom_centroid',      // Use: latitude/longitude columns directly
      'owner_entity_type',  // Use: owner_type_desc
      'zoning_code',        // Use: zoned_code_local
      'is_vacant',          // Use: property_use_group ILIKE '%VACANT%' or '%LAND%'
      'situs_city',         // Use: address_city
      'situs_zip'           // Use: address_zip
    ],
    
    // Common filter patterns
    filterPatterns: {
      cityFilter: "address_city ILIKE '%{city}%'",
      zipFilter: "address_zip LIKE '{zip}%'",
      vacantLand: "property_use_group ILIKE '%VACANT%' OR property_use_group ILIKE '%LAND%'",
      distressed: "tax_delinquent_year IS NOT NULL",
      ownerTypeFilter: "owner_type_desc ILIKE '%{type}%'",
      acreageRange: "lot_acres BETWEEN {min} AND {max}",
      valueRange: "market_value_total BETWEEN {min} AND {max}"
    },
    
    // Related ATTOM tables for JOINs
    relatedTables: {
      attom_parcels: {
        joinKey: 'apn_formatted = attom_parcels.apn',
        purpose: 'Full parcel geometry (PostGIS MultiPolygon)',
        rows: '428,529'
      },
      attom_loan_model: {
        joinKey: 'attom_id = attom_loan_model.attomid',
        purpose: 'Current loan positions, LTV, equity estimates',
        rows: '359,725'
      },
      attom_rental_avm: {
        joinKey: 'attom_id = attom_rental_avm.attomid',
        purpose: 'Estimated rental values',
        rows: '344,536'
      },
      attom_preforeclosure: {
        joinKey: 'attom_id = attom_preforeclosure.attom_id',
        purpose: 'Preforeclosure/default/auction records',
        rows: '45,820'
      },
      attom_recorder: {
        joinKey: 'attom_id = attom_recorder.attomid',
        purpose: 'Transaction/deed/mortgage recording history',
        rows: '1,522,647'
      }
    }
  };
}

/**
 * Get schema context formatted for Claude system prompt
 */
export function getSchemaPromptSection() {
  const schema = getSchemaContext();
  
  return `
---BEGIN SCHEMA CONTEXT---

## Database Schema — ATTOM Data (Travis County, TX)

### Primary table: attom_assessor (444K+ parcels)

**Queryable columns:**
| Column | Type | Notes |
|--------|------|-------|
| attom_id | BIGINT (PK) | Unique property ID |
| address_full | TEXT | Full address |
| address_city | TEXT | City — use for city filtering |
| address_zip | VARCHAR | ZIP code — use for ZIP filtering |
| latitude / longitude | NUMERIC | Coordinates |
| owner1_name | TEXT | Primary owner |
| owner_type_desc | TEXT | Owner type |
| company_flag | BOOLEAN | Corporate owner |
| lot_acres | NUMERIC | Lot size in acres |
| property_use_group | TEXT | Property type: RESIDENTIAL, COMMERCIAL, INDUSTRIAL, VACANT LAND, etc. |
| property_use_standard | TEXT | Standardized use code |
| zoned_code_local | TEXT | Zoning code |
| market_value_total | NUMERIC | Total market value |
| market_value_land | NUMERIC | Land value |
| market_value_improve | NUMERIC | Improvement value |
| tax_delinquent_year | INTEGER | NOT NULL = delinquent |
| homestead_exempt | BOOLEAN | Homestead exemption |
| year_built | INTEGER | Year built |
| building_sqft | NUMERIC | Building size |
| bedrooms_count | INTEGER | Bedrooms |
| bath_count | NUMERIC | Bathrooms |
| last_sale_date | DATE | Last sale date |
| last_sale_price | NUMERIC | Last sale price |

### ATTOM Enrichment Tables (JOIN via attom_id):
- **attom_loan_model** (360K): Current loans, LTV, available equity
- **attom_rental_avm** (345K): Estimated rental values
- **attom_preforeclosure** (46K): Default/auction records
- **attom_recorder** (1.5M): Transaction history, deeds, mortgages
- **attom_parcels** (429K): Parcel boundary geometry (JOIN on apn_formatted = apn)

### CRITICAL — Column names that DO NOT EXIST:
${schema.nonExistentColumns.map(col => `- ${col}`).join('\n')}

### Correct Filter Patterns:
- City: address_city ILIKE '%{city}%'
- ZIP: address_zip LIKE '{zip}%'
- Vacant land: property_use_group ILIKE '%VACANT%' OR '%LAND%'
- Distressed: tax_delinquent_year IS NOT NULL
- Acreage: lot_acres BETWEEN min AND max
- Value: market_value_total BETWEEN min AND max

### Geographic coverage:
- Travis County, Texas (FIPS 48453)
- Bounding box: [-98.17, 30.07, -97.37, 30.63]

### Derived metrics (computed by backend, not in DB):
- valuePerAcre = market_value_total / lot_acres
- improvementRatio = market_value_improve / market_value_total

---END SCHEMA CONTEXT---
`;
}

export default { getSchemaContext, getSchemaPromptSection };