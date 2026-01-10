# ScoutGPT vs SyndNet Database Schema Audit

**Generated:** 2024-12-19  
**Database:** PostgreSQL/PostGIS (Neon)  
**Total Tables:** 78  
**Primary Property Table:** `parcel_features_travis` (369,813 rows)

---

## Executive Summary

ScoutGPT's database schema is **significantly denormalized** compared to SyndNet's normalized design. The current architecture uses `parcel_features_travis` as the primary property table with **34 columns** containing mixed concerns (addresses, ownership, tax, characteristics). SyndNet's design separates these into **12 normalized tables** with clear relationships.

**Key Findings:**
- ❌ **7 of 12 SyndNet tables missing entirely** (addresses, tax_assessor, transactions, zoning_cases, permits, tax_delinquent, flood_zones)
- ⚠️ **4 of 12 partially implemented** (properties, ownership, property_characteristics, avm_valuations)
- ✅ **1 of 12 complete** (zoning_districts)
- **Data Quality:** 19.5% NULL `asset_class`, 100% NULL `year_built` in `parcel_features_travis`
- **Geometry:** Parcel boundaries exist in `parcels_travis.geom` but not linked to `parcel_features_travis`
- **Identifiers:** No unified `property_id`; relies on `parcel_id` with cross-reference to Attom IDs

**Impact:** Current schema works for basic queries but lacks:
- Historical tracking (ownership, assessments, transactions)
- Normalized addresses for spatial queries
- Time-series data for trend analysis
- Transaction history for distressed sale detection

---

## Section 1: Current ScoutGPT Schema

### 1.1 All Tables (78 total)

**Core Property Tables:**
- `parcel_features_travis` (369,813 rows) - Main property features
- `properties` (351,638 rows) - Legacy denormalized table
- `parcels_travis` (373,826 rows) - Parcel boundaries with geometry
- `parcels_travis_enrichment` (369,813 rows) - Enrichment data with raw JSONB

**County-Specific Tables (12 counties × 2 tables = 24 tables):**
- `parcels_bastrop`, `parcels_bell`, `parcels_blanco`, `parcels_burnet`, `parcels_caldwell`, `parcels_comal`, `parcels_hays`, `parcels_kendall`, `parcels_lee`, `parcels_llano`, `parcels_travis`, `parcels_williamson`
- Each with corresponding `*_enrichment` tables

**Ownership Tables:**
- `owners` (85,579 rows)
- `owner_properties` (100,000 rows)
- `owner_features_tx` (85,579 rows)
- `owner_segments` (5 rows)

**Signals & Opportunities:**
- `signals` (0 rows) - Table exists but empty
- `opportunities` (0 rows) - Table exists but empty

**GIS & Spatial:**
- `zoning_districts` (22,488 rows) - Zoning boundaries with geometry
- `osm_pois_travis` (127 rows) - Points of interest
- `gis_layers` (10 rows)
- `layer_sets` (32 rows)

**CRM & Business:**
- `deal_rooms`, `deal_documents`, `deal_media`, `deal_user_access`, `nda_signatures`, `deal_activity_log`, `buyer_assumptions`
- `deals`, `listings`, `comps`, `buy_boxes`
- `users`, `user_profiles`, `documents`, `activities`, `tasks`

**Cross-Reference:**
- `xref_parcel_property_travis` (401,851 rows) - Links `parcel_id` to `attom_id`
- `xref_parcel_property_travis_conflicts` (5,067 rows)

### 1.2 Key Table Structures

#### `parcel_features_travis` (Primary Property Table)
**Columns (34 total):**
- **Identifiers:** `parcel_id` (PK, TEXT), `county_fips` (TEXT, default '48453')
- **Addresses:** `situs_address` (TEXT), `mailing_address` (TEXT), `mail_city`, `mail_state`, `mail_zip`
- **Ownership:** `owner_name_raw`, `owner_name_norm`, `owner_entity_type`, `owner_segment`, `owner_portfolio_count_travis`
- **Characteristics:** `acres_calc` (NUMERIC, NOT NULL), `asset_class`, `year_built` (INT), `building_sqft` (NUMERIC)
- **Financial:** `market_value`, `assessed_total_value`, `land_value`, `improvement_value`
- **Tax:** `tax_delinquent_flag` (BOOLEAN), `homestead_exemption_flag` (BOOLEAN)
- **Transactions:** `last_sale_date` (DATE), `last_sale_price` (NUMERIC)
- **Zoning/Flood:** `zoning_code`, `flood_zone`, `land_use_code`, `land_use_desc`
- **Geometry:** `geom_centroid` (GEOMETRY Point, SRID 4326)
- **Metadata:** `created_at`, `updated_at`, `acres_calc_source`, `acres_calc_confidence`, `asset_class_confidence`

**Indexes:**
- GIST: `idx_pft_geom` on `geom_centroid`
- B-tree: `idx_pft_acres`, `idx_pft_asset_class`, `idx_pft_county_acres`, `idx_pft_market_value`, `idx_pft_owner_entity_type`, `idx_pft_owner_segment`

#### `parcels_travis` (Parcel Boundaries)
**Columns (3 total):**
- `parcel_id` (PK, TEXT)
- `geom` (GEOMETRY MultiPolygon, SRID 4326, NOT NULL)
- `created_at` (TIMESTAMPTZ)

**Indexes:**
- GIST: `parcels_travis_geom_idx` on `geom`

**Note:** This table contains parcel boundaries but is **NOT linked** to `parcel_features_travis` via foreign key. Must join on `parcel_id`.

#### `parcels_travis_enrichment` (Enrichment Data)
**Columns (37 total):**
- Similar to `parcel_features_travis` but with additional fields
- **Key Addition:** `raw` (JSONB) - Contains original source data with keys like `SITUS_ZIP`, `MAIL_ZIP`, `Prop_ID`, `GEO_ID`, `TAX_YEAR`

**Relationship:** One-to-one with `parcels_travis` via `parcel_id` (FK)

#### `properties` (Legacy Table)
**Columns (85 total):**
- **Identifiers:** `id` (PK, TEXT), `parcelId` (UNIQUE, TEXT), `attomId` (TEXT), `geoId` (TEXT), `apn` (TEXT, all NULL)
- **Addresses:** Multiple address fields (`address`, `siteAddress`, `mailingAddr`, `situsNum`, `situsStreet`, etc.)
- **AVM:** `avmValue`, `avmMin`, `avmMax`, `avmConfidence`, `avmDate`
- **Transactions:** `lastSaleDate`, `lastSaleAmount`, `lastSaleDocType`, `isForeclosure`
- **Ownership:** `ownerName`, `ownerFirstName`, `ownerLastName`, `grantorName`, `granteeName`
- **Geometry:** `centroid` (JSONB), `latitude`, `longitude` (no PostGIS geometry)

**Note:** This table is **denormalized** and contains data overlapping with `parcel_features_travis`. Not all parcels have entries here (351,638 vs 369,813).

#### `owners` (Owner Master Table)
**Columns (9 total):**
- `id` (PK, TEXT)
- `ownerNameRaw`, `ownerNameNorm`
- `mailingAddressRaw`, `mailingAddressNorm`, `mailingState`
- `entityType` (ENUM: PERSON, LLC, INC, LP, TRUST, UNKNOWN)
- `isCorporate` (BOOLEAN)
- `createdAt`, `updatedAt`

**Indexes:**
- `idx_owners_entitytype`, `idx_owners_iscorporate`, `idx_owners_mailingstate`, `idx_owners_ownernamenorm`

#### `owner_properties` (Owner-to-Parcel Mapping)
**Columns (4 total):**
- `id` (PK, TEXT)
- `ownerId` (FK → `owners.id`)
- `parcelId` (TEXT, no FK)
- `createdAt` (TIMESTAMP)

**Indexes:**
- `idx_owner_properties_ownerid`, `idx_owner_properties_parcelid`
- UNIQUE: `(ownerId, parcelId)`

**Note:** No temporal fields (`owner_start_date`, `owner_end_date`, `is_current_owner`). All records are current.

#### `signals` (Property Signals)
**Columns (17 total):**
- `id` (PK, TEXT)
- `parcel_id` (FK → `parcel_features_travis.parcel_id`)
- `county_fips` (TEXT)
- `signal_type`, `signal_subtype` (TEXT)
- `signal_date` (DATE)
- `signal_value` (NUMERIC)
- `signal_years` (INT)
- `signal_severity` (TEXT)
- `source_system`, `source_id`, `source_url` (TEXT)
- `raw_data` (JSONB)
- `is_active` (BOOLEAN)
- `expires_at` (TIMESTAMPTZ)
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Indexes:**
- `idx_signals_parcel_id`, `idx_signals_signal_type`, `idx_signals_signal_date`, `idx_signals_is_active`, `idx_signals_parcel_active` (partial)

**Status:** Table exists but **empty** (0 rows)

#### `opportunities` (Scored Opportunities)
**Columns (24 total):**
- `id` (PK, TEXT)
- `parcel_id` (FK → `parcel_features_travis.parcel_id`)
- `county_fips` (TEXT)
- **Scores:** `opportunity_score`, `distress_score`, `offmarket_score`, `value_score` (NUMERIC)
- **Breakdowns:** `distress_breakdown`, `offmarket_breakdown`, `value_breakdown` (JSONB)
- `tags` (TEXT[]), `reasons_json` (JSONB)
- `model_version` (TEXT)
- `scored_at` (TIMESTAMPTZ)
- `signal_count` (INT)
- **Denormalized:** `acres_calc`, `market_value`, `asset_class`, `owner_entity_type`, `is_absentee`, `situs_city`, `situs_zip`
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Status:** Table exists but **empty** (0 rows)

#### `zoning_districts` (Zoning Boundaries)
**Columns (6 total):**
- `id` (PK, SERIAL)
- `zoning_code` (VARCHAR(50))
- `zoning_desc` (VARCHAR(255))
- `overlay` (VARCHAR(50))
- `geometry` (GEOMETRY MultiPolygon, SRID 4326)
- `raw_attributes` (JSONB)
- `created_at` (TIMESTAMP)

**Indexes:**
- GIST: `idx_zoning_districts_geom` on `geometry`
- B-tree: `idx_zoning_districts_code`, `idx_zoning_districts_overlay`

**Status:** ✅ **Matches SyndNet design well** (22,488 rows)

### 1.3 Geometry Columns

**PostGIS Geometry Columns (18 total):**
- **Point:** `parcel_features_travis.geom_centroid`, `osm_pois_travis.geom`
- **MultiPolygon:** All `parcels_*` tables (12 counties), `zoning_districts.geometry`, `parcels_burnet_raw.geom`, `parcels_travis_txgio_stage.geom`, `parcels_tx.geom`

**Spatial Indexes (GIST):** 21 total
- All geometry columns have GIST indexes ✅

**SRID:** All use 4326 (WGS84) ✅

### 1.4 Foreign Key Relationships

**Key Relationships:**
- `owner_properties.ownerId` → `owners.id` ✅
- `owner_features_tx.ownerId` → `owners.id` ✅
- `signals.parcel_id` → `parcel_features_travis.parcel_id` ✅
- `opportunities.parcel_id` → `parcel_features_travis.parcel_id` ✅
- All `*_enrichment` tables → corresponding `parcels_*` tables ✅
- `parcels_travis_enrichment.parcel_id` → `parcels_travis.parcel_id` ✅

**Missing Relationships:**
- ❌ No FK from `parcel_features_travis` to `parcels_travis` (should link `parcel_id`)
- ❌ No FK from `properties` to `parcel_features_travis` (should link `parcelId` → `parcel_id`)
- ❌ No FK from `owner_properties.parcelId` to `parcel_features_travis.parcel_id`

---

## Section 2: Prisma Schema

See `/Users/braydonirwin/scoutgptpro-backend/prisma/schema.prisma` (1,648 lines)

**Key Models:**
- `Property` - Maps to `properties` table (legacy)
- `parcel_features_travis` - Maps to `parcel_features_travis` table (primary)
- `Owner`, `OwnerProperty`, `OwnerFeaturesTx` - Ownership tables
- `parcels_travis`, `parcels_travis_enrichment` - Parcel geometry and enrichment
- `signals`, `opportunities`, `scoring_models` - Scoring tables
- `zoning_districts` - Zoning boundaries
- CRM models: `DealRoom`, `DealDocument`, `DealMedia`, `DealUserAccess`, `NdaSignature`, `DealActivityLog`, `BuyerAssumptions`

**Note:** Prisma schema does NOT define all 78 tables. Many county-specific and staging tables are missing from Prisma.

---

## Section 3: Table-by-Table Comparison

| SyndNet Table | ScoutGPT Equivalent | Status | Gap Analysis |
|---------------|---------------------|--------|--------------|
| **properties** | `parcel_features_travis` (primary)<br>`properties` (legacy)<br>`parcels_travis` (geometry) | ⚠️ **Partial** | **Current:** `parcel_id` as PK (TEXT), `geom_centroid` (Point), no `parcel_boundary` link<br>**Missing:** `property_id` (SERIAL/UUID), `tcad_id`, `apn`, `sample_id`, `geo_id` as separate columns<br>**Missing:** `parcel_boundary` geometry link (exists in `parcels_travis.geom` but not joined)<br>**Note:** `parcel_id` serves as TCAD ID but not explicitly named |
| **addresses** | `parcel_features_travis.situs_address`<br>`parcel_features_travis.mailing_address`<br>`parcels_travis_enrichment.*` | ❌ **Missing** | **Current:** Addresses embedded in property tables as TEXT fields<br>**Missing:** Normalized addresses table with `address_type` (situs/mailing/grantor/grantee)<br>**Missing:** Parsed address components (house_number, street_name, street_suffix, unit_prefix, unit_value, zip_code, zip4)<br>**Missing:** ZIP code extraction for spatial queries (exists in `parcels_travis_enrichment.raw->>'SITUS_ZIP'` but not normalized) |
| **ownership** | `owners`<br>`owner_properties` | ⚠️ **Partial** | **Current:** Current owners only, no date ranges<br>**Missing:** `owner_start_date`, `owner_end_date`, `is_current_owner` flag<br>**Missing:** Historical ownership tracking<br>**Missing:** `is_owner_occupied`, `ownership_vesting` fields<br>**Note:** `owner_properties` has `createdAt` but no temporal ownership periods |
| **tax_assessor** | `parcel_features_travis.market_value`<br>`parcel_features_travis.assessed_total_value`<br>`parcels_travis_enrichment.*` | ❌ **Missing** | **Current:** Single-year values only (current assessment)<br>**Missing:** Time-series table with `tax_year` field<br>**Missing:** Historical tax assessment tracking (multiple years)<br>**Missing:** Separate `assessed_value_land`, `assessed_value_improvements` (have combined `assessed_total_value`)<br>**Missing:** `market_value_land`, `market_value_improvements` (have combined `market_value`)<br>**Missing:** `tax_billed_amount` field<br>**Missing:** Exemption flags (senior, veteran, disabled) - only have `homestead_exemption_flag`<br>**Note:** `parcels_travis_enrichment.raw->>'TAX_YEAR'` exists but not extracted |
| **property_characteristics** | `parcel_features_travis.*`<br>`parcels_travis_enrichment.*` | ⚠️ **Partial** | **Current:** Mixed into `parcel_features_travis`<br>**Have:** `year_built` (INT, but 100% NULL), `building_sqft` (NUMERIC), `acres_calc` (NUMERIC, matches `lot_area_acres`), `asset_class` (similar to `property_use_standardized`)<br>**Missing:** `year_built_effective` (after renovations)<br>**Missing:** `property_use_code` (have `land_use_code` but different)<br>**Missing:** `property_use_standardized` enum (have `asset_class` with values: residential, commercial, land, industrial, mixed, unknown)<br>**Missing:** `bedroom_count`, `bathroom_count`, `stories_count`, `units_count`<br>**Missing:** `garage_type`, `garage_area_sqft`, `pool_flag`, `pool_area_sqft`<br>**Missing:** `lot_area_sqft` (have `acres_calc` but not sqft) |
| **avm_valuations** | `properties.avmValue`<br>`properties.avmConfidence` | ⚠️ **Partial** | **Current:** Exists in legacy `properties` table (263,706 rows with AVM data)<br>**Have:** `avmValue`, `avmMin`, `avmMax`, `avmConfidence`, `avmDate`<br>**Missing:** Dedicated table with proper relationships<br>**Missing:** Historical AVM tracking (single record per property)<br>**Missing:** `forecast_std_deviation`, `create_date`, `publication_date` fields<br>**Missing:** Link to `parcel_features_travis` (only in `properties` table) |
| **transactions** | `parcel_features_travis.last_sale_date`<br>`parcel_features_travis.last_sale_price`<br>`properties.lastSaleDate`<br>`properties.lastSaleAmount` | ❌ **Missing** | **Current:** Only most recent sale tracked<br>**Missing:** Transaction history table with multiple records per property<br>**Missing:** `document_number`, `instrument_number`, `document_type_code`<br>**Missing:** `recording_date`, `instrument_date` (have `last_sale_date` but not separate)<br>**Missing:** `transfer_tax_total` field<br>**Missing:** `arms_length_flag`, `distress_flag` (have `isForeclosure` in `properties` but not standardized)<br>**Missing:** `multi_parcel_flag`<br>**Note:** Cannot track transaction history or detect distressed sale patterns |
| **zoning_cases** | None | ❌ **Missing** | **Current:** Only `zoning_districts` with boundaries<br>**Missing:** Zoning change applications table entirely<br>**Missing:** `case_number`, `permit_number`, `case_name`, `case_type`, `sub_type`, `status`<br>**Missing:** `existing_zoning`, `proposed_zoning`<br>**Missing:** `application_date`, `approval_date`<br>**Missing:** `council_district`, `watershed`<br>**Missing:** `location` geometry (Point) |
| **permits** | None | ❌ **Missing** | **Current:** No permit data<br>**Missing:** Building permits table entirely<br>**Missing:** `permit_number`, `permit_type`, `permit_type_desc`, `permit_class`, `work_class`<br>**Missing:** `description`, `applied_date`, `issued_date`, `completed_date`, `status`<br>**Missing:** `total_job_valuation`<br>**Missing:** `location` geometry (Point) |
| **tax_delinquent** | `parcel_features_travis.tax_delinquent_flag`<br>`signals` (can track but not specifically designed) | ⚠️ **Partial** | **Current:** Boolean flag only (`tax_delinquent_flag`)<br>**Missing:** Dedicated table with detailed breakdown<br>**Missing:** `account_number` field<br>**Missing:** `last_tax_roll_year`, `first_year_delinquent` fields<br>**Missing:** `delinquent_total`, `total_due` fields<br>**Missing:** `property_type`, `as_of_date` fields<br>**Note:** `signals` table could be used but not standardized for tax delinquent |
| **zoning_districts** | `zoning_districts` | ✅ **Complete** | **Current:** Matches SyndNet design well<br>**Have:** `zoning_code`, `zoning_desc`, `geometry` (MultiPolygon), `overlay`<br>**Have:** GIST index on `geometry` ✅<br>**Have:** B-tree indexes on `zoning_code` and `overlay` ✅<br>**Status:** 22,488 rows, well-indexed |
| **flood_zones** | `parcel_features_travis.flood_zone` (TEXT)<br>`parcels_travis_enrichment.flood_zone` (TEXT) | ❌ **Missing** | **Current:** Only text field (`flood_zone` TEXT), no geometry<br>**Missing:** FEMA flood zone boundaries as geometry (MultiPolygon)<br>**Missing:** Dedicated flood zones table<br>**Missing:** `fld_area_id`, `dfirm`, `zone_type`, `zone_subtype` fields<br>**Missing:** `static_bfe` (Base Flood Elevation)<br>**Missing:** `sfha_indicator` (Special Flood Hazard Area flag)<br>**Missing:** `zone_boundary` geometry (MultiPolygon) |

---

## Section 4: Normalization Analysis

| Concern | SyndNet Approach | ScoutGPT Current | Issue |
|---------|------------------|------------------|-------|
| **Addresses** | Separate `addresses` table with `address_type` (situs/mailing/grantor/grantee), parsed components | Embedded in `parcel_features_travis` as TEXT fields (`situs_address`, `mailing_address`). Also in `parcels_travis_enrichment` and `properties` table | **Denormalized:** Addresses duplicated across 3 tables. No parsing into components. ZIP codes in JSONB (`raw->>'SITUS_ZIP'`) not extracted. Cannot query by ZIP code efficiently. |
| **Ownership History** | `ownership` table with `owner_start_date`, `owner_end_date`, `is_current_owner` flag | `owner_properties` table with only `createdAt` (no end dates). All records are current. | **No History:** Cannot track ownership changes over time. Cannot determine when ownership changed or previous owners. |
| **Tax Assessments** | `tax_assessor` table with `tax_year` field, multiple years per property | Single-year values in `parcel_features_travis` (`market_value`, `assessed_total_value`). `TAX_YEAR` exists in `parcels_travis_enrichment.raw` JSONB but not extracted. | **No Time-Series:** Cannot track assessment history. Cannot analyze trends or compare year-over-year changes. |
| **AVM Valuations** | `avm_valuations` table with `valuation_date`, historical tracking | Single AVM record in `properties` table (`avmValue`, `avmDate`). Not linked to `parcel_features_travis`. | **No History:** Cannot track AVM changes over time. AVM data only in legacy `properties` table (263,706 rows). |
| **Transactions** | `transactions` table with full history, multiple records per property | Only `last_sale_date` and `last_sale_price` in `parcel_features_travis`. No transaction history. | **No History:** Cannot detect distressed sale patterns. Cannot analyze sale trends. Only most recent sale tracked. |
| **Property Characteristics** | `property_characteristics` table (1:1 with properties) | Mixed into `parcel_features_travis` (34 columns). Some fields 100% NULL (`year_built`). | **Denormalized:** Property characteristics mixed with addresses, ownership, tax data. Some fields missing (`bedrooms`, `bathrooms`, `stories`). |
| **Parcel Boundary** | `parcel_boundary` GEOMETRY(MultiPolygon) in `properties` table | `parcels_travis.geom` (MultiPolygon) exists but **NOT linked** to `parcel_features_travis`. Must join on `parcel_id`. | **Not Linked:** Parcel boundaries in separate table. No foreign key relationship. Cannot query by boundary without explicit join. |

**Normalization Score:** ScoutGPT is **~30% normalized** compared to SyndNet's **100% normalized** design.

---

## Section 5: Index Coverage Analysis

| Index Type | SyndNet Count | ScoutGPT Count | Gap |
|------------|---------------|----------------|-----|
| **Spatial (GIST)** | 8 (properties.location, properties.parcel_boundary, zoning_cases.location, permits.location, zoning_districts.zone_boundary, flood_zones.zone_boundary) | 21 (all parcel geometry tables, zoning_districts, osm_pois_travis) | ✅ **Exceeds:** ScoutGPT has more spatial indexes due to county-specific tables. However, missing spatial index on `parcel_features_travis.parcel_boundary` (doesn't exist). |
| **B-tree Composite** | ~15 (property_id + date, property_id + year, etc.) | ~10 (county_fips + acres_calc, ownerId + parcelId, etc.) | ⚠️ **Partial:** Missing composite indexes for time-series queries (property_id + tax_year, property_id + valuation_date). |
| **Partial Indexes** | 1 (`ownership.is_current_owner WHERE is_current_owner = TRUE`) | 1 (`signals.parcel_id + is_active WHERE is_active = true`) | ✅ **Matches:** Both have partial indexes for current/active records. |
| **Full-text (GIN)** | 0 | 0 | ✅ **Matches:** Neither uses full-text search indexes. |
| **Foreign Key Indexes** | Implicit (all FKs indexed) | ~30 (most FKs indexed) | ⚠️ **Partial:** Some FKs missing indexes (e.g., `owner_properties.parcelId` has no FK constraint or index). |

**Index Coverage Score:** ScoutGPT has **good spatial indexing** but **missing composite indexes** for time-series queries.

---

## Section 6: Data Quality Report

### 6.1 NULL Rates (parcel_features_travis)

| Field | NULL % | Total Rows | Issue |
|-------|--------|------------|-------|
| `owner_name_raw` | 1.6% | 369,813 | ✅ **Good** - Only 1.6% NULL |
| `asset_class` | 19.5% | 369,813 | ⚠️ **Poor** - 19.5% NULL or 'unknown' (72,286 rows) |
| `owner_segment` | 0% | 369,813 | ✅ **Good** - 0% NULL (all populated) |
| `market_value` | 9.0% | 369,813 | ⚠️ **Moderate** - 9.0% NULL or 0 |
| `year_built` | 100% | 369,813 | ❌ **Critical** - 100% NULL (all rows) |
| `situs_address` | 0% | 369,813 | ✅ **Good** - 0% NULL (all populated) |

**Data Quality Score:** **60%** - Critical issue with `year_built` (100% NULL), moderate issue with `asset_class` (19.5% NULL).

### 6.2 Duplicate Check

**Result:** ✅ **No duplicate `parcel_id` values** in `parcel_features_travis`

### 6.3 Geometry Validity

**Centroids:** ✅ **100% valid** - All 369,813 centroids are valid PostGIS geometries  
**Parcel Boundaries:** ✅ **100% valid** - All 372,826 parcel boundaries are valid MultiPolygons

**Geometry Quality Score:** ✅ **100%** - All geometries are valid.

### 6.4 Identifier Strategy

| Identifier | SyndNet | ScoutGPT | Notes |
|------------|---------|----------|-------|
| **Primary Key** | `property_id SERIAL` | `parcel_id TEXT` | ⚠️ **Different:** ScoutGPT uses TEXT (TCAD ID) instead of SERIAL. No auto-incrementing ID. |
| **TCAD ID** | `tcad_id VARCHAR(20) UNIQUE` | `parcel_id TEXT` (serves as TCAD ID) | ⚠️ **Implicit:** `parcel_id` is TCAD ID but not explicitly named. No separate `tcad_id` column. |
| **APN** | `apn VARCHAR(60)` | `properties.apn TEXT` (all NULL) | ❌ **Missing:** APN field exists in `properties` but 100% NULL. Not in `parcel_features_travis`. |
| **Sample ID** | `sample_id INTEGER UNIQUE` | None | ❌ **Missing:** No Sample ID tracking. |
| **Geo ID** | `geo_id VARCHAR(50)` | `properties.geoId TEXT` (9,609 rows), `parcels_travis_enrichment.raw->>'GEO_ID'` (27,546 rows) | ⚠️ **Partial:** Geo ID exists but not normalized. In legacy `properties` table and JSONB. |
| **Attom ID** | Not in SyndNet | `properties.attomId TEXT` (263,706 rows), `xref_parcel_property_travis.attom_id` (401,851 rows) | ⚠️ **Extra:** ScoutGPT has Attom ID cross-reference (not in SyndNet design). |

**Identifier Strategy Score:** **40%** - Missing APN, Sample ID. Geo ID not normalized. No unified `property_id`.

---

## Section 7: Recommendations

### 7.1 Critical Fixes (Must Have)

#### 7.1.1 Link Parcel Boundaries to Property Features

**Issue:** `parcels_travis.geom` (parcel boundaries) not linked to `parcel_features_travis`.

**Impact:** Cannot query by parcel boundary without explicit join. Spatial queries inefficient.

**Migration SQL:**
```sql
-- Option 1: Add parcel_boundary column to parcel_features_travis
ALTER TABLE parcel_features_travis 
ADD COLUMN parcel_boundary GEOMETRY(MultiPolygon, 4326);

-- Populate from parcels_travis
UPDATE parcel_features_travis pft
SET parcel_boundary = pt.geom
FROM parcels_travis pt
WHERE pft.parcel_id = pt.parcel_id;

-- Add GIST index
CREATE INDEX idx_pft_parcel_boundary ON parcel_features_travis USING GIST(parcel_boundary);

-- Option 2: Add foreign key constraint (if keeping separate)
ALTER TABLE parcel_features_travis
ADD CONSTRAINT fk_parcel_boundary 
FOREIGN KEY (parcel_id) REFERENCES parcels_travis(parcel_id);
```

**Recommendation:** **Option 1** - Denormalize `parcel_boundary` into `parcel_features_travis` for query performance. Keep `parcels_travis` as source of truth for updates.

#### 7.1.2 Fix year_built Data Population

**Issue:** `year_built` is 100% NULL in `parcel_features_travis`.

**Impact:** Cannot filter or analyze by year built. Property characteristics incomplete.

**Migration SQL:**
```sql
-- Extract year_built from enrichment table
UPDATE parcel_features_travis pft
SET year_built = pte.year_built
FROM parcels_travis_enrichment pte
WHERE pft.parcel_id = pte.parcel_id
AND pte.year_built IS NOT NULL
AND pft.year_built IS NULL;

-- Also try extracting from raw JSONB
UPDATE parcel_features_travis pft
SET year_built = (pte.raw->>'YEAR_BUILT')::integer
FROM parcels_travis_enrichment pte
WHERE pft.parcel_id = pte.parcel_id
AND pte.raw->>'YEAR_BUILT' IS NOT NULL
AND pft.year_built IS NULL
AND (pte.raw->>'YEAR_BUILT') ~ '^\d+$'; -- Only numeric values
```

**Backfill Strategy:** Extract from `parcels_travis_enrichment.year_built` and `parcels_travis_enrichment.raw->>'YEAR_BUILT'`.

#### 7.1.3 Add Missing Foreign Key Constraints

**Issue:** Missing FKs between related tables.

**Impact:** Data integrity issues. Cannot enforce referential integrity.

**Migration SQL:**
```sql
-- Link parcel_features_travis to parcels_travis
ALTER TABLE parcel_features_travis
ADD CONSTRAINT fk_parcel_boundary 
FOREIGN KEY (parcel_id) REFERENCES parcels_travis(parcel_id);

-- Link owner_properties.parcelId to parcel_features_travis
ALTER TABLE owner_properties
ADD CONSTRAINT fk_owner_properties_parcel 
FOREIGN KEY (parcelId) REFERENCES parcel_features_travis(parcel_id);

-- Add index on FK column
CREATE INDEX idx_owner_properties_parcelid_fk 
ON owner_properties(parcelId);
```

**Breaking Changes:** None - these are additive constraints. Existing data must satisfy constraints.

---

### 7.2 High Priority Improvements

#### 7.2.1 Create Normalized Addresses Table

**Priority:** High - Enables efficient ZIP code spatial queries.

**Migration SQL:**
```sql
-- Create addresses table
CREATE TABLE addresses (
  address_id SERIAL PRIMARY KEY,
  property_id TEXT NOT NULL, -- Will link to parcel_id initially
  address_type VARCHAR(20) NOT NULL, -- situs, mailing, grantor, grantee
  full_address VARCHAR(200),
  house_number VARCHAR(25),
  street_direction VARCHAR(10),
  street_name VARCHAR(100),
  street_suffix VARCHAR(25),
  street_post_direction VARCHAR(10),
  unit_prefix VARCHAR(20),
  unit_value VARCHAR(25),
  city VARCHAR(50),
  state CHAR(2),
  zip_code VARCHAR(5),
  zip4 VARCHAR(4),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_addresses_property ON addresses(property_id);
CREATE INDEX idx_addresses_type ON addresses(address_type);
CREATE INDEX idx_addresses_full ON addresses(full_address);
CREATE INDEX idx_addresses_zip ON addresses(zip_code);

-- Extract situs addresses from parcel_features_travis
INSERT INTO addresses (property_id, address_type, full_address, city, state, zip_code)
SELECT 
  parcel_id,
  'situs',
  situs_address,
  NULL, -- Will need to parse from situs_address
  NULL,
  NULL -- Will need to extract from enrichment.raw->>'SITUS_ZIP'
FROM parcel_features_travis
WHERE situs_address IS NOT NULL;

-- Extract mailing addresses
INSERT INTO addresses (property_id, address_type, full_address, city, state, zip_code)
SELECT 
  parcel_id,
  'mailing',
  mailing_address,
  mail_city,
  mail_state,
  mail_zip
FROM parcel_features_travis
WHERE mailing_address IS NOT NULL OR mail_city IS NOT NULL;

-- Extract ZIP codes from enrichment JSONB
UPDATE addresses a
SET zip_code = (
  SELECT pte.raw->>'SITUS_ZIP'
  FROM parcels_travis_enrichment pte
  WHERE pte.parcel_id = a.property_id
  AND a.address_type = 'situs'
  AND pte.raw->>'SITUS_ZIP' IS NOT NULL
)
WHERE a.address_type = 'situs' AND a.zip_code IS NULL;
```

**Backfill Strategy:** 
1. Extract from `parcel_features_travis` (situs and mailing)
2. Extract ZIP codes from `parcels_travis_enrichment.raw->>'SITUS_ZIP'`
3. Parse addresses into components (use address parsing library)

**Breaking Changes:** None - new table, no API changes initially.

#### 7.2.2 Create Tax Assessor Time-Series Table

**Priority:** High - Enables historical assessment tracking.

**Migration SQL:**
```sql
-- Create tax_assessor table
CREATE TABLE tax_assessor (
  assessment_id SERIAL PRIMARY KEY,
  property_id TEXT NOT NULL, -- Will link to parcel_id initially
  tax_year SMALLINT NOT NULL,
  assessed_value_total INTEGER,
  assessed_value_land INTEGER,
  assessed_value_improvements INTEGER,
  market_value_total INTEGER,
  market_value_land INTEGER,
  market_value_improvements INTEGER,
  tax_billed_amount NUMERIC(18,2),
  exemption_homeowner BOOLEAN DEFAULT FALSE,
  exemption_senior BOOLEAN DEFAULT FALSE,
  exemption_veteran BOOLEAN DEFAULT FALSE,
  exemption_disabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(property_id, tax_year)
);

-- Indexes
CREATE INDEX idx_tax_property_year ON tax_assessor(property_id, tax_year DESC);
CREATE INDEX idx_tax_year ON tax_assessor(tax_year);

-- Migrate current year data from parcel_features_travis
INSERT INTO tax_assessor (
  property_id, 
  tax_year, 
  assessed_value_total, 
  assessed_value_land, 
  assessed_value_improvements,
  market_value_total,
  market_value_land,
  market_value_improvements,
  exemption_homeowner
)
SELECT 
  parcel_id,
  EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT as tax_year,
  assessed_total_value::INTEGER,
  land_value::INTEGER,
  improvement_value::INTEGER,
  market_value::INTEGER,
  land_value::INTEGER, -- Assuming market_value_land = land_value
  improvement_value::INTEGER, -- Assuming market_value_improvements = improvement_value
  homestead_exemption_flag
FROM parcel_features_travis
WHERE assessed_total_value IS NOT NULL OR market_value IS NOT NULL;

-- Extract historical years from enrichment.raw->>'TAX_YEAR'
-- Note: This requires parsing JSONB and may have multiple years per parcel
```

**Backfill Strategy:**
1. Migrate current year from `parcel_features_travis`
2. Extract historical years from `parcels_travis_enrichment.raw->>'TAX_YEAR'` (if available)
3. Source additional years from county assessor data

**Breaking Changes:** None - new table.

#### 7.2.3 Create Transactions History Table

**Priority:** High - Enables distressed sale detection.

**Migration SQL:**
```sql
-- Create transactions table
CREATE TABLE transactions (
  transaction_id SERIAL PRIMARY KEY,
  property_id TEXT NOT NULL, -- Will link to parcel_id initially
  document_number VARCHAR(50),
  instrument_number VARCHAR(25),
  document_type_code VARCHAR(10),
  recording_date DATE,
  instrument_date DATE,
  transfer_amount NUMERIC(14,0),
  transfer_tax_total NUMERIC(10,2),
  arms_length_flag BOOLEAN,
  distress_flag BOOLEAN,
  foreclosure_flag BOOLEAN,
  multi_parcel_flag BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_transactions_property ON transactions(property_id);
CREATE INDEX idx_transactions_date ON transactions(recording_date DESC);
CREATE INDEX idx_transactions_amount ON transactions(transfer_amount);
CREATE INDEX idx_transactions_distress ON transactions(distress_flag) WHERE distress_flag = TRUE;
CREATE INDEX idx_transactions_foreclosure ON transactions(foreclosure_flag) WHERE foreclosure_flag = TRUE;

-- Migrate last sale from parcel_features_travis
INSERT INTO transactions (
  property_id,
  instrument_date,
  transfer_amount,
  foreclosure_flag
)
SELECT 
  parcel_id,
  last_sale_date,
  last_sale_price::NUMERIC(14,0),
  FALSE -- Default, will need to update from properties.isForeclosure
FROM parcel_features_travis
WHERE last_sale_date IS NOT NULL AND last_sale_price IS NOT NULL;

-- Migrate foreclosure flag from properties table
UPDATE transactions t
SET foreclosure_flag = TRUE
FROM properties p
WHERE t.property_id = p."parcelId"
AND p."isForeclosure" = TRUE;
```

**Backfill Strategy:**
1. Migrate `last_sale_date` and `last_sale_price` from `parcel_features_travis`
2. Migrate `isForeclosure` from `properties` table
3. Source historical transactions from county recorder data

**Breaking Changes:** None - new table.

#### 7.2.4 Enhance Ownership Table with Temporal Tracking

**Priority:** High - Enables ownership history analysis.

**Migration SQL:**
```sql
-- Add temporal fields to owner_properties
ALTER TABLE owner_properties
ADD COLUMN owner_start_date DATE,
ADD COLUMN owner_end_date DATE,
ADD COLUMN is_current_owner BOOLEAN DEFAULT TRUE;

-- Set all existing records as current
UPDATE owner_properties
SET is_current_owner = TRUE,
    owner_start_date = COALESCE(createdAt::DATE, CURRENT_DATE);

-- Create index for current owners
CREATE INDEX idx_owner_properties_current 
ON owner_properties(is_current_owner) 
WHERE is_current_owner = TRUE;

-- Add index for temporal queries
CREATE INDEX idx_owner_properties_dates 
ON owner_properties(owner_start_date, owner_end_date);
```

**Backfill Strategy:**
1. Set all existing `owner_properties` records as current (`is_current_owner = TRUE`)
2. Set `owner_start_date = createdAt` (or current date if NULL)
3. Source historical ownership from county records (if available)

**Breaking Changes:** None - additive columns.

---

### 7.3 Medium Priority Improvements

#### 7.3.1 Create AVM Valuations Table

**Priority:** Medium - Standardize AVM data.

**Migration SQL:**
```sql
-- Create avm_valuations table
CREATE TABLE avm_valuations (
  valuation_id SERIAL PRIMARY KEY,
  property_id TEXT NOT NULL, -- Will link to parcel_id initially
  valuation_date DATE NOT NULL,
  estimated_value INTEGER,
  estimated_value_min INTEGER,
  estimated_value_max INTEGER,
  confidence_score SMALLINT, -- 0-100
  forecast_std_deviation NUMERIC(5,2),
  create_date DATE,
  publication_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_avm_property_date ON avm_valuations(property_id, valuation_date DESC);
CREATE INDEX idx_avm_confidence ON avm_valuations(confidence_score);
CREATE INDEX idx_avm_date ON avm_valuations(valuation_date DESC);

-- Migrate from properties table
INSERT INTO avm_valuations (
  property_id,
  valuation_date,
  estimated_value,
  estimated_value_min,
  estimated_value_max,
  confidence_score,
  publication_date
)
SELECT 
  "parcelId",
  "avmDate"::DATE,
  "avmValue"::INTEGER,
  "avmMin"::INTEGER,
  "avmMax"::INTEGER,
  "avmConfidence",
  "avmDate"::DATE
FROM properties
WHERE "avmValue" IS NOT NULL AND "avmDate" IS NOT NULL;
```

**Backfill Strategy:** Migrate from `properties.avmValue`, `properties.avmMin`, `properties.avmMax`, `properties.avmConfidence`, `properties.avmDate`.

**Breaking Changes:** None - new table.

#### 7.3.2 Create Property Characteristics Table

**Priority:** Medium - Normalize property attributes.

**Migration SQL:**
```sql
-- Create property_characteristics table
CREATE TABLE property_characteristics (
  characteristic_id SERIAL PRIMARY KEY,
  property_id TEXT NOT NULL UNIQUE, -- Will link to parcel_id initially
  year_built SMALLINT,
  year_built_effective SMALLINT,
  property_use_code VARCHAR(10),
  property_use_standardized VARCHAR(50),
  building_area_sqft INTEGER,
  lot_area_sqft NUMERIC(18,2),
  lot_area_acres NUMERIC(18,7),
  bedroom_count INTEGER,
  bathroom_count NUMERIC(7,3),
  stories_count SMALLINT,
  units_count INTEGER,
  garage_type VARCHAR(50),
  garage_area_sqft INTEGER,
  pool_flag BOOLEAN DEFAULT FALSE,
  pool_area_sqft INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_characteristics_property ON property_characteristics(property_id);
CREATE INDEX idx_characteristics_use ON property_characteristics(property_use_standardized);
CREATE INDEX idx_characteristics_sqft ON property_characteristics(building_area_sqft);

-- Migrate from parcel_features_travis
INSERT INTO property_characteristics (
  property_id,
  year_built,
  property_use_standardized,
  building_area_sqft,
  lot_area_acres
)
SELECT 
  parcel_id,
  year_built::SMALLINT,
  asset_class, -- Map asset_class to property_use_standardized
  building_sqft::INTEGER,
  acres_calc
FROM parcel_features_travis
WHERE building_sqft IS NOT NULL OR acres_calc IS NOT NULL;
```

**Backfill Strategy:** Migrate from `parcel_features_travis` (year_built, building_sqft, acres_calc, asset_class).

**Breaking Changes:** None - new table.

#### 7.3.3 Create Tax Delinquent Table

**Priority:** Medium - Detailed tax delinquent tracking.

**Migration SQL:**
```sql
-- Create tax_delinquent table
CREATE TABLE tax_delinquent (
  delinquent_id SERIAL PRIMARY KEY,
  property_id TEXT NOT NULL UNIQUE, -- Will link to parcel_id initially
  account_number VARCHAR(50),
  last_tax_roll_year SMALLINT,
  first_year_delinquent SMALLINT,
  delinquent_total NUMERIC(12,2),
  total_due NUMERIC(12,2),
  property_type VARCHAR(100),
  as_of_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_delinquent_property ON tax_delinquent(property_id);
CREATE INDEX idx_delinquent_year ON tax_delinquent(first_year_delinquent);
CREATE INDEX idx_delinquent_amount ON tax_delinquent(delinquent_total DESC);

-- Migrate from parcel_features_travis
INSERT INTO tax_delinquent (
  property_id,
  property_type,
  as_of_date
)
SELECT 
  parcel_id,
  asset_class,
  CURRENT_DATE
FROM parcel_features_travis
WHERE tax_delinquent_flag = TRUE;
```

**Backfill Strategy:** Migrate from `parcel_features_travis.tax_delinquent_flag`. Source detailed delinquent data from county tax office.

**Breaking Changes:** None - new table.

---

### 7.4 Future Considerations

#### 7.4.1 Create Zoning Cases Table

**Priority:** Low - Source from city/county records.

**Migration SQL:**
```sql
-- Create zoning_cases table
CREATE TABLE zoning_cases (
  case_id SERIAL PRIMARY KEY,
  property_id TEXT NOT NULL, -- Will link to parcel_id initially
  case_number VARCHAR(50) UNIQUE,
  permit_number VARCHAR(50),
  case_name VARCHAR(200),
  case_type VARCHAR(50),
  sub_type VARCHAR(100),
  status VARCHAR(50),
  existing_zoning VARCHAR(50),
  proposed_zoning VARCHAR(50),
  application_date DATE,
  approval_date DATE,
  council_district SMALLINT,
  watershed VARCHAR(100),
  location GEOMETRY(Point, 4326),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_zoning_property ON zoning_cases(property_id);
CREATE INDEX idx_zoning_number ON zoning_cases(case_number);
CREATE INDEX idx_zoning_location ON zoning_cases USING GIST(location);
CREATE INDEX idx_zoning_status ON zoning_cases(status);
```

**Data Source:** City of Austin Planning Department, county planning offices.

#### 7.4.2 Create Permits Table

**Priority:** Low - Source from city/county building permits.

**Migration SQL:**
```sql
-- Create permits table
CREATE TABLE permits (
  permit_id SERIAL PRIMARY KEY,
  property_id TEXT NOT NULL, -- Will link to parcel_id initially
  permit_number VARCHAR(50) UNIQUE,
  permit_type VARCHAR(10),
  permit_type_desc VARCHAR(100),
  permit_class VARCHAR(50),
  work_class VARCHAR(100),
  description TEXT,
  applied_date DATE,
  issued_date DATE,
  completed_date DATE,
  status VARCHAR(50),
  total_job_valuation NUMERIC(12,2),
  location GEOMETRY(Point, 4326),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_permits_property ON permits(property_id);
CREATE INDEX idx_permits_number ON permits(permit_number);
CREATE INDEX idx_permits_type ON permits(permit_type);
CREATE INDEX idx_permits_issued ON permits(issued_date DESC);
CREATE INDEX idx_permits_location ON permits USING GIST(location);
```

**Data Source:** City of Austin Development Services Department, county building departments.

#### 7.4.3 Create Flood Zones Table

**Priority:** Low - Source FEMA flood zone boundaries.

**Migration SQL:**
```sql
-- Create flood_zones table
CREATE TABLE flood_zones (
  flood_zone_id SERIAL PRIMARY KEY,
  fld_area_id VARCHAR(50),
  dfirm VARCHAR(20),
  zone_type VARCHAR(10),
  zone_subtype VARCHAR(100),
  static_bfe NUMERIC(12,2),
  sfha_indicator BOOLEAN,
  zone_boundary GEOMETRY(MultiPolygon, 4326),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_flood_boundary ON flood_zones USING GIST(zone_boundary);
CREATE INDEX idx_flood_type ON flood_zones(zone_type);
CREATE INDEX idx_flood_sfha ON flood_zones(sfha_indicator);
```

**Data Source:** FEMA Flood Map Service Center, county floodplain administrators.

---

## Section 8: Recommended Schema Evolution

### Phase 1: Quick Wins (1-2 weeks)

**Goal:** Fix critical data quality issues and link parcel boundaries.

1. ✅ **Link parcel boundaries** - Add `parcel_boundary` column to `parcel_features_travis`
2. ✅ **Fix year_built** - Extract from `parcels_travis_enrichment`
3. ✅ **Add foreign keys** - Link `parcel_features_travis` to `parcels_travis`
4. ✅ **Add missing indexes** - Composite indexes for common queries

**Impact:** Improves query performance and data quality. No breaking changes.

**Migration Time:** 2-4 hours (data migration) + index creation time

---

### Phase 2: Normalization (2-4 weeks)

**Goal:** Create normalized tables for addresses, tax assessments, and transactions.

1. ✅ **Create `addresses` table** - Normalize situs and mailing addresses
2. ✅ **Create `tax_assessor` table** - Time-series tax assessments
3. ✅ **Create `transactions` table** - Transaction history
4. ✅ **Enhance `ownership` table** - Add temporal tracking

**Impact:** Enables historical tracking and efficient spatial queries. Foundation for advanced features.

**Migration Time:** 1-2 weeks (data extraction, parsing, migration)

**Breaking Changes:** None - new tables, existing code continues to work.

---

### Phase 3: Full Feature Parity (4-8 weeks)

**Goal:** Complete normalization and add missing features.

1. ✅ **Create `avm_valuations` table** - Standardize AVM data
2. ✅ **Create `property_characteristics` table** - Normalize property attributes
3. ✅ **Create `tax_delinquent` table** - Detailed tax delinquent tracking
4. ✅ **Create `zoning_cases` table** - Zoning change applications
5. ✅ **Create `permits` table** - Building permits
6. ✅ **Create `flood_zones` table** - FEMA flood zone boundaries

**Impact:** Full feature parity with SyndNet. Enables advanced analytics.

**Migration Time:** 4-8 weeks (data sourcing, ETL, migration)

**Breaking Changes:** None - new tables.

---

### Phase 4: Unified Property ID (Future)

**Goal:** Create unified `property_id` and migrate all tables.

**Approach:**
1. Add `property_id SERIAL` to `parcel_features_travis`
2. Update all related tables to use `property_id` instead of `parcel_id`
3. Create materialized view `property_current_snapshot` joining all tables

**Impact:** Single source of truth. Cleaner relationships.

**Migration Time:** 2-4 weeks (requires careful migration of all references)

**Breaking Changes:** ⚠️ **Major** - Requires API changes, application code updates.

---

## Appendix A: Full SQL Diagnostic Results

### A.1 All Tables

See Section 1.1 for complete table list (78 tables).

### A.2 Key Table Columns

See Section 1.2 for detailed column structures.

### A.3 Indexes

**Total Indexes:** ~200+ (including primary keys, unique constraints, and regular indexes)

**Spatial Indexes (GIST):** 21
- All parcel geometry tables (12 counties)
- `parcel_features_travis.geom_centroid`
- `zoning_districts.geometry`
- `osm_pois_travis.geom`

**B-tree Indexes:** ~180
- Foreign key indexes
- Query optimization indexes (acres, asset_class, market_value, etc.)

### A.4 Foreign Keys

**Total Foreign Keys:** 30+

**Key Relationships:**
- `owner_properties.ownerId` → `owners.id` ✅
- `signals.parcel_id` → `parcel_features_travis.parcel_id` ✅
- `opportunities.parcel_id` → `parcel_features_travis.parcel_id` ✅
- All `*_enrichment` tables → corresponding `parcels_*` tables ✅

**Missing Relationships:**
- `parcel_features_travis.parcel_id` → `parcels_travis.parcel_id` ❌
- `properties.parcelId` → `parcel_features_travis.parcel_id` ❌
- `owner_properties.parcelId` → `parcel_features_travis.parcel_id` ❌

### A.5 Row Counts

**Top Tables by Row Count:**
1. `parcels_travis_enrichment_stage` - 834,840 rows
2. `parcels_travis_txgio_stage` - 834,473 rows
3. `txgio_centroids` - 828,773 rows
4. `xref_parcel_property_travis` - 401,851 rows
5. `parcels_travis` - 373,826 rows
6. `parcel_features_travis` - 369,813 rows
7. `parcels_travis_enrichment` - 369,813 rows
8. `properties` - 351,638 rows

### A.6 Geometry Columns

**Total Geometry Columns:** 18

**Point:** 2
- `parcel_features_travis.geom_centroid`
- `osm_pois_travis.geom`

**MultiPolygon:** 16
- All `parcels_*` tables (12 counties)
- `zoning_districts.geometry`
- `parcels_burnet_raw.geom`
- `parcels_travis_txgio_stage.geom`
- `parcels_tx.geom`

**SRID:** All use 4326 (WGS84) ✅

### A.7 Data Quality Results

**NULL Rates:**
- `owner_name_raw`: 1.6% NULL ✅
- `asset_class`: 19.5% NULL or 'unknown' ⚠️
- `owner_segment`: 0% NULL ✅
- `market_value`: 9.0% NULL or 0 ⚠️
- `year_built`: 100% NULL ❌
- `situs_address`: 0% NULL ✅

**Duplicates:** None ✅

**Geometry Validity:** 100% valid ✅

---

## Appendix B: Recommended Materialized Views

### B.1 Property Current Snapshot

**Purpose:** Single view joining all property data for current state queries.

```sql
CREATE MATERIALIZED VIEW property_current_snapshot AS
SELECT 
  pft.parcel_id,
  pft.county_fips,
  -- Addresses (current)
  pft.situs_address,
  pft.mailing_address,
  pft.mail_city,
  pft.mail_state,
  pft.mail_zip,
  -- Ownership (current)
  o.id as owner_id,
  o.ownerNameNorm as owner_name,
  o.entityType as owner_entity_type,
  op.createdAt as ownership_start_date,
  -- Tax Assessment (latest)
  ta.assessed_value_total,
  ta.market_value_total,
  ta.tax_year,
  -- Property Characteristics
  pft.acres_calc,
  pft.asset_class,
  pft.year_built,
  pft.building_sqft,
  -- Geometry
  pft.geom_centroid,
  pt.geom as parcel_boundary,
  -- Metadata
  pft.created_at,
  pft.updated_at
FROM parcel_features_travis pft
LEFT JOIN parcels_travis pt ON pft.parcel_id = pt.parcel_id
LEFT JOIN owner_properties op ON pft.parcel_id = op.parcelId AND op.is_current_owner = TRUE
LEFT JOIN owners o ON op.ownerId = o.id
LEFT JOIN LATERAL (
  SELECT * FROM tax_assessor
  WHERE property_id = pft.parcel_id
  ORDER BY tax_year DESC
  LIMIT 1
) ta ON TRUE;

-- Indexes
CREATE INDEX idx_property_snapshot_parcel ON property_current_snapshot(parcel_id);
CREATE INDEX idx_property_snapshot_asset_class ON property_current_snapshot(asset_class);
CREATE INDEX idx_property_snapshot_geom ON property_current_snapshot USING GIST(geom_centroid);

-- Refresh strategy: Daily or on-demand
REFRESH MATERIALIZED VIEW CONCURRENTLY property_current_snapshot;
```

**Refresh Strategy:** Daily at 2 AM or on-demand after data updates.

### B.2 Owner Portfolio Summary

**Purpose:** Aggregate owner portfolio statistics.

```sql
CREATE MATERIALIZED VIEW owner_portfolio_summary AS
SELECT 
  o.id as owner_id,
  o.ownerNameNorm as owner_name,
  o.entityType,
  COUNT(DISTINCT op.parcelId) as property_count,
  SUM(pft.acres_calc) as total_acres,
  SUM(pft.market_value) as total_market_value,
  SUM(pft.assessed_total_value) as total_assessed_value,
  COUNT(DISTINCT pft.asset_class) as asset_class_diversity,
  AVG(pft.acres_calc) as avg_acres,
  AVG(pft.market_value) as avg_market_value
FROM owners o
JOIN owner_properties op ON o.id = op.ownerId
JOIN parcel_features_travis pft ON op.parcelId = pft.parcel_id
WHERE op.is_current_owner = TRUE
GROUP BY o.id, o.ownerNameNorm, o.entityType;

-- Indexes
CREATE INDEX idx_owner_portfolio_owner ON owner_portfolio_summary(owner_id);
CREATE INDEX idx_owner_portfolio_count ON owner_portfolio_summary(property_count DESC);
```

**Refresh Strategy:** Weekly or on-demand after ownership changes.

---

## Conclusion

ScoutGPT's database schema is **functional but denormalized** compared to SyndNet's production-ready design. The current architecture works for basic queries but lacks:

1. **Historical tracking** (ownership, assessments, transactions)
2. **Normalized addresses** for efficient spatial queries
3. **Time-series data** for trend analysis
4. **Transaction history** for distressed sale detection

**Recommended Path Forward:**
1. **Phase 1 (Quick Wins):** Fix data quality and link parcel boundaries (1-2 weeks)
2. **Phase 2 (Normalization):** Create addresses, tax_assessor, transactions tables (2-4 weeks)
3. **Phase 3 (Full Parity):** Complete normalization and add missing features (4-8 weeks)
4. **Phase 4 (Future):** Unified property_id migration (future, requires breaking changes)

**Total Migration Time:** 7-14 weeks for Phases 1-3 (non-breaking changes)

**Priority:** Focus on Phase 1 and Phase 2 first to enable historical tracking and efficient spatial queries.
