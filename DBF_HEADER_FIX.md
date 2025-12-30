# DBF Header Handling Fix

**Date:** 2024-12-30  
**Issue:** `openDbf()` doesn't expose `fields` directly  
**Fix:** Extract field names from `header.fields` or infer from first record

---

## Patch Summary

**File:** `scripts/ingest-travis-enrichment-local.mjs`  
**Function:** `streamDbfToStage()`  
**Lines:** ~206-300

---

## Changes Made

### Before (Broken):
```javascript
const source = await openDbf(filePath);
const headers = source.fields.map(f => f.name); // ❌ source.fields is undefined
```

### After (Fixed):
```javascript
const source = await openDbf(filePath);

// Extract field names: try header.fields first, then infer from first record
let headers = null;
if (source.header && source.header.fields && Array.isArray(source.header.fields)) {
  headers = source.header.fields.map(f => f.name || f.fieldName || f);
} else {
  // Infer from first record
  const firstResult = await source.read();
  if (firstResult.done) {
    throw new Error('DBF file is empty - cannot determine field names');
  }
  headers = Object.keys(firstResult.value || {});
  // Process first record (can't reset reader)
  // ... process first record ...
}

// Defensive guard
if (!headers || headers.length === 0) {
  const availableKeys = Object.keys(source).join(', ');
  throw new Error(`Cannot determine DBF field names. Available object keys: ${availableKeys}`);
}
```

---

## How DBF Fields Are Detected

1. **Primary:** `source.header.fields` (if available)
   - Maps to `f.name` or `f.fieldName`

2. **Fallback:** Infer from first record
   - Reads first record with `source.read()`
   - Extracts keys: `Object.keys(firstResult.value)`
   - Processes first record (can't reset reader)

3. **Defensive:** Clear error if fields can't be determined
   - Lists available object keys for debugging

---

## Confirmation

**DBF fields are detected by:**
- `source.header.fields` array (preferred)
- OR `Object.keys()` of first record (fallback)

**Parcel ID column detection works with:**
- Detected headers array passed to `detectParcelIdColumn(headers)`

**Defensive guard:**
- Throws clear error listing available keys if fields cannot be determined

