# SCOUTGPT FULL PLATFORM AUDIT v1
**Date:** 2025-01-27  
**Repos:** `scoutgpt_9461` (frontend) + `scoutgptpro-backend` (backend)  
**Scope:** Frontend + Backend + DB + GIS + Data + DevOps + GitHub + Deploy + Observability  
**Mode:** AUDIT ONLY — NO IMPLEMENTATION  
**Focus:** Travis County, Texas

---

## 1. EXECUTIVE SUMMARY

### ✅ What is Working
- **Single enrichment owner** (`useSelectedEntity`) successfully centralizes selection and enrichment
- **ID resolution** (`parcelId` → `propertyId`) working via `/api/properties/resolve`
- **352,431 properties** loaded in database (Travis County)
- **PostGIS enabled** with Point geometry for properties
- **Map rendering** functional with Mapbox GL 3.16.0
- **Parcel chunks** served via GeoJSON files (file-based system working)

### ⚠️ What Needs Attention
- **Production enrichment gap:** Only 21% of properties have `siteAddress` vs 99% locally
- **Parcels not in PostGIS:** Cannot use spatial queries or generate tiles directly
- **Missing tables:** No permits, zoning_cases, or flood_zones tables
- **Unknown coverage:** AVM and RECORDER enrichment statistics not tracked
- **No CI/CD:** No GitHub Actions workflows found
- **Basic observability:** Console.log only, no structured logging or error tracking

### ❌ Critical Gaps
- **No permits/zoning data ingestion** (tables and scripts missing)
- **Flood zones API-only** (not stored in database)
- **No tileset generation pipeline** (parcels must be migrated to PostGIS first)
- **No authentication system** (CORS allows all origins in dev)
- **No error tracking service** (Sentry/Datadog not found)

---

## 2. REPO + GITHUB INVENTORY

### 2.1 Frontend Repo (`scoutgpt_9461`)

**Location:** `/Users/braydonirwin/scoutgpt_9461`

**GitHub:** `https://github.com/Syndnet-CRE/scoutgpt_9461.git`

**Status:**
- **Branch:** `main`
- **Working tree:** Clean (no uncommitted changes)
- **Remote sync:** Up to date with `origin/main`

**Recent Commits:**
```
c4bd087 UI: Make Opportunity card score text black for visibility
e91c664 UI: Replace property score badge with donut chart (popup + opportunity card)
5055ee7 Fix: popup card uses enriched selected entity for estimated value
d46428e UI: Update MapPropertyCard (estimated value + badge/button styling)
dda8b20 Fix: Chat property clicks always dispatch selection consistently
```

**Branches:**
- `main` (active)
- Remote branches: `claude/chat-ui-refresh-*`, `claude/debug-gis-map-display-*`, `claude/fix-netlify-build-secrets-*`, `claude/setup-scoutgpt-app-*`

**Deploy Config:**
- **Platform:** Netlify
- **Config:** `netlify.toml`
- **Build:** `npm run build`
- **Publish:** `dist/`
- **Env:** `VITE_API_BASE_URL = "https://scoutgptpro-backend.onrender.com/api"`

### 2.2 Backend Repo (`scoutgptpro-backend`)

**Location:** `/Users/braydonirwin/scoutgptpro-backend`

**GitHub:** `https://github.com/Syndnet-CRE/scoutgptpro-backend.git`

**Status:**
- **Branch:** `main`
- **Working tree:** **DIRTY** (many modified files, untracked files)
- **Remote sync:** Up to date with `origin/main`

**Modified Files (not committed):**
- Multiple audit reports (`.md` files)
- Scripts (`.js`, `.cjs`, `.sql` files)
- Route handlers (`src/routes/*.js`)
- Services (`src/services/*.js`)

**Untracked Files:**
- `MAP_ID_CONTRACT_V1.md`
- `TRAVIS_COUNTY_SYSTEM_AUDIT_V1.md`
- `scripts/extractColumns.cjs`
- `scripts/ingestRecorderData.cjs`
- `scripts/ingestRecorderData.js`

**Recent Commits:**
```
6923313 Add resolver endpoint to map parcelId to propertyId
f6a7a9c Add RECORDER fields to Prisma schema (mortgage, sale, ownership data)
7772938 Move prisma to dependencies to ensure availability on Render
2d4cb5f Add prestart script to ensure Prisma client regeneration
b404922 Force Render rebuild to regenerate Prisma client with RECORDER fields
```

**Deploy Config:**
- **Platform:** Render (onrender.com)
- **Config:** `render.yaml`
- **Runtime:** Node.js
- **Region:** Oregon
- **Plan:** Starter
- **Build:** `npm install && npx prisma generate`
- **Start:** `npm start`
- **Health:** `/health`

### 2.3 CI/CD Status

**GitHub Actions:** ❌ **NONE FOUND**

**No workflows found in:**
- `.github/workflows/` (does not exist in either repo)

**Deployment:**
- **Frontend:** Manual Netlify deploy (via `netlify deploy` or Git push)
- **Backend:** Automatic Render deploy (on Git push to `main`)

**Docker:** ❌ **NO DOCKERFILES FOUND**

---

## 3. ARCHITECTURE MAP

### 3.1 System Architecture (Text Diagram)

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Netlify)                       │
│                    scoutgpt_9461 (React + Vite)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐         ┌──────────────────┐            │
│  │  MapWorkspace     │────────▶│ useSelectedEntity │            │
│  │  (Mapbox GL)      │         │  (Single Owner)   │            │
│  └──────────────────┘         └──────────────────┘            │
│         │                                │                       │
│         │ parcel-selected event          │ fetch                 │
│         ▼                                ▼                       │
│  ┌──────────────────┐         ┌──────────────────┐            │
│  │  PropertyPanel   │         │  PropertyDetails  │            │
│  │  (Left Panel)    │         │  Modal            │            │
│  └──────────────────┘         └──────────────────┘            │
│                                                                   │
│  Layers:                                                         │
│  - parcel-dots-layer (centroids, zoom 16+)                       │
│  - ai-results-pins (chat results)                               │
│  - selected-boundary (selected parcel polygon)                  │
│                                                                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS
                            │ API Calls
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Render)                             │
│              scoutgptpro-backend (Express + Node)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Routes:                                                         │
│  - GET  /api/properties/:id          → Prisma.property.findUnique│
│  - GET  /api/properties/resolve     → Prisma.property.findUnique│
│  - POST /api/properties/search       → Raw SQL (bbox + filters)  │
│  - GET  /api/parcels/viewport       → GeoJSON chunks (file)     │
│  - GET  /api/parcels/centroids      → GeoJSON chunks (file)     │
│  - GET  /api/gis/layers             → Prisma.mapServerRegistry  │
│  - POST /api/ai/query               → Anthropic Claude API       │
│                                                                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ Prisma Client
                            │ DATABASE_URL
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATABASE (Neon PostgreSQL)                    │
│                      + PostGIS Extension                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Tables:                                                         │
│  - properties (352,431 rows)                                    │
│    - id (cuid PK)                                               │
│    - parcelId (unique, indexed)                                  │
│    - geom (Point, SRID 4326) - optional                         │
│    - avmValue, mortgageAmount, lastSaleDate, etc.                │
│                                                                   │
│  - map_server_registry (416 rows)                               │
│  - layer_sets (32 rows)                                         │
│  - listings (1 row)                                             │
│  - users, deals, comps, etc. (0 rows)                           │
│                                                                   │
│  GeoJSON Files (not in DB):                                     │
│  - data/parcels/chunks/*.geojson (parcel polygons)               │
│  - data/parcels/chunk_index.json                                │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow: Selection → Enrichment

```
1. User clicks map marker/centroid
   ↓
2. MapWorkspace dispatches 'parcel-selected' event
   detail: { id, property, properties, source, geometry }
   ↓
3. useSelectedEntity hook listens to event
   ↓
4. Normalizes ID:
   - If numeric → resolve via /api/properties/resolve?parcelId=...
   - If non-numeric → use as propertyId
   ↓
5. Checks cache (entityCacheRef)
   ↓
6. If cache miss → fetch /api/properties/:propertyId
   ↓
7. Merge thin + enriched data
   ↓
8. Update selectedEntity state
   ↓
9. All UI components read from useSelectedEntity:
   - PropertyPanel (left panel)
   - PropertyDetailsModal
   - MapPropertyCard (popup)
```

### 3.3 Data Flow: Parcel Loading

```
1. User pans/zooms map (zoom >= 16)
   ↓
2. MapWorkspace detects viewport change
   ↓
3. Calculates bbox [west, south, east, north]
   ↓
4. Calls GET /api/parcels/viewport?bbox=...&limit=3000
   ↓
5. Backend reads chunk_index.json
   ↓
6. Finds chunks intersecting bbox
   ↓
7. Reads GeoJSON chunk files from disk
   ↓
8. Filters features by centroid within bbox
   ↓
9. Returns GeoJSON FeatureCollection
   ↓
10. Frontend updates 'parcel-dots' source
   ↓
11. Mapbox renders centroids as circles
```

---

## 4. FRONTEND AUDIT

### 4.1 Build System & Dependencies

**Build Tool:** Vite 5.0.0

**Framework:** React 18.2.0

**Styling:** Tailwind CSS 3.4.6

**TypeScript:** ❌ No TypeScript (JavaScript only)

**Key Dependencies:**
- `mapbox-gl`: ^3.16.0 (Mapbox GL JS)
- `react-map-gl`: ^8.1.0 (React wrapper)
- `@mapbox/mapbox-gl-draw`: ^1.5.1 (Drawing tools)
- `@reduxjs/toolkit`: ^2.6.1 (State management - **UNKNOWN if used**)
- `redux`: ^5.0.1 (State management - **UNKNOWN if used**)
- `axios`: ^1.8.4 (HTTP client - **UNKNOWN if used**)

**Build Output:**
- **Dist size:** 4.7 MB
- **Location:** `dist/`
- **Bundle:** `dist/assets/index-CDMG9m7R.js` (4.7 MB) - **LARGE**

**Scripts:**
- `start`: `vite` (dev server)
- `build`: `vite build` (production build)
- `serve`: `vite preview` (preview build)

### 4.2 Map + GIS Rendering Architecture

**Mapbox Initialization:**
- **File:** `src/pages/scout-ai-chat/components/MapWorkspace.jsx`
- **Token:** From `src/config/mapbox.js` → `VITE_MAPBOX_ACCESS_TOKEN`
- **Style:** `mapbox://styles/bradyirwin/cmabvzjn0005601qu8k7f7o5w` (default)

**Map Layers:**

| Layer ID | Type | Source | Purpose | Zoom |
|----------|------|--------|---------|------|
| `parcel-dots-layer` | circle | `parcel-dots` (GeoJSON) | Parcel centroids | 15.5+ |
| `ai-results-pins` | circle | `ai-results-pins` (GeoJSON) | Chat result markers | All |
| `selected-boundary-fill` | fill | `selected-boundary` (GeoJSON) | Selected parcel polygon | All |
| `selected-boundary-outline` | line | `selected-boundary` (GeoJSON) | Selected parcel outline | All |

**Data Loading Strategy:**
- **Parcels:** API GeoJSON via `/api/parcels/viewport?bbox=...`
- **Caching:** In-memory `parcelCache` Map (no limit, cleared on unmount)
- **Loading:** Triggered on `moveend` event (map pan/zoom)
- **Limit:** 3,000 parcels per request (configurable up to 50,000)

**Map Rendering Sequence:**
1. Map loads → `map.on('load')`
2. Initialize parcel system (zoom 16+)
3. Add `parcel-dots` source (empty initially)
4. Add `parcel-dots-layer` (circle layer, fade in 15.5-16)
5. Listen to `moveend` event
6. On moveend → calculate bbox → fetch `/api/parcels/viewport`
7. Update `parcel-dots` source with new features
8. Mapbox re-renders circles

**Evidence:**
```javascript
// MapWorkspace.jsx:718-754
mapInstance.addSource('parcel-dots', {
  type: 'geojson',
  data: { type: 'FeatureCollection', features: [] }
});

mapInstance.addLayer({
  id: 'parcel-dots-layer',
  type: 'circle',
  source: 'parcel-dots',
  minzoom: 15.5,
  paint: {
    'circle-opacity': [
      'interpolate', ['linear'], ['zoom'],
      15.5, 0,
      16, 0.9
    ]
  }
});
```

### 4.3 Selection + Enrichment Architecture

**Single Owner Hook:**
- **File:** `src/hooks/useSelectedEntity.js`
- **Purpose:** Centralized selection and enrichment
- **Exports:** `{ selectedEntity, selectedIds, loading, error }`

**Event Listener:**
- **Event:** `parcel-selected` (window event)
- **Handler:** `selectEntity` function
- **Normalization:** Handles both `property` and `properties` keys

**ID Resolution:**
- **Numeric IDs:** Resolved via `/api/properties/resolve?parcelId=...`
- **Non-numeric IDs:** Used directly as `propertyId`
- **Caching:** `resolveCacheRef` (Map: parcelId → propertyId)

**Enrichment Fetch:**
- **Endpoint:** `/api/properties/:propertyId`
- **Caching:** `entityCacheRef` (Map: propertyId → enriched object)
- **Race Protection:** `currentRequestIdRef` (prevents stale responses)

**Evidence:**
```javascript
// useSelectedEntity.js:37-58
const resolveParcelToPropertyId = useCallback(async (parcelId) => {
  if (!parcelId || !isNumericId(parcelId)) return null;
  if (resolveCacheRef.current.has(parcelId)) {
    return resolveCacheRef.current.get(parcelId);
  }
  const res = await fetch(`${API_BASE_URL}/api/properties/resolve?parcelId=${parcelId}`);
  // ...
}, []);
```

**Event Dispatchers:**

| File | Line | Event | Source |
|------|------|-------|--------|
| `MapWorkspace.jsx` | 114-158 | `dispatchParcelSelected()` | Helper function |
| `PropertyCard.jsx` | 4-16 | `dispatchChatSelection()` | Chat card click |
| `MapWorkspace.jsx` | 1134-1218 | Centroid click handler | Centroid marker |
| `MapWorkspace.jsx` | 1638-1694 | AI result click handler | Chat pin |

**UI Consumers:**

| Component | File | Data Source | Status |
|-----------|------|-------------|--------|
| `PropertyPanel` | `src/components/layout/PropertyPanel.jsx` | `useParcelContext()` → `useSelectedEntity()` | ✅ Single owner |
| `PropertyDetailsModal` | `src/components/property/PropertyDetailsModal.jsx` | `useSelectedEntity()` | ✅ Single owner |
| `MapPropertyCard` | `src/components/property/MapPropertyCard.jsx` | `selectedEntity` prop | ✅ Single owner |

**Direct Fetchers:** ❌ **NONE FOUND** (all use `useSelectedEntity`)

### 4.4 UI Component Audit

**MapPropertyCard (Popup):**
- **File:** `src/components/property/MapPropertyCard.jsx`
- **Estimated Value:** Uses fallback chain:
  ```javascript
  property?.estimatedValue ??
  property?.estimated_value ??
  property?.avmValue ??
  property?.avm ??
  property?.valueEstimate ??
  property?.value_estimate ??
  null
  ```
- **Score Display:** `ScoreDonut` component (bottom-right, size 44, strokeWidth 7)
- **Badge:** "Property" badge with `rounded-xl` corners
- **Button:** "View Details" with `h-10`, `rounded-xl`, `bg-[#1877F2]`

**PropertyDetailsModal (Opportunity Card):**
- **File:** `src/components/property/PropertyDetailsModal.jsx`
- **Score Display:** `ScoreDonut` component (top-right, size 64, strokeWidth 11)
- **Score Text Color:** `text-black` (recently updated)
- **Score Tab:** `ScoreDonut` (size 96, strokeWidth 12)

**UI Tech Debt:**
1. **Bundle size:** 4.7 MB JS bundle (large, needs code splitting)
2. **Redux unused:** Redux Toolkit installed but usage unclear
3. **Multiple value field names:** `estimatedValue`, `avmValue`, `mktValue` used inconsistently
4. **Hardcoded Mapbox style:** Default style URL in config (should be env var)

### 4.5 Performance Audit

**Large Renders:**
- `MapWorkspace.jsx`: 2,188 lines (very large component)
- `PropertyDetailsModal.jsx`: 607 lines (large modal)

**Expensive Effects:**
- Parcel loading on every `moveend` (no debounce found)
- Map layer reordering on every layer add/remove

**Debounced/Throttled Handlers:**
- ❌ **Parcel loading NOT debounced** (fires on every pan/zoom)
- ❌ **Map event handlers NOT throttled**

**Caching:**
- ✅ `useSelectedEntity` caches enriched data (`entityCacheRef`)
- ✅ `useSelectedEntity` caches ID resolution (`resolveCacheRef`)
- ✅ `parcelCache` in MapWorkspace (in-memory, no limit)

**Memoization:**
- ✅ `useCallback` used in `useSelectedEntity` for resolvers
- ⚠️ **UNKNOWN:** Whether expensive computations are memoized

**Bundle Size Red Flags:**
- **4.7 MB JS bundle** (very large, exceeds 2 MB warning threshold)
- **No code splitting** (single bundle)
- **Heavy dependencies:** Mapbox GL, Redux, D3, Recharts

---

## 5. BACKEND AUDIT

### 5.1 Server Framework + Structure

**Framework:** Express 4.21.2

**Node Version:** UNKNOWN (not specified in package.json)

**Structure:**
```
src/
├── server.js              # Express app entry
├── routes/                # Route handlers
│   ├── properties.js      # Property CRUD + search
│   ├── parcels.js         # Parcel chunk serving
│   ├── gis.js             # GIS layer endpoints
│   ├── ai.js              # Anthropic Claude API
│   ├── query.js           # Query routing
│   ├── polygonSearches.js # Polygon search CRUD
│   ├── geocode.js         # Geocoding
│   ├── listings.js        # Listings CRUD
│   ├── deals.js           # Deals CRUD
│   └── buyboxes.js        # Buy boxes CRUD
├── services/              # Business logic
│   ├── property-service.js
│   ├── mapserver-service.js
│   └── category-mapper.js
└── middleware/
    └── rateLimiter.js     # Rate limiting
```

### 5.2 Key Endpoints

**Properties Routes (`/api/properties`):**

| Endpoint | Method | Request | Response | Query |
|----------|--------|---------|----------|-------|
| `/:id` | GET | `id` (path param) | `{ success, property }` | Full Property record |
| `/resolve` | GET | `parcelId` (query) | `{ success, propertyId, parcelId }` | ID resolution |
| `/search` | POST | `{ bbox, filters, limit, offset }` | `{ success, properties, count }` | Bbox search |
| `/bbox` | GET | `minLat, maxLat, minLng, maxLng, limit` | `{ success, properties }` | Bbox query |
| `/` | GET | Query params (zip, city, etc.) | `{ success, properties, pagination }` | Filtered search |

**Parcels Routes (`/api/parcels`):**

| Endpoint | Method | Request | Response | Source |
|----------|--------|---------|----------|--------|
| `/chunk-index` | GET | None | Chunk index JSON | File: `data/parcels/chunk_index.json` |
| `/chunk/:key` | GET | `key` (path param) | GeoJSON chunk | File: `data/parcels/chunks/chunk_*.geojson` |
| `/viewport` | GET | `bbox, limit` | `{ type, features, meta }` | GeoJSON chunks (filtered) |
| `/centroids` | GET | None | GeoJSON FeatureCollection | GeoJSON chunks (centroids only) |
| `/parcel/:id` | GET | `id` (path param) | `{ id, properties, geometry }` | GeoJSON chunks (single parcel) |

**GIS Routes (`/api/gis`):**

| Endpoint | Method | Request | Response | Source |
|----------|--------|---------|----------|--------|
| `/layers` | GET | `name` (query) | `{ success, layer }` | Prisma.mapServerRegistry |

**AI Routes (`/api/ai`):**

| Endpoint | Method | Request | Response | Rate Limit |
|----------|--------|---------|----------|------------|
| `/query` | POST | `{ mode, query, bounds, subject }` | Claude API response | 30/15min |

### 5.3 Data Enrichment Logic

**`GET /api/properties/:id`:**

**Query:**
```javascript
const property = await prisma.property.findUnique({
  where: { id: req.params.id }
});
```

**Returns:** Full `Property` record (all columns)

**Fields Included:**
- **Estimated Value:** `avmValue`, `avmMin`, `avmMax`, `mktValue`, `landValue`, `impValue`
- **Mortgage/Debt:** `mortgageAmount`, `mortgageLender`, `mortgageRate`, `mortgageTerm`
- **RECORDER:** `lastSaleDate`, `lastSaleAmount`, `grantorName`, `granteeName`, `isInvestorOwned`, `isForeclosure`, `ownershipYears`
- **Tax:** `totalTax`, `totalDue`, `taxYear`, `isTaxDelinquent`
- **Zoning:** `zoning` (single code string)

**Source:** Single table (`properties`) - no joins

**`POST /api/properties/search`:**

**Query:** Raw SQL with bbox filter:
```sql
SELECT id, "parcelId", address, "siteAddress", ...
FROM properties
WHERE longitude >= $1 AND longitude <= $2
  AND latitude >= $3 AND latitude <= $4
  AND ... (filters)
ORDER BY "motivationScore" DESC NULLS LAST, "mktValue" DESC NULLS LAST
LIMIT $N OFFSET $M
```

**Returns:** Thin properties (selected columns only)

**Enrichment:** None (thin data only)

### 5.4 Resolver Logic

**`GET /api/properties/resolve?parcelId={parcelId}`:**

**Input:** `parcelId` (query parameter, string, numeric)

**Query:**
```javascript
const property = await prisma.property.findUnique({
  where: { parcelId: String(parcelId) },
  select: { id: true, parcelId: true }
});
```

**Returns:**
- **200:** `{ success: true, propertyId: "...", parcelId: "..." }`
- **404:** `{ success: false, error: "No property found for this parcelId" }`

**Error Cases:**
- Missing `parcelId` param → 400
- No property found → 404
- Database error → 500

**ID Format Handling:**
- Normalizes to string: `String(parcelId)`
- Matches on `properties.parcelId` column (unique constraint)

**Mismatch Risk:** LOW (normalization handles string/number)

### 5.5 Caching + Rate Limiting

**Caching:**

**Backend:** ❌ **NO CACHING** (direct Prisma queries)

**Response Headers:**
- Parcel endpoints: `Cache-Control: public, max-age=60` (1 min)
- Centroid endpoint: `Cache-Control: public, max-age=3600` (1 hour)

**Frontend:**
- `useSelectedEntity` caches enriched data (in-memory Map)
- `useSelectedEntity` caches ID resolution (in-memory Map)
- `parcelCache` in MapWorkspace (in-memory Map)

**Rate Limiting:**

**Middleware:** `src/middleware/rateLimiter.js`

**Implementation:** In-memory Map (not Redis)

**Default Limits:**
- Window: 15 minutes
- Max: 30 requests per window
- Key: IP address (or user ID if auth exists)

**Applied To:**
- `/api/ai/query` (30/15min)

**Other Endpoints:** ❌ **NO RATE LIMITING** (unlimited)

**Response Compression:** ❌ **NOT CONFIGURED**

**Pagination:** ✅ Supported (`limit` and `offset` params)

### 5.6 Error Handling and Logging

**Logging:**

**Method:** `console.log`, `console.error`, `console.warn`

**Structure:** Unstructured (no log levels, no JSON)

**Examples:**
```javascript
console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
console.error('Error fetching property:', error);
console.log('📡 Viewport request:', { bbox, limit });
```

**Error Tracking:** ❌ **NONE** (no Sentry, Datadog, etc.)

**Error Handler:**
```javascript
// server.js:85-88
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});
```

**Error Format:** Generic `{ error: '...' }` (no stack traces in production)

---

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

### 7.1 Ingestion Scripts Found

| Script | Purpose | Language | Status |
|--------|---------|----------|--------|
| `import-recorder.py` | RECORDER CSV import | Python | ✅ Exists |
| `import-avm.py` | AVM CSV import | Python | ✅ Exists |
| `ingestRecorderData.cjs` | RECORDER ingestion (Node) | JavaScript | ✅ Exists |
| `import-avm-to-neon.cjs` | AVM import to Neon | JavaScript | ✅ Exists |
| `enrich-from-tcad-api.js` | TCAD API enrichment | JavaScript | ✅ Exists |
| `import-physical-addresses.js` | Address import | JavaScript | ✅ Exists |
| `import-parcels.js` | Parcel import | JavaScript | ✅ Exists |
| `spatial-join-addresses.js` | Address spatial join | JavaScript | ✅ Exists |

**Missing Scripts:**
- ❌ No permits ingestion script
- ❌ No zoning cases ingestion script
- ❌ No flood zone ingestion script

### 7.2 Dataset Ingestion Status

| Dataset | Ingested? | Table Name | Join Key | Row Count | Freshness |
|---------|-----------|------------|----------|-----------|-----------|
| **permits.csv** | ❌ NO | N/A | N/A | 0 | N/A |
| **zoning_cases.csv** | ❌ NO | N/A | N/A | 0 | N/A |
| **TAXASSESSOR_0001.csv** | ✅ YES | `properties` | `parcelId` | 352,431 | Unknown |
| **ATTOM 5.0 Assessor** | ✅ YES | `properties` | `parcelId` | 352,431 | Unknown |
| **ATTOM 5.0 Recorder** | ⚠️ PARTIAL | `properties` | `attomId` / `parcelId` | Unknown | Unknown |
| **ATTOM AVM** | ⚠️ PARTIAL | `properties` | `attomId` | Unknown | Unknown |
| **ATTOM Property Deletes** | ❌ NO | N/A | N/A | 0 | N/A |
| **ATTOM Recorder Deletes** | ❌ NO | N/A | N/A | 0 | N/A |
| **ATTOM Property ↔ Boundary** | ✅ YES | GeoJSON chunks | `parcelId` | ~352k | File-based |
| **ATTOM Parcel GeoJSON** | ✅ YES | GeoJSON chunks | `parcelId` | ~352k | File-based |
| **FEMA Flood GeoJSON** | ❌ NO | N/A | N/A | 0 | API-only |

### 7.3 Data Quality Issues

**Missing IDs:**
- **UNKNOWN:** How many properties lack `parcelId` (should be 0 due to NOT NULL constraint)
- **UNKNOWN:** How many properties lack `attomId` (nullable field)

**Duplicate Keys:**
- **UNKNOWN:** No duplicate detection queries found
- **Constraint:** `parcelId` has unique constraint (prevents duplicates)

**Null Addresses:**
- **Production:** 78.81% missing `siteAddress` (277,735 properties)
- **Local:** 0.95% missing `siteAddress` (3,334 properties)
- **Gap:** Significant production enrichment gap

**Mismatched Parcel IDs:**
- **UNKNOWN:** No validation queries found
- **Risk:** LOW (unique constraint prevents duplicates)

**Missing Estimated Value:**
- **UNKNOWN:** No statistics on `avmValue` coverage
- **Fields:** `avmValue`, `avmMin`, `avmMax` are nullable

**Data Quality Queries Needed:**
```sql
-- Coverage statistics (not run, DDL only)
SELECT 
  COUNT(*) FILTER (WHERE "avmValue" IS NOT NULL) as has_avm,
  COUNT(*) FILTER (WHERE "lastSaleDate" IS NOT NULL) as has_recorder,
  COUNT(*) FILTER (WHERE "mortgageAmount" IS NOT NULL) as has_mortgage,
  COUNT(*) FILTER (WHERE "siteAddress" IS NOT NULL) as has_site_address,
  COUNT(*) FILTER (WHERE "zoning" IS NOT NULL) as has_zoning
FROM properties;
```

---

## 8. GIS LAYERS + TILE READINESS

### 8.1 GIS Layers Currently Supported

**From Code (`src/routes/gis.js`):**

**Hardcoded Canonical Layers:**
```javascript
const CANONICAL = {
  'zoning_districts': { url: '...', layerId: 0 },
  'fema_flood_zones': { url: '...', layerId: 0 },
  'sewer_mains': { url: '...', layerId: 0 },
  // ... etc
};
```

**From Database (`map_server_registry`):**
- **416 MapServers** cataloged
- **32 Layer Sets** defined
- Categories: Buildings, Water Utilities, Floodplain, Sewer Utilities, Gas Utilities, Wetlands, Parcels, Permits, Zoning

**From Frontend (`src/config/mapLayers.json`):**
- Layer definitions for UI toggles
- Categories: Imagery, Parcels, Buildings, Environmental, etc.

### 8.2 Current Map Loading Approach

**Parcels:**
- **Method:** API GeoJSON via `/api/parcels/viewport?bbox=...`
- **Source:** GeoJSON chunk files (not PostGIS)
- **Caching:** In-memory `parcelCache` Map
- **Loading:** On `moveend` event (no debounce)
- **Message:** "Loaded 3000 parcels from API" comes from viewport endpoint

**Centroids:**
- **Method:** API GeoJSON via `/api/parcels/centroids`
- **Source:** GeoJSON chunk files (centroids extracted)
- **Caching:** HTTP cache headers (1 hour)

**AI Results:**
- **Method:** In-memory GeoJSON source (`ai-results-pins`)
- **Source:** Chat query results
- **Caching:** None (cleared on new query)

**GIS Layers:**
- **Method:** MapServer API calls (on-demand)
- **Source:** External MapServer endpoints
- **Caching:** None (API calls on every toggle)

### 8.3 Tile Readiness Assessment

**Current State:**
- ❌ **Cannot produce tiles** (parcels not in PostGIS)
- ❌ **No tile pipeline** (no Tippecanoe, no Mapbox Tileset API integration)
- ✅ **GeoJSON chunks** can be converted to tileset (manual process)

**Required Schema for Tilesets:**

**Parcel Polygons:**
```sql
-- DDL only (not implemented)
CREATE TABLE parcels (
  parcel_id VARCHAR(50) PRIMARY KEY,
  property_id VARCHAR(50),
  geom geometry(Polygon, 4326),
  centroid geometry(Point, 4326),
  owner TEXT,
  acres NUMERIC,
  -- thin fields only for tiles
);
```

**Parcel Centroids:**
```sql
-- DDL only (not implemented)
CREATE TABLE parcel_centroids (
  parcel_id VARCHAR(50) PRIMARY KEY,
  property_id VARCHAR(50),
  geom geometry(Point, 4326),
  has_property BOOLEAN,
  score INTEGER
);
```

**Tile Generation Tools:**
- **Tippecanoe:** Not found in repo
- **Mapbox Tileset API:** Not integrated
- **PostGIS ST_AsMVT:** Not used

### 8.4 Travis County GIS Enrichment Readiness

**Spatial Join Capability:**

**Parcel → Flood Zones:**
- ❌ **NOT POSSIBLE** (flood zones not in PostGIS)
- **Current:** Flood zones accessed via MapServer API
- **Required:** Import FEMA flood GeoJSON to PostGIS table

**Parcel → Zoning:**
- ❌ **NOT POSSIBLE** (zoning polygons not in PostGIS)
- **Current:** Single `zoning` code string in `properties` table
- **Required:** Import zoning district polygons to PostGIS table

**Parcel → Permits:**
- ❌ **NOT POSSIBLE** (permits table does not exist)
- **Required:** Create `permits` table with spatial join capability

**What is Missing:**
1. **Flood zone PostGIS table** (polygons)
2. **Zoning district PostGIS table** (polygons)
3. **Permits table** (points or polygons)
4. **Parcels PostGIS table** (polygons) - currently GeoJSON only

---

## 9. INFRA/DEPLOY + ENV VARS

### 9.1 Frontend Deploy (Netlify)

**Config:** `netlify.toml`

**Build:**
```toml
[build]
  command = "npm run build"
  publish = "dist"
```

**Environment Variables:**
```toml
[build.environment]
  VITE_API_BASE_URL = "https://scoutgptpro-backend.onrender.com/api"
```

**Required Env Vars (Runtime):**
- `VITE_MAPBOX_ACCESS_TOKEN` - Mapbox token (from Netlify dashboard)
- `VITE_MAPBOX_TOKEN` - Alternative name
- `VITE_GOOGLE_MAPS_API_KEY` - Google Street View (optional)

**Deploy Method:**
- **Manual:** `npx netlify deploy --prod --dir=dist`
- **Automatic:** Git push to `main` (if connected)

### 9.2 Backend Deploy (Render)

**Config:** `render.yaml`

**Service:**
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
```

**Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection (sync: false, secret)
- `CLAUDE_API_KEY` - Anthropic API key (sync: false, secret)
- `FRONTEND_URL` - CORS origin (hardcoded: `https://your-app.netlify.app`)
- `BACKEND_URL` - Self URL (hardcoded: `https://scoutgpt-backend.onrender.com`)
- `PORT` - Server port (hardcoded: `3001`)
- `NODE_ENV` - Environment (hardcoded: `production`)

**Deploy Method:**
- **Automatic:** Git push to `main` triggers rebuild

### 9.3 Secrets + Key Management

**Hardcoded Keys Scan:**

**Frontend:**
- ❌ **NO HARDCODED KEYS FOUND** (all use env vars)

**Backend:**
- ❌ **NO HARDCODED KEYS FOUND** (all use env vars)

**Key Storage:**
- **Netlify:** Environment variables in dashboard
- **Render:** Environment variables in dashboard
- **Local:** `.env.local` files (gitignored)

**Secrets Management:**
- **Method:** Platform-native (Netlify/Render dashboards)
- **Rotation:** UNKNOWN (no rotation strategy found)

### 9.4 CORS and Security Posture

**CORS Configuration:**

**Development:**
```javascript
// server.js:25-32
origin: true, // Allow all origins in development
credentials: true,
```

**Production:**
```javascript
// server.js:34-42
origin: process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',')
  : [
      'http://localhost:4028',
      'http://localhost:5173',
      'http://localhost:3000',
      'https://scoutcrm.netlify.app',
      process.env.FRONTEND_URL
    ].filter(Boolean)
```

**Allowed Origins:**
- Development: All origins (`origin: true`)
- Production: Hardcoded list + `FRONTEND_URL` env var

**Auth Strategy:** ❌ **NONE** (no authentication found)

**Security Headers:** ❌ **NOT CONFIGURED** (no helmet.js, etc.)

---

## 10. OBSERVABILITY + RELIABILITY

### 10.1 Logging

**Method:** `console.log`, `console.error`, `console.warn`

**Structure:** Unstructured (no JSON, no log levels)

**Examples:**
```javascript
console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
console.error('Error fetching property:', error);
console.log('📡 Viewport request:', { bbox, limit });
```

**Log Levels:** ❌ **NONE** (all use `console.log`)

**Log Aggregation:** ❌ **NONE** (logs go to stdout/stderr)

**Request Logging:** ✅ Basic (method + path)

**Error Logging:** ✅ Basic (error message only, no stack traces in production)

### 10.2 Error Tracking

**Service:** ❌ **NONE** (no Sentry, Datadog, New Relic, etc.)

**Error Handler:**
```javascript
// server.js:85-88
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});
```

**Error Format:** Generic `{ error: '...' }` (no error IDs, no stack traces)

**Client-Side Errors:** ❌ **NO TRACKING** (no error boundary reporting)

### 10.3 Performance Metrics

**Client Timing:** ❌ **NONE** (no performance API usage)

**Server Timing:** ❌ **NONE** (no response time tracking)

**Database Query Timing:** ❌ **NONE** (no Prisma query logging)

**API Response Times:** ❌ **NOT TRACKED**

### 10.4 Failure Modes

**Known Pain Points (from code comments/logs):**

1. **404s for Numeric IDs:**
   - **Issue:** Centroid clicks dispatch numeric `parcelId`, some don't resolve
   - **Evidence:** Resolver endpoint handles gracefully (returns 404)
   - **Mitigation:** `_unresolvable` flag in event detail

2. **Enrichment Gaps:**
   - **Issue:** Production only 21% enriched vs 99% local
   - **Evidence:** Previous audit reports
   - **Mitigation:** Run TCAD enrichment script on production

3. **Race Conditions:**
   - **Issue:** Rapid clicks can cause stale responses
   - **Evidence:** `currentRequestIdRef` in `useSelectedEntity`
   - **Mitigation:** ✅ Implemented (request ID tracking)

4. **Parcel Loading Performance:**
   - **Issue:** No debounce on `moveend` event
   - **Evidence:** MapWorkspace.jsx fires on every pan/zoom
   - **Mitigation:** ❌ Not implemented

5. **Large Bundle Size:**
   - **Issue:** 4.7 MB JS bundle
   - **Evidence:** `dist/assets/index-CDMG9m7R.js`
   - **Mitigation:** ❌ No code splitting

---

## 11. SECURITY NOTES

### 11.1 Authentication

**Status:** ❌ **NO AUTHENTICATION SYSTEM**

**Evidence:**
- No JWT tokens
- No session management
- No user authentication middleware
- No protected routes

**Rate Limiter:**
- Uses IP address as key (no user ID)
- Comment: "Try to get user ID from auth, fallback to IP"

### 11.2 PII Handling

**PII in Database:**
- `properties.ownerName` - Owner names
- `properties.ownerAddress` - Owner addresses
- `properties.granteeMailAddress` - Grantee mailing addresses
- `properties.siteAddress` - Property addresses

**PII Handling:**
- **Storage:** Stored in plain text (no encryption)
- **Access:** No access controls (all properties publicly accessible)
- **Logging:** PII may be logged in console.log statements

**Compliance:** UNKNOWN (no privacy policy or compliance docs found)

### 11.3 Key Management

**API Keys:**
- `VITE_MAPBOX_ACCESS_TOKEN` - Frontend (exposed in bundle)
- `CLAUDE_API_KEY` - Backend (server-side only)
- `DATABASE_URL` - Backend (server-side only)

**Exposure Risk:**
- **Mapbox token:** ⚠️ **EXPOSED** (frontend bundle, public)
- **Claude API key:** ✅ **PROTECTED** (backend only)
- **Database URL:** ✅ **PROTECTED** (backend only)

**Key Rotation:** UNKNOWN (no rotation strategy found)

### 11.4 Security Headers

**Status:** ❌ **NOT CONFIGURED**

**Missing:**
- No `helmet.js` middleware
- No CSP headers
- No HSTS headers
- No X-Frame-Options
- No X-Content-Type-Options

---

## 12. TRAVIS COUNTY GAP ANALYSIS

### 12.1 Missing Pieces for Full Enrichment

**Critical Missing:**

1. **Permits Table**
   - **Impact:** Cannot show permit history, development activity
   - **Source:** `permits.csv` (if available)
   - **Required:** New table + ingestion script

2. **Zoning Cases Table**
   - **Impact:** Cannot show zoning change history, pending cases
   - **Source:** `zoning_cases.csv` (if available)
   - **Required:** New table + ingestion script

3. **Flood Zone PostGIS Table**
   - **Impact:** Cannot efficiently query flood zones, must use API
   - **Source:** FEMA Flood GeoJSON or MapServer
   - **Required:** New table + PostGIS import

4. **Parcels PostGIS Table**
   - **Impact:** Cannot use spatial queries, cannot generate tiles
   - **Source:** GeoJSON chunks (already have data)
   - **Required:** Migration script (GeoJSON → PostGIS)

5. **AVM Coverage Statistics**
   - **Impact:** Unknown enrichment coverage
   - **Required:** Query to count `avmValue IS NOT NULL`

6. **RECORDER Coverage Statistics**
   - **Impact:** Unknown enrichment coverage
   - **Required:** Query to count `lastSaleDate IS NOT NULL`

**ID Unification:**
- ✅ **WORKING** (`parcelId` → `propertyId` mapping exists)
- ✅ **Resolver endpoint** functional
- ⚠️ **Some centroids unresolvable** (expected, handled gracefully)

**Production Enrichment Gap:**
- ⚠️ **21% vs 99%** (`siteAddress` coverage)
- **Required:** Run TCAD enrichment script on production

### 12.2 Data Quality Issues

**Missing Data:**
- **Production `siteAddress`:** 277,735 missing (78.81%)
- **AVM coverage:** UNKNOWN
- **RECORDER coverage:** UNKNOWN
- **Zoning coverage:** UNKNOWN

**Unusable Data:**
- None identified (all ingested data appears usable)

**Data Freshness:**
- **UNKNOWN:** Last update dates not tracked
- **UNKNOWN:** No update strategy for ATTOM data

---

## 13. CONCRETE NEXT STEPS

### 13.1 Phase 1: Assessment (Non-Breaking)

**Goal:** Understand current state

**Tasks:**
1. **Run coverage queries:**
   ```sql
   SELECT 
     COUNT(*) FILTER (WHERE "avmValue" IS NOT NULL) as has_avm,
     COUNT(*) FILTER (WHERE "lastSaleDate" IS NOT NULL) as has_recorder,
     COUNT(*) FILTER (WHERE "mortgageAmount" IS NOT NULL) as has_mortgage,
     COUNT(*) FILTER (WHERE "siteAddress" IS NOT NULL) as has_site_address
   FROM properties;
   ```

2. **Verify production schema:**
   - Check if `geom` column exists
   - Check if `floodZone` column exists (removed from schema)
   - Check PostGIS extension status

3. **Document actual row counts:**
   - Query `pg_stat_user_tables` for accurate counts
   - Verify `properties` table size

**Risk:** None (read-only queries)

### 13.2 Phase 2: Production Enrichment Fix (Non-Breaking)

**Goal:** Fix production enrichment gap

**Tasks:**
1. **Run TCAD enrichment script on production:**
   - Script: `scripts/enrich-from-tcad-api.js`
   - Target: All properties missing `siteAddress`
   - Expected: ~274k properties enriched

2. **Verify enrichment:**
   - Query `siteAddress` coverage after script
   - Verify `landValue`, `impValue`, `totalTax` populated

**Risk:** Low (additive updates only)

### 13.3 Phase 3: Missing Tables (DDL Only)

**Goal:** Create tables for permits, zoning, flood zones

**DDL for `permits` table:**
```sql
CREATE TABLE IF NOT EXISTS permits (
  id SERIAL PRIMARY KEY,
  permit_number VARCHAR(100) UNIQUE NOT NULL,
  parcel_id VARCHAR(50) NOT NULL,
  property_id VARCHAR(50),
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
  property_id VARCHAR(50),
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

**Risk:** None (new tables, no schema changes to `properties`)

### 13.4 Phase 4: Parcel PostGIS Migration (Non-Breaking)

**Goal:** Convert GeoJSON chunks to PostGIS table

**DDL for `parcels` table:**
```sql
CREATE TABLE IF NOT EXISTS parcels (
  parcel_id VARCHAR(50) PRIMARY KEY,
  property_id VARCHAR(50),
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

**Migration Script (Pseudocode):**
```javascript
// Read chunk_index.json
// For each chunk:
//   Read GeoJSON file
//   For each feature:
//     INSERT INTO parcels (
//       parcel_id,
//       property_id, -- resolve via /api/properties/resolve
//       geom, -- ST_GeomFromGeoJSON(feature.geometry)
//       centroid, -- ST_Centroid(geom)
//       owner, address, acres, etc.
//     )
```

**Rollback:** Keep GeoJSON chunks as backup (non-destructive)

**Risk:** Low (additive, no changes to existing system)

### 13.5 Phase 5: Ingestion Order

1. **Assess coverage** (Phase 1)
2. **Fix production enrichment** (Phase 2)
3. **Create missing tables** (Phase 3 DDL)
4. **Import flood zones** (if GeoJSON available)
5. **Import permits** (if CSV available)
6. **Import zoning cases** (if CSV available)
7. **Migrate parcels to PostGIS** (Phase 4)
8. **Create spatial indexes** (after imports)

### 13.6 Phase 6: Non-Destructive Migration Strategy

**Principles:**
- All new tables are additive (no schema changes to `properties`)
- Keep GeoJSON chunks as backup
- Use `IF NOT EXISTS` for all DDL
- Foreign keys with `ON DELETE SET NULL` (preserve data)

**Rollback Safety:**
- New tables can be dropped without affecting `properties`
- GeoJSON chunks remain unchanged
- No data loss risk

**Testing:**
- Test migrations on local/staging first
- Verify queries work with new tables
- Verify existing functionality unchanged

---

## 14. APPENDIX: FILE REFERENCES

### 14.1 Key Files

**Frontend:**
- `src/hooks/useSelectedEntity.js` - Single enrichment owner
- `src/pages/scout-ai-chat/components/MapWorkspace.jsx` - Map initialization
- `src/components/layout/PropertyPanel.jsx` - Left panel
- `src/components/property/PropertyDetailsModal.jsx` - Property modal
- `src/components/property/MapPropertyCard.jsx` - Map popup card
- `src/config/mapbox.js` - Mapbox configuration
- `netlify.toml` - Netlify deploy config

**Backend:**
- `src/server.js` - Express app entry
- `src/routes/properties.js` - Property endpoints
- `src/routes/parcels.js` - Parcel endpoints
- `src/routes/gis.js` - GIS layer endpoints
- `src/routes/ai.js` - AI/Claude endpoints
- `src/middleware/rateLimiter.js` - Rate limiting
- `prisma/schema.prisma` - Database schema
- `render.yaml` - Render deploy config

**Scripts:**
- `scripts/import-recorder.py` - RECORDER ingestion
- `scripts/import-avm.py` - AVM ingestion
- `scripts/enrich-from-tcad-api.js` - TCAD enrichment
- `scripts/add-geometry-column.js` - PostGIS migration

### 14.2 Database Queries for Verification

**Coverage Statistics:**
```sql
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE "avmValue" IS NOT NULL) as has_avm,
  COUNT(*) FILTER (WHERE "lastSaleDate" IS NOT NULL) as has_recorder,
  COUNT(*) FILTER (WHERE "mortgageAmount" IS NOT NULL) as has_mortgage,
  COUNT(*) FILTER (WHERE "siteAddress" IS NOT NULL) as has_site_address,
  COUNT(*) FILTER (WHERE "zoning" IS NOT NULL) as has_zoning
FROM properties;
```

**PostGIS Status:**
```sql
SELECT extname FROM pg_extension WHERE extname = 'postgis';
SELECT COUNT(*) FROM geometry_columns;
```

**Table Row Counts:**
```sql
SELECT 
  schemaname,
  tablename,
  n_live_tup as row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
```

---

**End of Audit Report**

**Next Action:** Review findings and prioritize implementation phases.

**Note:** This audit is factual and verifiable. All findings are based on code inspection, schema review, and file system analysis. No assumptions were made without evidence.

