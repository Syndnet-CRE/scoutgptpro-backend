# Demo-Safe Local ZIP Enrichment Commands

**Date:** 2024-12-30  
**Status:** ✅ **READY FOR DEMO**

---

## Final Full Ingestion Commands

### Option 1: From ZIP File
```bash
cd /Users/braydonirwin/scoutgptpro-backend
export DATABASE_URL="your_database_url"
node scripts/ingest-travis-enrichment-local.mjs --zip ~/Downloads/stratmap25-landparcels_48453_lp.zip --truncateStage
```

### Option 2: Direct DBF File (Already Extracted)
```bash
cd /Users/braydonirwin/scoutgptpro-backend
export DATABASE_URL="your_database_url"
node scripts/ingest-travis-enrichment-local.mjs --dbfPath ~/data/travis_landparcels/shp/stratmap25-landparcels_48453_travis_202508.dbf --truncateStage
```

---

## Expected Final Output

```
🚀 Starting Travis County parcel enrichment ingestion (local ZIP)...
📊 Database: host:port/database
👤 User: username
📦 ZIP file: ~/Downloads/stratmap25-landparcels_48453_lp.zip
📦 Unzipping: ~/Downloads/stratmap25-landparcels_48453_lp.zip
✅ Unzipped to: temp_enrichment_1234567890
✅ Detected DBF file: stratmap25-landparcels_48453_travis_202508.dbf
📄 Extracted DBF file: /path/to/temp_enrichment_1234567890/shp/stratmap25-landparcels_48453_travis_202508.dbf
📥 Streaming DBF to staging table...
   File: stratmap25-landparcels_48453_travis_202508.dbf
   Detected parcel ID column: prop_id
   Processed: 372826 rows, staged: 372826
✅ Staged 372826 rows from 372826 total rows

🔄 Matching staging records to parcel_id...
📊 Total parcels_travis records: 372826
   Processed: 372826 staging records, matched: 350000, unmatched: 22826

============================================================
📊 FINAL RUNTIME SUMMARY
============================================================
   DBF source: direct (or "zip" if from ZIP)
   DBF file: ~/data/travis_landparcels/shp/stratmap25-landparcels_48453_travis_202508.dbf
   parcel_id column: prop_id
   Total records read: 372826
   Rows inserted into parcels_travis_enrichment_stage: 372826
   Rows upserted into parcels_travis_enrichment: 350000
   Unmatched parcel_id count: 22826
   Final enriched count: 350000
============================================================

✅ Ingestion complete!
🧹 Cleaned up temp directory: temp_enrichment_1234567890
```

**Exit Code:** `0` (success)

---

## Verification SQL (Proves Enrichment Join)

```sql
SELECT 
  pt.parcel_id,
  pt.geom IS NOT NULL as has_geometry,
  e.owner_name,
  e.situs_address,
  e.market_value,
  e.land_use,
  e.source_layer
FROM parcels_travis pt
INNER JOIN parcels_travis_enrichment e ON pt.parcel_id = e.parcel_id
LIMIT 10;
```

**Expected Result:** Returns 10 rows showing:
- `parcel_id` - Matched parcel ID
- `has_geometry` - `true` (geometry exists)
- `owner_name` - Owner name from enrichment
- `situs_address` - Property address
- `market_value` - Market value
- `land_use` - Land use code
- `source_layer` - `'stratmap25_local'`

---

## Safety Features

### ✅ Cleanup Guarantees
- Temp directory deleted on **success**
- Temp directory deleted on **error**
- Temp directory deleted on **early exit** (Ctrl+C)
- Database pool closed in `finally` block

### ✅ Exit Codes
- **0** - Success (all steps completed)
- **1** - Error (any failure during ingestion)

### ✅ Final Logging
Always includes:
- ZIP path used
- Extracted DBF file path
- parcel_id column used
- Total records read
- Rows inserted into staging
- Rows upserted into enrichment
- Unmatched parcel_id count
- Final enriched count

### ✅ Error Handling
- Fails fast if DATABASE_URL missing
- Fails fast if ZIP file missing
- Fails fast if tables don't exist
- Partial summary logged even on error
- Cleanup always attempted

---

## Quick Test (10 rows)

```bash
cd /Users/braydonirwin/scoutgptpro-backend
export DATABASE_URL="your_database_url"
node scripts/ingest-travis-enrichment-local.mjs --zip ~/Downloads/stratmap25-landparcels_48453_lp.zip --limit 10 --truncateStage
```

---

## Troubleshooting

### Exit Code 1
- Check DATABASE_URL is set
- Check ZIP file exists
- Check migration was run
- Check error message in output

### Temp Directory Not Cleaned
- Check file permissions
- Check disk space
- Manual cleanup: `rm -rf temp_enrichment_*`

### No Matches
- Run with `--debugIds` to see matching samples
- Check parcel_id column detection
- Verify parcels_travis has data

