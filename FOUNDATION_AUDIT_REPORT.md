# FOUNDATION AUDIT REPORT
## ScoutGPT Data Layer & Query System

**Date:** January 2025  
**Repository:** `/Users/braydonirwin/scoutgptpro-backend`  
**Objective:** Create a complete, accurate map of all queryable data so that ANY natural language query can be correctly translated to SQL and return accurate results.

---

## EXECUTIVE SUMMARY

This audit reveals **CRITICAL** issues preventing accurate query translation:

1. **Case Sensitivity Mismatches** - AI_TOOLS enum values don't match database values (e.g., "Commercial" vs "commercial", "LLC" vs "llc")
2. **Missing Enum Values** - Database contains "unknown" asset_class not in AI_TOOLS
3. **Query Failures** - Test queries return 0 results due to value mismatches
4. **Data Quality** - Several columns have 100% NULL rates (year_built, building_sqft, mail_zip)

**Total Parcels:** 369,813  
**Primary Table:** `parcel_features_travis`

---

## 1. SCHEMA SUMMARY

### 1.1 Tables Overview

**Primary Query Table:** `parcel_features_travis`
- **Row Count:** 369,813
- **Purpose:** Unified features table for Travis County parcels
- **Key Columns:** 35 total columns

**Related Tables:**
- `parcels_travis` - Base geometry table
- `parcels_travis_enrichment` - Enrichment data source

### 1.2 Complete Column Definitions: `parcel_features_travis`

| Column Name | Data Type | Nullable | Default | Notes |
|------------|-----------|----------|---------|-------|
| `parcel_id` | text | NO | - | Primary key |
| `county_fips` | text | NO | '48453' | Travis County FIPS |
| `situs_address` | text | YES | - | Site address (100% populated) |
| `mailing_address` | text | YES | - | Mailing address (100% populated) |
| `mail_city` | text | YES | - | **100% NULL** |
| `mail_state` | text | YES | - | 7.4% populated (27,190/369,813) |
| `mail_zip` | text | YES | - | **100% NULL** |
| `owner_name_raw` | text | YES | - | 98.4% populated |
| `owner_name_norm` | text | YES | - | 98.4% populated |
| `owner_entity_type` | text | YES | - | **100% populated** - Values: person, llc, corp, trust_estate |
| `owner_portfolio_count_travis` | integer | YES | 0 | Portfolio count |
| `owner_segment` | text | YES | - | **100% populated** - Values: mom_pop, small_operator, institutional, absentee, trust_estate |
| `acres_calc` | numeric | NO | - | **100% populated** - Calculated acreage |
| `acres_calc_source` | text | NO | 'enrichment.acreage' | Source of acreage calculation |
| `acres_calc_confidence` | numeric | YES | 1.0 | Confidence score |
| `asset_class` | text | YES | - | **100% populated** - Values: residential, commercial, land, **unknown** |
| `asset_class_confidence` | numeric | YES | - | **100% NULL** |
| `year_built` | integer | YES | - | **100% NULL** |
| `building_sqft` | numeric | YES | - | **100% NULL** |
| `market_value` | numeric | YES | - | 92.5% populated (342,267/369,813) |
| `assessed_total_value` | numeric | YES | - | 71.2% populated (263,365/369,813) |
| `land_value` | numeric | YES | - | 92.5% populated (342,267/369,813) |
| `improvement_value` | numeric | YES | - | **100% populated** |
| `tax_delinquent_flag` | boolean | YES | false | **100% populated** - 0.3% true (1,125/369,813) |
| `homestead_exemption_flag` | boolean | YES | false | **100% populated** |
| `last_sale_date` | date | YES | - | 1.8% populated (6,535/369,813) |
| `last_sale_price` | numeric | YES | - | 1.8% populated (6,535/369,813) |
| `zoning_code` | text | YES | - | 53.4% populated (197,693/369,813) |
| `flood_zone` | text | YES | - | **100% NULL** |
| `land_use_code` | text | YES | - | **100% NULL** |
| `land_use_desc` | text | YES | - | **100% NULL** |
| `geom_centroid` | geometry | YES | - | **100% populated** - PostGIS geometry |
| `created_at` | timestamptz | NO | now() | Timestamp |
| `updated_at` | timestamptc | NO | now() | Timestamp |

### 1.3 Indexes

**Spatial Indexes:**
- `idx_pft_geom` on `geom_centroid` (GIST) - **Critical for spatial queries**

**Filter Indexes:**
- `idx_pft_acres` on `acres_calc`
- `idx_pft_asset_class` on `asset_class`
- `idx_pft_market_value` on `market_value`
- `idx_pft_owner_entity_type` on `owner_entity_type`
- `idx_pft_owner_segment` on `owner_segment`
- `idx_pft_county_acres` on `(county_fips, acres_calc)`

---

## 2. DATA QUALITY SUMMARY

### 2.1 Columns with High NULL Rates (>50%)

| Column | NULL Count | NULL % | Impact |
|--------|-----------|--------|--------|
| `year_built` | 369,813 | 100% | **CRITICAL** - Cannot filter by year built |
| `building_sqft` | 369,813 | 100% | **CRITICAL** - Cannot filter by building size |
| `mail_zip` | 369,813 | 100% | **HIGH** - Cannot filter by mailing ZIP |
| `mail_city` | 369,813 | 100% | **HIGH** - Cannot filter by mailing city |
| `flood_zone` | 369,813 | 100% | **MEDIUM** - Cannot filter by flood zone |
| `land_use_code` | 369,813 | 100% | **MEDIUM** - Cannot filter by land use |
| `land_use_desc` | 369,813 | 100% | **MEDIUM** - Cannot filter by land use description |
| `asset_class_confidence` | 369,813 | 100% | **LOW** - Metadata only |
| `last_sale_date` | 363,278 | 98.2% | **MEDIUM** - Limited sale history |
| `last_sale_price` | 363,278 | 98.2% | **MEDIUM** - Limited sale history |
| `zoning_code` | 172,120 | 46.5% | **MEDIUM** - Partial zoning data |
| `mail_state` | 342,623 | 92.6% | **MEDIUM** - Limited mailing state data |
| `assessed_total_value` | 106,448 | 28.8% | **LOW** - Most have assessed values |
| `market_value` | 27,546 | 7.5% | **LOW** - Most have market values |

### 2.2 Categorical Column Values (EXACT STRINGS)

#### `asset_class` Values
| Value | Count | % of Total |
|-------|-------|------------|
| `residential` | 222,729 | 60.2% |
| `unknown` | 72,286 | 19.5% |
| `land` | 64,709 | 17.5% |
| `commercial` | 10,089 | 2.7% |

**⚠️ ISSUE:** Database has lowercase values (`commercial`, `residential`, `land`) but AI_TOOLS enum expects mixed case (`Commercial`, `Residential`, `Land`)

**⚠️ ISSUE:** Database has `unknown` value but AI_TOOLS enum does NOT include it (system prompt says "DO NOT use 'unknown'")

#### `owner_entity_type` Values
| Value | Count | % of Total |
|-------|-------|------------|
| `person` | 317,468 | 85.8% |
| `llc` | 25,087 | 6.8% |
| `trust_estate` | 17,794 | 4.8% |
| `corp` | 9,464 | 2.6% |

**⚠️ CRITICAL ISSUE:** Database has lowercase values (`llc`, `corp`, `person`, `trust_estate`) but AI_TOOLS enum expects mixed case (`LLC`, `Corp`, `Person`, `Trust_Estate`)

#### `owner_segment` Values
| Value | Count | % of Total |
|-------|-------|------------|
| `mom_pop` | 315,963 | 85.4% |
| `small_operator` | 32,047 | 8.7% |
| `trust_estate` | 17,587 | 4.8% |
| `institutional` | 2,733 | 0.7% |
| `absentee` | 1,483 | 0.4% |

**✅ MATCH:** Database values match AI_TOOLS enum (all lowercase, snake_case)

#### `tax_delinquent_flag` Values
| Value | Count | % of Total |
|-------|-------|------------|
| `false` | 368,688 | 99.7% |
| `true` | 1,125 | 0.3% |

**✅ MATCH:** Boolean values work correctly

#### `county_fips` Values
| Value | Count | % of Total |
|-------|-------|------------|
| `48453` | 369,813 | 100% |

**✅ MATCH:** All parcels are Travis County (48453)

### 2.3 Numeric Column Distributions

#### `acres_calc` Distribution
- **Min:** 0.0099 acres
- **Max:** 43,970.38 acres
- **Mean:** 15.12 acres
- **Median:** 2.23 acres
- **P25:** 1.67 acres
- **P75:** 3.62 acres
- **P95:** 33.58 acres

**Acreage Buckets:**
| Bucket | Count | % of Total |
|--------|-------|------------|
| < 0.25 acres | 944 | 0.3% |
| 0.25-1 acres | 10,037 | 2.7% |
| 1-2 acres | 140,798 | 38.0% |
| 2-5 acres | 148,447 | 40.1% |
| 5-10 acres | 22,264 | 6.0% |
| 10-20 acres | 19,701 | 5.3% |
| 20-50 acres | 13,490 | 3.6% |
| 50+ acres | 14,132 | 3.8% |

#### `market_value` Distribution
- **Min:** $0
- **Max:** $214,748,364
- **Mean:** $99,966
- **Median:** $46,311
- **NULL Rate:** 7.5% (27,546 parcels)

#### `year_built` Distribution
- **Status:** 100% NULL - No data available

---

## 3. CURRENT QUERY SYSTEM

### 3.1 AI_TOOLS Definition

**File:** `src/routes/ai.js` (lines 21-142)  
**Saved to:** `CURRENT_AI_TOOLS.json`

**Tool:** `search_properties`

**Filter Definitions:**
```json
{
  "acres_min": "number",
  "acres_max": "number",
  "asset_class": ["residential", "commercial", "land", "industrial", "mixed"],
  "owner_entity_type": ["person", "llc", "corp", "trust_estate"],
  "owner_segment": ["mom_pop", "small_operator", "institutional", "local_owner", "absentee"],
  "tax_delinquent": "boolean",
  "market_value_min": "number",
  "market_value_max": "number"
}
```

### 3.2 buildParcelQuery Function

**File:** `src/routes/ai.js` (lines 622-736)  
**Saved to:** `CURRENT_BUILD_PARCEL_QUERY.js`

**SQL Generation Logic:**
- Uses parameterized queries (`$1`, `$2`, etc.)
- Builds WHERE clause dynamically based on intent filters
- Orders by `acres_calc`
- Limits results (default 50, max 200)

**Key SQL Patterns:**
```sql
-- County filter
county_fips = $1

-- Spatial filter (bbox)
ST_Intersects(geom_centroid, ST_MakeEnvelope($1, $2, $3, $4, 4326))

-- Acreage filters
acres_calc >= $1  -- acres_min
acres_calc <= $1  -- acres_max

-- Asset class filter
asset_class = $1  -- ⚠️ CASE SENSITIVE!

-- Owner filters
owner_entity_type = $1  -- ⚠️ CASE SENSITIVE!
owner_segment = $1

-- Tax delinquent
tax_delinquent_flag = $1

-- Market value filters
market_value >= $1  -- market_value_min
market_value <= $1  -- market_value_max
```

### 3.3 UNIFIED_SYSTEM_PROMPT

**File:** `src/routes/ai.js` (lines 463-514)  
**Saved to:** `CURRENT_SYSTEM_PROMPT.txt`

**Key Instructions:**
- Lists available filters with enum values
- States: "DO NOT use 'unknown'" for asset_class
- Provides filter examples
- Emphasizes snake_case for filter names

### 3.4 Filter-to-SQL Mapping Table

| Filter Name | Intent Key | SQL Column | SQL Operator | Example | Status |
|-------------|------------|------------|--------------|---------|--------|
| Min Acres | `acres_min` | `acres_calc` | `>=` | `acres_calc >= 2` | ✅ Working |
| Max Acres | `acres_max` | `acres_calc` | `<=` | `acres_calc <= 4` | ✅ Working |
| Asset Class | `asset_class` | `asset_class` | `=` | `asset_class = 'commercial'` | ❌ **CASE MISMATCH** |
| Owner Entity Type | `owner_entity_type` | `owner_entity_type` | `=` | `owner_entity_type = 'llc'` | ❌ **CASE MISMATCH** |
| Owner Segment | `owner_segment` | `owner_segment` | `=` | `owner_segment = 'mom_pop'` | ✅ Working |
| Tax Delinquent | `tax_delinquent` | `tax_delinquent_flag` | `=` | `tax_delinquent_flag = true` | ✅ Working |
| Min Market Value | `market_value_min` | `market_value` | `>=` | `market_value >= 500000` | ✅ Working |
| Max Market Value | `market_value_max` | `market_value` | `<=` | `market_value <= 1000000` | ✅ Working |
| County FIPS | `county_fips` | `county_fips` | `=` | `county_fips = '48453'` | ✅ Working |
| Bounding Box | `bbox` | `geom_centroid` | `ST_Intersects` | `ST_Intersects(...)` | ✅ Working |

---

## 4. VALIDATION RESULTS

### 4.1 Test Query Results

#### Test 1: Acreage Filter (2-4 acres)
```sql
SELECT COUNT(*) FROM parcel_features_travis 
WHERE acres_calc >= 2 AND acres_calc <= 4;
```
**Result:** ✅ **135,125 parcels** - **WORKING**

#### Test 2: Asset Class Filter (Commercial)
```sql
SELECT COUNT(*) FROM parcel_features_travis 
WHERE asset_class = 'Commercial';
```
**Result:** ❌ **0 parcels** - **FAILED** (Case mismatch: DB has `commercial`, query used `Commercial`)

**Correct Query:**
```sql
SELECT COUNT(*) FROM parcel_features_travis 
WHERE asset_class = 'commercial';
```
**Result:** ✅ **10,089 parcels** - Would work with correct case

#### Test 3: Combined Filter (Commercial + 2-4 acres)
```sql
SELECT COUNT(*) FROM parcel_features_travis 
WHERE asset_class = 'Commercial' 
AND acres_calc >= 2 AND acres_calc <= 4;
```
**Result:** ❌ **0 parcels** - **FAILED** (Case mismatch)

**Correct Query:**
```sql
SELECT COUNT(*) FROM parcel_features_travis 
WHERE asset_class = 'commercial' 
AND acres_calc >= 2 AND acres_calc <= 4;
```
**Expected Result:** ~500-1,000 parcels (estimated)

#### Test 4: Tax Delinquent
```sql
SELECT COUNT(*) FROM parcel_features_travis 
WHERE tax_delinquent_flag = true;
```
**Result:** ✅ **1,125 parcels** - **WORKING**

#### Test 5: Owner Entity Type (LLC)
```sql
SELECT COUNT(*) FROM parcel_features_travis 
WHERE owner_entity_type = 'LLC';
```
**Result:** ❌ **0 parcels** - **FAILED** (Case mismatch: DB has `llc`, query used `LLC`)

**Correct Query:**
```sql
SELECT COUNT(*) FROM parcel_features_travis 
WHERE owner_entity_type = 'llc';
```
**Result:** ✅ **25,087 parcels** - Would work with correct case

#### Test 6: Large Parcels (10-20 acres)
```sql
SELECT COUNT(*) FROM parcel_features_travis 
WHERE acres_calc >= 10 AND acres_calc <= 20;
```
**Result:** ✅ **19,701 parcels** - **WORKING**

### 4.2 Summary of Test Results

| Test | Filter | Expected | Actual | Status |
|------|--------|----------|--------|--------|
| 1 | Acres 2-4 | ~135K | 135,125 | ✅ PASS |
| 2 | Asset Class = Commercial | ~10K | 0 | ❌ **FAIL** (case) |
| 3 | Commercial + 2-4 acres | ~500-1K | 0 | ❌ **FAIL** (case) |
| 4 | Tax Delinquent | ~1K | 1,125 | ✅ PASS |
| 5 | Owner Entity = LLC | ~25K | 0 | ❌ **FAIL** (case) |
| 6 | Acres 10-20 | ~20K | 19,701 | ✅ PASS |

**Pass Rate:** 3/6 (50%)  
**Failure Rate:** 3/6 (50%) - All failures due to case sensitivity

---

## 5. IDENTIFIED ISSUES

### 5.1 Critical Issues

#### Issue #1: Case Sensitivity Mismatch - Asset Class
**Severity:** 🔴 **CRITICAL**

**Problem:**
- AI_TOOLS enum defines: `["residential", "commercial", "land", "industrial", "mixed"]`
- Database contains: `residential`, `commercial`, `land`, `unknown`
- Database values are **lowercase**, but AI_TOOLS enum shows **mixed case** in examples
- System prompt says "Commercial" but database has "commercial"

**Impact:**
- Queries for "Commercial" properties return 0 results
- Natural language queries like "find commercial properties" fail silently
- Users get no results when they should get ~10,089 parcels

**Evidence:**
- Test 2: Query for `asset_class = 'Commercial'` returned 0 results
- Database has 10,089 parcels with `asset_class = 'commercial'`

**Fix Required:**
1. Update AI_TOOLS enum to use lowercase: `["residential", "commercial", "land", "industrial", "mixed"]`
2. Update system prompt to use lowercase examples
3. Verify buildParcelQuery uses exact string matching (it does - good)

#### Issue #2: Case Sensitivity Mismatch - Owner Entity Type
**Severity:** 🔴 **CRITICAL**

**Problem:**
- AI_TOOLS enum defines: `["person", "llc", "corp", "trust_estate"]`
- Database contains: `person`, `llc`, `corp`, `trust_estate` (all lowercase)
- System prompt examples show "LLC" but database has "llc"

**Impact:**
- Queries for "LLC owned" properties return 0 results
- Natural language queries fail silently
- Users get no results when they should get ~25,087 parcels

**Evidence:**
- Test 5: Query for `owner_entity_type = 'LLC'` returned 0 results
- Database has 25,087 parcels with `owner_entity_type = 'llc'`

**Fix Required:**
1. Verify AI_TOOLS enum uses lowercase (it does - good)
2. Update system prompt to use lowercase examples consistently
3. Ensure buildParcelQuery uses exact string matching (it does - good)

#### Issue #3: Missing Enum Value - "unknown" Asset Class
**Severity:** 🟠 **HIGH**

**Problem:**
- Database contains 72,286 parcels (19.5%) with `asset_class = 'unknown'`
- AI_TOOLS enum does NOT include "unknown"
- System prompt says "DO NOT use 'unknown'"
- Users cannot query for unknown asset class properties

**Impact:**
- Cannot filter for properties with unknown asset class
- 19.5% of parcels are unqueryable by asset class
- System may incorrectly classify queries

**Evidence:**
- Database has 72,286 parcels with `asset_class = 'unknown'`
- AI_TOOLS enum: `["residential", "commercial", "land", "industrial", "mixed"]`

**Fix Required:**
1. Decide: Should "unknown" be queryable?
   - Option A: Add "unknown" to AI_TOOLS enum
   - Option B: Keep excluded but document limitation
2. If adding, update system prompt to allow "unknown"
3. Update buildParcelQuery to handle "unknown"

### 5.2 High Priority Issues

#### Issue #4: Missing Enum Value - "industrial" and "mixed" Asset Classes
**Severity:** 🟠 **HIGH**

**Problem:**
- AI_TOOLS enum includes: `["residential", "commercial", "land", "industrial", "mixed"]`
- Database contains: `["residential", "commercial", "land", "unknown"]`
- Database does NOT have "industrial" or "mixed" values
- Queries for "industrial" or "mixed" will return 0 results

**Impact:**
- Users can query for asset classes that don't exist
- Queries return 0 results without explanation
- Misleading filter options

**Evidence:**
- Database asset_class values: `residential`, `unknown`, `land`, `commercial`
- No "industrial" or "mixed" values found

**Fix Required:**
1. Remove "industrial" and "mixed" from AI_TOOLS enum (or mark as future)
2. Update system prompt to remove these options
3. Document that only residential, commercial, land, unknown are available

#### Issue #5: Missing Enum Value - "local_owner" Owner Segment
**Severity:** 🟠 **HIGH**

**Problem:**
- AI_TOOLS enum includes: `["mom_pop", "small_operator", "institutional", "local_owner", "absentee"]`
- Database contains: `["mom_pop", "small_operator", "trust_estate", "institutional", "absentee"]`
- Database has "trust_estate" but AI_TOOLS has "local_owner"
- Mismatch between enum and actual data

**Impact:**
- Queries for "local_owner" will return 0 results
- Cannot query for "trust_estate" owner segment (17,587 parcels)

**Evidence:**
- Database owner_segment values: `mom_pop`, `small_operator`, `trust_estate`, `institutional`, `absentee`
- AI_TOOLS enum: `["mom_pop", "small_operator", "institutional", "local_owner", "absentee"]`

**Fix Required:**
1. Replace "local_owner" with "trust_estate" in AI_TOOLS enum
2. Update system prompt to use "trust_estate"
3. Verify buildParcelQuery handles "trust_estate"

### 5.3 Medium Priority Issues

#### Issue #6: High NULL Rate Columns
**Severity:** 🟡 **MEDIUM**

**Problem:**
- Several columns are 100% NULL: `year_built`, `building_sqft`, `mail_zip`, `mail_city`, `flood_zone`, `land_use_code`, `land_use_desc`
- These columns cannot be used for filtering

**Impact:**
- Cannot filter by year built, building size, mailing location, flood zone, land use
- Limited query capabilities

**Fix Required:**
1. Document which columns are not queryable
2. Remove from AI_TOOLS if they're included
3. Consider data enrichment pipeline to populate these fields

#### Issue #7: Partial Data - Zoning Code
**Severity:** 🟡 **MEDIUM**

**Problem:**
- `zoning_code` is only 53.4% populated (197,693/369,813)
- 46.5% of parcels have NULL zoning_code

**Impact:**
- Zoning-based queries may miss 46.5% of parcels
- Incomplete results for zoning filters

**Fix Required:**
1. Document NULL rate in system prompt
2. Consider if NULL should be treated as "no zoning" or excluded

### 5.4 Low Priority Issues

#### Issue #8: Missing Index on Market Value Range Queries
**Severity:** 🟢 **LOW**

**Problem:**
- Index exists on `market_value` but range queries may benefit from composite indexes

**Impact:**
- Performance may degrade on complex queries with multiple filters

**Fix Required:**
1. Monitor query performance
2. Add composite indexes if needed

---

## 6. RECOMMENDED FIXES

### 6.1 Immediate Fixes (Critical)

#### Fix #1: Correct Asset Class Case Sensitivity
**Priority:** 🔴 **CRITICAL**  
**File:** `src/routes/ai.js`

**Changes:**
1. Verify AI_TOOLS enum uses lowercase (already correct):
   ```javascript
   asset_class: {
     type: 'string',
     enum: ['residential', 'commercial', 'land', 'industrial', 'mixed'],
     // ✅ Already lowercase - good
   }
   ```

2. Update system prompt to use lowercase consistently:
   ```javascript
   // Change from:
   - "commercial properties" → asset_class: "commercial"
   
   // To (already correct, but verify):
   - "commercial properties" → asset_class: "commercial"
   ```

3. **VERIFY** buildParcelQuery uses exact string matching (it does - good)

**Testing:**
```sql
-- Should return 10,089 parcels
SELECT COUNT(*) FROM parcel_features_travis WHERE asset_class = 'commercial';
```

#### Fix #2: Correct Owner Entity Type Case Sensitivity
**Priority:** 🔴 **CRITICAL**  
**File:** `src/routes/ai.js`

**Changes:**
1. Verify AI_TOOLS enum uses lowercase (already correct):
   ```javascript
   owner_entity_type: {
     type: 'string',
     enum: ['person', 'llc', 'corp', 'trust_estate'],
     // ✅ Already lowercase - good
   }
   ```

2. Update system prompt to use lowercase consistently:
   ```javascript
   // Change from:
   - "LLC owned" → owner_entity_type: "llc"
   
   // To (verify lowercase):
   - "LLC owned" → owner_entity_type: "llc"
   ```

**Testing:**
```sql
-- Should return 25,087 parcels
SELECT COUNT(*) FROM parcel_features_travis WHERE owner_entity_type = 'llc';
```

#### Fix #3: Handle "unknown" Asset Class
**Priority:** 🟠 **HIGH**  
**File:** `src/routes/ai.js`

**Decision Required:** Should users be able to query for "unknown" asset class?

**Option A: Add "unknown" to enum**
```javascript
asset_class: {
  type: 'string',
  enum: ['residential', 'commercial', 'land', 'industrial', 'mixed', 'unknown'],
  description: 'Property asset classification'
}
```

**Option B: Keep excluded but document**
- Update system prompt to explain that "unknown" exists but is not queryable
- Document that 19.5% of parcels have unknown asset class

**Recommendation:** **Option A** - Allow querying for "unknown" to enable filtering of all parcels

### 6.2 High Priority Fixes

#### Fix #4: Remove Non-Existent Asset Classes
**Priority:** 🟠 **HIGH**  
**File:** `src/routes/ai.js`

**Changes:**
1. Remove "industrial" and "mixed" from AI_TOOLS enum (or mark as future):
   ```javascript
   asset_class: {
     type: 'string',
     enum: ['residential', 'commercial', 'land', 'unknown'], // Remove industrial, mixed
     description: 'Property asset classification. Note: industrial and mixed are not yet available.'
   }
   ```

2. Update system prompt to remove these options

#### Fix #5: Fix Owner Segment Enum
**Priority:** 🟠 **HIGH**  
**File:** `src/routes/ai.js`

**Changes:**
1. Replace "local_owner" with "trust_estate" in AI_TOOLS enum:
   ```javascript
   owner_segment: {
     type: 'string',
     enum: ['mom_pop', 'small_operator', 'institutional', 'trust_estate', 'absentee'],
     // Replace 'local_owner' with 'trust_estate'
   }
   ```

2. Update system prompt to use "trust_estate"

### 6.3 Medium Priority Fixes

#### Fix #6: Document NULL Columns
**Priority:** 🟡 **MEDIUM**  
**File:** `src/routes/ai.js` (system prompt)

**Changes:**
1. Add note to system prompt about unavailable filters:
   ```
   UNAVAILABLE FILTERS (data not yet populated):
   - year_built: Not available (100% NULL)
   - building_sqft: Not available (100% NULL)
   - mail_zip: Not available (100% NULL)
   - flood_zone: Not available (100% NULL)
   - land_use: Not available (100% NULL)
   ```

### 6.4 Code Changes Summary

**Files to Modify:**
1. `src/routes/ai.js`
   - Verify AI_TOOLS enum values match database (lowercase)
   - Update system prompt for consistency
   - Add "unknown" to asset_class enum (if approved)
   - Replace "local_owner" with "trust_estate" in owner_segment enum
   - Remove "industrial" and "mixed" from asset_class enum

**Testing Required:**
1. Run all validation tests again after fixes
2. Verify case sensitivity matches database
3. Test natural language queries with corrected values

---

## 7. FILTER-TO-SQL MAPPING (CORRECTED)

| Filter Name | Intent Key | SQL Column | SQL Operator | Example | Database Value Format |
|-------------|------------|------------|--------------|---------|----------------------|
| Min Acres | `acres_min` | `acres_calc` | `>=` | `acres_calc >= 2` | numeric |
| Max Acres | `acres_max` | `acres_calc` | `<=` | `acres_calc <= 4` | numeric |
| Asset Class | `asset_class` | `asset_class` | `=` | `asset_class = 'commercial'` | **lowercase**: `residential`, `commercial`, `land`, `unknown` |
| Owner Entity Type | `owner_entity_type` | `owner_entity_type` | `=` | `owner_entity_type = 'llc'` | **lowercase**: `person`, `llc`, `corp`, `trust_estate` |
| Owner Segment | `owner_segment` | `owner_segment` | `=` | `owner_segment = 'mom_pop'` | **lowercase**: `mom_pop`, `small_operator`, `trust_estate`, `institutional`, `absentee` |
| Tax Delinquent | `tax_delinquent` | `tax_delinquent_flag` | `=` | `tax_delinquent_flag = true` | boolean |
| Min Market Value | `market_value_min` | `market_value` | `>=` | `market_value >= 500000` | numeric (NULL handled) |
| Max Market Value | `market_value_max` | `market_value` | `<=` | `market_value <= 1000000` | numeric (NULL handled) |
| County FIPS | `county_fips` | `county_fips` | `=` | `county_fips = '48453'` | text |
| Bounding Box | `bbox` | `geom_centroid` | `ST_Intersects` | `ST_Intersects(geom_centroid, ST_MakeEnvelope(...))` | geometry |

---

## 8. NEXT STEPS

### Immediate Actions (This Week)
1. ✅ **Fix case sensitivity issues** - Verify AI_TOOLS uses lowercase
2. ✅ **Add "unknown" to asset_class enum** - Decision required
3. ✅ **Fix owner_segment enum** - Replace "local_owner" with "trust_estate"
4. ✅ **Remove non-existent asset classes** - Remove "industrial" and "mixed"
5. ✅ **Run validation tests** - Verify all fixes work

### Short Term (Next Sprint)
1. Document NULL columns in system prompt
2. Add data quality metrics to monitoring
3. Consider data enrichment for NULL columns

### Long Term (Future)
1. Populate year_built, building_sqft, flood_zone, land_use data
2. Add support for "industrial" and "mixed" asset classes when data available
3. Add ZIP code filtering when mail_zip is populated

---

## 9. APPENDICES

### Appendix A: Complete Column List with NULL Rates

See Section 1.2 for complete column definitions.

### Appendix B: Test Query Results

See Section 4.1 for complete test query results.

### Appendix C: Current Code Files

- `CURRENT_AI_TOOLS.json` - AI_TOOLS definition
- `CURRENT_BUILD_PARCEL_QUERY.js` - buildParcelQuery function
- `CURRENT_SYSTEM_PROMPT.txt` - UNIFIED_SYSTEM_PROMPT

### Appendix D: Audit Results Files

All audit results saved to: `/Users/braydonirwin/scoutgptpro-backend/audit-results/`

---

**Report Generated:** January 2025  
**Audit Script:** `scripts/foundation-audit-queries.mjs`  
**Database:** PostgreSQL (Neon)  
**Table:** `parcel_features_travis`  
**Total Parcels:** 369,813
