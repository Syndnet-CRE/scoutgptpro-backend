# Matching Fix - Root Cause & Solution

**Date:** 2024-12-30  
**Issue:** 834,936 staged rows, 0 matched  
**Root Cause:** Case-sensitive key lookup + Set.has() exact match

---

## Root Cause

1. **Case-sensitive DBF key lookup:** `record[parcelIdColumn]` fails if DBF key case differs from detected column name
   - Detected: `"Prop_ID"` 
   - Actual DBF key might be: `"prop_id"` or `"PROP_ID"`

2. **Exact Set match:** `parcelIds.has(detectedId)` requires exact string match (case-sensitive)
   - `detectedId = "970897"` vs `parcelIds.has("970897")` should work, but whitespace/type issues could break it

---

## Code Changes

### 1) DBF Record Key Lookup (Case-Insensitive)

**File:** `scripts/ingest-travis-enrichment-local.mjs`  
**Function:** `streamDbfToStage()`  
**Lines:** ~283-285

**Before:**
```javascript
const rawParcelId = record[parcelIdColumn] || (headers && headers[0] ? record[headers[0]] : null) || null;
```

**After:**
```javascript
// Case-insensitive lookup for parcel ID column (DBF keys may differ in case)
let rawParcelId = null;
if (parcelIdColumn && record[parcelIdColumn] !== undefined) {
  rawParcelId = record[parcelIdColumn];
} else {
  // Try case-insensitive match
  const recordKeys = Object.keys(record);
  const matchedKey = recordKeys.find(k => k.toLowerCase() === parcelIdColumn.toLowerCase());
  if (matchedKey) {
    rawParcelId = record[matchedKey];
  } else if (headers && headers[0]) {
    rawParcelId = record[headers[0]] || null;
  }
}
```

### 2) Matching Logic (Case-Insensitive, Type-Safe)

**File:** `scripts/ingest-travis-enrichment-local.mjs`  
**Function:** `matchAndUpsert()`  
**Lines:** ~550-570

**Before:**
```javascript
if (detectedId && parcelIds.has(detectedId)) {
  matchedParcelId = detectedId;
} else if (detectedId) {
  // Try variations...
}
```

**After:**
```javascript
// Ensure detected_id is string and trim whitespace (type-safe)
if (detectedId !== null && detectedId !== undefined) {
  detectedId = String(detectedId).trim();
} else {
  detectedId = null;
}

// Try to match detected_id to parcel_id (case-insensitive, type-safe)
let matchedParcelId = null;
if (detectedId) {
  // Direct match (case-insensitive comparison)
  for (const pid of parcelIds) {
    const pidStr = String(pid).trim();
    if (pidStr.toLowerCase() === detectedId.toLowerCase()) {
      matchedParcelId = pidStr; // Use original case from parcels_travis
      break;
    }
  }
}
```

### 3) Temporary Debug (First 20 Rows)

**Added:** Lines ~287-295
- Logs DBF record keys, parcelIdColumn, rawParcelId, normalizedParcelId, typeof
- Helps verify case sensitivity and data types

---

## Verification SQL

### Check Match Count
```sql
SELECT 
  COUNT(*) as matched_count
FROM parcels_travis_enrichment_stage s
INNER JOIN parcels_travis p ON LOWER(TRIM(s.detected_id::text)) = LOWER(TRIM(p.parcel_id::text));
```

### Sample Matched Parcel IDs
```sql
SELECT 
  p.parcel_id,
  s.detected_id,
  s.raw->>'Prop_ID' as raw_prop_id,
  s.raw->>'prop_id' as raw_prop_id_lower
FROM parcels_travis_enrichment_stage s
INNER JOIN parcels_travis p ON LOWER(TRIM(s.detected_id::text)) = LOWER(TRIM(p.parcel_id::text))
LIMIT 5;
```

### Data Type Check
```sql
SELECT 
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name IN ('parcels_travis', 'parcels_travis_enrichment_stage')
  AND column_name IN ('parcel_id', 'detected_id');
```

---

## Expected Result

After fix:
- Match count should be > 0 (ideally close to 372,826)
- Sample matched parcel_ids should show correct joins
- Debug output should show correct case-insensitive key lookup

