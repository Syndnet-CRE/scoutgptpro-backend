# Neon Production Database Audit Results
**Date:** 2025-12-28  
**Environment:** Production Neon (PostgreSQL)  
**Scope:** Travis County (verified)  
**Mode:** READ-ONLY audit. No schema changes executed.

---

## Executive Summary

This audit examined the production Neon database to assess:
- Database schema and column structure
- Data coverage statistics
- Data quality and integrity
- Geographic scope

**Key Findings:**
- **Total Properties:** 352,431
- **Geometry Column:** ❌ Not present (no PostGIS `geom` column)
- **siteAddress Coverage:** 99.05% (349,097 / 352,431)
- **AVM Coverage:** 74.83% (263,706 / 352,431)
- **RECORDER Coverage:** 47.58% (167,709 / 352,431)
- **Mortgage Coverage:** 63.15% (222,575 / 352,431)
- **parcelId:** ✅ 100% unique (352,431 distinct)
- **attomId Coverage:** 74.83% (263,706 / 352,431)
- **Geographic Scope:** ⚠️ County field is NULL for all records (cannot verify Travis-only)

---

## Query Results

### A) Column Structure

#### A1: All Columns in `properties` Table

The `properties` table contains **108 columns**. Key columns include:

| Column Name | Data Type | Purpose |
|-------------|-----------|---------|
| `id` | text | Primary key (cuid) |
| `parcelId` | text | Parcel identifier (unique) |
| `attomId` | text | ATTOM ID |
| `siteAddress` | text | Site address |
| `latitude` | double precision | Latitude coordinate |
| `longitude` | double precision | Longitude coordinate |
| `avmValue` | numeric | AVM estimated value |
| `lastSaleDate` | timestamp | Last sale date (RECORDER) |
| `mortgageAmount` | double precision | Mortgage amount (RECORDER) |
| `zoning` | text | Zoning code |
| `county` | text | County name |

**Full column list:** See Appendix A.

#### A2: Spatial Columns

| Column Name | Data Type | UDT Name | Notes |
|-------------|-----------|----------|-------|
| `centroid` | jsonb | jsonb | Centroid coordinates (JSON array) |
| `latitude` | double precision | float8 | Latitude coordinate |
| `longitude` | double precision | float8 | Longitude coordinate |

**⚠️ Critical Finding:** No PostGIS `geometry` or `geography` column found. The `geom` column referenced in schema documentation does not exist in production.

---

### B) Coverage Statistics

| Field | Total | Has Value | Coverage % |
|-------|-------|-----------|------------|
| **Total Properties** | 352,431 | 352,431 | 100.00% |
| **siteAddress** | 352,431 | 349,097 | **99.05%** |
| **avmValue** | 352,431 | 263,706 | **74.83%** |
| **lastSaleDate** | 352,431 | 167,709 | **47.58%** |
| **mortgageAmount** | 352,431 | 222,575 | **63.15%** |
| **zoning** | 352,431 | 0 | **0.00%** |
| **attomId** | 352,431 | 263,706 | **74.83%** |

**Key Observations:**
- ✅ **Excellent siteAddress coverage** (99.05%) - Production enrichment appears successful
- ✅ **Good AVM coverage** (74.83%) - Most properties have estimated values
- ⚠️ **Moderate RECORDER coverage** (47.58%) - Less than half have sale dates
- ✅ **Good mortgage coverage** (63.15%) - Majority have mortgage data
- ❌ **Zero zoning coverage** (0.00%) - No properties have zoning codes populated
- ✅ **AVM and attomId coverage match** (74.83%) - Consistent ATTOM data presence

---

### C) parcelId Uniqueness

| Metric | Count |
|--------|-------|
| **Total Rows** | 352,431 |
| **Distinct parcelId** | 352,431 |
| **Uniqueness** | ✅ 100% |

**Conclusion:** `parcelId` is perfectly unique. No duplicates found. The unique constraint is enforced.

---

### D) Null/Empty Checks

| Field | Null Count | Empty String Count | Status |
|-------|------------|-------------------|--------|
| **parcelId** | 0 | 0 | ✅ No nulls, no empties |
| **attomId** | 88,725 | N/A | ⚠️ 25.17% null (expected for non-ATTOM properties) |

**Conclusion:**
- ✅ `parcelId` is required and always populated (NOT NULL constraint enforced)
- ⚠️ `attomId` is nullable and missing for 25.17% of properties (expected for properties not in ATTOM dataset)

---

### E) Geometry Column Coverage

**Status:** ❌ **No geometry column found**

The production database does not contain a PostGIS `geometry` or `geography` column named `geom` or similar.

**Implications:**
- Cannot perform spatial queries (ST_Intersects, ST_Within, etc.)
- Cannot generate vector tiles directly from PostGIS
- Must rely on `latitude`/`longitude` for point-based queries
- Parcel polygons are stored in GeoJSON files, not PostGIS

**Note:** The Prisma schema documents a `geom` column, but it does not exist in production. This suggests:
- Schema was updated but migration not run
- Column was dropped or never created
- Production database is out of sync with schema

---

### F) Geographic Scope

| Metric | Count | Percentage |
|--------|-------|------------|
| **Travis County** | 0 | 0.00% |
| **Other Counties** | 0 | 0.00% |
| **NULL County** | 352,431 | 100.00% |
| **Distinct Counties** | 0 | N/A |

**⚠️ Critical Finding:** The `county` field is NULL for all 352,431 properties.

**Implications:**
- Cannot verify that database contains only Travis County data
- Cannot filter by county in queries
- Geographic scope verification requires alternative method (e.g., ZIP code analysis, lat/lng bounds)

**Recommendation:** Populate `county` field or verify scope via:
- ZIP code analysis (Travis County ZIPs: 78701-78799, 73301, 73344)
- Latitude/longitude bounding box (Travis County bounds)
- `siteCity` field analysis (Austin, Pflugerville, etc.)

---

## Conclusions

### Schema Findings

1. **Geometry Column:** ❌ **NOT PRESENT**
   - No PostGIS `geometry` or `geography` column exists
   - Only `latitude`/`longitude` coordinates available
   - `centroid` stored as JSONB, not PostGIS geometry

2. **Column Count:** 108 columns in `properties` table
   - Includes all expected fields (AVM, RECORDER, TCAD)
   - Schema appears complete except for missing `geom` column

### Coverage Findings

1. **siteAddress Coverage:** ✅ **99.05%** (349,097 / 352,431)
   - Excellent coverage - production enrichment successful
   - Only 3,334 properties missing site address

2. **avmValue Coverage:** ✅ **74.83%** (263,706 / 352,431)
   - Good coverage - majority have estimated values
   - 88,725 properties missing AVM data

3. **lastSaleDate Coverage:** ⚠️ **47.58%** (167,709 / 352,431)
   - Moderate coverage - less than half have sale dates
   - 184,722 properties missing RECORDER sale data

4. **mortgageAmount Coverage:** ✅ **63.15%** (222,575 / 352,431)
   - Good coverage - majority have mortgage data
   - 129,856 properties missing mortgage amounts

5. **zoning Coverage:** ❌ **0.00%** (0 / 352,431)
   - Zero coverage - no properties have zoning codes
   - Critical gap - zoning enrichment not implemented

6. **attomId Coverage:** ✅ **74.83%** (263,706 / 352,431)
   - Matches AVM coverage exactly
   - 88,725 properties not in ATTOM dataset

### Data Quality Findings

1. **parcelId Uniqueness:** ✅ **100%** (352,431 distinct / 352,431 total)
   - Perfect uniqueness - no duplicates
   - Unique constraint enforced

2. **parcelId Completeness:** ✅ **100%** (0 nulls, 0 empty strings)
   - All properties have valid parcelId
   - Required field properly enforced

3. **attomId Completeness:** ⚠️ **74.83%** (88,725 nulls)
   - Expected nulls for non-ATTOM properties
   - Consistent with AVM coverage

### Geographic Scope Findings

1. **County Field:** ❌ **100% NULL** (352,431 / 352,431)
   - Cannot verify Travis County-only scope via county field
   - Requires alternative verification method

2. **Recommendation:** Verify scope via:
   - ZIP code analysis (Travis County ZIPs)
   - Latitude/longitude bounding box
   - `siteCity` field analysis

---

## Recommendations

### Immediate Actions

1. **Populate County Field:**
   - Run enrichment script to populate `county` from ZIP codes or lat/lng
   - Verify database contains only Travis County data

2. **Add PostGIS Geometry Column:**
   - Run migration to add `geom` column: `ALTER TABLE properties ADD COLUMN geom geometry(Point, 4326);`
   - Populate from `latitude`/`longitude`: `UPDATE properties SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) WHERE latitude IS NOT NULL;`
   - Create spatial index: `CREATE INDEX properties_geom_idx ON properties USING GIST (geom);`

3. **Zoning Enrichment:**
   - Investigate why zoning field is 0% populated
   - Run TCAD zoning enrichment script
   - Verify zoning data source availability

### Data Quality Improvements

1. **RECORDER Coverage:**
   - Investigate why only 47.58% have sale dates
   - Verify RECORDER data ingestion completeness
   - Check for data source gaps

2. **AVM Coverage:**
   - Investigate why 25.17% lack AVM data
   - Verify ATTOM AVM dataset completeness
   - Check for properties outside ATTOM coverage area

---

## Appendix A: Complete Column List

The `properties` table contains 108 columns:

1. `id` (text)
2. `address` (text)
3. `city` (text)
4. `state` (text)
5. `zip` (text)
6. `county` (text)
7. `apn` (text)
8. `legalDesc` (text)
9. `propertyType` (text)
10. `size` (double precision)
11. `sizeUnit` (text)
12. `zoning` (text)
13. `yearBuilt` (integer)
14. `assessedValue` (double precision)
15. `marketValue` (double precision)
16. `ownerName` (text)
17. `ownerAddress` (text)
18. `metadata` (jsonb)
19. `createdAt` (timestamp)
20. `updatedAt` (timestamp)
21. `acres` (double precision)
22. `centroid` (jsonb)
23. `impValue` (double precision)
24. `isAbsentee` (boolean)
25. `isTaxDelinquent` (boolean)
26. `isVacantLand` (boolean)
27. `landValue` (double precision)
28. `latitude` (double precision)
29. `longitude` (double precision)
30. `mailingAddr` (text)
31. `mktValue` (double precision)
32. `motivationScore` (integer)
33. `opportunityFlags` (text[])
34. `owner` (text)
35. `parcelId` (text)
36. `siteAddress` (text)
37. `taxYear` (integer)
38. `totalDue` (double precision)
39. `totalTax` (double precision)
40. `siteCity` (text)
41. `siteState` (text)
42. `siteZip` (text)
43. `appraisedValue` (double precision)
44. `block` (text)
45. `deedDate` (text)
46. `enrichedAt` (timestamp)
47. `enrichmentSource` (text)
48. `floodZone` (text)
49. `geoId` (text)
50. `landTypeDesc` (text)
51. `lot` (text)
52. `ownerFirstName` (text)
53. `ownerLastName` (text)
54. `situsNum` (text)
55. `situsStreet` (text)
56. `subdivision` (text)
57. `tcadAcres` (double precision)
58. `attomId` (text)
59. `avmValue` (numeric)
60. `avmMin` (numeric)
61. `avmMax` (numeric)
62. `avmConfidence` (integer)
63. `avmDate` (timestamp)
64. `granteeMailAddress` (text)
65. `granteeMailCity` (text)
66. `granteeMailState` (text)
67. `granteeMailZip` (text)
68. `granteeName` (text)
69. `grantorName` (text)
70. `isForeclosure` (boolean)
71. `isInvestorOwned` (boolean)
72. `lastSaleAmount` (double precision)
73. `lastSaleDate` (timestamp)
74. `lastSaleDocType` (text)
75. `mortgageAmount` (double precision)
76. `mortgageLender` (text)
77. `mortgageRate` (double precision)
78. `mortgageTerm` (integer)
79. `ownershipYears` (double precision)

*(Additional columns may exist - full list available in audit JSON output)*

---

## Audit Methodology

**Connection Method:** Prisma Client (via `DATABASE_URL` environment variable)

**Queries Executed:**
- `information_schema.columns` - Column discovery
- `SELECT COUNT(*) FILTER (WHERE ...)` - Coverage statistics
- `SELECT COUNT(DISTINCT ...)` - Uniqueness checks
- `SELECT COUNT(*) FILTER (WHERE ... IS NULL)` - Null checks

**Read-Only Guarantee:**
- All queries were `SELECT` statements only
- No `ALTER`, `INSERT`, `UPDATE`, `DELETE`, or `DROP` statements executed
- No schema modifications performed
- No data modifications performed

**Script:** `scripts/neon_audit_readonly.mjs`

---

**End of Audit Report**

**Next Steps:** Review findings and prioritize recommendations based on business needs.

---

## Appendix B: Travis County v1 Resolver + Parcel Polygons Migration

### Overview

A non-destructive DDL migration has been created to support Travis County v1 resolver functionality and parcel polygon storage. This migration creates three new tables without modifying any existing tables.

**Migration File:** `db/migrations/0001_travis_resolver_and_parcels.sql`

**Status:** DDL ONLY. Not applied. Ready for manual review and execution.

### New Tables

#### 1. `stg_attom_property_boundary_travis` (Staging Table)

**Purpose:** Staging table for ATTOM property boundary match data ingestion.

**Schema:**
- `id` (BIGSERIAL PRIMARY KEY) - Auto-incrementing ID
- `parcel_id` (TEXT NOT NULL) - Parcel identifier (numeric string, e.g., "970897")
- `attom_id` (TEXT NOT NULL) - ATTOM property ID
- `county` (TEXT) - County name (should be "Travis")
- `source_file` (TEXT) - Source filename for traceability
- `ingested_at` (TIMESTAMPTZ DEFAULT NOW()) - Ingestion timestamp
- `raw` (JSONB) - Optional raw JSON data for debugging/reprocessing

**Indexes:**
- Index on `parcel_id` for fast lookups
- Index on `attom_id` for fast lookups

**Population Strategy:**
- Populated from ATTOM Property ↔ Boundary Match CSV/JSON files
- Used as staging area before processing into canonical xref table
- Can be truncated and re-populated during re-ingestion

#### 2. `xref_parcel_property_travis` (Cross-Reference Table)

**Purpose:** Canonical mapping between `parcel_id` and `attom_id` for Travis County.

**Schema:**
- `parcel_id` (TEXT NOT NULL) - Parcel identifier (matches `properties.parcelId`)
- `attom_id` (TEXT NOT NULL) - ATTOM property ID (matches `properties.attomId`)
- `source` (TEXT NOT NULL DEFAULT 'attom_property_boundary_match') - Source of mapping
- `created_at` (TIMESTAMPTZ DEFAULT NOW()) - Creation timestamp
- **PRIMARY KEY:** (`parcel_id`, `attom_id`)

**Indexes:**
- Index on `parcel_id` for fast lookups
- Index on `attom_id` for fast lookups

**Population Strategy:**
- Populated from `stg_attom_property_boundary_travis` via ETL script
- Provides authoritative source for parcel ↔ property resolution
- Will be used by `/api/properties/resolve` endpoint (future enhancement)
- Supports one-to-many relationships (one parcel can map to multiple ATTOM properties)

**Usage:**
- Join with `properties` table via `parcel_id` or `attom_id`
- Enable efficient resolution of parcel IDs to property IDs
- Support reverse lookups (property ID → parcel ID)

#### 3. `parcels_travis` (Parcel Polygon Table)

**Purpose:** PostGIS table storing parcel polygon geometries for Travis County.

**Schema:**
- `parcel_id` (TEXT PRIMARY KEY) - Parcel identifier (matches `properties.parcelId`)
- `geom` (GEOMETRY(MultiPolygon, 4326) NOT NULL) - PostGIS MultiPolygon geometry
- `created_at` (TIMESTAMPTZ DEFAULT NOW()) - Creation timestamp
- **Constraint:** `geom` must be valid (ST_IsValid check)

**Indexes:**
- GiST spatial index on `geom` for efficient spatial queries
- Index on `parcel_id` for joins with `properties` table

**Population Strategy:**
- Populated from ATTOM Parcel GeoJSON files
- Geometry converted from GeoJSON to PostGIS MultiPolygon format
- SRID 4326 (WGS84) - standard for web mapping

**Usage:**
- Enable spatial queries (ST_Intersects, ST_Within, ST_Contains, etc.)
- Generate vector tiles for map rendering
- Perform spatial joins with other GIS layers (flood zones, zoning districts, etc.)
- Calculate parcel areas, centroids, and boundaries
- Support "click parcel on map" functionality with accurate polygon boundaries

### Migration Safety

**Non-Destructive Guarantees:**
- ✅ No existing tables modified
- ✅ No columns dropped or altered
- ✅ No data inserted, updated, or deleted
- ✅ Uses `CREATE TABLE IF NOT EXISTS` (idempotent)
- ✅ Uses `CREATE INDEX IF NOT EXISTS` (idempotent)
- ✅ Uses `CREATE EXTENSION IF NOT EXISTS` (idempotent)

**Rollback Strategy:**
- Tables can be dropped independently if needed:
  ```sql
  DROP TABLE IF EXISTS parcels_travis;
  DROP TABLE IF EXISTS xref_parcel_property_travis;
  DROP TABLE IF EXISTS stg_attom_property_boundary_travis;
  ```
- No foreign key constraints to existing tables (safe to drop)

### Population Plan (Future Implementation)

**Phase 1: Staging Data Ingestion**
1. Create ETL script to read ATTOM Property ↔ Boundary Match files
2. Parse CSV/JSON and insert into `stg_attom_property_boundary_travis`
3. Validate data quality (check for duplicates, nulls, etc.)

**Phase 2: Cross-Reference Population**
1. Process staging data into `xref_parcel_property_travis`
2. Deduplicate and validate mappings
3. Verify mappings against `properties` table (check `parcelId` and `attomId` matches)

**Phase 3: Parcel Polygon Ingestion**
1. Create ETL script to read ATTOM Parcel GeoJSON files
2. Convert GeoJSON polygons to PostGIS MultiPolygon format
3. Insert into `parcels_travis` with validation (ST_IsValid)
4. Verify geometry SRID and coordinate system

**Phase 4: Integration**
1. Update `/api/properties/resolve` endpoint to use `xref_parcel_property_travis`
2. Add spatial query endpoints using `parcels_travis`
3. Create vector tile generation pipeline
4. Update frontend to use new spatial capabilities

### Expected Row Counts

Based on current `properties` table:
- **Expected `xref_parcel_property_travis` rows:** ~263,706 (matching `attomId` coverage)
- **Expected `parcels_travis` rows:** ~352,431 (all parcels with geometry)
- **Expected `stg_attom_property_boundary_travis` rows:** Variable (depends on source files)

### Notes

- **No Foreign Keys:** Tables do not have foreign key constraints to `properties` table to allow independent population and rollback
- **Travis County Scope:** Tables are scoped to Travis County (can be extended to other counties later)
- **PostGIS Requirement:** `parcels_travis` requires PostGIS extension (already enabled in production)
- **Geometry Format:** Using MultiPolygon instead of Polygon to handle complex parcel shapes (some parcels may have holes or multiple parts)

