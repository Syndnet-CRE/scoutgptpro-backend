# TRAVIS COUNTY SYSTEM + DATA AUDIT v1
**Date:** 2025-01-27  
**Repos:** `scoutgpt_9461` (frontend) + `scoutgptpro-backend` (backend)  
**Focus:** Travis County, Texas  
**Purpose:** Factual audit of current system state, data coverage, enrichment logic, IDs, and GIS readiness

---

## 1. SYSTEM OVERVIEW

### 1.1 Backend Configuration

**Database:**
- **Provider:** PostgreSQL (Neon)
- **ORM:** Prisma Client
- **Schema:** `public` (default)
- **PostGIS:** ✅ Enabled (extension exists, `spatial_ref_sys` table present)
- **Connection:** Via `DATABASE_URL` environment variable

**Backend Structure:**
```
scoutgptpro-backend/
├── prisma/
│   └── schema.prisma          # Prisma schema (single source of truth)
├── src/
│   ├── routes/                # Express route handlers
│   │   ├── properties.js      # Property CRUD + search
│   │   ├── parcels.js         # Parcel chunk serving
│   │   ├── gis.js             # GIS layer endpoints
│   │   └── ...
│   ├── services/              # Business logic
│   └── server.js              # Express app entry
└── scripts/                   # ETL/ingestion scripts
    ├── import-recorder.py     # RECORDER data ingestion
    ├── import-avm.py          # AVM data ingestion
    ├── ingestRecorderData.cjs # RECORDER ingestion (Node)
    └── ...
```

**Frontend Structure:**
```
scoutgpt_9461/
├── src/
│   ├── pages/scout-ai-chat/   # Main map interface
│   ├── components/
│   │   ├── property/          # Property UI components
│   │   └── layout/            # PropertyPanel (left panel)
│   ├── hooks/
│   │   ├── useSelectedEntity.js  # Single enrichment owner
│   │   └── useParcelData.js      # Parcel chunk loading
│   └── contexts/
│       └── ParcelContext.jsx     # Property selection context
```

---

## 2. DATABASE INVENTORY

### 2.1 Tables (from Prisma Schema)

| Table Name | Model Name | Primary Key | Row Count (Est.) | Purpose |
|------------|-----------|-------------|------------------|---------|
| `properties` | Property | `id` (cuid) | **352,431** | Core property records |
| `users` | User | `id` (cuid) | 0 | User accounts |
| `user_profiles` | UserProfile | `id` (cuid) | 0 | Extended user profiles |
| `listings` | Listing | `id` (cuid) | 1 | Property listings |
| `deals` | Deal | `id` (cuid) | 0 | CRM deals |
| `buy_boxes` | BuyBox | `id` (cuid) | 0 | User search criteria |
| `documents` | Document | `id` (cuid) | 0 | File uploads |
| `activities` | Activity | `id` (cuid) | 0 | Activity log |
| `tasks` | Task | `id` (cuid) | 0 | Task management |
| `comps` | Comp | `id` (cuid) | 0 | Comparables |
| `gis_layers` | GisLayer | `id` (cuid) | 0 | Custom GIS layer configs |
| `pins` | Pin | `id` (cuid) | 0 | Map pins |
| `map_server_registry` | MapServerRegistry | `id` (cuid) | **416** | MapServer catalog |
| `layer_sets` | LayerSet | `id` (cuid) | **32** | GIS layer set definitions |
| `map_queries` | MapQuery | `id` (cuid) | 0 | Saved map queries |
| `polygon_searches` | PolygonSearch | `id` (cuid) | 0 | Saved polygon searches |
| `spatial_ref_sys` | spatial_ref_sys | `srid` (int) | ~6,000 | PostGIS SRID definitions |

**Note:** Row counts are estimates from previous audits. Actual counts may vary.

### 2.2 Geometry Tables

**PostGIS Geometry Columns:**
- `properties.geom` (Point, SRID 4326) - ✅ EXISTS (optional, populated from lat/lng)
- **No polygon geometry tables** - Parcels stored as GeoJSON chunks, not PostGIS

**GeoJSON Parcel Storage:**
- **Location:** `backend/data/parcels/chunks/*.geojson`
- **Index:** `backend/data/parcels/chunk_index.json`
- **Format:** FeatureCollection with Polygon geometries
- **Centroids:** Pre-computed in `properties.centroid` array `[lng, lat]`

### 2.3 Missing Tables (Expected but Not Found)

| Expected Table | Status | Notes |
|---------------|--------|-------|
| `parcels` | ❌ Not in schema | Parcels stored as GeoJSON files |
| `permits` | ❌ Not in schema | No permits table found |
| `zoning_cases` | ❌ Not in schema | No zoning table found |
| `recorder_transactions` | ❌ Not in schema | RECORDER data merged into `properties` |
| `flood_zones` | ❌ Not in schema | Flood data accessed via MapServer API |
| `staging_avm` | ❌ Not in schema | AVM data merged into `properties` |

---

## 3. CORE SCHEMAS

### 3.1 `properties` Table (Primary)

**Primary Key:** `id` (String, cuid format, e.g., `"cmjew..."`)

**Unique Constraints:**
- `parcelId` (String, unique, indexed) - Numeric string from county assessor

**Foreign Keys:** None (standalone table)

**Indexes:**
- `properties_propertyType_idx` - Property type filter
- `properties_latitude_longitude_idx` - Spatial queries
- `properties_isAbsentee_idx` - Absentee owner filter
- `properties_isTaxDelinquent_idx` - Tax delinquent filter
- `properties_motivationScore_idx` - Score sorting
- `properties_acres_idx` - Acreage filter
- `properties_totalTax_idx` - Tax filter
- `properties_parcelId_idx` - Parcel ID lookup
- `properties_attomId_idx` - ATTOM ID lookup
- `properties_geom_idx` (GIST) - PostGIS spatial index (if geom column exists)

**Key Columns:**

| Column | Type | Nullable | Purpose | Source |
|--------|------|----------|---------|--------|
| `id` | String (cuid) | NO | Primary key | Generated |
| `parcelId` | String | NO | Parcel identifier | ATTOM/County |
| `attomId` | String | YES | ATTOM ID | ATTOM |
| `apn` | String | YES | Assessor Parcel Number | ATTOM |
| `address` | String | YES | Mailing address | ATTOM |
| `siteAddress` | String | YES | Site address | TCAD API |
| `siteCity` | String | YES | Site city | TCAD API |
| `siteState` | String | YES | Site state | TCAD API |
| `siteZip` | String | YES | Site ZIP | TCAD API |
| `latitude` | Float | YES | Latitude | ATTOM/TCAD |
| `longitude` | Float | YES | Longitude | ATTOM/TCAD |
| `geom` | geometry(Point, 4326) | YES | PostGIS point | Derived from lat/lng |
| `propertyType` | String | YES | Property type | Classified |
| `zoning` | String | YES | Zoning code | TCAD API |
| `acres` | Float | YES | Acreage | ATTOM/TCAD |
| `motivationScore` | Int | YES | Score (0-100) | Calculated |
| `mktValue` | Float | YES | Market value | ATTOM |
| `landValue` | Float | YES | Land value | TCAD API |
| `impValue` | Float | YES | Improvement value | TCAD API |
| `avmValue` | Decimal(14,2) | YES | AVM estimated value | ATTOM AVM |
| `avmMin` | Decimal(14,2) | YES | AVM min value | ATTOM AVM |
| `avmMax` | Decimal(14,2) | YES | AVM max value | ATTOM AVM |
| `avmConfidence` | Int | YES | AVM confidence | ATTOM AVM |
| `avmDate` | DateTime | YES | AVM date | ATTOM AVM |
| `totalTax` | Float | YES | Total tax | TCAD API |
| `totalDue` | Float | YES | Total due | TCAD API |
| `taxYear` | Int | YES | Tax year | TCAD API |
| `isAbsentee` | Boolean | NO | Absentee owner flag | Calculated |
| `isTaxDelinquent` | Boolean | NO | Tax delinquent flag | TCAD API |
| `isVacantLand` | Boolean | NO | Vacant land flag | Classified |
| `lastSaleDate` | DateTime | YES | Last sale date | RECORDER |
| `lastSaleAmount` | Float | YES | Last sale amount | RECORDER |
| `lastSaleDocType` | String | YES | Document type | RECORDER |
| `grantorName` | String | YES | Grantor name | RECORDER |
| `granteeName` | String | YES | Grantee name | RECORDER |
| `granteeMailAddress` | String | YES | Grantee mailing address | RECORDER |
| `granteeMailCity` | String | YES | Grantee city | RECORDER |
| `granteeMailState` | String | YES | Grantee state | RECORDER |
| `granteeMailZip` | String | YES | Grantee ZIP | RECORDER |
| `isInvestorOwned` | Boolean | NO | Investor owned flag | RECORDER |
| `isForeclosure` | Boolean | NO | Foreclosure flag | RECORDER |
| `mortgageAmount` | Float | YES | Mortgage amount | RECORDER |
| `mortgageLender` | String | YES | Mortgage lender | RECORDER |
| `mortgageRate` | Float | YES | Mortgage rate | RECORDER |
| `mortgageTerm` | Int | YES | Mortgage term | RECORDER |
| `ownershipYears` | Float | YES | Ownership duration | Calculated |
| `enrichedAt` | DateTime | YES | Enrichment timestamp | System |
| `enrichmentSource` | String | YES | Enrichment source | System |
| `floodZone` | String | YES | Flood zone | **REMOVED** (was in schema) |
| `centroid` | Json | YES | Centroid coordinates | **REMOVED** (was in schema) |

**Note:** `floodZone` and `centroid` columns were removed in schema cleanup but may still exist in production DB.

### 3.2 Parcel Geometry (GeoJSON)

**Storage:** File-based GeoJSON chunks

**Structure:**
```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "properties": {
      "id": "970897",              // parcel_id (numeric string)
      "owner": "...",
      "address": "...",
      "acres": "1.0188",
      "taxYear": "2025",
      "totalTax": "35.38",
      "centroid": [-97.71549, 30.06657]  // [lng, lat]
    },
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[...]]]
    }
  }]
}
```

**No PostGIS table** - Parcels are served via `/api/parcels/viewport` endpoint.

---

## 4. ID CONTRACT AUDIT

### 4.1 Canonical Property ID

**Format:** String (cuid), e.g., `"cmjew..."`

**Generation:**
- Generated by Prisma on insert (`@default(cuid())`)
- Immutable (never changes)

**Usage:**
- Primary key for `properties` table
- Used in API: `GET /api/properties/:id`
- Used in frontend: `useSelectedEntity` hook
- Referenced by: `listings.propertyId`, `deals.propertyId`, `pins.propertyId`, `comps.propertyId`

**Evidence:**
```prisma
model Property {
  id String @id @default(cuid())
  // ...
}
```

### 4.2 Canonical Parcel ID

**Format:** String (numeric), e.g., `"970897"`

**Source:** County assessor (Travis County via ATTOM)

**Stability:** ✅ Stable and unique (county-assigned identifier)

**Storage:**
- In `properties.parcelId` (unique constraint)
- In GeoJSON chunk `properties.id` field

**Evidence:**
```prisma
model Property {
  parcelId String @unique
  @@index([parcelId])
}
```

### 4.3 Parcel → Property Mapping

**Mapping Method:** Direct column relationship

**Structure:**
- `properties.parcelId` → `properties.id` (one-to-one via unique constraint)
- No separate mapping table

**Resolver Endpoint:**
- **Path:** `GET /api/properties/resolve?parcelId={parcelId}`
- **Input:** `parcelId` (query parameter, string, numeric)
- **Query:** `SELECT id, parcelId FROM properties WHERE parcelId = $1`
- **Returns:**
  ```json
  {
    "success": true,
    "propertyId": "cmjew...",
    "parcelId": "970897"
  }
  ```
- **404:** If no property record exists for parcelId

**Evidence:**
```javascript
// src/routes/properties.js:88-121
router.get('/resolve', async (req, res) => {
  const { parcelId } = req.query;
  const property = await prisma.property.findUnique({
    where: { parcelId: String(parcelId) },
    select: { id: true, parcelId: true }
  });
  // ...
});
```

### 4.4 ID Contract Summary

| ID Type | Format | Source | Stable | Unique | Mapping |
|---------|--------|--------|--------|--------|---------|
| **property_id** | String (cuid) | Generated | ✅ Yes | ✅ Yes | Primary key |
| **parcel_id** | String (numeric) | County/ATTOM | ✅ Yes | ✅ Yes | `properties.parcelId` |
| **attom_id** | String | ATTOM | ✅ Yes | ✅ Yes | `properties.attomId` (indexed) |

**Mapping:** `parcelId` → `id` (one-to-one, unique constraint)

---

## 5. ENRICHMENT COVERAGE TODAY

### 5.1 Enrichment Endpoint

**Endpoint:** `GET /api/properties/:id`

**Returns:** Full `Property` record (all columns)

**Single Owner:** ✅ `useSelectedEntity` hook (frontend) is the single enrichment owner

**Evidence:**
```javascript
// src/routes/properties.js:127-142
router.get('/:id', async (req, res) => {
  const property = await prisma.property.findUnique({
    where: { id: req.params.id }
  });
  res.json({ success: true, property });
});
```

### 5.2 Enrichment Fields

**Estimated Value:**
- `avmValue` (Decimal) - ATTOM AVM estimated value
- `avmMin` (Decimal) - ATTOM AVM min value
- `avmMax` (Decimal) - ATTOM AVM max value
- `avmConfidence` (Int) - ATTOM AVM confidence score
- `avmDate` (DateTime) - ATTOM AVM valuation date
- `mktValue` (Float) - Market value (ATTOM)
- `landValue` (Float) - Land value (TCAD API)
- `impValue` (Float) - Improvement value (TCAD API)

**Mortgage / Debt:**
- `mortgageAmount` (Float) - RECORDER
- `mortgageLender` (String) - RECORDER
- `mortgageRate` (Float) - RECORDER
- `mortgageTerm` (Int) - RECORDER

**RECORDER Fields:**
- `lastSaleDate` (DateTime) - RECORDER
- `lastSaleAmount` (Float) - RECORDER
- `lastSaleDocType` (String) - RECORDER
- `grantorName` (String) - RECORDER
- `granteeName` (String) - RECORDER
- `granteeMailAddress` (String) - RECORDER
- `granteeMailCity` (String) - RECORDER
- `granteeMailState` (String) - RECORDER
- `granteeMailZip` (String) - RECORDER
- `isInvestorOwned` (Boolean) - RECORDER
- `isForeclosure` (Boolean) - RECORDER
- `ownershipYears` (Float) - Calculated from `lastSaleDate`

**Zoning:**
- `zoning` (String) - TCAD API (single code, not cases)

**Permits:** ❌ Not stored in database

**Flood:** ❌ Not stored in database (accessed via MapServer API)

### 5.3 Data Source Mapping

| Field Category | Source | Ingestion Method | Coverage |
|---------------|--------|------------------|----------|
| **Core Property** | ATTOM 5.0 Assessor | Initial import | 352,431 properties |
| **Site Address** | TCAD API | `enrich-from-tcad-api.js` | 99.05% (local), 21.19% (production) |
| **Tax Data** | TCAD API | `enrich-from-tcad-api.js` | 94% |
| **AVM Values** | ATTOM AVM | `import-avm.py` / `import-avm-to-neon.cjs` | Partial (unknown %) |
| **RECORDER Data** | ATTOM 5.0 Recorder | `import-recorder.py` / `ingestRecorderData.cjs` | Partial (matched by attomId/parcelId) |
| **Zoning** | TCAD API | `enrich-from-tcad-api.js` | Single code per property |
| **Permits** | Unknown | ❌ Not ingested | 0% |
| **Flood Zones** | FEMA/MapServer | API-only (not stored) | 0% (no DB storage) |

### 5.4 Enrichment Coverage Statistics

**From Previous Audit (Dec 2024):**

| Metric | Local DB | Production DB | Gap |
|--------|----------|---------------|-----|
| **Total Properties** | 352,431 | 352,431 | ✅ Same |
| **With siteAddress** | 349,097 (99.05%) | 74,696 (21.19%) | ⚠️ -77.86% |
| **Fully Enriched (TCAD)** | 321,995 (91.36%) | 47,594 (13.50%) | ⚠️ -77.86% |
| **With AVM** | Unknown | Unknown | ❓ Unknown |
| **With RECORDER** | Unknown | Unknown | ❓ Unknown |

**Current Status:** Production database has significant enrichment gaps.

---

## 6. GIS READINESS

### 6.1 Geometry Storage

**PostGIS Geometry:**
- ✅ `properties.geom` (Point, SRID 4326) - Optional, populated from lat/lng
- ✅ `spatial_ref_sys` table exists (PostGIS enabled)
- ❌ No polygon geometry tables

**GeoJSON Parcel Storage:**
- ✅ Parcel polygons stored as GeoJSON chunks
- ✅ Centroids pre-computed in chunk `properties.centroid`
- ❌ Not in PostGIS (cannot use spatial queries)

### 6.2 CRS / SRID

**Standard:** SRID 4326 (WGS84) - Used for all geometry

**Evidence:**
```javascript
// scripts/add-geometry-column.js
ALTER TABLE properties ADD COLUMN geom geometry(Point, 4326);
```

### 6.3 Centroid Status

**Status:** ✅ Pre-computed

**Location:**
- GeoJSON chunks: `properties.centroid` array `[lng, lat]`
- Properties table: `centroid` Json column (removed from schema, may exist in DB)

**Generation:** Not derived on-the-fly (already in chunk files)

### 6.4 Tiling Readiness

**Current State:**
- ❌ Parcels not in PostGIS (cannot generate tiles directly)
- ✅ GeoJSON chunks can be converted to tileset
- ✅ Centroids available for point tileset

**Recommendation:** Convert GeoJSON chunks to PostGIS `parcels` table for tiling.

### 6.5 GIS Layers (API vs Tiled)

**Current Approach:** API-loaded (MapServer endpoints)

**Available Layers (416 MapServers):**
- Zoning: 6 layers (API)
- Floodplain: 79 layers (API)
- Permits: 7 layers (API)
- Parcels: 15 layers (API)
- Utilities: 191 layers (API)
- Buildings: 87 layers (API)

**Tiling Status:** ❌ No tilesets generated (all API-loaded)

---

## 7. DATASET INGESTION STATUS

### 7.1 Dataset Inventory

| Dataset | Ingested? | Table Name | Join Key | Row Count | Status |
|---------|-----------|------------|----------|-----------|--------|
| **permits.csv** | ❌ NO | N/A | N/A | 0 | Not found |
| **zoning_cases.csv** | ❌ NO | N/A | N/A | 0 | Not found |
| **TAXASSESSOR_0001.csv** | ✅ YES | `properties` | `parcelId` | 352,431 | Merged into properties |
| **ATTOM 5.0 Assessor** | ✅ YES | `properties` | `parcelId` | 352,431 | Initial import |
| **ATTOM 5.0 Recorder** | ⚠️ PARTIAL | `properties` | `attomId` / `parcelId` | Unknown | Merged into properties |
| **ATTOM AVM** | ⚠️ PARTIAL | `properties` | `attomId` | Unknown | Merged into properties |
| **ATTOM Property Deletes** | ❌ NO | N/A | N/A | 0 | Not ingested |
| **ATTOM Recorder Deletes** | ❌ NO | N/A | N/A | 0 | Not ingested |
| **ATTOM Property ↔ Boundary Match** | ✅ YES | GeoJSON chunks | `parcelId` | ~352k | File-based |
| **ATTOM Parcel GeoJSON** | ✅ YES | GeoJSON chunks | `parcelId` | ~352k | File-based |
| **FEMA Flood GeoJSON** | ❌ NO | N/A | N/A | 0 | API-only (not stored) |

### 7.2 Ingestion Scripts Found

| Script | Purpose | Status | Notes |
|--------|---------|--------|-------|
| `import-recorder.py` | RECORDER CSV import | ✅ Exists | Matches by attomId/apn |
| `import-avm.py` | AVM CSV import | ✅ Exists | Matches by attomId |
| `ingestRecorderData.cjs` | RECORDER ingestion (Node) | ✅ Exists | Matches by attomId/parcelId |
| `import-avm-to-neon.cjs` | AVM import to Neon | ✅ Exists | Matches by attomId |
| `enrich-from-tcad-api.js` | TCAD API enrichment | ✅ Exists | Updates existing properties |
| `import-physical-addresses.js` | Address import | ✅ Exists | Spatial join with parcels |

**Missing Scripts:**
- ❌ No permits ingestion script
- ❌ No zoning cases ingestion script
- ❌ No flood zone ingestion script

### 7.3 Data Coverage Gaps

**Missing Data:**
1. **Permits** - No table, no ingestion
2. **Zoning Cases** - No table, no ingestion (only single code in `properties.zoning`)
3. **Flood Zones** - No table, API-only access
4. **AVM Coverage** - Unknown (no statistics)
5. **RECORDER Coverage** - Unknown (no statistics)

**Unusable Data:**
- None identified (all ingested data appears usable)

---

## 8. MISSING DATA (TRAVIS COUNTY)

### 8.1 Critical Missing Data

1. **Permits Table**
   - **Impact:** Cannot show permit history, recent development activity
   - **Source:** `permits.csv` (if available)
   - **Required:** New table + ingestion script

2. **Zoning Cases Table**
   - **Impact:** Cannot show zoning change history, pending cases
   - **Source:** `zoning_cases.csv` (if available)
   - **Required:** New table + ingestion script

3. **Flood Zone Table**
   - **Impact:** Cannot efficiently query flood zones, must use API
   - **Source:** FEMA Flood GeoJSON or MapServer
   - **Required:** New table + PostGIS polygon import

4. **AVM Coverage Statistics**
   - **Impact:** Unknown enrichment coverage
   - **Required:** Query to count `avmValue IS NOT NULL`

5. **RECORDER Coverage Statistics**
   - **Impact:** Unknown enrichment coverage
   - **Required:** Query to count `lastSaleDate IS NOT NULL`

### 8.2 ID Resolution Issues

**Current State:** ✅ Working (parcelId → propertyId via unique constraint)

**Potential Issues:**
- Centroid clicks dispatch numeric `parcelId`, resolved via `/api/properties/resolve`
- Some parcels may not have property records (unresolvable centroids)

**Evidence:** Resolver endpoint exists and is used by frontend.

### 8.3 GIS Readiness Gaps

1. **Parcel Polygons Not in PostGIS**
   - **Impact:** Cannot use spatial queries, cannot generate tiles directly
   - **Fix:** Convert GeoJSON chunks to PostGIS `parcels` table

2. **No Flood Zone Storage**
   - **Impact:** Must query MapServer API for every request
   - **Fix:** Import FEMA flood zones to PostGIS table

3. **No Zoning Polygon Storage**
   - **Impact:** Must query MapServer API for every request
   - **Fix:** Import zoning districts to PostGIS table

---

## 9. TRAVIS COUNTY ENRICHMENT PLAN v1

### 9.1 Phase 1: Data Coverage Assessment

**Goal:** Determine actual enrichment coverage

**Tasks:**
1. Query `properties` table for:
   - Count of `avmValue IS NOT NULL`
   - Count of `lastSaleDate IS NOT NULL`
   - Count of `mortgageAmount IS NOT NULL`
   - Count of `zoning IS NOT NULL`
2. Identify gaps in Travis County coverage
3. Document missing data sources

**DDL:** None (assessment only)

### 9.2 Phase 2: Missing Tables (DDL Only)

**Goal:** Create tables for permits, zoning cases, flood zones

**DDL for `permits` table:**
```sql
CREATE TABLE IF NOT EXISTS permits (
  id SERIAL PRIMARY KEY,
  permit_number VARCHAR(100) UNIQUE NOT NULL,
  parcel_id VARCHAR(50) NOT NULL,
  property_id VARCHAR(50),  -- FK to properties.id (nullable)
  permit_type VARCHAR(100),
  permit_status VARCHAR(50),
  issue_date DATE,
  expiration_date DATE,
  project_description TEXT,
  estimated_cost DECIMAL(15, 2),
  contractor_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_permits_property FOREIGN KEY (property_id) 
    REFERENCES properties(id) ON DELETE SET NULL
);

CREATE INDEX idx_permits_parcel_id ON permits(parcel_id);
CREATE INDEX idx_permits_property_id ON permits(property_id);
CREATE INDEX idx_permits_issue_date ON permits(issue_date);
```

**DDL for `zoning_cases` table:**
```sql
CREATE TABLE IF NOT EXISTS zoning_cases (
  id SERIAL PRIMARY KEY,
  case_number VARCHAR(100) UNIQUE NOT NULL,
  parcel_id VARCHAR(50) NOT NULL,
  property_id VARCHAR(50),  -- FK to properties.id (nullable)
  current_zoning VARCHAR(50),
  requested_zoning VARCHAR(50),
  case_status VARCHAR(50),
  case_type VARCHAR(100),
  filed_date DATE,
  hearing_date DATE,
  decision_date DATE,
  decision VARCHAR(50),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_zoning_cases_property FOREIGN KEY (property_id) 
    REFERENCES properties(id) ON DELETE SET NULL
);

CREATE INDEX idx_zoning_cases_parcel_id ON zoning_cases(parcel_id);
CREATE INDEX idx_zoning_cases_property_id ON zoning_cases(property_id);
CREATE INDEX idx_zoning_cases_status ON zoning_cases(case_status);
```

**DDL for `flood_zones` table:**
```sql
CREATE TABLE IF NOT EXISTS flood_zones (
  id SERIAL PRIMARY KEY,
  zone_code VARCHAR(20) NOT NULL,
  zone_description VARCHAR(255),
  geom geometry(Polygon, 4326) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_flood_zones_geom ON flood_zones USING GIST (geom);
CREATE INDEX idx_flood_zones_code ON flood_zones(zone_code);
```

**DDL for `parcel_flood_intersection` table:**
```sql
CREATE TABLE IF NOT EXISTS parcel_flood_intersection (
  id SERIAL PRIMARY KEY,
  parcel_id VARCHAR(50) NOT NULL,
  property_id VARCHAR(50),  -- FK to properties.id (nullable)
  flood_zone_id INTEGER NOT NULL,
  intersection_area DECIMAL(15, 2),  -- acres
  is_fully_in_flood_zone BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_parcel_flood_property FOREIGN KEY (property_id) 
    REFERENCES properties(id) ON DELETE SET NULL,
  CONSTRAINT fk_parcel_flood_zone FOREIGN KEY (flood_zone_id) 
    REFERENCES flood_zones(id) ON DELETE CASCADE
);

CREATE INDEX idx_parcel_flood_parcel_id ON parcel_flood_intersection(parcel_id);
CREATE INDEX idx_parcel_flood_property_id ON parcel_flood_intersection(property_id);
```

### 9.3 Phase 3: Parcel PostGIS Migration

**Goal:** Convert GeoJSON chunks to PostGIS table for tiling

**DDL for `parcels` table:**
```sql
CREATE TABLE IF NOT EXISTS parcels (
  parcel_id VARCHAR(50) PRIMARY KEY,
  property_id VARCHAR(50),  -- FK to properties.id (nullable)
  owner TEXT,
  address TEXT,
  acres NUMERIC(10, 4),
  tax_year INTEGER,
  total_tax NUMERIC(12, 2),
  total_due NUMERIC(12, 2),
  legal_desc TEXT,
  geom geometry(Polygon, 4326) NOT NULL,
  centroid geometry(Point, 4326),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_parcels_property FOREIGN KEY (property_id) 
    REFERENCES properties(id) ON DELETE SET NULL
);

CREATE INDEX idx_parcels_geom ON parcels USING GIST (geom);
CREATE INDEX idx_parcels_centroid ON parcels USING GIST (centroid);
CREATE INDEX idx_parcels_property_id ON parcels(property_id);
```

**Migration Strategy:**
1. Read GeoJSON chunks
2. Insert into `parcels` table with `ST_GeomFromGeoJSON()`
3. Generate centroids with `ST_Centroid(geom)`
4. Link to `properties` via `parcelId`

**Rollback:** Keep GeoJSON chunks as backup (non-destructive)

### 9.4 Phase 4: Ingestion Order

1. **Assess current coverage** (Phase 1)
2. **Create missing tables** (Phase 2 DDL)
3. **Import flood zones** (if GeoJSON available)
4. **Import permits** (if CSV available)
5. **Import zoning cases** (if CSV available)
6. **Migrate parcels to PostGIS** (Phase 3)
7. **Create spatial indexes** (after imports)

### 9.5 Phase 5: Non-Destructive Migration

**Strategy:**
- All new tables are additive (no schema changes to `properties`)
- Keep GeoJSON chunks as backup
- Use `IF NOT EXISTS` for all DDL
- Add foreign keys with `ON DELETE SET NULL` (preserve data if property deleted)

**Rollback Safety:**
- New tables can be dropped without affecting `properties`
- GeoJSON chunks remain unchanged
- No data loss risk

---

## 10. RISKS + NOTES

### 10.1 Data Quality Risks

1. **Production Enrichment Gap**
   - Only 21.19% of properties have `siteAddress` in production
   - Only 13.50% fully enriched from TCAD API
   - **Risk:** Incomplete data for Travis County users
   - **Mitigation:** Run TCAD enrichment script on production

2. **Unknown AVM/RECORDER Coverage**
   - No statistics on enrichment coverage
   - **Risk:** Unclear what data is available
   - **Mitigation:** Run coverage assessment queries

3. **Missing Permits/Zoning Data**
   - No tables, no ingestion scripts
   - **Risk:** Cannot show permit/zoning history
   - **Mitigation:** Create tables + ingestion scripts

### 10.2 Technical Risks

1. **Parcels Not in PostGIS**
   - Cannot use spatial queries
   - Cannot generate tiles directly
   - **Risk:** Performance issues at scale
   - **Mitigation:** Migrate to PostGIS (Phase 3)

2. **Flood Zones API-Only**
   - Must query MapServer for every request
   - **Risk:** Performance + rate limiting
   - **Mitigation:** Import to PostGIS table

3. **Schema Cleanup Inconsistency**
   - `floodZone` and `centroid` columns removed from schema but may exist in DB
   - **Risk:** Schema drift
   - **Mitigation:** Verify production schema matches Prisma

### 10.3 ID Contract Risks

1. **Unresolvable Centroids**
   - Some centroids may not have property records
   - **Risk:** 404s on `/api/properties/resolve`
   - **Mitigation:** Current resolver handles gracefully (returns 404)

2. **Parcel ID Format Consistency**
   - Must ensure numeric string format
   - **Risk:** Type mismatches
   - **Mitigation:** Current resolver uses `String(parcelId)` normalization

### 10.4 Notes

1. **Single Enrichment Owner**
   - ✅ `useSelectedEntity` hook is the single owner
   - ✅ No duplicate fetches identified

2. **GeoJSON Chunk Strategy**
   - Current approach works for small-scale
   - May need PostGIS migration for large-scale tiling

3. **Travis County Focus**
   - All 352,431 properties are Travis County
   - No multi-county support needed

4. **MapServer Registry**
   - 416 MapServers cataloged
   - Can be used for API-based enrichment
   - Not suitable for high-performance queries

---

## 11. SUMMARY

### 11.1 Current State

- ✅ **352,431 properties** in database
- ✅ **PostGIS enabled** (Point geometry for properties)
- ✅ **ID contracts clear** (parcelId → propertyId mapping)
- ✅ **Single enrichment owner** (`useSelectedEntity`)
- ⚠️ **Production enrichment gap** (21% vs 99% local)
- ❌ **No permits/zoning tables**
- ❌ **No flood zone storage**
- ❌ **Parcels not in PostGIS**

### 11.2 Critical Gaps

1. **Missing Tables:** permits, zoning_cases, flood_zones
2. **Missing Ingestion:** permits.csv, zoning_cases.csv, flood GeoJSON
3. **Unknown Coverage:** AVM, RECORDER enrichment statistics
4. **GIS Readiness:** Parcels not in PostGIS (cannot tile directly)

### 11.3 Recommended Next Steps

1. **Assess coverage** (query enrichment statistics)
2. **Create missing tables** (DDL provided)
3. **Import missing data** (permits, zoning, flood zones)
4. **Migrate parcels to PostGIS** (for tiling)
5. **Fix production enrichment** (run TCAD enrichment script)

---

**End of Audit Report**

**Next Action:** Review findings and prioritize implementation phases.



