# ATTOM Resolver Fix Summary
**Date:** 2025-12-28  
**Status:** ✅ **COMPLETE**

---

## Problem

The resolver was incorrectly overwriting/mislabeling numeric ATTOM IDs. The `properties.attomId` column contains numeric IDs, but the resolver tables contain 32-hex GeoJSON IDs. These are two different ID systems that must be kept separate.

---

## Solution

Separated the two ID systems into distinct fields:
- **`attomId`** (numeric) - Preserved from `properties.attomId` column, never overwritten
- **`attomGeoId`** (32-hex) - From resolver tables (`xref_parcel_property_travis.attom_id`)

---

## Changes Made

### 1. Service (`src/services/attom-resolver-service.js`)

**Before:**
```javascript
export async function getAttomIdByParcelId(parcelId) {
  return { attomId: '...', attomConflict: false };
}
```

**After:**
```javascript
export async function getAttomGeoIdByParcelId(parcelId) {
  return { attomGeoId: '...', attomConflict: false };
}
```

**Key Changes:**
- ✅ Renamed return field: `attomId` → `attomGeoId`
- ✅ New function: `getAttomGeoIdByParcelId()`
- ✅ New function: `attachAttomGeoIdsToProperties()`
- ✅ Legacy functions kept for backward compatibility (deprecated)
- ✅ Preserves existing numeric `attomId` from properties

### 2. Routes (`src/routes/properties.js`)

**Before:**
```javascript
const { attomId, attomConflict } = await getAttomIdByParcelId(parcelId);
// attomId could be 32-hex, overwriting numeric attomId
```

**After:**
```javascript
const { attomGeoId, attomConflict } = await getAttomGeoIdByParcelId(parcelId);
// attomGeoId is 32-hex, attomId (numeric) preserved separately
```

**Key Changes:**
- ✅ All endpoints use `attomGeoId` instead of `attomId` from resolver
- ✅ Existing numeric `attomId` preserved from properties table
- ✅ `/resolve` endpoint returns both fields:
  ```json
  {
    "attomId": "123456",           // Numeric (from properties table)
    "attomGeoId": "d84579b28c32c13f2f859f0c95d1457b",  // 32-hex (from resolver)
    "attomConflict": false
  }
  ```

### 3. Test Script (`scripts/test_attom_resolver_live.mjs`)

**Key Changes:**
- ✅ Validates `attomGeoId` is 32-hex or null: `/^[0-9a-f]{32}$/i`
- ✅ Validates numeric `attomId` is numeric or null: `/^[0-9]+$/`
- ✅ Tests conflict parcelId handling
- ✅ Tests numeric `attomId` preservation
- ✅ Includes known conflict parcelId (`374448`)

### 4. Documentation (`docs/ATTOM_RESOLVER_LIVE.md`)

**Key Changes:**
- ✅ Added "ID Systems" section explaining two fields
- ✅ Updated all examples to show both `attomId` and `attomGeoId`
- ✅ Clarified formats: numeric vs 32-hex
- ✅ Updated service API documentation

---

## Test Results

```
✅ Test Complete - All validations passed

Results Summary:
- Total tested: 21
- With ATTOM GeoID (32-hex): 20 (95.2%)
- With numeric attomId (from DB): 17 (81.0%)
- With conflict: 1 (4.8%)
- Without mapping: 0 (0.0%)

Validations:
✅ attomGeoId format: 32-hex or null
✅ Numeric attomId format: numeric or null
✅ Conflict handling: Returns null attomGeoId
✅ Numeric attomId preservation: Preserved separately
```

---

## API Response Examples

### Normal Parcel (with both IDs)
```json
{
  "parcelId": "105015",
  "attomId": "123456",                    // Numeric (from properties table)
  "attomGeoId": "d84579b28c32c13f2f859f0c95d1457b",  // 32-hex (from resolver)
  "attomConflict": false
}
```

### Normal Parcel (only GeoID)
```json
{
  "parcelId": "105016",
  "attomId": null,                        // No numeric ID in properties table
  "attomGeoId": "a164a39e3db1a26d833d6de41c7f726f",  // 32-hex (from resolver)
  "attomConflict": false
}
```

### Conflict Parcel
```json
{
  "parcelId": "374448",
  "attomId": null,                        // May or may not have numeric ID
  "attomGeoId": null,                     // Conflicts return null
  "attomConflict": true
}
```

---

## Backward Compatibility

✅ **Preserved:** Legacy function names (`getAttomIdByParcelId`, `attachAttomIdsToProperties`) still work but are deprecated  
✅ **No Breaking Changes:** Existing clients using numeric `attomId` continue to work  
✅ **New Field:** `attomGeoId` is additive, doesn't break existing code

---

## Safety Guarantees

✅ **Read-Only:** No modifications to `public.properties.attomId`  
✅ **Non-Destructive:** Numeric `attomId` never overwritten  
✅ **Format Validation:** `attomGeoId` must be 32-hex or null  
✅ **Separation:** Two ID systems kept completely separate  
✅ **Conflict-Safe:** Conflicts return null `attomGeoId` (no guessing)

---

## Files Modified

1. `src/services/attom-resolver-service.js` - Core resolver logic
2. `src/routes/properties.js` - API endpoints (5 endpoints updated)
3. `scripts/test_attom_resolver_live.mjs` - Test harness
4. `docs/ATTOM_RESOLVER_LIVE.md` - Documentation

---

**Last Updated:** 2025-12-28  
**Status:** ✅ Complete and tested


