# Travis County Parcel Enrichment Ingestion

**Date:** 2024-12-30  
**Source:** Texas ArcGIS REST API (attributes only, no geometry)  
**Target:** `parcels_travis_enrichment` table  
**Status:** Ready for ingestion

---

## Files Created

1. **`db/migrations/0003_add_parcels_travis_enrichment.sql`** - Migration for enrichment and staging tables
2. **`scripts/ingest-travis-enrichment.mjs`** - Node.js ingestion script
3. **`src/routes/parcels-search.js`** - New search endpoint
4. **`src/routes/parcels.js`** - Added `/api/parcels/:parcelId/enrichment` endpoint

---

## Commands to Run

### 1) Apply Migration

```bash
cd /Users/braydonirwin/scoutgptpro-backend
psql $DATABASE_URL -f db/migrations/0003_add_parcels_travis_enrichment.sql
```

### 2) Run Ingestion (Local ZIP File)

**Test with 10 rows:**
```bash
cd /Users/braydonirwin/scoutgptpro-backend
export DATABASE_URL="your_database_url"
node scripts/ingest-travis-enrichment-local.mjs --zip ~/Downloads/stratmap25-landparcels_48453_lp.zip --limit 10 --truncateStage
```

**Full ingestion:**
```bash
npm run ingest:travis:enrichment:local -- --zip ~/Downloads/stratmap25-landparcels_48453_lp.zip --truncateStage
```

**Or with npm script:**
```bash
npm run ingest:travis:enrichment:local -- --zip ~/Downloads/stratmap25-landparcels_48453_lp.zip
```

### 3) Alternative: ArcGIS REST API Ingestion

```bash
cd /Users/braydonirwin/scoutgptpro-backend
export DATABASE_URL="your_database_url"
npm run ingest:travis:enrichment
```

**With options:**
```bash
# Custom batch size
node scripts/ingest-travis-enrichment.mjs --batchSize=2000

# Truncate staging table first
node scripts/ingest-travis-enrichment.mjs --truncateStage
```

### 3) Verification Queries

**Prove enrichment joined to parcels_travis:**
```bash
psql $DATABASE_URL -c "
SELECT 
  pt.parcel_id,
  pt.geom IS NOT NULL as has_geometry,
  e.owner_name,
  e.situs_address,
  e.market_value,
  e.land_use
FROM parcels_travis pt
INNER JOIN parcels_travis_enrichment e ON pt.parcel_id = e.parcel_id
LIMIT 10;
"
```

**Coverage report:**
```bash
psql $DATABASE_URL <<EOF
SELECT 
  (SELECT COUNT(*) FROM parcels_travis) as total_parcels,
  (SELECT COUNT(*) FROM parcels_travis_enrichment) as enriched_count,
  ROUND(100.0 * (SELECT COUNT(*) FROM parcels_travis_enrichment) / 
    (SELECT COUNT(*) FROM parcels_travis), 2) as coverage_pct;
EOF
```

**Sample enriched records:**
```bash
psql $DATABASE_URL -c "
SELECT parcel_id, owner_name, situs_address, land_use, market_value 
FROM parcels_travis_enrichment 
LIMIT 10;
"
```

**Unmatched staging records (for debugging):**
```bash
psql $DATABASE_URL -c "
SELECT COUNT(*) as unmatched_count 
FROM parcels_travis_enrichment_stage s
LEFT JOIN parcels_travis_enrichment e ON s.detected_id = e.parcel_id
WHERE e.parcel_id IS NULL;
"
```

---

## API Endpoints

### Get Enrichment for Parcel

```bash
GET /api/parcels/:parcelId/enrichment
```

**Example:**
```bash
curl "http://localhost:3001/api/parcels/970897/enrichment"
```

**Response:**
```json
{
  "parcelId": "970897",
  "hasGeometry": true,
  "enrichment": {
    "parcel_id": "970897",
    "owner_name": "John Doe",
    "situs_address": "123 Main St",
    "land_use": "Residential",
    "market_value": 250000,
    ...
  },
  "property": {
    "id": "...",
    "address": "...",
    ...
  }
}
```

### Search Parcels with Filters

```bash
GET /api/parcels/search?bbox=west,south,east,north&ownerAbsentee=true&minMarketValue=100000&landUse=Residential&yearBuiltMin=2000
```

**Example:**
```bash
curl "http://localhost:3001/api/parcels/search?bbox=-97.8,30.2,-97.7,30.3&minMarketValue=100000&limit=50"
```

**Response:**
```json
{
  "features": [
    {
      "parcelId": "970897",
      "centroid": { "type": "Point", "coordinates": [-97.7431, 30.2672] },
      "enrichment": {
        "ownerName": "John Doe",
        "situsAddress": "123 Main St",
        "landUse": "Residential",
        "marketValue": 250000,
        "yearBuilt": 2010
      }
    }
  ],
  "count": 50,
  "bbox": [-97.8, 30.2, -97.7, 30.3],
  "filters": {
    "minMarketValue": "100000"
  }
}
```

---

## Ingestion Process

1. **Fetch Layer Metadata** - Detects parcel ID field and Travis filter
2. **Stage Raw Data** - Loads all records into `parcels_travis_enrichment_stage`
3. **Match to parcel_id** - Normalizes IDs and matches to `parcels_travis.parcel_id`
4. **Upsert Enrichment** - Inserts/updates `parcels_travis_enrichment` table
5. **Coverage Report** - Logs matched %, unmatched count

---

## ID Matching Strategy

**Primary:** Direct match on `parcel_id` (6-digit numeric)

**Fallbacks:**
- Pad with zeros: `"123"` → `"000123"`
- Strip leading zeros: `"000123"` → `"123"`
- Extract numeric portion: `"TX-123456"` → `"123456"`

**Coverage Tracking:**
- Script logs matched vs unmatched counts
- Unmatched records remain in staging table for manual review
- Raw JSON preserved for all records

---

## Expected Output

```
🚀 Starting Travis County parcel enrichment ingestion...
📊 Configuration: batchSize=1000, delay=100ms

📋 STEP 1: Fetching layer metadata...
📡 Fetching layer metadata from: https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer/0?f=json
✅ Detected parcel ID field: prop_id
✅ Travis filter: county_fips IN ('48453','Travis')
📝 Using where clause: county_fips IN ('48453','Travis')

📥 STEP 2: Ingesting into staging table...
📡 Fetching batch: offset=0, batchSize=1000
  Batch 1: staged 1000 records, total=1000
  Batch 2: staged 1000 records, total=2000
  ...
✅ Staged 372826 records

🔄 STEP 3: Matching and upserting...
📊 Total parcels_travis records: 372826
🔄 Matching staging records to parcel_id...

📊 Coverage Report:
   Total parcels_travis: 372826
   Matched: 350000
   Unmatched: 22826
   Enriched count: 350000
   Coverage: 93.88%

✅ Ingestion complete!
```

---

## Notes

- **No Geometry:** Only attributes are ingested (returnGeometry=false)
- **Idempotent:** Re-running updates existing records, doesn't duplicate
- **Raw JSON Preserved:** All original data stored in `raw` JSONB column
- **Prototype Quality:** Matching logic is basic but functional
- **No GDAL Required:** Pure Node.js + PostgreSQL

