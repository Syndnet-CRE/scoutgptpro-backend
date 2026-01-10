# Database Schema Comparison Report

**Date:** 2024-12-19  
**Purpose:** Compare current database schema to proposed normalized schema design

---

## Executive Summary

The current database has **78 tables** with a mix of normalized and denormalized structures. The proposed schema introduces **12 normalized tables** that would consolidate and standardize property data across multiple counties. Key gaps include:

- ❌ **No normalized addresses table** (addresses scattered across multiple tables)
- ❌ **No historical ownership tracking** (current owners only)
- ❌ **No transaction history table** (only last_sale_date/price)
- ⚠️ **Limited AVM data** (exists in `properties` but not standardized)
- ❌ **No permits table** (missing entirely)
- ❌ **No zoning_cases table** (only `zoning_districts` with boundaries)
- ❌ **No flood_zones geometry table** (only `flood_zone` text field)
- ⚠️ **Tax delinquent data** exists but not in dedicated table

---

## 1. Current Schema Inventory

### All Tables (78 total)

**Core Property Tables:**
- `parcel_features_travis` - Main property features table (369,813 rows)
- `properties` - Legacy property table (denormalized, 84 columns)
- `parcels_travis` - Parcel boundaries with geometry (372,826 rows)
- `parcels_travis_enrichment` - Enrichment data with raw JSONB

**County-Specific Tables (12 counties):**
- `parcels_bastrop`, `parcels_bell`, `parcels_blanco`, `parcels_burnet`, `parcels_caldwell`, `parcels_comal`, `parcels_hays`, `parcels_kendall`, `parcels_lee`, `parcels_llano`, `parcels_travis`, `parcels_williamson`
- Each with corresponding `*_enrichment` tables

**Ownership Tables:**
- `owners` - Owner master table
- `owner_properties` - Owner-to-parcel mapping (current only)
- `owner_features_tx` - Owner aggregations
- `owner_segments` - Owner segmentation rules

**Signals & Opportunities:**
- `signals` - Property signals (tax delinquent, foreclosure, etc.)
- `opportunities` - Scored opportunities with breakdowns

**GIS & Spatial:**
- `zoning_districts` - Zoning boundaries with geometry
- `osm_pois_travis` - Points of interest
- `gis_layers` - GIS layer registry
- `layer_sets` - Layer set definitions

**CRM & Business:**
- `deal_rooms`, `deal_documents`, `deal_media`, `deal_user_access`, `nda_signatures`, `deal_activity_log`, `buyer_assumptions`
- `deals`, `listings`, `comps`, `buy_boxes`
- `users`, `user_profiles`, `documents`, `activities`, `tasks`

**Other:**
- `scoring_models` - Scoring model definitions
- `discover_runs`, `discover_results` - Discovery query results
- `xref_parcel_property_travis` - Parcel-to-property cross-reference
- `stg_attom_property_boundary_travis` - Attom data staging

---

## 2. Proposed Schema Mapping

| Proposed Table | Current Equivalent | Status | Notes |
|----------------|-------------------|--------|-------|
| **properties** | `parcel_features_travis` (primary)<br>`properties` (legacy)<br>`parcels_travis` (geometry) | ⚠️ **Partial** | Current: `parcel_id` as PK, `geom_centroid` (Point), no `parcel_boundary` (MultiPolygon)<br>Missing: `property_id`, `tcad_id`, `apn`, `sample_id`, `geo_id` as separate IDs<br>Missing: `parcel_boundary` geometry (have in `parcels_travis.geom` but not linked) |
| **addresses** | `parcel_features_travis.situs_address`<br>`parcel_features_travis.mailing_address`<br>`parcels_travis_enrichment.*` | ❌ **Missing** | Current: Addresses embedded in property tables<br>Missing: Normalized addresses table with `address_type` (situs/mailing), separate fields for street/city/state/zip<br>Missing: ZIP code extraction for spatial queries |
| **ownership** | `owners`<br>`owner_properties` | ⚠️ **Partial** | Current: Current owners only, no date ranges<br>Missing: `owner_start_date`, `owner_end_date`, `is_current_owner` flag<br>Missing: Historical ownership tracking |
| **tax_assessor** | `parcel_features_travis.market_value`<br>`parcel_features_travis.assessed_total_value`<br>`parcels_travis_enrichment.*` | ❌ **Missing** | Current: Single year values only<br>Missing: Time-series table with `tax_year`, multiple years of assessments<br>Missing: Historical tax assessment tracking |
| **property_characteristics** | `parcel_features_travis.*`<br>`parcels_travis_enrichment.*` | ⚠️ **Partial** | Current: Mixed into `parcel_features_travis`<br>Have: `year_built`, `building_sqft`, `acres_calc` (vs `lot_area_acres`), `asset_class` (vs `property_use_standardized`)<br>Missing: `bedrooms`, standardized `property_use_standardized` field |
| **avm_valuations** | `properties.avmValue`<br>`properties.avmConfidence` | ⚠️ **Partial** | Current: Exists in `properties` table but not standardized<br>Missing: Dedicated table with `avm_date`, `confidence_score`, `avm_min`, `avm_max`<br>Missing: Historical AVM tracking |
| **transactions** | `parcel_features_travis.last_sale_date`<br>`parcel_features_travis.last_sale_price`<br>`properties.lastSaleDate`<br>`properties.lastSaleAmount` | ❌ **Missing** | Current: Only most recent sale<br>Missing: Transaction history table with `sale_date`, `sale_price`, `arms_length_flag`, `distress_flag`, `foreclosure_flag`<br>Missing: Multiple transaction records per property |
| **zoning_cases** | None | ❌ **Missing** | Current: Only `zoning_districts` with boundaries<br>Missing: Zoning change applications, case numbers, dates, status |
| **permits** | None | ❌ **Missing** | Current: No permit data<br>Missing: Building permits table entirely |
| **tax_delinquent** | `parcel_features_travis.tax_delinquent_flag`<br>`signals` (for some signals) | ⚠️ **Partial** | Current: Boolean flag only<br>Missing: Dedicated table with `first_year_delinquent`, `delinquent_total`, detailed breakdown<br>Note: `signals` table exists but not specifically for tax delinquent |
| **zoning_districts** | `zoning_districts` | ✅ **Exists** | Current: Has `zoning_code`, `zoning_desc`, `geometry` (MultiPolygon), `overlay`<br>Status: Matches proposed schema well |
| **flood_zones** | `parcel_features_travis.flood_zone` (text)<br>`parcels_travis_enrichment.flood_zone` (text) | ❌ **Missing** | Current: Only text field, no geometry<br>Missing: FEMA flood zone boundaries as geometry (MultiPolygon)<br>Missing: Dedicated flood zones table |

---

## 3. Detailed Analysis

### 3.1 Properties Table

**Current State (`parcel_features_travis`):**
- **Primary Key:** `parcel_id` (text)
- **Geometry:** `geom_centroid` (Point, SRID 4326) ✅
- **Missing:** `parcel_boundary` (MultiPolygon) - exists in `parcels_travis.geom` but not linked
- **External IDs:** None explicitly tracked
  - `parcel_id` serves as TCAD ID
  - No `property_id`, `apn`, `sample_id`, `geo_id` fields
- **Cross-Reference:** `xref_parcel_property_travis` links to Attom IDs but not standardized

**Gap Analysis:**
- ❌ Need to add `property_id` (UUID) as primary key
- ❌ Need to add `tcad_id`, `apn`, `sample_id`, `geo_id` as separate columns
- ❌ Need to link `parcel_boundary` from `parcels_travis.geom`
- ⚠️ Current `parcel_id` can serve as `tcad_id` but needs renaming/clarification

### 3.2 Addresses Table

**Current State:**
- Addresses embedded in `parcel_features_travis`:
  - `situs_address` (single text field)
  - `mailing_address` (single text field)
  - `mail_city`, `mail_state`, `mail_zip` (separate fields for mailing only)
- Also in `parcels_travis_enrichment`:
  - `situs_address`, `mail_address1`, `mail_address2`, `mail_city`, `mail_state`, `mail_zip`
  - Raw JSONB with `SITUS_ADDR`, `SITUS_CITY`, `SITUS_ZIP`, `MAIL_ADDR`, `MAIL_ZIP`

**Gap Analysis:**
- ❌ No normalized addresses table
- ❌ Situs address not parsed into street/city/state/zip
- ❌ No `address_type` field to distinguish situs vs mailing
- ❌ ZIP code extraction needed for spatial queries (currently in `parcels_travis_enrichment.raw->>'SITUS_ZIP'`)
- ⚠️ Data exists but needs normalization

### 3.3 Ownership Table

**Current State:**
- `owners` table: Master owner records
  - `id`, `ownerNameRaw`, `ownerNameNorm`, `mailingAddressRaw`, `mailingAddressNorm`, `mailingState`, `entityType`, `isCorporate`
- `owner_properties` table: Current owner-to-parcel mapping
  - `id`, `ownerId`, `parcelId`, `createdAt`
  - No `owner_start_date`, `owner_end_date`, `is_current_owner`

**Gap Analysis:**
- ❌ No historical ownership tracking
- ❌ No date ranges for ownership periods
- ❌ No `is_current_owner` flag (all records are current)
- ⚠️ Structure exists but lacks temporal dimension

### 3.4 Tax Assessor Table

**Current State:**
- Single-year values in `parcel_features_travis`:
  - `market_value`, `assessed_total_value`, `land_value`, `improvement_value`
- Also in `parcels_travis_enrichment`:
  - `market_value`, `assessed_value`, `land_value`, `improvement_value`
  - Raw JSONB with `TAX_YEAR`, `MKT_VALUE`, `LAND_VALUE`, `IMP_VALUE`

**Gap Analysis:**
- ❌ No time-series tax assessment table
- ❌ No `tax_year` field (exists in raw JSONB but not extracted)
- ❌ Cannot track assessment history over multiple years
- ⚠️ Data exists in raw JSONB but not structured

### 3.5 Property Characteristics

**Current State (`parcel_features_travis`):**
- ✅ `year_built` (integer)
- ✅ `building_sqft` (numeric) - matches proposed `sqft`
- ✅ `acres_calc` (numeric) - matches proposed `lot_area_acres`
- ⚠️ `asset_class` (text) - similar to proposed `property_use_standardized` but different values
- ❌ `bedrooms` - missing
- ❌ `property_use_standardized` - have `asset_class` but not standardized

**Gap Analysis:**
- ⚠️ Most fields exist but in different table
- ❌ Need `bedrooms` field
- ❌ Need standardized `property_use_standardized` enum/field

### 3.6 AVM Valuations

**Current State (`properties` table):**
- `avmValue` (Decimal)
- `avmMin`, `avmMax` (Decimal)
- `avmConfidence` (Integer)
- `avmDate` (DateTime)

**Gap Analysis:**
- ⚠️ Data exists but in legacy `properties` table
- ❌ Not linked to `parcel_features_travis`
- ❌ No historical AVM tracking (single record per property)
- ❌ Not standardized across system

### 3.7 Transactions

**Current State:**
- `parcel_features_travis.last_sale_date` (date)
- `parcel_features_travis.last_sale_price` (numeric)
- `properties.lastSaleDate`, `properties.lastSaleAmount`
- `properties.isForeclosure` (boolean)
- `properties.lastSaleDocType` (text)

**Gap Analysis:**
- ❌ No transaction history table
- ❌ Only most recent sale tracked
- ❌ No `arms_length_flag`, `distress_flag` (have `isForeclosure` but not standardized)
- ❌ Cannot track multiple transactions per property

### 3.8 Zoning Cases

**Current State:**
- `zoning_districts` table: Zoning boundaries only
  - `zoning_code`, `zoning_desc`, `overlay`, `geometry` (MultiPolygon)

**Gap Analysis:**
- ❌ No zoning cases/change applications table
- ❌ No case numbers, application dates, status tracking
- ✅ Have zoning boundaries but not change history

### 3.9 Permits

**Current State:**
- No permit tables exist

**Gap Analysis:**
- ❌ Missing entirely
- ❌ No building permit data

### 3.10 Tax Delinquent

**Current State:**
- `parcel_features_travis.tax_delinquent_flag` (boolean)
- `signals` table: Can track tax delinquent signals but not specifically designed for it
  - `signal_type`, `signal_subtype`, `signal_date`, `signal_value`, `signal_severity`

**Gap Analysis:**
- ⚠️ Boolean flag exists but lacks detail
- ❌ No `first_year_delinquent` field
- ❌ No `delinquent_total` field
- ⚠️ `signals` table could be used but not standardized

### 3.11 Zoning Districts

**Current State:**
- ✅ `zoning_districts` table exists
  - `zoning_code`, `zoning_desc`, `overlay`, `geometry` (MultiPolygon), `raw_attributes` (JSONB)

**Gap Analysis:**
- ✅ Matches proposed schema well
- ✅ Has geometry with GIST index
- ✅ Has zoning codes and descriptions

### 3.12 Flood Zones

**Current State:**
- `parcel_features_travis.flood_zone` (text field)
- `parcels_travis_enrichment.flood_zone` (text field)

**Gap Analysis:**
- ❌ No flood zone geometry table
- ❌ No FEMA flood zone boundaries as MultiPolygon
- ❌ Only text codes, no spatial boundaries

---

## 4. Critical Gaps Summary

### Missing Tables (7 of 12)
1. ❌ **addresses** - No normalized addresses table
2. ❌ **tax_assessor** - No time-series tax assessments
3. ❌ **transactions** - No transaction history
4. ❌ **zoning_cases** - No zoning change applications
5. ❌ **permits** - No building permits table
6. ❌ **flood_zones** - No flood zone geometry table
7. ⚠️ **tax_delinquent** - Exists as flag, needs dedicated table

### Partial Implementations (4 of 12)
1. ⚠️ **properties** - Has data but missing IDs and parcel_boundary link
2. ⚠️ **ownership** - Has current owners but no historical tracking
3. ⚠️ **property_characteristics** - Has most fields but missing bedrooms, standardized use
4. ⚠️ **avm_valuations** - Exists in legacy table but not standardized

### Complete Implementations (1 of 12)
1. ✅ **zoning_districts** - Matches proposed schema well

---

## 5. Data Quality & Availability

### ZIP Code Data
- **Current:** ZIP codes exist in `parcels_travis_enrichment.raw->>'SITUS_ZIP'` and `parcels_travis_enrichment.raw->>'MAIL_ZIP'`
- **Gap:** Not extracted to normalized addresses table
- **Impact:** Spatial queries by ZIP code require JSONB extraction

### Property Use Standardization
- **Current:** `asset_class` field with values: `residential`, `commercial`, `land`, `industrial`, `mixed`, `unknown`
- **Gap:** Not standardized to proposed `property_use_standardized` enum
- **Impact:** May need mapping/transformation

### Lot Area/Acres
- **Current:** `acres_calc` in `parcel_features_travis` (369,813 rows populated)
- **Gap:** Field name differs (`acres_calc` vs `lot_area_acres`)
- **Impact:** Minor - field exists and is populated

### Transaction History
- **Current:** Only `last_sale_date` and `last_sale_price`
- **Gap:** No historical transaction tracking
- **Impact:** Cannot detect "distressed sale" patterns without transaction history

### Parcel Boundary Geometry
- **Current:** `parcels_travis.geom` (MultiPolygon, 372,826 rows)
- **Gap:** Not linked to `parcel_features_travis` (only `geom_centroid` Point)
- **Impact:** Cannot query by parcel boundary without joining tables

---

## 6. Migration Recommendations

### Phase 1: Foundation (High Priority)
1. **Create `properties` table** with proper IDs
   - Add `property_id` (UUID) as primary key
   - Add `tcad_id`, `apn`, `sample_id`, `geo_id` columns
   - Link `parcel_boundary` from `parcels_travis.geom`
   - Migrate data from `parcel_features_travis`

2. **Create `addresses` table**
   - Extract addresses from `parcel_features_travis` and `parcels_travis_enrichment`
   - Parse situs and mailing addresses into normalized fields
   - Extract ZIP codes for spatial queries
   - Link to `properties` via `property_id`

3. **Enhance `ownership` table**
   - Add `owner_start_date`, `owner_end_date`, `is_current_owner`
   - Migrate historical ownership from raw data if available
   - Update `owner_properties` to include temporal fields

### Phase 2: Time-Series Data (Medium Priority)
4. **Create `tax_assessor` table**
   - Extract `TAX_YEAR` from `parcels_travis_enrichment.raw`
   - Create time-series records for multiple years
   - Link to `properties` via `property_id`

5. **Create `transactions` table**
   - Extract transaction data from raw sources
   - Add `arms_length_flag`, `distress_flag`, `foreclosure_flag`
   - Link to `properties` via `property_id`

6. **Create `avm_valuations` table**
   - Migrate AVM data from `properties` table
   - Add historical AVM tracking
   - Link to `properties` via `property_id`

### Phase 3: Additional Features (Lower Priority)
7. **Create `zoning_cases` table**
   - Source zoning change applications from city/county records
   - Link to `properties` via `property_id`

8. **Create `permits` table**
   - Source building permits from city/county records
   - Link to `properties` via `property_id`

9. **Create `tax_delinquent` table**
   - Extract detailed tax delinquent data
   - Add `first_year_delinquent`, `delinquent_total`
   - Link to `properties` via `property_id`

10. **Create `flood_zones` table**
    - Source FEMA flood zone boundaries (geometry)
    - Create MultiPolygon boundaries
    - Link to `properties` via spatial intersection

### Phase 4: Materialized Views
11. **Create `property_current_snapshot` materialized view**
    - Join all tables to create current state view
    - Include current owner, latest assessment, latest AVM, etc.
    - Refresh on schedule

---

## 7. Priority Order for Implementation

### Critical Path (Must Have)
1. ✅ **properties** table - Foundation for all other tables
2. ✅ **addresses** table - Required for spatial queries by ZIP
3. ✅ **ownership** enhancement - Historical tracking needed

### High Value (Should Have)
4. ✅ **tax_assessor** table - Time-series assessments valuable
5. ✅ **transactions** table - Distressed sale detection critical
6. ✅ **avm_valuations** table - Standardize AVM data

### Nice to Have (Could Have)
7. ⚠️ **zoning_cases** table - Lower priority, can source later
8. ⚠️ **permits** table - Lower priority, can source later
9. ⚠️ **tax_delinquent** table - Can use `signals` table for now
10. ⚠️ **flood_zones** table - Lower priority, text field exists

---

## 8. Implementation Considerations

### Data Sources
- **Current:** `parcel_features_travis`, `parcels_travis_enrichment`, `parcels_travis`
- **Raw Data:** JSONB fields in enrichment tables contain additional data
- **External:** May need to source permits, zoning cases, flood zones from city/county

### Migration Strategy
1. **Create new tables** alongside existing tables
2. **Migrate data** in batches to avoid downtime
3. **Update application code** to use new tables
4. **Deprecate old tables** after migration complete

### Performance Considerations
- **PostGIS GIST indexes** on all geometry columns ✅ (already implemented)
- **Materialized view** for current snapshot (needs implementation)
- **Indexes** on foreign keys and frequently queried fields

### Backward Compatibility
- **Keep existing tables** during migration period
- **Create views** to map old tables to new schema
- **Gradual migration** of application code

---

## 9. Conclusion

The current database schema has **significant data** but lacks **normalization** and **temporal tracking**. The proposed schema would:

- ✅ **Consolidate** property data into a single source of truth
- ✅ **Normalize** addresses, ownership, and assessments
- ✅ **Enable** historical tracking of ownership, assessments, and transactions
- ✅ **Standardize** data across multiple counties
- ✅ **Improve** query performance with proper indexes and materialized views

**Recommendation:** Proceed with Phase 1 (Foundation) migration to establish the normalized schema, then gradually migrate time-series and additional features.

---

## Appendix: Current Table Counts

- **Total Tables:** 78
- **Property-Related:** ~15 tables
- **County-Specific:** 24 tables (12 counties × 2 tables each)
- **CRM/Business:** ~15 tables
- **GIS/Spatial:** ~5 tables
- **Other:** ~19 tables
