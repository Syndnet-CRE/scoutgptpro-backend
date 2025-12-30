# DBF Float Parcel ID Fix

**Date:** 2024-12-30  
**Issue:** DBF parcel IDs are numeric floats (e.g., "970897.0"), causing 0 matches  
**Fix:** Strip trailing ".0" in `normalizeParcelId()`

---

## Patch Applied

**File:** `scripts/ingest-travis-enrichment-local.mjs`  
**Function:** `normalizeParcelId()`

**Before:**
```javascript
function normalizeParcelId(id) {
  if (!id) return null;
  
  // Trim whitespace and cast to string - no other transformation
  return String(id).trim();
}
```

**After:**
```javascript
function normalizeParcelId(id) {
  if (!id) return null;
  let normalized = String(id).trim();
  // DBF numeric fields are stored as floats (e.g., "970897.0"), but parcels_travis.parcel_id is integer-like.
  // Strip trailing ".0" to match: "970897.0" → "970897"
  if (/^\d+\.0$/.test(normalized)) {
    normalized = normalized.replace(/\.0$/, '');
  }
  return normalized;
}
```

---

## Verification SQL

### Match Count (Should be > 0)
```sql
SELECT COUNT(*) as matched_count
FROM parcels_travis_enrichment_stage s
INNER JOIN parcels_travis p ON TRIM(s.detected_id::text) = TRIM(p.parcel_id::text);
```

### Sample Matched Parcel IDs (5)
```sql
SELECT 
  p.parcel_id,
  s.detected_id,
  TRIM(s.detected_id::text) as detected_id_trimmed,
  TRIM(p.parcel_id::text) as parcel_id_trimmed
FROM parcels_travis_enrichment_stage s
INNER JOIN parcels_travis p ON TRIM(s.detected_id::text) = TRIM(p.parcel_id::text)
LIMIT 5;
```

### Check for ".0" Pattern in Staging
```sql
SELECT 
  detected_id,
  CASE 
    WHEN detected_id LIKE '%.0' THEN 'has_trailing_dot_zero'
    ELSE 'no_trailing_dot_zero'
  END as pattern_check
FROM parcels_travis_enrichment_stage
WHERE detected_id IS NOT NULL
LIMIT 10;
```

---

## Behavior

- ✅ Trims whitespace (unchanged)
- ✅ Strips trailing ".0" for numeric floats (new)
- ✅ No other transformations
- ✅ Deterministic: only matches `/^\d+\.0$/` pattern

