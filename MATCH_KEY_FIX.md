# Match Key Fix for Leading Zeros

**Date:** 2024-12-30  
**Issue:** DBF Prop_ID has leading zeros (e.g., "0100050259"), parcels_travis.parcel_id doesn't  
**Fix:** Use canonical matchKey (strips leading zeros and trailing .0+) for in-memory matching

---

## Patch Applied

### 1) Added matchKey() Helper Function

**Location:** After `normalizeParcelId()`

```javascript
function matchKey(id) {
  if (id === null || id === undefined) return null;
  let s = String(id).trim();
  // Strip trailing ".0+"
  s = s.replace(/\.0+$/, '');
  // Strip leading zeros, but if result becomes empty string, keep "0"
  s = s.replace(/^0+/, '');
  if (s === '') {
    s = '0';
  }
  return s;
}
```

### 2) Updated parcelIdsMap Building

**Location:** `matchAndUpsert()` function

**Before:**
```javascript
const parcelIdsMap = new Map();
parcelIdsResult.rows.forEach(r => {
  const pid = String(r.parcel_id).trim();
  parcelIdsMap.set(pid, pid);
});
```

**After:**
```javascript
const parcelIdsMap = new Map();
parcelIdsResult.rows.forEach(r => {
  const originalParcelId = String(r.parcel_id).trim();
  const key = matchKey(originalParcelId);
  if (key) {
    parcelIdsMap.set(key, originalParcelId);
  }
});
```

### 3) Updated Matching Logic

**Location:** `matchAndUpsert()` function, inside processing loop

**Before:**
```javascript
matchedParcelId = parcelIdsMap.get(detectedId) || null;
```

**After:**
```javascript
const matchKeyValue = matchKey(detectedId);
if (matchKeyValue) {
  matchedParcelId = parcelIdsMap.get(matchKeyValue) || null;
}
```

### 4) Added Pre-run Validation

**Location:** `matchAndUpsert()` function, after building map

Prints sample transformations:
- 5 sample `parcels_travis.parcel_id` → matchKey
- 5 sample staging `detected_id` → matchKey

---

## Verification SQL

### Match Count Using matchKey Logic (SQL equivalent)

```sql
WITH match_key_func AS (
  SELECT 
    id,
    detected_id,
    CASE 
      WHEN REGEXP_REPLACE(REGEXP_REPLACE(TRIM(detected_id::text), E'\\.0+$', ''), '^0+', '') = '' THEN '0'
      ELSE REGEXP_REPLACE(REGEXP_REPLACE(TRIM(detected_id::text), E'\\.0+$', ''), '^0+', '')
    END as match_key
  FROM parcels_travis_enrichment_stage
  WHERE detected_id IS NOT NULL
),
parcel_match_key AS (
  SELECT 
    parcel_id,
    CASE 
      WHEN REGEXP_REPLACE(REGEXP_REPLACE(TRIM(parcel_id::text), E'\\.0+$', ''), '^0+', '') = '' THEN '0'
      ELSE REGEXP_REPLACE(REGEXP_REPLACE(TRIM(parcel_id::text), E'\\.0+$', ''), '^0+', '')
    END as match_key
  FROM parcels_travis
)
SELECT COUNT(*) as matched_count
FROM match_key_func s
INNER JOIN parcel_match_key p ON s.match_key = p.match_key;
```

**Expected:** matched_count >> 0 (should be much greater than 0)

### Sample Matched Records (5)

```sql
WITH match_key_func AS (
  SELECT 
    id,
    detected_id,
    CASE 
      WHEN REGEXP_REPLACE(REGEXP_REPLACE(TRIM(detected_id::text), E'\\.0+$', ''), '^0+', '') = '' THEN '0'
      ELSE REGEXP_REPLACE(REGEXP_REPLACE(TRIM(detected_id::text), E'\\.0+$', ''), '^0+', '')
    END as match_key
  FROM parcels_travis_enrichment_stage
  WHERE detected_id IS NOT NULL
),
parcel_match_key AS (
  SELECT 
    parcel_id,
    CASE 
      WHEN REGEXP_REPLACE(REGEXP_REPLACE(TRIM(parcel_id::text), E'\\.0+$', ''), '^0+', '') = '' THEN '0'
      ELSE REGEXP_REPLACE(REGEXP_REPLACE(TRIM(parcel_id::text), E'\\.0+$', ''), '^0+', '')
    END as match_key
  FROM parcels_travis
)
SELECT 
  p.parcel_id as parcels_travis_id,
  s.detected_id as staging_detected_id,
  s.match_key as staging_match_key,
  p.match_key as parcels_match_key
FROM match_key_func s
INNER JOIN parcel_match_key p ON s.match_key = p.match_key
LIMIT 5;
```

**Expected:** staging_match_key = parcels_match_key for all rows

---

## Behavior

- ✅ `normalizeParcelId()` still applied first (handles trailing ".0")
- ✅ `matchKey()` applied for canonical matching (handles leading zeros)
- ✅ Original parcel_id values preserved in DB
- ✅ In-memory matching only (no SQL schema changes)
- ✅ Pre-run validation shows sample transformations

---

## Example Transformations

| Input | matchKey Output |
|-------|----------------|
| "0100050259" | "100050259" |
| "000123456" | "123456" |
| "0" | "0" |
| "000" | "0" |
| "123.0" | "123" |
| "123.00" | "123" |
| "00123.0" | "123" |

