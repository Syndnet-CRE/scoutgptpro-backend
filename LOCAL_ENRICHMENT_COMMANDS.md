# Local ZIP/DBF Enrichment Ingestion - Quick Reference

**Date:** 2024-12-30  
**Script:** `scripts/ingest-travis-enrichment-local.mjs`  
**Input:** ZIP file OR direct DBF file

---

## Exact Commands

### 1) Test Run (10 rows) - ZIP

```bash
cd /Users/braydonirwin/scoutgptpro-backend
export DATABASE_URL="your_database_url"
node scripts/ingest-travis-enrichment-local.mjs --zip ~/Downloads/stratmap25-landparcels_48453_lp.zip --limit 10 --truncateStage
```

### 2) Full Ingestion - ZIP

```bash
cd /Users/braydonirwin/scoutgptpro-backend
export DATABASE_URL="your_database_url"
node scripts/ingest-travis-enrichment-local.mjs --zip ~/Downloads/stratmap25-landparcels_48453_lp.zip --truncateStage
```

### 3) Direct DBF File Ingestion

```bash
cd /Users/braydonirwin/scoutgptpro-backend
export DATABASE_URL="your_database_url"
node scripts/ingest-travis-enrichment-local.mjs --dbfPath ~/data/travis_landparcels/shp/stratmap25-landparcels_48453_travis_202508.dbf --truncateStage
```

**Or using npm script:**
```bash
npm run ingest:travis:enrichment:local -- --dbfPath ~/data/travis_landparcels/shp/stratmap25-landparcels_48453_travis_202508.dbf --truncateStage
```

### 3) Verification SQL (Prove Enrichment Joined)

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

---

## Script Features

- ✅ **Auto-detects** CSV/TXT/TSV files in ZIP
- ✅ **Streams** records (no full file load)
- ✅ **Normalizes** parcel_id to match `parcels_travis.parcel_id`
- ✅ **Idempotent** upsert (safe to rerun)
- ✅ **Tracks** matched/unmatched counts
- ✅ **Cleans up** temp directory automatically

---

## Arguments

- `--zip <path>` - **Required.** Path to ZIP file
- `--limit <n>` - **Optional.** Limit rows processed (for testing)
- `--truncateStage` - **Optional.** Clear staging table before ingestion

---

## Expected Output

```
🚀 Starting Travis County parcel enrichment ingestion (local ZIP)...
📊 Database: host:port/database
👤 User: username
📦 Unzipping: ~/Downloads/stratmap25-landparcels_48453_lp.zip
✅ Unzipped to: temp_enrichment_1234567890
✅ Detected CSV file: parcels.csv
📥 Streaming CSV to staging table...
   File: parcels.csv
   Detected parcel ID column: prop_id
   Processed: 1000 rows, staged: 1000
✅ Staged 372826 rows from 372826 total rows

🔄 Matching staging records to parcel_id...
📊 Total parcels_travis records: 372826
   Processed: 372826 staging records, matched: 350000, unmatched: 22826

📊 Coverage Report:
   Total rows read: 372826
   Rows staged: 372826
   Total parcels_travis: 372826
   Matched: 350000
   Unmatched: 22826
   Enriched count: 350000
   Coverage: 93.88%

✅ Ingestion complete!
🧹 Cleaned up temp directory
```

