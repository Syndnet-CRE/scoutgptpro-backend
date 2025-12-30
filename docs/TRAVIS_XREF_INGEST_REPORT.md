# Travis Xref Ingestion Report
**Date:** 2025-12-28T18:45:55.169Z  
**Purpose:** Safe ingestion of ATTOM GeoJSON apn->id mappings

---

## Step 0: Pre-Ingest Verification

| Metric | Value |
|--------|-------|
| **Total Properties** | 352,431 |
| **Distinct parcelIds** | 352,431 |

---

## Step 1: ATTOM GeoJSON Analysis

| Metric | Value |
|--------|-------|
| **Total Features with 6-Digit APN** | 406,918 |
| **Unique APN Count** | 406,918 |
| **Unique Mappings (1 apn -> 1 attom_id)** | 401,851 |
| **Collisions (1 apn -> multiple attom_ids)** | 5,067 |

---

## Step 2: Ingestion Results

| Metric | Value |
|--------|-------|
| **Unique Mappings Inserted** | 401,851 |
| **Collisions Quarantined** | 5,067 |

---

## Step 3: Post-Ingest Validation

| Metric | Value |
|--------|-------|
| **Xref Table Rows** | 401,851 |
| **Conflicts Table Rows** | 5,067 |
| **Overlap (should be 0)** | 0 ✅ |
| **Mapped parcelIds** | 349,090 |
| **Total Neon parcelIds** | 352,431 |
| **Coverage Rate** | **99.05%** |

---

## Commands

### Apply Migration
```bash
psql "$DATABASE_URL" -f db/migrations/0001_travis_resolver_and_parcels.sql
```

### Run Ingestion
```bash
cd /Users/braydonirwin/scoutgptpro-backend
node scripts/ingest_attom_geojson_xref_safe.mjs
```

### Verify Results
```sql
-- Count unique mappings
SELECT COUNT(*) FROM xref_parcel_property_travis;

-- Count conflicts
SELECT COUNT(*) FROM xref_parcel_property_travis_conflicts;

-- Check for overlap (should return 0)
SELECT COUNT(*) 
FROM xref_parcel_property_travis x
INNER JOIN xref_parcel_property_travis_conflicts c ON x.parcel_id = c.parcel_id;

-- Coverage
SELECT 
  COUNT(DISTINCT x.parcel_id) as mapped,
  (SELECT COUNT(DISTINCT "parcelId") FROM properties WHERE "parcelId" IS NOT NULL) as total,
  ROUND(100.0 * COUNT(DISTINCT x.parcel_id) / 
    (SELECT COUNT(DISTINCT "parcelId") FROM properties WHERE "parcelId" IS NOT NULL), 2) as coverage_pct
FROM xref_parcel_property_travis x
INNER JOIN properties p ON x.parcel_id = p."parcelId";
```

---

**Script:** `scripts/ingest_attom_geojson_xref_safe.mjs`  
**Report Generated:** 2025-12-28T18:45:55.203Z
