# Backend Technical Audit Report - ScoutGPT Backend

**Date:** Generated on audit execution  
**Repository:** `/Users/braydonirwin/scoutgptpro-backend`  
**Audit Type:** Full Technical Audit

---

## 1. Repository Structure

### 1.1 Full Directory Tree

```
/Users/braydonirwin/scoutgptpro-backend/
├── data/
│   ├── backups/
│   │   └── neon_full_backup.sql
│   ├── exports/
│   ├── mapservers/
│   │   └── cache/
│   ├── parcels/
│   │   └── chunks/
│   └── shapefiles/
│       ├── address_points/
│       └── land_parcels/
├── db/
│   └── migrations/
│       ├── 0001_travis_resolver_and_parcels.sql
│       ├── 0002_add_parcels_tx.sql
│       └── 0003_add_parcels_travis_enrichment.sql
├── docs/
├── prisma/
│   ├── migrations/
│   │   ├── 0_init/
│   │   │   └── migration.sql
│   │   ├── add_osm_pois_table.sql
│   │   ├── add_property_id_to_osm_pois.sql
│   │   └── discovery_tables.sql
│   ├── schema-cleanup.sql
│   ├── schema.prisma
│   └── schema.prisma.backup* (5 backup files)
├── scripts/
│   ├── mapservers/
│   ├── mts/
│   │   ├── fix-centroids-ndjson.mjs
│   │   ├── ndjson-to-geojson.mjs
│   │   └── publish-travis.mjs
│   ├── sql/
│   │   ├── travis_enrichment_keys_report.sql
│   │   ├── travis_enrichment_latest_view.sql
│   │   ├── travis_enrichment_materialize.sql
│   │   ├── travis_enrichment_materialize_validate.sql
│   │   ├── travis_enrichment_upsert.sql
│   │   ├── travis_enrichment_validate.sql
│   │   └── verify-parcels-travis.sql
│   ├── tx/
│   │   ├── asset-class-backfill.mjs
│   │   ├── owner-features.mjs
│   │   ├── owner-segments.mjs
│   │   ├── owners-build.mjs
│   │   └── seed-scoring-models.mjs
│   ├── [80+ utility scripts: .mjs, .js, .cjs, .py, .sh, .sql, .md]
│   └── [See complete list in section 1.3]
├── src/
│   ├── middleware/
│   │   └── rateLimiter.js
│   ├── routes/
│   │   ├── ai.js
│   │   ├── buyboxes.js
│   │   ├── deals.js
│   │   ├── discover.js
│   │   ├── geocode.js
│   │   ├── gis.js
│   │   ├── listings.js
│   │   ├── mapservers.js
│   │   ├── mts.js
│   │   ├── osm-pois.js
│   │   ├── parcels-search.js
│   │   ├── parcels-tx.js
│   │   ├── parcels.js
│   │   ├── polygonSearches.js
│   │   ├── properties.js
│   │   └── query.js
│   ├── services/
│   │   ├── attom-resolver-service.js
│   │   ├── category-mapper.js
│   │   ├── countyResolver.js
│   │   ├── discoverEngine.js
│   │   ├── intentExtractor.js
│   │   ├── mapserver-service.js
│   │   └── property-service.js
│   ├── utils/
│   │   └── polygonSearchNames.js
│   └── server.js
├── tmp/
├── [60+ markdown documentation files]
├── check-db-counts.js
├── check-parcels.js
├── check-populated-tables.js
├── flood-zones-travis-simplified.geojson
├── flood-zones-travis.geojson
├── flood-zones-travis.ndjson
├── import-addresses.log
├── import-log.txt
├── ingestion.log
├── package-lock.json
├── package.json
├── render.yaml
└── requirements.txt (if exists)
```

### 1.2 Root Package Configuration

**File:** `/Users/braydonirwin/scoutgptpro-backend/package.json`

- **Package Name:** `scoutgpt-backend`
- **Version:** `1.0.0`
- **Type:** `module` (ESM)
- **Main Entry:** `src/server.js`
- **Description:** "ScoutGPT Backend API with MapServer Integration"

### 1.3 Top-Level Directories and Purpose

| Directory | Purpose |
|-----------|---------|
| `src/` | Main application source code (Express routes, services, middleware) |
| `prisma/` | Prisma ORM schema and migrations |
| `db/` | Raw SQL migrations for PostGIS tables (parcels, enrichment) |
| `scripts/` | Utility scripts for data ingestion, ETL, MTS export, analysis |
| `data/` | Data files (shapefiles, parcel chunks, backups, exports) |
| `docs/` | Documentation files |
| `tmp/` | Temporary files |

---

## 2. Backend Framework

### 2.1 Language and Version

**Language:** JavaScript (Node.js)  
**Module System:** ES Modules (`"type": "module"`)

### 2.2 Framework and Version

**Framework:** Express.js  
**Version:** `^4.21.2`  
**Entry Point:** `/Users/braydonirwin/scoutgptpro-backend/src/server.js`

### 2.3 Server Configuration

**Port:** `process.env.PORT || 3001`  
**Host:** `0.0.0.0` (binds to all interfaces)

**Middleware Stack:**
1. **CORS:** Configured with environment-based origins
   - Development: Allows all origins (`origin: true`)
   - Production: Uses `CORS_ORIGINS` env var or default whitelist
2. **JSON Parser:** `express.json()`
3. **Request Logging:** Custom middleware logging all requests
4. **Error Handler:** Global error handler (500 status)

**CORS Configuration:**
- **Development:** Allows all origins, credentials enabled
- **Production:** Whitelist includes:
  - `http://localhost:4028`
  - `http://localhost:5173`
  - `http://localhost:3000`
  - `https://scoutcrm.netlify.app`
  - `process.env.FRONTEND_URL`

**Health Check Endpoint:** `GET /health`

---

## 3. API Routes/Endpoints

### 3.1 Route Prefixes

All routes are prefixed with `/api` except:
- `/health` - Health check (no prefix)

### 3.2 Complete API Routes

#### **Properties Routes** (`/api/properties`)
**Handler File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/properties.js`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/properties` | Search properties with query parameters (zip, city, propertyType, priceMin, priceMax, acresMin, acresMax, absenteeOwner, taxDelinquent, limit, offset) |
| GET | `/api/properties/parcel/:parcelId` | Get property by parcelId with enrichment data |
| GET | `/api/properties/:id` | Get property by ID |
| POST | `/api/properties` | Create new property |
| PUT | `/api/properties/:id` | Update property |
| DELETE | `/api/properties/:id` | Delete property |
| GET | `/api/properties/resolve/:parcelId` | Resolve parcelId to ATTOM GeoJSON ID |

#### **Parcels Routes** (`/api/parcels`)
**Handler File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/parcels.js`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/parcels/chunk-index` | Get parcel chunk index JSON |
| GET | `/api/parcels/chunk/:key` | Get parcel chunk GeoJSON by key |
| GET | `/api/parcels/stats` | Get parcel statistics (total parcels, chunks, chunk size) |
| GET | `/api/parcels/centroids` | Get parcel centroids for clustering (bbox query) |
| GET | `/api/parcels/viewport` | Get parcels in viewport by bbox (with enrichment join) |

#### **Parcels Search Routes** (`/api/parcels/search`)
**Handler File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/parcels-search.js`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/parcels/search` | Search parcels with bbox and enrichment filters (ownerAbsentee, minMarketValue, landUse, yearBuiltMin, limit) |

#### **Parcels TX Routes** (`/api/parcels-tx`)
**Handler File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/parcels-tx.js`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/parcels-tx/viewport` | Get Texas statewide parcels in viewport (bbox, limit, countyFips filter) |

#### **Listings Routes** (`/api/listings`)
**Handler File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/listings.js`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/listings` | Get all active listings with filters (page, pageSize, propertyType, city, minPrice, maxPrice, minSqft, maxSqft, sort, order) |
| GET | `/api/listings/:id` | Get single listing by ID (increments view count) |
| POST | `/api/listings` | Create new listing (Submit Property) |
| PUT | `/api/listings/:id` | Update listing |
| DELETE | `/api/listings/:id` | Delete/withdraw listing |
| POST | `/api/listings/bulk` | Bulk create multiple listings |
| GET | `/api/listings/stats/summary` | Get marketplace statistics summary |

#### **MapServers Routes** (`/api/mapservers`)
**Handler File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/mapservers.js`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mapservers/categories` | Get all MapServer categories with counts |
| GET | `/api/mapservers/layer-sets` | Get all layer sets grouped by category |
| GET | `/api/mapservers/layer-sets/:id` | Get single layer set by ID |
| GET | `/api/mapservers/search` | Search MapServers (category, state, search keyword, limit, offset) |

#### **AI Routes** (`/api/ai`)
**Handler File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/ai.js`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ai/query` | AI-powered query endpoint (rate limited: 30 calls per 15 minutes). Accepts mode, query, bounds, subject. Returns property results, overlays, pins, insights. Uses Claude API with MCP server integration. |

#### **GIS Routes** (`/api/gis`)
**Handler File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/gis.js`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/gis/layers` | Get GIS layers by name or all active layers |
| POST | `/api/gis/layers` | Handle layer toggle actions (returns canonical ArcGIS URLs) |
| GET | `/api/gis/layers/:id/query` | Query specific layer by bbox or geometry |

#### **Discover Routes** (`/api/discover`)
**Handler File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/discover.js`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/discover/query` | Natural language discovery endpoint. Extracts intent using Claude, builds SQL query, scores candidates, saves run and results. Returns extractedIntent, candidates, mapPins, runId, stats. |

#### **MTS Routes** (`/api/mts`)
**Handler File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/mts.js`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mts/centroids` | Get parcel centroids for Mapbox Tilesets (bbox query, limit up to 50000). Returns GeoJSON FeatureCollection with parcelId, geometry, hasProperty, motivationScore. |

#### **Buy Boxes Routes** (`/api/buy-boxes`)
**Handler File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/buyboxes.js`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/buy-boxes` | List user buy boxes (requires userId query param) |
| POST | `/api/buy-boxes` | Create buy box (userId, name, markets, counties, propertyTypes, priceMin, priceMax, acresMin, acresMax, zoningCodes, filters) |
| PUT | `/api/buy-boxes/:id` | Update buy box |
| DELETE | `/api/buy-boxes/:id` | Delete buy box |

#### **Deals Routes** (`/api/deals`)
**Handler File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/deals.js`

| Method | Path | Description |
|--------|------|-------------|
| (Routes exist but not fully audited - see handler file) | | |

#### **Query Routes** (`/api/query`)
**Handler File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/query.js`

| Method | Path | Description |
|--------|------|-------------|
| (Routes exist but not fully audited - see handler file) | | |

#### **Polygon Searches Routes** (`/api/polygon-searches`)
**Handler File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/polygonSearches.js`

| Method | Path | Description |
|--------|------|-------------|
| (Routes exist but not fully audited - see handler file) | | |

#### **Geocode Routes** (`/api/geocode`)
**Handler File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/geocode.js`

| Method | Path | Description |
|--------|------|-------------|
| (Routes exist but not fully audited - see handler file) | | |

#### **OSM POIs Routes** (`/api/osm-pois`)
**Handler File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/osm-pois.js`

| Method | Path | Description |
|--------|------|-------------|
| (Routes exist but not fully audited - see handler file) | | |

---

## 4. Database

### 4.1 Database Type

**Type:** PostgreSQL  
**PostGIS Extension:** Enabled (required for spatial queries)

### 4.2 ORM/Query Builder

**Primary ORM:** Prisma `^6.1.0`  
**Client:** `@prisma/client` `^6.1.0`  
**Schema Location:** `/Users/braydonirwin/scoutgptpro-backend/prisma/schema.prisma`

**Raw SQL:** Also uses `pg` (node-postgres) `^8.16.3` for:
- PostGIS spatial queries
- Raw SQL queries not supported by Prisma
- Connection pooling for enrichment queries

**Connection Pools:**
- Prisma Client: Single instance per route file
- Raw pg Pool: Used in `properties.js`, `parcels.js`, `parcels-search.js`, `mts.js`, `parcels-tx.js`, `osm-pois.js`
- Pool sizes: 5-10 connections max

### 4.3 Connection Configuration

**Connection String:** `process.env.DATABASE_URL`  
**Used In:**
- Prisma schema: `datasource db { url = env("DATABASE_URL") }`
- Raw pg pools: `connectionString: process.env.DATABASE_URL`

### 4.4 Schema Files

#### **Prisma Schema**
**File:** `/Users/braydonirwin/scoutgptpro-backend/prisma/schema.prisma`

#### **SQL Migration Files**

**Prisma Migrations:**
1. `/Users/braydonirwin/scoutgptpro-backend/prisma/migrations/0_init/migration.sql`
2. `/Users/braydonirwin/scoutgptpro-backend/prisma/migrations/add_osm_pois_table.sql`
3. `/Users/braydonirwin/scoutgptpro-backend/prisma/migrations/add_property_id_to_osm_pois.sql`
4. `/Users/braydonirwin/scoutgptpro-backend/prisma/migrations/discovery_tables.sql`

**Raw SQL Migrations (db/migrations):**
1. `/Users/braydonirwin/scoutgptpro-backend/db/migrations/0001_travis_resolver_and_parcels.sql`
2. `/Users/braydonirwin/scoutgptpro-backend/db/migrations/0002_add_parcels_tx.sql`
3. `/Users/braydonirwin/scoutgptpro-backend/db/migrations/0003_add_parcels_travis_enrichment.sql`

**Additional SQL Files:**
- `/Users/braydonirwin/scoutgptpro-backend/prisma/schema-cleanup.sql`
- `/Users/braydonirwin/scoutgptpro-backend/scripts/sql/*.sql` (7 files)

### 4.5 All Tables with Columns and Types

#### **Prisma-Managed Tables** (from schema.prisma)

**1. users**
- `id` (String, @id, cuid)
- `email` (String, @unique)
- `name` (String?)
- `role` (UserRole enum, default: AGENT)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)
- Relations: activities, buyBoxes, deals, documents, listings, mapQueries, tasks, profile

**2. user_profiles**
- `id` (String, @id, cuid)
- `userId` (String, @unique)
- `phone` (String?)
- `company` (String?)
- `licenseNumber` (String?)
- `bio` (String?)
- `avatar` (String?)
- `preferences` (Json?)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)
- Relations: user (User)

**3. properties** (83 columns - MAIN TABLE)
- `id` (String, @id, cuid)
- `parcelId` (String, @unique) - Links to parcels_travis.parcel_id
- `address`, `city`, `state`, `zip`, `county`, `apn`, `legalDesc` (String?)
- `propertyType`, `sizeUnit`, `zoning`, `ownerName`, `ownerAddress`, `mailingAddr`, `siteAddress`, `siteCity`, `siteState`, `siteZip`, `block`, `lot`, `subdivision`, `situsNum`, `situsStreet`, `landTypeDesc`, `floodZone`, `geoId`, `enrichmentSource`, `deedDate` (String?)
- `size`, `acres`, `latitude`, `longitude`, `assessedValue`, `marketValue`, `impValue`, `landValue`, `mktValue`, `totalDue`, `totalTax`, `appraisedValue`, `tcadAcres`, `lastSaleAmount`, `mortgageAmount`, `mortgageRate`, `ownershipYears` (Float?)
- `yearBuilt`, `taxYear`, `motivationScore`, `avmConfidence`, `mortgageTerm` (Int?)
- `isAbsentee`, `isTaxDelinquent`, `isVacantLand`, `isInvestorOwned`, `isForeclosure` (Boolean, default: false)
- `opportunityFlags` (String[])
- `metadata`, `centroid` (Json?)
- `avmValue`, `avmMin`, `avmMax` (Decimal?, Decimal(14,2))
- `avmDate`, `lastSaleDate`, `enrichedAt` (DateTime?)
- `lastSaleDocType`, `grantorName`, `granteeName`, `granteeMailAddress`, `granteeMailCity`, `granteeMailState`, `granteeMailZip`, `mortgageLender`, `owner`, `ownerFirstName`, `ownerLastName`, `attomId` (String?)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)
- Relations: comps, deals, listings, pins
- Indexes: propertyType, [latitude, longitude], isAbsentee, isTaxDelinquent, motivationScore, acres, totalTax, parcelId, attomId

**4. listings**
- `id` (String, @id, cuid)
- `status` (ListingStatus enum, default: ACTIVE)
- `propertyType` (PropertyType enum)
- `title`, `description`, `address`, `city`, `state`, `zipCode`, `county`, `apn`, `zoning`, `assetType`, `assetSubtype`, `leaseType`, `topography`, `entitlements`, `coverImage` (String?)
- `latitude`, `longitude` (Float?)
- `askingPrice` (Decimal, Decimal(15,2))
- `pricePerSqft`, `pricePerAcre` (Decimal?, Decimal(10,2) / Decimal(15,2))
- `totalSqft`, `lotSizeSqft`, `tenantCount`, `buildingCount`, `floors`, `parkingSpaces`, `bedrooms`, `numberOfLots`, `roadFrontage` (Int?)
- `lotSizeAcres`, `totalAcres` (Decimal?, Decimal(10,4))
- `yearBuilt` (Int?)
- `noi`, `capRate`, `occupancy`, `hoaFee` (Decimal?, Decimal(15,2) / Decimal(5,2) / Decimal(10,2))
- `bathrooms` (Decimal?, Decimal(3,1))
- `utilities`, `images`, `documents` (Json?)
- `views`, `inquiries` (Int, default: 0)
- `userId`, `propertyId` (String?)
- `createdAt`, `updatedAt`, `listedAt` (DateTime)
- Relations: property (Property?), user (User?)
- Indexes: status, propertyType, city, askingPrice

**5. deals**
- `id` (String, @id, cuid)
- `userId` (String)
- `propertyId` (String?)
- `title`, `dealType`, `seller`, `buyer`, `lostReason`, `notes` (String?)
- `stage` (DealStage enum, default: PIPELINE)
- `purchasePrice`, `offerPrice` (Float?)
- `probability` (Int?)
- `closingDate` (DateTime?)
- `metadata` (Json?)
- `createdAt`, `updatedAt` (DateTime)
- Relations: property (Property?), user (User), activities, documents, tasks
- Indexes: [userId, stage], stage

**6. buy_boxes**
- `id` (String, @id, cuid)
- `userId` (String)
- `name` (String)
- `isActive` (Boolean, default: true)
- `markets`, `counties`, `propertyTypes`, `zoning`, `filters` (Json?)
- `minSize`, `maxSize`, `minPrice`, `maxPrice`, `minCap`, `maxCap` (Float?)
- `sizeUnit` (String?)
- `minYearBuilt` (Int?)
- `createdAt`, `updatedAt` (DateTime)
- Relations: user (User)
- Indexes: userId

**7. documents**
- `id` (String, @id, cuid)
- `userId` (String)
- `dealId` (String?)
- `filename`, `fileUrl`, `fileType`, `category`, `description` (String?)
- `fileSize` (Int)
- `uploadedAt` (DateTime)
- Relations: deal (Deal?), user (User)
- Indexes: userId, dealId

**8. activities**
- `id` (String, @id, cuid)
- `userId` (String)
- `dealId` (String?)
- `type`, `subject`, `description` (String?)
- `completedAt` (DateTime)
- Relations: deal (Deal?), user (User)
- Indexes: userId, dealId

**9. tasks**
- `id` (String, @id, cuid)
- `userId` (String)
- `dealId` (String?)
- `title`, `description` (String?)
- `priority` (Priority enum, default: MEDIUM)
- `status` (TaskStatus enum, default: TODO)
- `dueDate`, `completedAt` (DateTime?)
- `createdAt`, `updatedAt` (DateTime)
- Relations: deal (Deal?), user (User)
- Indexes: [userId, status], dueDate

**10. comps**
- `id` (String, @id, cuid)
- `propertyId` (String?)
- `address`, `city`, `state`, `propertyType`, `sizeUnit`, `source` (String)
- `size`, `salePrice`, `pricePerUnit`, `capRate`, `noi`, `distance` (Float?)
- `saleDate` (DateTime)
- `verified` (Boolean, default: false)
- `metadata` (Json?)
- `createdAt` (DateTime)
- Relations: property (Property?)
- Indexes: [city, state, propertyType]

**11. gis_layers**
- `id` (String, @id, cuid)
- `name`, `category`, `sourceType`, `sourceUrl` (String?)
- `style`, `metadata` (Json?)
- `minZoom`, `maxZoom` (Float?)
- `isActive` (Boolean, default: true)
- `createdAt`, `updatedAt` (DateTime)

**12. pins**
- `id` (String, @id, cuid)
- `propertyId` (String?)
- `title`, `summary`, `pinType` (String?)
- `lat`, `lng` (Float)
- `tags`, `metadata` (Json?)
- `createdAt` (DateTime)
- Relations: property (Property?)
- Indexes: [lat, lng]

**13. map_server_registry**
- `id` (String, @id, cuid)
- `url` (String, @unique)
- `category`, `context`, `datasetType`, `datasetCategory`, `serviceName`, `geometryType` (String?)
- `layerId` (Int?)
- `fields`, `extent` (Json?)
- `isActive` (Boolean, default: true)
- `lastQueried` (DateTime?)
- `queryCount` (Int, default: 0)
- `createdAt`, `updatedAt` (DateTime)
- Indexes: category, datasetType, [isActive, category]

**14. layer_sets**
- `id` (String, @id, cuid)
- `layerSetId` (String, @unique)
- `name`, `category`, `description`, `geometryType`, `primaryLayerUrl`, `primaryLayerId` (String?)
- `style`, `alternativeLayers` (Json?)
- `totalFeatureCount`, `layerCount` (Int, default: 0 / 1)
- `isActive` (Boolean, default: true)
- `queryCount` (Int, default: 0)
- `lastQueried` (DateTime?)
- `createdAt`, `updatedAt` (DateTime)
- Indexes: category, geometryType, [isActive, category]

**15. map_queries**
- `id` (String, @id, cuid)
- `userId` (String)
- `query` (String)
- `selectedServers`, `bounds`, `results` (Json?)
- `createdAt` (DateTime)
- Relations: user (User)
- Indexes: userId, createdAt

**16. polygon_searches**
- `id` (String, @id, cuid)
- `userId` (String?)
- `name`, `description` (String?)
- `polygonGeoJSON` (Json)
- `areaAcres` (Float?)
- `centroidLat`, `centroidLng` (Float?)
- `messages` (Json, default: "[]")
- `filters` (Json?)
- `createdAt`, `updatedAt`, `lastAccessedAt` (DateTime)
- `isArchived` (Boolean, default: false)
- Indexes: userId, updatedAt, lastAccessedAt

**17. spatial_ref_sys**
- `srid` (Int, @id)
- `auth_name` (String?, VarChar(256))
- `auth_srid` (Int?)
- `srtext` (String?, VarChar(2048))
- `proj4text` (String?, VarChar(2048))

**18. owners**
- `id` (String, @id, cuid)
- `ownerNameRaw`, `ownerNameNorm`, `mailingAddressRaw`, `mailingAddressNorm`, `mailingState` (String?, Text)
- `entityType` (EntityType enum, default: UNKNOWN)
- `isCorporate` (Boolean, default: false)
- `createdAt`, `updatedAt` (DateTime)
- Relations: properties (OwnerProperty[]), features (OwnerFeaturesTx?)
- Indexes: ownerNameNorm, mailingState, entityType, isCorporate

**19. owner_properties**
- `id` (String, @id, cuid)
- `ownerId` (String)
- `parcelId` (String)
- `createdAt` (DateTime)
- Relations: owner (Owner)
- Unique: [ownerId, parcelId]
- Indexes: parcelId, ownerId

**20. owner_features_tx**
- `id` (String, @id)
- `ownerId` (String, @unique)
- `parcelCountTx` (Int, default: 0)
- `totalAssessedValueTx` (Decimal?, Decimal(15,2))
- `assetClassMix` (Json?)
- `absenteeRate` (Decimal?, Decimal(5,4))
- `outOfState` (Boolean, default: false)
- `avgHoldYears` (Decimal?, Decimal(5,2))
- `updatedAt` (DateTime)
- Relations: owner (Owner)
- Indexes: parcelCountTx, outOfState

**21. owner_segments**
- `segmentKey` (String, @id)
- `description` (String?, Text)
- `ruleJson` (Json)
- `version` (String, default: "1.0")
- `updatedAt` (DateTime)
- Indexes: segmentKey

**22. tx_enrichment_rollups**
- `parcelId` (String, @id)
- `pop1mi` (Decimal?, Decimal(10,0))
- `medIncome1mi` (Decimal?, Decimal(10,2))
- `poiCounts`, `nearestPoi` (Json?)
- `trafficIndex` (Decimal?, Decimal(5,2))
- `floodPct` (Decimal?, Decimal(5,4))
- `inFloodplain` (Boolean, default: false)
- `updatedAt` (DateTime)
- Indexes: parcelId

**23. discover_runs**
- `id` (String, @id, cuid)
- `queryText` (String?, Text)
- `intentJson` (Json)
- `createdBy` (String?)
- `startedAt` (DateTime)
- `endedAt` (DateTime?)
- `stats`, `error` (Json? / String?, Text)
- Relations: results (DiscoverResult[])
- Indexes: createdBy, startedAt

**24. discover_results**
- `id` (String, @id, cuid)
- `runId` (String)
- `parcelId` (String)
- `score` (Decimal, Decimal(10,6))
- `reasons`, `breakdown` (Json)
- Relations: run (DiscoverRun)
- Indexes: runId, parcelId, score

**25. scoring_models**
- `modelId` (String, @id)
- `assetClass` (String)
- `version` (String, default: "1.0")
- `modelJson` (Json)
- `updatedAt` (DateTime)
- Indexes: assetClass, version

#### **Raw SQL Tables** (PostGIS, not in Prisma schema)

**26. parcels_travis** (from 0001_travis_resolver_and_parcels.sql)
- `parcel_id` (TEXT, PRIMARY KEY)
- `geom` (GEOMETRY(MultiPolygon, 4326), NOT NULL)
- `created_at` (TIMESTAMPTZ, DEFAULT NOW())
- **Spatial Index:** GIST index on `geom`

**27. parcels_travis_enrichment** (from 0003_add_parcels_travis_enrichment.sql)
- `parcel_id` (TEXT, PRIMARY KEY, REFERENCES parcels_travis)
- `owner_name`, `owner2`, `mail_address1`, `mail_address2`, `mail_city`, `mail_state`, `mail_zip`, `situs_address`, `land_use`, `land_use_desc`, `legal_desc`, `source_layer` (TEXT)
- `year_built` (INT)
- `acres`, `land_value`, `improvement_value`, `market_value`, `assessed_value` (NUMERIC)
- `last_update` (DATE)
- `raw` (JSONB)
- `updated_at` (TIMESTAMPTZ, DEFAULT NOW())
- **Indexes:** owner_name, land_use, market_value, year_built

**28. parcels_travis_enrichment_stage** (from 0003_add_parcels_travis_enrichment.sql)
- `id` (BIGSERIAL, PRIMARY KEY)
- `raw` (JSONB, NOT NULL)
- `detected_id` (TEXT)
- `ingested_at` (TIMESTAMPTZ, DEFAULT NOW())
- **Indexes:** detected_id

**29. parcels_tx** (from 0002_add_parcels_tx.sql)
- `parcel_uid` (TEXT, PRIMARY KEY)
- `geom` (GEOMETRY(MultiPolygon, 4326), NOT NULL)
- `state_fips` (TEXT, NOT NULL)
- `county_fips` (TEXT, NOT NULL)
- `prop_id`, `geo_id`, `source_layer` (TEXT)
- `ingested_at`, `updated_at` (TIMESTAMPTZ, DEFAULT NOW())
- **Spatial Index:** GIST index on `geom`
- **Indexes:** county_fips, state_fips, [county_fips, state_fips]

**30. stg_attom_property_boundary_travis** (from 0001_travis_resolver_and_parcels.sql)
- `id` (BIGSERIAL, PRIMARY KEY)
- `parcel_id`, `attom_id`, `county`, `source_file` (TEXT)
- `ingested_at` (TIMESTAMPTZ, DEFAULT NOW())
- `raw` (JSONB)
- **Indexes:** parcel_id, attom_id, [parcel_id, attom_id]

**31. xref_parcel_property_travis** (from 0001_travis_resolver_and_parcels.sql)
- `parcel_id` (TEXT, NOT NULL)
- `attom_id` (TEXT, NOT NULL) - Contains 32-hex GeoJSON ID
- `source` (TEXT, NOT NULL, DEFAULT 'attom_property_boundary_match')
- `created_at` (TIMESTAMPTZ, DEFAULT NOW())
- **PRIMARY KEY:** [parcel_id, attom_id]
- **Indexes:** parcel_id, attom_id

**32. xref_parcel_property_travis_conflicts** (from 0001_travis_resolver_and_parcels.sql)
- `parcel_id` (TEXT, PRIMARY KEY)
- `attom_ids` (TEXT[], NOT NULL)
- `attom_id_count` (INTEGER, NOT NULL)
- `sample_rows` (JSONB)
- `created_at` (TIMESTAMPTZ, DEFAULT NOW())
- **Indexes:** attom_id_count

### 4.6 PostGIS Usage

**PostGIS Extension:** Enabled (`CREATE EXTENSION IF NOT EXISTS postgis`)

**Geometry Columns:**
- `parcels_travis.geom` - GEOMETRY(MultiPolygon, 4326)
- `parcels_tx.geom` - GEOMETRY(MultiPolygon, 4326)

**Spatial Indexes (GIST):**
- `parcels_travis_geom_idx` on `parcels_travis.geom`
- `parcels_tx_geom_idx` on `parcels_tx.geom`

**Spatial Functions Used:**
- `ST_Intersects()` - Bbox intersection queries
- `ST_MakeEnvelope()` - Create bounding box geometries
- `ST_PointOnSurface()` - Get centroid points
- `ST_AsGeoJSON()` - Convert geometry to GeoJSON
- `ST_MakeValid()` - Geometry validation (mentioned in comments)

**Coordinate System:** SRID 4326 (WGS84)

### 4.7 Views and Materialized Views

**No views or materialized views found in migrations.**  
**Note:** SQL scripts in `scripts/sql/` reference views (`travis_enrichment_latest_view.sql`, `travis_enrichment_materialize.sql`) but these are not in the migration files.

---

## 5. Data Models

### 5.1 Prisma Models

All models are defined in `/Users/braydonirwin/scoutgptpro-backend/prisma/schema.prisma`. See section 4.5 for complete table definitions.

**Model List:**
1. User
2. UserProfile
3. Property (main entity, 83 columns)
4. Listing
5. Deal
6. BuyBox
7. Document
8. Activity
9. Task
10. Comp
11. GisLayer
12. Pin
13. MapServerRegistry
14. LayerSet
15. MapQuery
16. PolygonSearch
17. spatial_ref_sys (PostGIS system table)
18. Owner
19. OwnerProperty
20. OwnerFeaturesTx
21. OwnerSegment
22. TxEnrichmentRollup
23. DiscoverRun
24. DiscoverResult
25. ScoringModel

**Enums:**
- UserRole: AGENT, BROKER, LENDER, INVESTOR, DEVELOPER, WHOLESALER
- ListingStatus: ACTIVE, PENDING, SOLD, EXPIRED, WITHDRAWN, UNDER_CONTRACT
- PropertyType: COMMERCIAL, RESIDENTIAL, LAND
- DealStage: PIPELINE, ACTIVE, UNDERWRITING, PENDING, CLOSED, HOLD
- Priority: LOW, MEDIUM, HIGH, URGENT
- TaskStatus: TODO, IN_PROGRESS, COMPLETED, CANCELLED
- EntityType: PERSON, LLC, INC, LP, TRUST, UNKNOWN

### 5.2 Raw SQL Models (Not in Prisma)

**PostGIS Tables:**
- `parcels_travis` - Travis County parcel geometries
- `parcels_tx` - Texas statewide parcel geometries
- `parcels_travis_enrichment` - Travis County enrichment data
- `stg_attom_property_boundary_travis` - Staging table for ATTOM data
- `xref_parcel_property_travis` - Parcel to ATTOM ID mapping
- `xref_parcel_property_travis_conflicts` - Conflict resolution table

---

## 6. External API Integrations

### 6.1 Anthropic (Claude AI)

**SDK:** `@anthropic-ai/sdk` `^0.32.1`  
**API Key:** `process.env.ANTHROPIC_API_KEY` or `process.env.CLAUDE_API_KEY`  
**Usage Files:**
- `/Users/braydonirwin/scoutgptpro-backend/src/routes/ai.js` - AI query endpoint
- `/Users/braydonirwin/scoutgptpro-backend/src/routes/discover.js` - Discovery intent extraction
- `/Users/braydonirwin/scoutgptpro-backend/src/services/intentExtractor.js` - Intent extraction service

**Endpoints Called:**
- `anthropic.messages.create()` - Main API call
- **Model Used:** `claude-sonnet-4-20250514` (in ai.js), `claude-3-sonnet-20240229` (in discover.js)

**MCP Server Integration:**
- Property MCP server URL: `process.env.PROPERTY_MCP_URL` or `https://scoutgpt-property-mcp.onrender.com/mcp`
- Configured in ai.js route: `mcp_servers` array with property-data server

### 6.2 ATTOM Data

**Integration Type:** Data ingestion (no direct API calls)  
**Usage Files:**
- `/Users/braydonirwin/scoutgptpro-backend/src/services/attom-resolver-service.js` - Resolves parcelId to ATTOM GeoJSON ID
- `/Users/braydonirwin/scoutgptpro-backend/src/routes/properties.js` - Uses ATTOM resolver service

**Data Source:**
- Pre-ingested ATTOM property boundary match files
- Stored in `xref_parcel_property_travis` table
- `attom_id` column contains 32-hex GeoJSON ID

**No Direct API Calls:** ATTOM data is pre-loaded into database tables

### 6.3 ArcGIS MapServer

**Integration Type:** REST API calls (no SDK)  
**Usage Files:**
- `/Users/braydonirwin/scoutgptpro-backend/src/services/mapserver-service.js` - MapServer search and query
- `/Users/braydonirwin/scoutgptpro-backend/src/routes/gis.js` - GIS layer endpoints

**Endpoints:**
- Various ArcGIS MapServer/FeatureServer URLs stored in `map_server_registry` table
- Hardcoded canonical URLs in `gis.js`:
  - Austin zoning: `https://maps.austintexas.gov/arcgis/rest/services/Shared/Zoning_1/MapServer/0`
  - FEMA flood zones: `https://maps.austintexas.gov/arcgis/rest/services/Shared/Environmental_2/MapServer/1`
  - Sewer/water utilities: Various MapServer URLs
  - Parcel boundaries: `https://maps.austintexas.gov/arcgis/rest/services/Shared/Parcels/MapServer/0`

**Query Methods:**
- ArcGIS REST API query endpoint: `/query?where=...&outFields=*&f=geojson&geometryType=esriGeometryEnvelope&geometry=...`

### 6.4 Geocoding Services

**Usage Files:**
- `/Users/braydonirwin/scoutgptpro-backend/src/routes/geocode.js` - Geocoding endpoints

**Services:** Not fully audited - see geocode.js route file

### 6.5 Other External Services

**None found** - No other third-party API integrations detected

---

## 7. MCP Implementation

### 7.1 MCP Server Implementation

**No MCP server implementation found in this backend repository.**

**MCP Client Usage:**
- Backend acts as MCP client when calling Claude API
- Configures MCP server URL in `ai.js`: `process.env.PROPERTY_MCP_URL` or `https://scoutgpt-property-mcp.onrender.com/mcp`
- MCP server is external service (not in this repo)

**Conclusion:** This backend does not implement an MCP server. It consumes an external MCP server (property-data) when making Claude API calls.

---

## 8. Background Jobs / Cron / Workers

### 8.1 Scheduled Tasks

**No cron jobs or scheduled tasks found.**

### 8.2 Queue/Worker Implementations

**No queue or worker implementations found** (no Bull, BullMQ, Celery, etc.)

### 8.3 Data Sync / ETL Processes

**ETL Scripts (Manual Execution):**
Located in `/Users/braydonirwin/scoutgptpro-backend/scripts/`:

**Parcel Ingestion:**
- `load-parcels-travis.mjs` - Load Travis County parcels
- `ingest-parcels-tx.mjs` - Ingest Texas statewide parcels
- `ingest-travis-enrichment.mjs` - Ingest Travis enrichment data
- `ingest-txgio-travis.sh` - TXGIO Travis ingestion script

**Data Enrichment:**
- `enrich-from-tcad-api.js` - Enrich from TCAD API
- `enrich-travis-fast.js` - Fast Travis enrichment
- `enrich-osm-pois.js` - Enrich OSM POIs
- `enrich-properties-land-use.mjs` - Land use enrichment

**MTS Export:**
- `export-parcels-to-mts.mjs` - Export parcels to Mapbox Tilesets
- `scripts/mts/publish-travis.mjs` - Publish Travis tileset

**Owner/Discovery:**
- `scripts/tx/owners-build.mjs` - Build owner entities
- `scripts/tx/owner-features.mjs` - Calculate owner features
- `scripts/tx/seed-scoring-models.mjs` - Seed scoring models

**No Automated Scheduling:** All scripts are run manually via npm scripts or direct execution

### 8.4 Rate Limiter Cleanup

**File:** `/Users/braydonirwin/scoutgptpro-backend/src/middleware/rateLimiter.js`

**Background Process:**
- `setInterval()` cleanup every 15 minutes
- Cleans up expired rate limit entries from in-memory store
- **Not a scheduled job** - runs as part of middleware initialization

---

## 9. Environment Variables

### 9.1 Complete List of Environment Variables

#### **Database**
- `DATABASE_URL` - PostgreSQL connection string (REQUIRED)

#### **External APIs**
- `ANTHROPIC_API_KEY` - Anthropic/Claude API key (REQUIRED for AI endpoints)
- `CLAUDE_API_KEY` - Alternative name for Anthropic API key (fallback)
- `PROPERTY_MCP_URL` - Property MCP server URL (optional, default: `https://scoutgpt-property-mcp.onrender.com/mcp`)

#### **Server Configuration**
- `PORT` - Server port (optional, default: 3001)
- `NODE_ENV` - Node environment: `development` or `production` (optional, default: development)
- `CORS_ORIGINS` - Comma-separated list of allowed CORS origins (optional)
- `FRONTEND_URL` - Frontend URL for CORS whitelist (optional)
- `BACKEND_URL` - Backend URL (optional, used in render.yaml)

### 9.2 Environment Variable Categories

**Required:**
- `DATABASE_URL` - Database connection
- `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY` - AI functionality

**Optional:**
- `PORT` - Server port (defaults to 3001)
- `NODE_ENV` - Environment mode
- `CORS_ORIGINS` - CORS configuration
- `FRONTEND_URL` - CORS whitelist
- `PROPERTY_MCP_URL` - MCP server URL

---

## 10. Authentication & Authorization

### 10.1 Auth Implementation

**No authentication implementation found.**

**User Identification:**
- Routes use `req.user?.id` or `req.headers['x-user-id']` with fallback to `'anonymous'`
- No JWT, sessions, or API key authentication middleware

**Files Using User ID:**
- `src/routes/discover.js` - Uses `req.user?.id || req.headers['x-user-id'] || 'anonymous'`
- `src/routes/buyboxes.js` - Uses `userId` from query params or body
- `src/routes/listings.js` - Uses `userId` from body (optional)

### 10.2 Auth Middleware

**No auth middleware files found.**

### 10.3 User Model

**User Model Exists:** Defined in Prisma schema (`users` table) but not used for authentication

**User Fields:**
- `id`, `email` (unique), `name`, `role` (enum), `createdAt`, `updatedAt`

### 10.4 Protected vs Public Routes

**All routes are public** - No authentication required

**Rate Limiting:**
- `/api/ai/query` - Rate limited to 30 calls per 15 minutes per IP/user

---

## 11. Deployment Configuration

### 11.1 Deployment Platform

**Platform:** Render.com  
**Configuration File:** `/Users/braydonirwin/scoutgptpro-backend/render.yaml`

### 11.2 Render Configuration

**File:** `/Users/braydonirwin/scoutgptpro-backend/render.yaml`

```yaml
services:
  - type: web
    name: scoutgpt-backend
    runtime: node
    region: oregon
    plan: starter
    buildCommand: npm install && npx prisma generate
    startCommand: npm start
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        sync: false
      - key: CLAUDE_API_KEY
        sync: false
      - key: FRONTEND_URL
        value: https://your-app.netlify.app
      - key: BACKEND_URL
        value: https://scoutgpt-backend.onrender.com
      - key: PORT
        value: 3001
```

### 11.3 Build Commands

**Build:** `npm install && npx prisma generate`  
**Start:** `npm start` (runs `node src/server.js`)

### 11.4 Health Check

**Endpoint:** `GET /health`  
**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-XX...",
  "environment": "production"
}
```

### 11.5 Other Deployment Files

**No Dockerfile found**  
**No docker-compose.yml found**  
**No Railway configuration found**  
**No AWS configuration found**

---

## 12. Key Business Logic

### 12.1 Property Search/Query Logic

**File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/properties.js`

**Main Functions:**
- `GET /api/properties` - Search with filters (zip, city, propertyType, price, acres, absentee, taxDelinquent)
- `GET /api/properties/parcel/:parcelId` - Get property with enrichment join
- Enrichment data joined from `parcels_travis_enrichment` table
- ATTOM GeoJSON ID resolution via `attom-resolver-service.js`

**File:** `/Users/braydonirwin/scoutgptpro-backend/src/services/property-service.js`

**Functions:**
- `queryProperties()` - Query properties with bounds, filters, mode
- `needsPropertyData()` - Determines if query needs property data

### 12.2 GIS/Spatial Query Logic

**File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/parcels.js`

**Spatial Queries:**
- `GET /api/parcels/viewport` - Bbox query using `ST_Intersects()` and `ST_MakeEnvelope()`
- `GET /api/parcels/centroids` - Centroid extraction using `ST_PointOnSurface()`
- GeoJSON conversion using `ST_AsGeoJSON()`

**File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/mts.js`

**Spatial Queries:**
- `GET /api/mts/centroids` - Parcel centroids for Mapbox Tilesets
- Uses `ST_Intersects()` for bbox filtering
- Uses `ST_PointOnSurface()` for centroid calculation

**File:** `/Users/braydonirwin/scoutgptpro-backend/src/routes/parcels-search.js`

**Spatial Queries:**
- `GET /api/parcels/search` - Bbox search with enrichment filters
- Joins `parcels_travis` with `parcels_travis_enrichment`

**File:** `/Users/braydonirwin/scoutgptpro-backend/src/services/mapserver-service.js`

**Functions:**
- `searchMapServers()` - Search and query ArcGIS MapServers
- Fetches GeoJSON from ArcGIS REST API

### 12.3 Scoring/Ranking Algorithms

**File:** `/Users/braydonirwin/scoutgptpro-backend/src/services/discoverEngine.js`

**Functions:**
- `buildDiscoverQuery()` - Builds SQL query from DiscoverIntent
- `scoreCandidates()` - Scores property candidates based on:
  - Scoring model weights (location, owner, property)
  - Population density (pop1mi)
  - Median income (medIncome1mi)
  - Owner segments (mom_pop, small_operator, institutional, etc.)
  - Property characteristics (acres, motivation score, absentee status)
  - Soft preferences (population, income, flood risk)

**Scoring Model:**
- Stored in `scoring_models` table
- JSON structure with weights for different factors
- Default scoring if no model available

### 12.4 Data Transformation/Enrichment Logic

**File:** `/Users/braydonirwin/scoutgptpro-backend/src/services/attom-resolver-service.js`

**Functions:**
- `getAttomGeoIdByParcelId()` - Resolves parcelId to ATTOM GeoJSON ID
- `attachAttomGeoIdsToProperties()` - Batch attach ATTOM IDs to properties
- Handles conflicts (returns null for conflicted parcels)

**File:** `/Users/braydonirwin/scoutgptpro-backend/src/services/countyResolver.js`

**Functions:**
- `resolveParcelCounty()` - Resolves county from parcel data

**File:** `/Users/braydonirwin/scoutgptpro-backend/src/services/intentExtractor.js`

**Functions:**
- `extractDiscoverIntent()` - Uses Claude API to extract structured intent from natural language
- Returns DiscoverIntent JSON schema

**ETL Scripts:**
- Multiple scripts in `scripts/` directory for data ingestion and transformation
- See section 8.3 for complete list

---

## Summary

### Architecture Overview

- **Framework:** Express.js 4.21.2
- **Database:** PostgreSQL with PostGIS
- **ORM:** Prisma 6.1.0 + raw pg for spatial queries
- **Deployment:** Render.com
- **External APIs:** Anthropic Claude, ArcGIS MapServers, Property MCP server
- **Authentication:** None implemented
- **Background Jobs:** None (manual script execution only)

### Key Findings

1. **Hybrid Database Access:** Prisma for CRUD + raw pg for PostGIS spatial queries
2. **No Authentication:** All routes are public, user identification via headers
3. **PostGIS Enabled:** Spatial queries on parcel geometries with GIST indexes
4. **MCP Client Only:** Consumes external MCP server, does not implement one
5. **No Background Jobs:** All ETL/ingestion scripts run manually
6. **Rate Limiting:** Only on `/api/ai/query` endpoint (in-memory, 30/15min)
7. **25 Prisma Models + 6 Raw SQL Tables:** Comprehensive data model
8. **Multiple Parcel Sources:** Travis County (`parcels_travis`) + Texas statewide (`parcels_tx`)

---

**End of Backend Technical Audit Report**
