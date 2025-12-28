# ATTOM Resolver Live Documentation
**Date:** 2025-12-28  
**Status:** ✅ **LIVE**

---

## Overview

The ATTOM resolver service provides deterministic mapping from Travis County `parcelId` (6-digit numeric) to ATTOM GeoJSON ID (32-hex). It uses read-only joins to Neon tables and handles conflicts safely by quarantining them.

**Important:** This service returns `attomGeoId` (32-hex GeoJSON ID), NOT the numeric `attomId` from the `properties` table. The numeric `attomId` is preserved separately and never overwritten.

---

## ID Systems

### Two Separate ATTOM ID Fields

The API exposes two different ATTOM ID fields:

1. **`attomId` (numeric)** - Numeric ATTOM ID used in Assessor/Recorder/AVM CSVs
   - Format: Numeric string (e.g., `"123456"`)
   - Source: `properties.attomId` column (may be null)
   - Preserved: Never overwritten by resolver
   - Validation: `/^[0-9]+$/`
   - Usage: Used in Assessor, Recorder, and AVM CSV data files

2. **`attomGeoId` (32-hex)** - 32-hex ID from ATTOM GeoJSON files used for GeoJSON-derived features
   - Format: 32-character hexadecimal string (e.g., `"d84579b28c32c13f2f859f0c95d1457b"`)
   - Source: `xref_parcel_property_travis.attom_id` column
   - Generated: From ATTOM GeoJSON `id` field
   - Validation: `/^[0-9a-f]{32}$/i`
   - Usage: Used for GeoJSON-derived features and spatial data

### Why Two Fields?

- **Backward Compatibility:** Existing clients rely on numeric `attomId`
- **Data Integrity:** Prevents overwriting existing numeric IDs
- **Clarity:** Separates legacy numeric IDs from GeoJSON hash IDs
- **Future-Proof:** Allows both ID systems to coexist

### Examples

**Property with both IDs:**
```json
{
  "parcelId": "105015",
  "attomId": "123456",           // Numeric (from properties table)
  "attomGeoId": "d84579b28c32c13f2f859f0c95d1457b",  // 32-hex (from resolver)
  "attomConflict": false,
  "attomGeoIdSource": "travis_xref"  // Source of attomGeoId resolution
}
```

**Property with only GeoID:**
```json
{
  "parcelId": "105016",
  "attomId": null,               // No numeric ID in properties table
  "attomGeoId": "a164a39e3db1a26d833d6de41c7f726f",  // 32-hex (from resolver)
  "attomConflict": false,
  "attomGeoIdSource": "travis_xref"  // Source of attomGeoId resolution
}
```

**Property with conflict:**
```json
{
  "parcelId": "374448",
  "attomId": null,               // May or may not have numeric ID
  "attomGeoId": null,            // Conflicts return null
  "attomConflict": true,         // Flag indicates conflict
  "attomGeoIdSource": "conflict" // Source indicates conflict
}
```

**Property without mapping:**
```json
{
  "parcelId": "999999",
  "attomId": null,
  "attomGeoId": null,            // No mapping found
  "attomConflict": false,
  "attomGeoIdSource": "unmapped" // Source indicates no mapping
}
```

### attomGeoIdSource Field

The `attomGeoIdSource` field indicates the source of the `attomGeoId` resolution:

- **`"travis_xref"`** - `attomGeoId` was resolved via `xref_parcel_property_travis` table
- **`"conflict"`** - `attomConflict === true`, parcelId exists in conflicts table
- **`"unmapped"`** - No mapping exists for this parcelId in resolver tables

---

## Tables Used

### Primary Table: `xref_parcel_property_travis`

**Schema:**
- `parcel_id` (TEXT, PRIMARY KEY) - 6-digit parcel identifier
- `attom_id` (TEXT) - ATTOM GeoJSON ID (32-hex hash, NOT numeric)
- `source` (TEXT) - Source of mapping (e.g., 'attom_geojson_apn')
- `created_at` (TIMESTAMPTZ) - Creation timestamp

**Purpose:** Stores unique mappings (1 parcel_id → 1 attom_id where attom_id is 32-hex GeoJSON ID)

**Note:** The `attom_id` column contains 32-hex GeoJSON IDs, NOT numeric ATTOM IDs. This is exposed as `attomGeoId` in the API.

**Indexes:**
- Primary key on `(parcel_id, attom_id)`
- Index on `parcel_id`
- Index on `attom_id`

### Conflicts Table: `xref_parcel_property_travis_conflicts`

**Schema:**
- `parcel_id` (TEXT, PRIMARY KEY) - 6-digit parcel identifier
- `attom_ids` (TEXT[]) - Array of ATTOM IDs (multiple mappings)
- `attom_id_count` (INTEGER) - Number of distinct ATTOM IDs
- `sample_rows` (JSONB) - Sample feature properties for debugging
- `created_at` (TIMESTAMPTZ) - Creation timestamp

**Purpose:** Quarantines parcel_ids that map to multiple ATTOM IDs

**Indexes:**
- Primary key on `parcel_id`
- Index on `attom_id_count DESC` (for finding worst collisions)

---

## API Behavior

### Normal Parcels (Unique Mapping)

**Condition:** `parcel_id` exists in `xref_parcel_property_travis` and NOT in `xref_parcel_property_travis_conflicts`

**Response:**
```json
{
  "parcelId": "105015",
  "attomId": "123456",                    // Numeric (from properties table, if present)
  "attomGeoId": "d84579b28c32c13f2f859f0c95d1457b",  // 32-hex (from resolver)
  "attomConflict": false
}
```

### Conflict Parcels

**Condition:** `parcel_id` exists in `xref_parcel_property_travis_conflicts`

**Response:**
```json
{
  "parcelId": "374448",
  "attomId": null,                       // Numeric (from properties table, if present)
  "attomGeoId": null,                    // Conflicts return null
  "attomConflict": true
}
```

**Note:** Conflicts **always** return `attomGeoId: null` - no guessing or "pick first" behavior. The numeric `attomId` (if present) is preserved separately.

### Unmapped Parcels

**Condition:** `parcel_id` does not exist in either table

**Response:**
```json
{
  "parcelId": "999999",
  "attomId": null,                       // Numeric (from properties table, if present)
  "attomGeoId": null,                    // No mapping found
  "attomConflict": false
}
```

---

## Endpoints

### 1. GET /api/properties/resolve?parcelId=XXXXXX

**Purpose:** Resolve a single parcelId to propertyId, numeric attomId (if present), and ATTOM GeoJSON ID

**Request:**
```
GET /api/properties/resolve?parcelId=105015
```

**Response (200 OK):**
```json
{
  "success": true,
  "parcelId": "105015",
  "propertyId": "cmjewidjb7zc21l20ppd0483b",
  "attomId": "123456",                    // Numeric (from properties table, if present)
  "attomGeoId": "d84579b28c32c13f2f859f0c95d1457b",  // 32-hex (from resolver)
  "attomConflict": false
}
```

**Response (Conflict - 200 OK):**
```json
{
  "success": true,
  "parcelId": "374448",
  "propertyId": "cmjewidjb7zc21l20ppd0483b",
  "attomId": null,                       // Numeric (from properties table, if present)
  "attomGeoId": null,                    // Conflicts return null
  "attomConflict": true
}
```

**Response (400 Bad Request):**
```json
{
  "success": false,
  "error": "parcelId query parameter is required"
}
```

**Response (404 Not Found):**
```json
{
  "success": false,
  "error": "No property found for this parcelId"
}
```

### 2. GET /api/properties

**Purpose:** Search properties (now includes `attomId` and `attomConflict`)

**Request:**
```
GET /api/properties?zip=78747&limit=10
```

**Response:**
```json
{
  "success": true,
  "properties": [
    {
      "id": "cmjewidjb7zc21l20ppd0483b",
      "parcelId": "105015",
      "siteAddress": "5408 REGENCY DR",
      "attomId": "123456",                    // Numeric (from properties table, if present)
      "attomGeoId": "d84579b28c32c13f2f859f0c95d1457b",  // 32-hex (from resolver)
      "attomConflict": false,
      ...
    },
    {
      "id": "cmjewc3jn24ov1l20xhix1enx",
      "parcelId": "374448",
      "siteAddress": "...",
      "attomId": null,                       // Numeric (from properties table, if present)
      "attomGeoId": null,                    // Conflicts return null
      "attomConflict": true,
      ...
    }
  ],
  "pagination": { ... }
}
```

### 3. GET /api/properties/:id

**Purpose:** Get single property by ID (now includes `attomId` and `attomConflict`)

**Request:**
```
GET /api/properties/cmjewidjb7zc21l20ppd0483b
```

**Response:**
```json
{
  "success": true,
  "property": {
    "id": "cmjewidjb7zc21l20ppd0483b",
    "parcelId": "105015",
    "attomId": "123456",                    // Numeric (from properties table, if present)
    "attomGeoId": "d84579b28c32c13f2f859f0c95d1457b",  // 32-hex (from resolver)
    "attomConflict": false,
    ...
  }
}
```

### 4. GET /api/properties/bbox

**Purpose:** Get properties in bounding box (now includes `attomId` and `attomConflict`)

**Request:**
```
GET /api/properties/bbox?minLat=30.2&maxLat=30.3&minLng=-97.8&maxLng=-97.7
```

**Response:** Same format as GET /api/properties

### 5. POST /api/properties/search

**Purpose:** Search properties with bbox and filters (now includes `attomId` and `attomConflict`)

**Request:**
```json
{
  "bbox": [-97.8, 30.2, -97.7, 30.3],
  "filters": { "propertyType": "Residential" },
  "limit": 100
}
```

**Response:** Same format as GET /api/properties

---

## Service API

### `getAttomGeoIdByParcelId(parcelId)`

**Parameters:**
- `parcelId` (string) - 6-digit parcel identifier

**Returns:**
```typescript
Promise<{
  attomGeoId: string | null,  // 32-hex GeoJSON ID (or null)
  attomConflict: boolean
}>
```

**Usage:**
```javascript
import { getAttomGeoIdByParcelId } from '../services/attom-resolver-service.js';

const result = await getAttomGeoIdByParcelId('105015');
// { attomGeoId: 'd84579b28c32c13f2f859f0c95d1457b', attomConflict: false }
```

**Note:** Returns `attomGeoId` (32-hex), NOT numeric `attomId`. The numeric `attomId` must be fetched separately from the properties table.

### `attachAttomGeoIdsToProperties(properties)`

**Parameters:**
- `properties` (Array<Object>) - Array of property objects with `parcelId` field (may include numeric `attomId`)

**Returns:**
```typescript
Promise<Array<Object>> // Same array with attomGeoId and attomConflict added
                       // Preserves existing numeric attomId if present
```

**Usage:**
```javascript
import { attachAttomGeoIdsToProperties } from '../services/attom-resolver-service.js';

const properties = [
  { id: '...', parcelId: '105015', attomId: '123456', ... },
  { id: '...', parcelId: '374448', attomId: null, ... }
];

const enriched = await attachAttomGeoIdsToProperties(properties);
// [
//   { id: '...', parcelId: '105015', attomId: '123456', attomGeoId: 'd84579b28c32c13f2f859f0c95d1457b', attomConflict: false, ... },
//   { id: '...', parcelId: '374448', attomId: null, attomGeoId: null, attomConflict: true, ... }
// ]
```

**Note:** Preserves existing numeric `attomId` from properties table. Adds `attomGeoId` (32-hex) from resolver.

---

## Conflict Resolution Strategy

**Rule:** Conflicts **always** return `attomId: null` and `attomConflict: true`

**Rationale:**
- Prevents incorrect data from being used
- Forces manual review of conflicts
- Maintains data integrity

**Example Conflict:**
- `parcel_id: "374448"` maps to 12 different ATTOM IDs
- Response: `{ attomId: null, attomConflict: true }`
- Manual review required to determine correct mapping

---

## Performance

**Batch Lookups:**
- Uses parameterized SQL queries with `IN` clause
- Single query for conflicts, single query for xref
- O(n) complexity where n = number of parcelIds

**Indexes:**
- `xref_parcel_property_travis.parcel_id` - Fast lookups
- `xref_parcel_property_travis_conflicts.parcel_id` - Fast conflict checks

**Expected Performance:**
- Single lookup: < 10ms
- Batch lookup (100 properties): < 50ms
- Batch lookup (1000 properties): < 200ms

---

## Testing Locally

### 1. Run Test Script

```bash
cd /Users/braydonirwin/scoutgptpro-backend
node scripts/test_attom_resolver_live.mjs
```

**Expected Output:**
- Tests 20 random parcelIds
- Shows counts: with ATTOM ID, with conflict, without mapping
- Displays sample outputs for each category
- Verifies conflict handling

### 2. Test API Endpoints

**Test resolve endpoint:**
```bash
curl "http://localhost:3000/api/properties/resolve?parcelId=105015"
```

**Test properties endpoint:**
```bash
curl "http://localhost:3000/api/properties?zip=78747&limit=5"
```

**Test single property:**
```bash
curl "http://localhost:3000/api/properties/cmjewidjb7zc21l20ppd0483b"
```

### 3. Verify Conflict Handling

**Test conflict parcel:**
```bash
curl "http://localhost:3000/api/properties/resolve?parcelId=374448"
```

**Expected:** `attomId: null, attomConflict: true`

---

## Coverage Statistics

**Current Coverage (as of ingestion):**
- **Total Neon parcelIds:** 352,431
- **Mapped parcelIds:** 349,090
- **Coverage Rate:** 99.05%
- **Conflicts:** 5,067 (quarantined)
- **Unmapped:** 3,341 (0.95%)

---

## Data Flow

```
API Request
    ↓
Fetch Properties (Prisma)
    ↓
attachAttomIdsToProperties(properties)
    ↓
Query xref_parcel_property_travis_conflicts (batch)
    ↓
Query xref_parcel_property_travis (batch, exclude conflicts)
    ↓
Merge results (conflicts override xref)
    ↓
Return enriched properties
```

---

## Safety Guarantees

✅ **Read-Only:** No modifications to `public.properties` table  
✅ **Non-Destructive:** Only reads from xref tables  
✅ **Deterministic:** Same parcelId always returns same result  
✅ **Conflict-Safe:** Conflicts return null (no guessing)  
✅ **Parameterized Queries:** SQL injection protection

---

## Troubleshooting

### Issue: attomId always null

**Check:**
1. Tables exist: `SELECT to_regclass('public.xref_parcel_property_travis');`
2. Data exists: `SELECT COUNT(*) FROM xref_parcel_property_travis;`
3. parcelId format: Must be 6-digit numeric string

### Issue: Conflicts not detected

**Check:**
1. Conflicts table exists: `SELECT to_regclass('public.xref_parcel_property_travis_conflicts');`
2. Data exists: `SELECT COUNT(*) FROM xref_parcel_property_travis_conflicts;`
3. Query order: Conflicts are checked before xref (correct)

### Issue: Performance slow

**Check:**
1. Indexes exist: `SELECT * FROM pg_indexes WHERE tablename = 'xref_parcel_property_travis';`
2. Batch size: Consider reducing batch size if > 1000 properties
3. Query plan: Use `EXPLAIN ANALYZE` on resolver queries

---

## Files

**Service:** `src/services/attom-resolver-service.js`  
**Routes:** `src/routes/properties.js` (updated)  
**Test Script:** `scripts/test_attom_resolver_live.mjs`  
**Documentation:** `docs/ATTOM_RESOLVER_LIVE.md` (this file)

---

**Last Updated:** 2025-12-28  
**Status:** ✅ Live and operational

