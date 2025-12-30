## 6. DATABASE + POSTGIS AUDIT

### 6.1 DB Connection

**Provider:** PostgreSQL (Neon)

**ORM:** Prisma Client

**Schema:** `public` (default)

**Connection:** Via `DATABASE_URL` environment variable

**PostGIS:** ✅ **ENABLED** (`spatial_ref_sys` table exists)

**Evidence:**
```prisma
// prisma/schema.prisma:5-8
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 6.2 Table Inventory

**From Prisma Schema:**

| Table Name | Model | Primary Key | Row Count (Est.) | Notes |
|------------|-------|-------------|------------------|-------|
| `properties` | Property | `id` (cuid) | **352,431** | Core table |
| `users` | User | `id` (cuid) | 0 | Empty |
| `user_profiles` | UserProfile | `id` (cuid) | 0 | Empty |
| `listings` | Listing | `id` (cuid) | 1 | Test data |
| `deals` | Deal | `id` (cuid) | 0 | Empty |
| `buy_boxes` | BuyBox | `id` (cuid) | 0 | Empty |
| `documents` | Document | `id` (cuid) | 0 | Empty |
| `activities` | Activity | `id` (cuid) | 0 | Empty |
| `tasks` | Task | `id` (cuid) | 0 | Empty |
| `comps` | Comp | `id` (cuid) | 0 | Empty |
| `gis_layers` | GisLayer | `id` (cuid) | 0 | Empty |
| `pins` | Pin | `id` (cuid) | 0 | Empty |
| `map_server_registry` | MapServerRegistry | `id` (cuid) | **416** | MapServer catalog |
| `layer_sets` | LayerSet | `id` (cuid) | **32** | Layer definitions |
| `map_queries` | MapQuery | `id` (cuid) | 0 | Empty |
| `polygon_searches` | PolygonSearch | `id` (cuid) | 0 | Empty |
| `spatial_ref_sys` | spatial_ref_sys | `srid` (int) | ~6,000 | PostGIS SRIDs |

**Note:** Row counts are estimates from previous audits. Actual counts may vary.

### 6.3 Core Schema: `properties` Table

**Primary Key:** `id` (String, cuid format, e.g., `"cmjew..."`)

**Unique Constraints:**
- `parcelId` (String, unique, indexed)

**Foreign Keys:** None

**Indexes:**
- `properties_propertyType_idx`
- `properties_latitude_longitude_idx`
- `properties_isAbsentee_idx`
- `properties_isTaxDelinquent_idx`
- `properties_motivationScore_idx`
- `properties_acres_idx`
- `properties_totalTax_idx`
- `properties_parcelId_idx`
- `properties_attomId_idx`
- `properties_geom_idx` (GIST) - **If geom column exists**

**Key Columns (100+ total):**

| Column | Type | Nullable | Source | Purpose |
|--------|------|----------|--------|---------|
| `id` | String (cuid) | NO | Generated | Primary key |
| `parcelId` | String | NO | ATTOM/County | Parcel identifier (unique) |
| `attomId` | String | YES | ATTOM | ATTOM ID (indexed) |
| `apn` | String | YES | ATTOM | Assessor Parcel Number |
| `siteAddress` | String | YES | TCAD API | Site address |
| `latitude` | Float | YES | ATTOM/TCAD | Latitude |
| `longitude` | Float | YES | ATTOM/TCAD | Longitude |
| `geom` | geometry(Point, 4326) | YES | Derived | PostGIS point |
| `propertyType` | String | YES | Classified | Property type |
| `zoning` | String | YES | TCAD API | Zoning code |
| `avmValue` | Decimal(14,2) | YES | ATTOM AVM | Estimated value |
| `avmMin` | Decimal(14,2) | YES | ATTOM AVM | Min value |
| `avmMax` | Decimal(14,2) | YES | ATTOM AVM | Max value |
| `mktValue` | Float | YES | ATTOM | Market value |
| `landValue` | Float | YES | TCAD API | Land value |
| `mortgageAmount` | Float | YES | RECORDER | Mortgage amount |
| `mortgageLender` | String | YES | RECORDER | Lender name |
| `lastSaleDate` | DateTime | YES | RECORDER | Last sale date |
| `lastSaleAmount` | Float | YES | RECORDER | Last sale amount |
| `isInvestorOwned` | Boolean | NO | RECORDER | Investor flag |
| `isForeclosure` | Boolean | NO | RECORDER | Foreclosure flag |
| `motivationScore` | Int | YES | Calculated | Score (0-100) |

**Full schema:** See `prisma/schema.prisma` lines 45-143

### 6.4 PostGIS Geometry Audit

**Geometry Columns:**

| Table | Column | Type | SRID | Status |
|-------|--------|------|------|--------|
| `properties` | `geom` | Point | 4326 | ✅ EXISTS (optional) |

**No Polygon Geometry Tables:**
- ❌ No `parcels` table with PostGIS polygons
- ❌ No `flood_zones` table
- ❌ No `zoning_districts` table

**SRID:** 4326 (WGS84) - Standard for web mapping

**Geometry Population:**
- `properties.geom` populated from `latitude`/`longitude` via `ST_MakePoint()`
- Script: `scripts/add-geometry-column.js`

**Spatial Index:**
- `properties_geom_idx` (GIST) - **If column exists**

**Validity:** UNKNOWN (no validation queries found)

### 6.5 Joinability Audit (ID Contract)

**Canonical Property ID:**
- **Format:** String (cuid), e.g., `"cmjew..."`
- **Field:** `properties.id`
- **Stability:** ✅ Immutable (never changes)
- **Uniqueness:** ✅ Primary key (guaranteed unique)

**Canonical Parcel ID:**
- **Format:** String (numeric), e.g., `"970897"`
- **Field:** `properties.parcelId`
- **Stability:** ✅ Stable (county-assigned)
- **Uniqueness:** ✅ Unique constraint (guaranteed unique)

**Mapping:**
- **Method:** Direct column (`properties.parcelId` → `properties.id`)
- **Relationship:** One-to-one (unique constraint)
- **Resolver:** `/api/properties/resolve?parcelId=...`

**Universal Join Key for Travis County:**
- **Primary:** `properties.parcelId` (numeric string from county)
- **Secondary:** `properties.id` (cuid, for API calls)
- **Tertiary:** `properties.attomId` (for ATTOM data matching)

**Evidence:**
```prisma
// prisma/schema.prisma:80
parcelId String @unique

// prisma/schema.prisma:140
@@index([parcelId])
```

---

## 7. DATA PIPELINE + DATASETS AUDIT
