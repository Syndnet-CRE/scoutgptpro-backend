# GIS Layers Tool Fix Report

**Date:** January 25, 2026  
**File:** `src/tools/handlers.js`  
**Function:** `getGisLayers()`

---

## Problem Identified

The `get_gis_layers` tool was failing when users requested GIS layers like flood zones. The audit test showed:
- Error message: "flood zone layer may not be available"
- No mapData returned

---

## Root Causes Found

### 1. Table Name Mismatch
- **Issue:** `zoning_districts` table uses column name `geometry`, but code was querying `geom`
- **Impact:** Zoning queries would fail even if table exists

### 2. Missing Tables
Most GIS layer tables don't exist in the database:
- ✅ `zoning_districts` - EXISTS (uses `geometry` column)
- ✅ `parcels_travis` - EXISTS (uses `geom` column)
- ❌ `flood_zones` - NOT FOUND
- ❌ `utility_sewer` - NOT FOUND
- ❌ `utility_water` - NOT FOUND
- ❌ `building_footprints` - NOT FOUND
- ❌ `wetlands` - NOT FOUND
- ❌ `building_permits` - NOT FOUND

### 3. Poor Error Handling
- No table existence check before querying
- Minimal error logging
- Generic error messages that don't help diagnose issues

---

## Fixes Applied

### 1. Fixed Column Name Mapping
```javascript
'zoning_districts': { table: 'zoning_districts', geomCol: 'geometry' }, // Fixed: was 'geom'
```

### 2. Added Table Existence Check
Before querying, the function now checks if the table exists:
```javascript
const tableCheck = await prisma.$queryRawUnsafe(`
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = $1
  ) as exists
`, layer.table);

if (!tableCheck[0].exists) {
  return { 
    error: `GIS layer "${layer_id}" is not available. The table "${layer.table}" does not exist in the database.`,
    layer_id,
    table: layer.table
  };
}
```

### 3. Enhanced Error Logging
Added comprehensive logging:
- Function entry with parameters
- Table existence check results
- Query execution details
- Success with feature count
- Detailed error messages with stack traces
- Query and values logged on error

### 4. Improved Error Messages
- More descriptive error messages
- Includes layer_id and table name in errors
- Lists available layers when unknown layer_id provided
- Validates bbox format

### 5. Parameter Validation
- Validates bbox is array of 4 numbers
- Ensures either bbox or parcel_id is provided
- Better error messages for invalid inputs

---

## Code Changes

**File:** `src/tools/handlers.js`

**Lines Changed:** 302-365 (entire `getGisLayers` function)

**Key Improvements:**
1. Fixed `zoning_districts` geometry column name: `geom` → `geometry`
2. Added table existence verification before querying
3. Added comprehensive console logging
4. Enhanced error messages with context
5. Added input validation for bbox and parcel_id

---

## Testing

### Test 1: Zoning Districts (Should Work)
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Show me zoning districts in Austin"}],
    "sessionId": "test-gis"
  }'
```

**Expected:** Should return zoning districts with mapData

### Test 2: Flood Zones (Should Return Clear Error)
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Show me flood zones in Austin"}],
    "sessionId": "test-gis"
  }'
```

**Expected:** Should return clear error message that `flood_zones` table doesn't exist

---

## Current Status

### Working Layers
- ✅ `zoning_districts` - Fixed and should work
- ✅ `parcels_boundaries` - Should work (uses `parcels_travis`)

### Non-Working Layers (Tables Don't Exist)
- ❌ `flood_fema_zones` - Table `flood_zones` doesn't exist
- ❌ `sewer_mains` - Table `utility_sewer` doesn't exist
- ❌ `water_mains` - Table `utility_water` doesn't exist
- ❌ `building_footprints` - Table doesn't exist
- ❌ `wetlands_boundaries` - Table `wetlands` doesn't exist
- ❌ `permits_building` - Table `building_permits` doesn't exist

**Note:** These layers will now return clear error messages instead of failing silently.

---

## Next Steps

### Immediate
1. **Restart Server** - Code changes require server restart to take effect
2. **Test Zoning Districts** - Verify zoning queries work correctly
3. **Test Error Handling** - Verify missing tables return helpful errors

### Short-term
1. **Import Missing GIS Data** - If flood zones, utilities, etc. are needed, import the data
2. **Update Tool Definition** - Consider removing non-existent layers from tool enum or marking as "coming soon"
3. **Add GIS Layer Registry** - Create a table to track available GIS layers dynamically

### Long-term
1. **GIS Layer Management** - Build admin interface to manage available layers
2. **Layer Metadata** - Store layer descriptions, source info, update dates
3. **Dynamic Layer Discovery** - Auto-discover available layers from database

---

## Summary

✅ **Fixed:** Column name mismatch for `zoning_districts`  
✅ **Added:** Table existence checking  
✅ **Improved:** Error logging and messages  
✅ **Enhanced:** Input validation  

**Result:** The tool now provides clear feedback when layers are unavailable and should work correctly for `zoning_districts` and `parcels_boundaries`.

**Action Required:** Restart the server to apply changes.
