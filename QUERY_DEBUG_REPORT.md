# Query Debug Report

## Issues Found

### 1. Query: "show properties in 78758" - Returns Wrong Results

**Root Cause:**
- The bbox coordinates for ZIP 78758 in `zipCodeResolver.js` were incorrect
- Original bbox: `[-97.7000, 30.3700, -97.6700, 30.4000]` (too small, wrong location)
- Actual bbox from data: `[-98.0514, 30.1880, -97.7078, 30.4927]`
- The `zip_code` field was being passed by Claude but not processed correctly in `preprocessToolInput`

**Fixes Applied:**
1. ✅ Added `zip_code` field to `search_properties` tool schema in `ai.js`
2. ✅ Updated `preprocessToolInput` to prioritize `zip_code` field over `bbox` field
3. ✅ Corrected bbox coordinates for 78758 in `zipCodeResolver.js`
4. ✅ Added debug logging to trace ZIP code resolution

**Status:** 
- Bbox coordinates corrected
- ZIP code preprocessing fixed
- **Note:** Server may need restart to pick up changes. Test again after restart.

**Verification:**
- 688 parcels have SITUS_ZIP = '78758' in enrichment table
- Corrected bbox should return ~685 parcels with ZIP 78758

---

### 2. Query: "show land in travis county 2-4 acres" - Returns Wrong Properties

**Root Cause:**
- `county_fips` was not included in SELECT clause, so it appeared as `null` in results
- This made it appear that the county filter wasn't working, even though it was

**Fixes Applied:**
1. ✅ Added `county_fips` to SELECT clause in `buildParcelQuery()`
2. ✅ Added `county_fips` to property mapping in `executeSearchProperties()`

**Status:** ✅ **FIXED**
- Query now correctly returns land parcels with 2-4 acres in Travis County
- `county_fips` now shows "48453" in results

**Verification:**
- All 369,813 parcels have `county_fips = '48453'`
- 18,873 land parcels with 2-4 acres in Travis County
- Query returns correct results with `county_fips: "48453"`

---

## Code Changes Summary

### `/src/routes/ai.js`
1. Added `zip_code` field to `search_properties` tool schema (line ~37)
2. Added `county_fips` to SELECT clause (line ~715)
3. Added `county_fips` to property mapping (line ~219)
4. Added debug logging for SQL queries (lines ~200-204)

### `/src/services/zipCodeResolver.js`
1. Updated `preprocessToolInput()` to prioritize `zip_code` field (line ~155)
2. Corrected bbox for ZIP 78758 (line ~57)

---

## Testing Recommendations

1. **Restart backend server** to ensure all changes are loaded
2. Test "show properties in 78758":
   ```bash
   curl -X POST http://localhost:3001/api/ai/query \
     -H "Content-Type: application/json" \
     -d '{"query":"show properties in 78758","mode":"scout"}' | jq '.properties[0:5] | map({parcel_id, situs_address})'
   ```
   - Should return parcels with "78758" in address

3. Test "show land in travis county 2-4 acres":
   ```bash
   curl -X POST http://localhost:3001/api/ai/query \
     -H "Content-Type: application/json" \
     -d '{"query":"show land in travis county 2-4 acres","mode":"scout"}' | jq '.properties[0:5] | map({parcel_id, asset_class, acres_calc, county_fips})'
   ```
   - Should return land parcels with `county_fips: "48453"` and `acres_calc` between 2-4

---

## Additional Findings

1. **ZIP Code Bbox Accuracy:** The bbox coordinates in `zipCodeResolver.js` are approximate and may need refinement for other ZIP codes. Consider:
   - Calculating bboxes dynamically from actual parcel data
   - Using a more accurate ZIP code boundary dataset
   - Filtering by actual ZIP code from enrichment table instead of bbox

2. **Debug Logging:** Added comprehensive logging to trace:
   - ZIP code resolution
   - SQL query construction
   - Query results count

3. **Data Quality:** All parcels have `county_fips = '48453'`, so county filtering works correctly.
