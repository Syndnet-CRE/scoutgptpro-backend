# Phase 0a: AI Query System Audit Results

**Date:** January 2025  
**File Audited:** `src/routes/ai.js`  
**Audit Type:** Read-only documentation

---

## 1. AI_TOOLS Definition

**Location:** Lines 21-142

### Tool Names Defined:
1. `search_properties` - Search for properties with filters
2. `toggle_gis_layer` - Toggle visibility of GIS map layers
3. `search_pois` - Search for points of interest
4. `get_property` - Get detailed information about a specific property

### search_properties Tool Schema (Lines 23-83)

**Filter Definitions:**

#### Enum Values:

**asset_class** (Line 49-52):
```javascript
enum: ['residential', 'commercial', 'land', 'unknown']
description: 'Property type. MUST be lowercase. Options: residential, commercial, land, unknown. Note: industrial/mixed not available.'
```
- ✅ **Lowercase:** Yes, all values are lowercase
- ✅ **Includes "unknown":** Yes

**owner_entity_type** (Line 54-57):
```javascript
enum: ['person', 'llc', 'corp', 'trust_estate']
description: 'Type of owner entity'
```
- ✅ **Lowercase:** Yes, all values are lowercase

**owner_segment** (Line 59-62):
```javascript
enum: ['mom_pop', 'small_operator', 'institutional', 'trust_estate', 'absentee']
description: 'Owner segment classification'
```
- ✅ **Lowercase:** Yes, all values are lowercase
- ✅ **Includes "trust_estate":** Yes (correct)

**Other Filters:**
- `acres_min` / `acres_max`: number
- `tax_delinquent`: boolean
- `market_value_min` / `market_value_max`: number
- `county_fips`: string (e.g., "48453" for Travis County)
- `bbox`: array of numbers [minLng, minLat, maxLng, maxLat]
- `zip_code`: string or number (5-digit ZIP)

### Column Names Referenced:
- No direct column references in AI_TOOLS (uses filter names like `acres_min`, `asset_class`, etc.)
- Column mapping happens in `buildParcelQuery()` function

---

## 2. buildParcelQuery Function

**Location:** Lines 634-759

### Case Normalization (Lines 635-644):
```javascript
// CASE NORMALIZATION - Database requires lowercase
if (intent.filters?.asset_class) {
  intent.filters.asset_class = intent.filters.asset_class.toLowerCase();
}
if (intent.filters?.owner_entity_type) {
  intent.filters.owner_entity_type = intent.filters.owner_entity_type.toLowerCase();
}
if (intent.filters?.owner_segment) {
  intent.filters.owner_segment = intent.filters.owner_segment.toLowerCase();
}
```
- ✅ **Normalizes to lowercase:** Yes, all enum filters are normalized

### Column Names Used:

**Acreage Filter** (Lines 665-677):
- Uses: `acres_calc` ✅
- Filter: `acres_min` → SQL: `acres_calc >= $X`
- Filter: `acres_max` → SQL: `acres_calc <= $X`

**Tax Delinquency** (Lines 700-705):
- Uses: `tax_delinquent_flag` ✅
- Filter: `tax_delinquent: true` → SQL: `tax_delinquent_flag = $X`

**Other Column Mappings:**
- `asset_class` → `asset_class` (exact match)
- `owner_entity_type` → `owner_entity_type` (exact match)
- `owner_segment` → `owner_segment` (exact match)
- `market_value_min` → `market_value >= $X`
- `market_value_max` → `market_value <= $X`
- `county_fips` → `county_fips` (exact match)
- Spatial: `bbox` → `ST_Intersects(geom_centroid, ST_MakeEnvelope(...))`

### Table Queried:
- **Table:** `parcel_features_travis` (Line 742)

### SQL Query Structure (Lines 729-746):
```sql
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
WHERE [conditions]
ORDER BY acres_calc
LIMIT $X
```

---

## 3. UNIFIED_SYSTEM_PROMPT

**Location:** Lines 464-526

### Lowercase Instructions (Lines 484-492):
```
CRITICAL: All filter values MUST be lowercase.
- asset_class: use "commercial" not "Commercial"  
- owner_entity_type: use "llc" not "LLC"
- owner_segment: use "trust_estate" not "Trust_Estate"

AVAILABLE VALUES:
- asset_class: residential, commercial, land, unknown
- owner_entity_type: person, llc, corp, trust_estate
- owner_segment: mom_pop, small_operator, institutional, trust_estate, absentee
```
- ✅ **Instructs lowercase:** Yes, explicitly stated
- ✅ **Provides examples:** Yes, shows correct lowercase usage

### Filter Examples (Lines 503-517):
```
FILTER EXAMPLES:
- "commercial properties" → asset_class: "commercial"
- "vacant land" → asset_class: "land"
- "residential properties" → asset_class: "residential"
- "mom and pop owners" → owner_segment: "mom_pop"
- "LLC owned" → owner_entity_type: "llc"
- "institutional investors" → owner_segment: "institutional"
- "out of state owners" OR "absentee" → owner_segment: "absentee"
- "small operators" → owner_segment: "small_operator"
- "2-4 acres" → acres_min: 2, acres_max: 4
- "over 5 acres" → acres_min: 5
- "under 10 acres" → acres_max: 10
- "under $500k" → market_value_max: 500000
- "over $1M" → market_value_min: 1000000
- "tax delinquent" → tax_delinquent: true
```

### Additional Instructions (Lines 519-525):
```
IMPORTANT: 
- Always use snake_case for filter names
- Always use lowercase for filter values (commercial, not Commercial)
- Don't make up filter values - only use the ones listed above
- If unsure about a filter, omit it rather than guessing
- For combined queries (e.g., "commercial properties over 2 acres"), apply all relevant filters
```

---

## 4. Tool Call Handler

### search_properties Tool Execution

**Location:** `executeSearchProperties()` function (Lines 162-259)

**Processing Flow:**
1. **Preprocessing** (Line 166): Calls `preprocessToolInput(input)` to resolve ZIP codes
2. **Intent Construction** (Lines 171-187): Builds `rawIntent` object from tool input
3. **Validation** (Line 190): Calls `validateIntent(rawIntent)` 
4. **Query Building** (Line 197): Calls `buildParcelQuery(intent)` to generate SQL
5. **Query Execution** (Line 207): Executes SQL query against database
6. **Result Mapping** (Lines 209-221): Maps database rows to property objects
7. **Filter Assertions** (Lines 223-241): Runs filter assertions to verify correctness

### Normalization Before Query Building:

**In executeSearchProperties** (Lines 171-187):
- No normalization here - passes input directly to `buildParcelQuery()`
- Normalization happens **inside** `buildParcelQuery()` (Lines 635-644)

**In processClaudeResponse** (Lines 405-458):
- Line 423: Logs Claude's tool output: `console.log('CLAUDE_TOOL_OUTPUT:', JSON.stringify(block.input, null, 2));`
- Line 425: Calls `executeTool(block.name, block.input, pool)`
- No normalization before tool execution

### Tool Handler Location:
- **Main handler:** `processClaudeResponse()` (Lines 405-458)
- **Tool router:** `executeTool()` (Lines 386-400)
- **Property search:** `executeSearchProperties()` (Lines 162-259)

---

## 5. Other Relevant Functions

### extractIntentFromQuery

**Location:** Lines 567-629

**Purpose:** Extract structured intent from natural language query using Claude

**Process:**
1. Builds user prompt with query and optional bounds
2. Calls Claude API with `UNIFIED_SYSTEM_PROMPT` and `AI_TOOLS`
3. Extracts JSON from Claude's text response
4. Normalizes intent structure (Lines 604-620)
5. Returns normalized intent object

**Note:** This function appears to be **deprecated** or **unused** in the current flow. The main endpoint (Line 1132) calls Claude directly with tools enabled, not this extraction function.

### Response Formatting

**Location:** `executeSearchProperties()` return (Lines 244-250):
```javascript
return {
  success: true,
  count: properties.length,
  properties: properties,
  intent: intent,
  validationErrors: errors.length > 0 ? errors : undefined
};
```

**Property Object Structure** (Lines 209-221):
```javascript
{
  parcel_id: row.parcel_id,
  situs_address: row.situs_address,
  owner_name_raw: row.owner_name_raw,
  owner_entity_type: row.owner_entity_type,
  owner_segment: row.owner_segment,
  acres_calc: parseFloat(row.acres_calc),
  asset_class: row.asset_class,
  market_value: row.market_value ? parseFloat(row.market_value) : null,
  tax_delinquent_flag: row.tax_delinquent_flag === true,
  county_fips: row.county_fips,
  geom: row.geom  // Already JSON from ST_AsGeoJSON
}
```

### Filter Assertions

**Location:** Lines 223-241

After query execution, the system runs filter assertions:
- `assertAcresFilter()` - Verifies acreage filters
- `assertAssetClassFilter()` - Verifies asset_class filter
- `assertOwnerSegmentFilter()` - Verifies owner_segment filter
- `assertOwnerEntityTypeFilter()` - Verifies owner_entity_type filter
- `assertMarketValueFilter()` - Verifies market value filters
- `assertTaxDelinquentFilter()` - Verifies tax_delinquent filter

These assertions are imported from `../utils/filterAssertions.js` (Line 9).

---

## 6. Issues Found

### ✅ No Critical Issues Found

The current implementation appears to be **correct**:

1. **Case Normalization:** ✅ Implemented in `buildParcelQuery()` (Lines 635-644)
2. **Enum Values:** ✅ All lowercase in `AI_TOOLS`
3. **System Prompt:** ✅ Explicitly instructs lowercase usage
4. **Column Names:** ✅ Correct (`acres_calc`, `tax_delinquent_flag`)
5. **Table Name:** ✅ Correct (`parcel_features_travis`)

### Potential Improvements:

1. **Double Normalization:** 
   - Normalization happens in `buildParcelQuery()` but Claude is already instructed to use lowercase
   - This is defensive programming and is fine, but could be documented

2. **extractIntentFromQuery Unused:**
   - Function exists (Lines 567-629) but doesn't appear to be called in main flow
   - May be legacy code or used elsewhere

3. **INTENT_EXTRACTION_SYSTEM_PROMPT:**
   - Separate prompt defined (Lines 528-562) but appears unused
   - May be legacy code

### Code Quality Observations:

1. **Good:** Case normalization is defensive and handles edge cases
2. **Good:** Filter assertions verify query correctness
3. **Good:** Comprehensive logging for debugging
4. **Good:** Parameterized queries prevent SQL injection
5. **Good:** Input validation via `validateIntent()`

---

## 7. Summary

### Current State:
- ✅ **AI_TOOLS enums:** All lowercase, correct values
- ✅ **buildParcelQuery:** Normalizes to lowercase, uses correct column names
- ✅ **UNIFIED_SYSTEM_PROMPT:** Explicitly instructs lowercase usage
- ✅ **Tool handler:** Passes input to buildParcelQuery which normalizes
- ✅ **Column names:** Correct (`acres_calc`, `tax_delinquent_flag`)
- ✅ **Table:** Correct (`parcel_features_travis`)

### Conclusion:
The AI query system is **correctly implemented** with proper case normalization, correct column names, and clear instructions to Claude. No critical issues found.

---

**Audit Complete**  
**Status:** ✅ No changes required
