# Map ID Contract v1
**Technical Inventory: Parcel Geometry & ID Mapping**

**Date:** 2025-01-27  
**Repos:** `scoutgpt_9461` (frontend) + `scoutgptpro-backend` (backend)

---

## 1. Authoritative Parcel Geometry Source

### 1.1 Storage Format
- **Type:** GeoJSON chunk files (not PostGIS tables)
- **Location:** `backend/data/parcels/chunks/*.geojson`
- **Index:** `backend/data/parcels/chunk_index.json`
- **Structure:** FeatureCollection with Polygon geometries

### 1.2 Parcel Feature Schema
```json
{
  "type": "Feature",
  "properties": {
    "id": "970897",                    // parcel_id (numeric string)
    "owner": "CENTURY LAND HOLDINGS II LLC",
    "address": "BLDG 2 STE 200 6500 RIVER PLACE, AUSTIN, TX 78730",
    "acres": "1.0188",
    "taxYear": "2025",
    "totalTax": "35.38",
    "totalDue": "35.23",
    "legalDesc": "DEL CABALLO UNIT 1 BLK 1 LOT 9",
    "yearBuilt": null,
    "landValue": null,
    "impValue": null,
    "mktValue": null,
    "mailingAddr": ", AUSTIN, TX 787301119",
    "centroid": [-97.71549, 30.06657]  // [lng, lat] - pre-computed
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[...]]]  // Full polygon boundary
  }
}
```

### 1.3 Centroid Status
- **Status:** ✅ **Already exist** in chunk files
- **Location:** `properties.centroid` array `[lng, lat]`
- **Generation:** Pre-computed (not generated on-the-fly)
- **No PostGIS required** for centroids (already in GeoJSON)

---

## 2. Property Records (PostgreSQL)

### 2.1 Table: `properties`
- **Model:** `Property` (Prisma schema)
- **Primary Key:** `id` (String, cuid format, e.g., `"cmjew..."`)
- **Unique Constraint:** `parcelId` (String, indexed)

### 2.2 Key Fields
```prisma
model Property {
  id               String    @id @default(cuid())  // property_id
  parcelId         String    @unique               // parcel_id (numeric string)
  apn              String?                         // Assessor's Parcel Number
  address          String?
  siteAddress      String?
  latitude         Float?
  longitude        Float?
  motivationScore  Int?                            // 0-100 score
  // ... 100+ other fields
  @@index([parcelId])
  @@map("properties")
}
```

### 2.3 PostGIS Geometry
- **Polygon Geometry:** ❌ **Not stored** in `properties` table
- **Point Geometry:** ✅ Optional `geom` column (Point, SRID 4326) from lat/lng
- **Polygon Source:** Must use GeoJSON chunk files

---

## 3. ID Mapping Contract

### 3.1 Canonical IDs

| ID Type | Field Name | Type | Example | Source |
|---------|-----------|------|---------|--------|
| **parcel_id** | `properties.id` (chunk) | String (numeric) | `"970897"` | GeoJSON chunk files |
| **parcel_id** | `properties.parcelId` (DB) | String (numeric) | `"970897"` | PostgreSQL `properties` table |
| **property_id** | `properties.id` (DB) | String (cuid) | `"cmjew..."` | PostgreSQL `properties` table |

### 3.2 ID Stability
- **parcel_id:** ✅ **Stable and unique** (numeric string from county assessor)
- **property_id:** ✅ **Stable and unique** (cuid, immutable)
- **Mapping:** One-to-one relationship (`parcelId` → `id` via unique constraint)

### 3.3 ID Resolution Endpoint
- **Endpoint:** `GET /api/properties/resolve?parcelId={parcelId}`
- **Accepts:** `parcelId` as query parameter (string, numeric)
- **Matches On:** `properties.parcelId` column (String)
- **Returns:**
  ```json
  {
    "success": true,
    "propertyId": "cmjew...",
    "parcelId": "970897"
  }
  ```
- **404 Response:** If no property record exists for parcelId

---

## 4. Recommended SQL Export Queries

### 4.1 Parcel Polygons (from GeoJSON chunks)
**Note:** Parcels are stored as GeoJSON files, not PostGIS tables. Use file-based export or convert to PostGIS.

**If converting to PostGIS:**
```sql
-- Create parcels table with PostGIS geometry
CREATE TABLE IF NOT EXISTS parcels (
  parcel_id VARCHAR(50) PRIMARY KEY,
  geom geometry(Polygon, 4326),
  owner TEXT,
  address TEXT,
  acres NUMERIC,
  tax_year INTEGER,
  total_tax NUMERIC,
  centroid geometry(Point, 4326)
);

-- Import from GeoJSON (requires external tool or COPY)
-- Or use ST_GeomFromGeoJSON() if loading via application
```

### 4.2 Parcel Centroids (from GeoJSON chunks)
**Centroids already exist** in `properties.centroid` array. Extract via:

```sql
-- If converting GeoJSON to PostGIS first:
SELECT 
  parcel_id,
  ST_Centroid(geom) AS centroid_geom,
  ST_X(ST_Centroid(geom)) AS lng,
  ST_Y(ST_Centroid(geom)) AS lat,
  acres,
  owner
FROM parcels;
```

### 4.3 Property Records with Mapping
```sql
-- Export properties with parcel mapping
SELECT 
  p.id AS property_id,
  p."parcelId" AS parcel_id,
  p.apn,
  p.address,
  p."siteAddress",
  p."siteCity",
  p."siteState",
  p."siteZip",
  p.latitude,
  p.longitude,
  p."motivationScore" AS score,
  CASE 
    WHEN p."motivationScore" IS NOT NULL THEN true 
    ELSE false 
  END AS has_score,
  CASE 
    WHEN p.id IS NOT NULL THEN true 
    ELSE false 
  END AS has_property
FROM properties p
WHERE p."parcelId" IS NOT NULL
ORDER BY p."parcelId";
```

### 4.4 Combined Export (Parcels + Properties)
```sql
-- Join parcels (if in PostGIS) with properties
SELECT 
  par.parcel_id,
  par.geom AS parcel_geom,
  ST_Centroid(par.geom) AS centroid_geom,
  p.id AS property_id,
  p."motivationScore" AS score,
  CASE WHEN p.id IS NOT NULL THEN true ELSE false END AS has_property,
  par.acres,
  par.owner,
  par.address
FROM parcels par
LEFT JOIN properties p ON p."parcelId" = par.parcel_id
ORDER BY par.parcel_id;
```

---

## 5. Mapbox Tileset Generation Recommendations

### 5.1 Data Source Priority
1. **Parcel Polygons:** GeoJSON chunk files (`data/parcels/chunks/*.geojson`)
2. **Centroids:** Extract `properties.centroid` from chunks (already computed)
3. **Property Mapping:** Join via `parcelId` → `propertyId` using resolver endpoint

### 5.2 Tileset Structure
- **Layer 1: Parcel Polygons**
  - Source: GeoJSON chunks
  - ID field: `properties.id` (parcel_id)
  - Geometry: Polygon
  - Properties: Include `parcel_id`, `owner`, `acres`, `centroid`

- **Layer 2: Parcel Centroids**
  - Source: GeoJSON chunks (`properties.centroid`)
  - ID field: `properties.id` (parcel_id)
  - Geometry: Point (from centroid array)
  - Properties: Include `parcel_id`, `has_property`, `score` (if joined)

### 5.3 ID Field Naming for Tilesets
- **Canonical:** Use `parcel_id` (string, numeric) as primary identifier
- **Optional:** Include `property_id` (string, cuid) if property record exists
- **Format:** Ensure both IDs are strings in tileset properties

---

## 6. Summary

| Item | Status | Details |
|------|--------|---------|
| **Parcel Polygons** | ✅ GeoJSON chunks | `data/parcels/chunks/*.geojson` |
| **Centroids** | ✅ Pre-computed | `properties.centroid` array in chunks |
| **Property Records** | ✅ PostgreSQL | `properties` table |
| **parcel_id → property_id Mapping** | ✅ Unique constraint | `properties.parcelId` → `properties.id` |
| **Resolver Endpoint** | ✅ `/api/properties/resolve` | Matches on `parcelId` field |
| **PostGIS Polygon Storage** | ❌ Not implemented | Use GeoJSON chunks or convert |

---

## 7. Next Steps for Tileset Generation

1. **Extract parcel polygons** from GeoJSON chunks
2. **Extract centroids** from `properties.centroid` arrays
3. **Join property data** via `/api/properties/resolve` or direct DB query
4. **Generate Mapbox tilesets** with:
   - `parcel_id` (string, numeric) as primary ID
   - `property_id` (string, cuid) as optional secondary ID
   - `has_property` (boolean) flag
   - `score` (integer, 0-100) if available

---

**End of Contract**

