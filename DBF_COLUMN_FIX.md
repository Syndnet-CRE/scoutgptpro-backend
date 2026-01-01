# DBF Parcel ID Column Selection Fix

**Date:** 2024-12-30  
**Issue:** Wrong DBF column selected (e.g., LAND_USE showing "MEDIAN", "PARK", etc.)  
**Fix:** Strict selection + validation of parcel ID column

---

## Patch Applied

### 1) Header Dump (TASK 1)
**Location:** `streamDbfToStage()` function start

Prints all DBF field names with type/length information:
```
📋 DBF Header Dump:
   Total fields: 25
   1. PROP_ID (type: N, length: 10)
   2. LAND_USE (type: C, length: 50)
   ...
```

### 2) Strict Column Selection (TASK 2)
**Function:** `detectParcelIdColumnDbf(headers)`

**Priority order:**
1. Exact names (case-insensitive): `PROP_ID`, `PROPID`, `PROP_ID_1`, `PROPERTYID`, `PROPERTY_ID`, `PARCELID`, `PARCEL_ID`, `PID`
2. Field containing both `PROP` and `ID`
3. Field containing both `PARCEL` and `ID`
4. **Throw error** if none found (with header list)

### 3) Validation (TASK 3)
**Location:** After column selection, before streaming

- Reads first 200 records
- Computes % numeric-like values (matching `/^\d+(\.0+)?$/`)
- Shows top 10 distinct values
- **Throws error** if < 80% numeric-like

### 4) Case-Insensitive Lookup (TASK 4)
**Location:** During streaming

- Uses validated `parcelIdColumn`
- Case-insensitive key lookup: `recordKeys.find(k => k.toLowerCase() === parcelIdColumn.toLowerCase())`
- `detected_id = normalizeParcelId(record[selectedFieldKey])`

---

## Rerun Command

```bash
cd /Users/braydonirwin/scoutgptpro-backend
export DATABASE_URL="your_database_url"
node scripts/ingest-travis-enrichment-local.mjs --dbfPath ~/data/travis_landparcels/shp/stratmap25-landparcels_48453_travis_202508.dbf --truncateStage
```

**Expected Output:**
- DBF Header Dump with all fields
- Selected parcel ID column
- Validation stats (numeric %, top 10 values)
- Validation pass confirmation
- Streaming progress

---

## Sanity SQL (TASK 5)

### Top 20 detected_id values (should be numeric)
```sql
SELECT 
  detected_id,
  COUNT(*) as count
FROM parcels_travis_enrichment_stage
WHERE detected_id IS NOT NULL
GROUP BY detected_id
ORDER BY count DESC
LIMIT 20;
```

**Expected:** All values should be numeric (e.g., "970897", "123456"), NOT "MEDIAN", "PARK", etc.

### Match Count (should be > 0)
```sql
SELECT COUNT(*) as matched_count
FROM parcels_travis_enrichment_stage s
INNER JOIN parcels_travis p ON TRIM(s.detected_id::text) = TRIM(p.parcel_id::text);
```

### Sample Matched Parcel IDs (5)
```sql
SELECT 
  p.parcel_id,
  s.detected_id
FROM parcels_travis_enrichment_stage s
INNER JOIN parcels_travis p ON TRIM(s.detected_id::text) = TRIM(p.parcel_id::text)
LIMIT 5;
```

---

## Behavior

- ✅ Header dump always printed
- ✅ Strict column selection (no fallback to first column)
- ✅ Validation before streaming (fails fast if wrong field)
- ✅ Case-insensitive lookup during streaming
- ✅ Error messages include diagnostic info


