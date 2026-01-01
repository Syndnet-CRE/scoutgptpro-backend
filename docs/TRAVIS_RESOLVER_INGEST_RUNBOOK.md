# Travis Resolver Ingestion Runbook
**Date:** 2025-12-28  
**Phase:** B (Ingestion)  
**Purpose:** Step-by-step guide for ingesting StratMap and ATTOM data

---

## ⚠️ CRITICAL FINDING

**GEO_ID Format Mismatch Detected**

- **StratMap GEO_ID:** 10-digit numeric (e.g., "0105970604")
- **ATTOM Boundary Match GeoID:** 32-character hash (e.g., "c8e252d18f378a1669232b3b4a0d35b5")

**These formats DO NOT match and cannot be joined directly.**

**Alternative Approach Required:**
- Use `Prop_ID` (6-digit) from StratMap
- Join to ATTOM data via APN field (if available in ATTOM GeoJSON)
- Or use a different ATTOM dataset that includes parcel numbers

---

## Prerequisites

1. **Migration Applied:** Tables must exist before ingestion
2. **Data Files Available:**
   - StratMap DBF: `/Users/braydonirwin/attom_bridge/parcel_boundaries/parcel_boundaries/stratmap24-landparcels_48453_travis_202404.dbf`
   - ATTOM Boundary Match CSV: `~/Downloads/PROPERTYTOBOUNDARYMATCH_PARCEL_0003.csv`
3. **Database Access:** `DATABASE_URL` environment variable set
4. **Python:** `dbfread` package installed (`pip install dbfread`)

---

## Step 1: Apply Migration

**⚠️ DO NOT RUN AUTOMATICALLY - Review migration file first**

```bash
cd /Users/braydonirwin/scoutgptpro-backend

# Review the migration file
cat db/migrations/0001_travis_resolver_and_parcels.sql

# Apply migration (replace $DATABASE_URL with actual connection string)
psql $DATABASE_URL -f db/migrations/0001_travis_resolver_and_parcels.sql

# Verify tables created
psql $DATABASE_URL -c "\dt stg_attom_property_boundary_travis xref_parcel_property_travis parcels_travis"
```

**Expected Output:**
```
                    List of relations
 Schema |              Name               | Type  | Owner
--------+---------------------------------+-------+-------
 public | stg_attom_property_boundary_travis | table | ...
 public | xref_parcel_property_travis     | table | ...
 public | parcels_travis                   | table | ...
```

**Expected Runtime:** < 5 seconds

---

## Step 2: Run Proof Script (Phase A)

**Verify data quality before ingestion:**

```bash
cd /Users/braydonirwin/scoutgptpro-backend
node scripts/prove_travis_resolver.mjs
```

**Review:** `docs/TRAVIS_RESOLVER_PROOF.md`

**Expected Runtime:** 2-5 minutes

---

## Step 3: Ingest StratMap Data

**⚠️ CURRENT STATUS: Blocked by GEO_ID format mismatch**

The ingestion script will:
1. Read StratMap DBF file
2. Extract `Prop_ID` and `GEO_ID` fields
3. Insert into `stg_attom_property_boundary_travis`

**Command:**
```bash
cd /Users/braydonirwin/scoutgptpro-backend
node scripts/ingest_travis_resolver.mjs
```

**Expected Runtime:** 5-10 minutes (374,880 records)

**Expected Output:**
```
📥 Ingesting StratMap data into staging...
  Reading StratMap DBF...
  ✅ Loaded 374,880 records
  Inserting into staging table...
    Inserted 10,000 / 374,880...
    ...
  ✅ Inserted 374,880 records
```

**Verification:**
```sql
SELECT COUNT(*) FROM stg_attom_property_boundary_travis 
WHERE source_file = 'stratmap24-landparcels_48453_travis_202404.dbf';
-- Expected: ~374,880
```

---

## Step 4: Ingest ATTOM Boundary Match CSV

**⚠️ CURRENT STATUS: Will ingest but cannot join to StratMap**

The ingestion script will:
1. Read boundary match CSV
2. Extract `GeoID` and `[ATTOM ID]` fields
3. Insert into `stg_attom_property_boundary_travis`

**Command:** (Same as Step 3 - script handles both)

**Expected Runtime:** 2-3 minutes (409,670 records)

**Verification:**
```sql
SELECT COUNT(*) FROM stg_attom_property_boundary_travis 
WHERE source_file = 'PROPERTYTOBOUNDARYMATCH_PARCEL_0003.csv';
-- Expected: ~409,670
```

---

## Step 5: Populate Xref Table

**⚠️ CURRENT STATUS: BLOCKED - Cannot populate due to format mismatch**

**Current Issue:**
- StratMap uses `GEO_ID` (10-digit numeric)
- ATTOM boundary match uses `GeoID` (32-char hash)
- These cannot be joined

**Alternative Approaches:**

### Option A: Use ATTOM GeoJSON with APN
1. Use `ATTOM_Travis County.geojson` (from zip2)
2. Join `Prop_ID` (StratMap) ↔ `apn` (ATTOM GeoJSON, 6-digit values)
3. Use `id` field from ATTOM GeoJSON as `attom_id`

**SQL:**
```sql
-- This would require ingesting ATTOM GeoJSON first
INSERT INTO xref_parcel_property_travis (parcel_id, attom_id, source)
SELECT 
    sm.prop_id as parcel_id,
    ag.id as attom_id,
    'attom_geojson_apn_match' as source
FROM stg_attom_property_boundary_travis sm
INNER JOIN attom_geojson_travis ag ON sm.prop_id = ag.apn
WHERE sm.source_file = 'stratmap24-landparcels_48453_travis_202404.dbf'
  AND ag.apn IS NOT NULL
  AND LENGTH(ag.apn) = 6
  AND ag.apn ~ '^[0-9]+$'
ON CONFLICT (parcel_id, attom_id) DO NOTHING;
```

### Option B: Direct Prop_ID → ATTOM ID Mapping
If ATTOM data includes parcel numbers that match `Prop_ID`, use those directly.

**Status:** Requires investigation of available ATTOM datasets.

---

## Step 6: Verify Ingestion

**Check staging table:**
```sql
-- Total records
SELECT source_file, COUNT(*) 
FROM stg_attom_property_boundary_travis 
GROUP BY source_file;

-- Sample records
SELECT * FROM stg_attom_property_boundary_travis 
LIMIT 10;
```

**Check xref table:**
```sql
-- Total mappings
SELECT COUNT(*) FROM xref_parcel_property_travis;

-- Sample mappings
SELECT * FROM xref_parcel_property_travis LIMIT 10;

-- Overlap with properties table
SELECT COUNT(DISTINCT x.parcel_id)
FROM xref_parcel_property_travis x
INNER JOIN properties p ON x.parcel_id = p."parcelId";
```

---

## Rollback Procedures

### Rollback Staging Data

```sql
-- Delete staging records
DELETE FROM stg_attom_property_boundary_travis 
WHERE source_file IN (
    'stratmap24-landparcels_48453_travis_202404.dbf',
    'PROPERTYTOBOUNDARYMATCH_PARCEL_0003.csv'
);

-- Verify deletion
SELECT COUNT(*) FROM stg_attom_property_boundary_travis;
```

### Rollback Xref Data

```sql
-- Delete xref records
TRUNCATE TABLE xref_parcel_property_travis;

-- Verify deletion
SELECT COUNT(*) FROM xref_parcel_property_travis;
```

### Drop Tables (Full Rollback)

**⚠️ DESTRUCTIVE - Use with caution**

```sql
DROP TABLE IF EXISTS xref_parcel_property_travis CASCADE;
DROP TABLE IF EXISTS stg_attom_property_boundary_travis CASCADE;
DROP TABLE IF EXISTS parcels_travis CASCADE;
```

---

## Troubleshooting

### Issue: "Required tables do not exist"

**Solution:** Apply migration first (Step 1)

### Issue: "dbfread not installed"

**Solution:**
```bash
pip install dbfread
```

### Issue: "Memory error during ingestion"

**Solution:** Reduce `CHUNK_SIZE` in `ingest_travis_resolver.mjs` (default: 1000)

### Issue: "GEO_ID format mismatch"

**Status:** Expected - see "CRITICAL FINDING" above. Need alternative join strategy.

---

## Next Steps

1. **Investigate ATTOM GeoJSON:** Check if `apn` field can be used to join `Prop_ID`
2. **Alternative ATTOM Dataset:** Find ATTOM dataset with parcel numbers matching `Prop_ID`
3. **Manual Mapping:** If no automated join exists, consider manual mapping for high-value parcels
4. **Update Resolver Endpoint:** Once xref table is populated, update `/api/properties/resolve` to use it

---

## Performance Notes

- **StratMap Ingestion:** ~374k records, ~5-10 minutes
- **Boundary Match Ingestion:** ~409k records, ~2-3 minutes
- **Total Expected Runtime:** 10-15 minutes (excluding xref population)

**Optimization Tips:**
- Use `COPY` for bulk inserts (faster than INSERT)
- Increase `CHUNK_SIZE` if memory allows
- Use transactions for atomicity

---

**Script:** `scripts/ingest_travis_resolver.mjs`  
**Report:** `docs/TRAVIS_RESOLVER_PROOF.md`  
**Last Updated:** 2025-12-28


