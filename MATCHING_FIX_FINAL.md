# Matching Fix - Final

**Root Cause:** Case-sensitive Set.has() exact match + potential DBF key case mismatch

---

## Root Cause

1. **DBF key case mismatch:** `record["Prop_ID"]` may not match actual DBF key case
2. **Exact Set match:** `parcelIds.has(detectedId)` requires exact string match (case-sensitive)

---

## Code Changes

### 1) DBF Key Lookup (Case-Insensitive)

**File:** `scripts/ingest-travis-enrichment-local.mjs`  
**Lines:** ~289-302

**Change:** Added case-insensitive key lookup:
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

### 2) Matching Logic (Case-Insensitive Map)

**File:** `scripts/ingest-travis-enrichment-local.mjs`  
**Lines:** ~530-574

**Change:** Replaced Set.has() with case-insensitive Map lookup:
```javascript
// Create case-insensitive lookup map: lowercase -> original case
const parcelIdsMap = new Map();
parcelIdsResult.rows.forEach(r => {
  const pid = String(r.parcel_id).trim();
  parcelIdsMap.set(pid.toLowerCase(), pid);
});

// In matching loop:
if (detectedId) {
  // Direct match using case-insensitive map lookup
  matchedParcelId = parcelIdsMap.get(detectedId.toLowerCase()) || null;
}
```

### 3) Type Safety

**Change:** Ensure detected_id is string and trimmed:
```javascript
if (detectedId !== null && detectedId !== undefined) {
  detectedId = String(detectedId).trim();
} else {
  detectedId = null;
}
```

### 4) Debug (First 20 Rows)

**Added:** Lines ~307-317
- Logs DBF keys, parcelIdColumn, rawParcelId, normalizedParcelId, typeof

---

## Verification SQL

### Match Count
```sql
SELECT COUNT(*) as matched_count
FROM parcels_travis_enrichment_stage s
INNER JOIN parcels_travis p ON LOWER(TRIM(s.detected_id::text)) = LOWER(TRIM(p.parcel_id::text));
```

### Sample Matched Parcel IDs
```sql
SELECT 
  p.parcel_id,
  s.detected_id,
  LOWER(TRIM(s.detected_id::text)) as detected_id_normalized,
  LOWER(TRIM(p.parcel_id::text)) as parcel_id_normalized
FROM parcels_travis_enrichment_stage s
INNER JOIN parcels_travis p ON LOWER(TRIM(s.detected_id::text)) = LOWER(TRIM(p.parcel_id::text))
LIMIT 5;
```

### Data Types
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

- Match count > 0 (ideally ~372,826)
- Sample matched parcel_ids show correct joins
- Debug output confirms case-insensitive key lookup works

