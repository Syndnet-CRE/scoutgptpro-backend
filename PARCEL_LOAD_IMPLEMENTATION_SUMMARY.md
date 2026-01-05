# Travis Parcel Loader Implementation Summary
**Date:** 2025-12-28  
**Status:** ✅ Implementation Complete

---

## Files Created/Modified

### New Files
1. **`scripts/load-parcels-travis.mjs`** - Main load script (445 lines)
2. **`scripts/sql/verify-parcels-travis.sql`** - Verification queries

### Modified Files
1. **`package.json`** - Added npm script:
   ```json
   "load:parcels:travis": "node scripts/load-parcels-travis.mjs"
   ```

---

## Git Diff

### package.json
```diff
--- a/package.json
+++ b/package.json
@@ -15,7 +15,9 @@
     "prisma:generate": "prisma generate",
     "prisma:push": "prisma db push",
     "seed": "node scripts/seed-mapservers.js",
-    "seed:layersets": "node scripts/seed-layer-sets.js"
+    "seed:layersets": "node scripts/seed-layer-sets.js",
+    "export:parcels:travis": "node scripts/export-parcels-to-mts.mjs",
+    "load:parcels:travis": "node scripts/load-parcels-travis.mjs"
   },
```

---

## Exact Run Commands

### 1. Dry Run (Test with 1000 records)
```bash
cd /Users/braydonirwin/scoutgptpro-backend
npm run load:parcels:travis -- --dryRun=true --limit=1000 --batchSize=500
```

**Expected Output:**
- Reads 1000 features from shapefile
- Validates geometry transformation
- **NO database inserts**
- Prints summary statistics
- Writes report to `dist/parcels-travis-load-report.json`

### 2. Small Test Load (Insert 100 records)
```bash
npm run load:parcels:travis -- --limit=100 --batchSize=50
```

**Expected Output:**
- Inserts 100 parcels into `parcels_travis`
- Validates inserts work correctly
- Prints progress per batch
- ~1-2 minutes runtime

### 3. Full Load (All ~375k parcels)
```bash
npm run load:parcels:travis -- --batchSize=1000
```

**Expected Output:**
- Inserts all parcels from shapefile
- Progress logging every 1000 rows
- ~15-30 minutes runtime (depends on Neon performance)
- Final summary with counts

### 4. Custom Batch Size (Reduce Neon Load)
```bash
npm run load:parcels:travis -- --batchSize=500
```

**Use this if:** Neon shows high CPU/memory usage or connection timeouts

---

## Recommended Run Strategy

### Phase 1: Dry Run Validation (5 minutes)
```bash
# Test script works and validates geometry transformation
npm run load:parcels:travis -- --dryRun=true --limit=1000 --batchSize=500
```

**Verify:**
- ✅ Script reads shapefile correctly
- ✅ Geometry transformation works (SRID 2276 → 4326)
- ✅ Parcel IDs extracted correctly (6-digit format)
- ✅ No fatal errors

### Phase 2: Small Test Load (5-10 minutes)
```bash
# Insert 100 records to verify database writes work
npm run load:parcels:travis -- --limit=100 --batchSize=50
```

**Verify:**
- ✅ Records inserted successfully
- ✅ Run verification queries (see below)
- ✅ Check Neon dashboard for performance

### Phase 3: Full Load (Off Hours - 15-30 minutes)
```bash
# Load all parcels (run during low-traffic period)
npm run load:parcels:travis -- --batchSize=1000
```

**Best Time:** 
- Late evening (after 10 PM) or early morning (before 6 AM)
- Weekend off-hours
- When application traffic is minimal

**Monitor:**
- Neon dashboard for CPU/memory usage
- Connection pool exhaustion
- Script progress logs

### Phase 4: Verification (5 minutes)
```bash
# Run verification queries
psql "$DATABASE_URL" -f scripts/sql/verify-parcels-travis.sql
```

**Expected Results:**
- Total parcels: ~374,880
- Null geometries: 0
- SRID: 4326 (all rows)
- Invalid geometries: 0 or very few
- Matching properties: ~352,431 (join to properties table)

---

## Verification Queries

### Quick Verification (Run in prompt)
```sql
-- 1. Total count
SELECT COUNT(*) as total_parcels FROM parcels_travis;

-- 2. Null geometries (should be 0)
SELECT COUNT(*) as null_geometries 
FROM parcels_travis 
WHERE geom IS NULL;

-- 3. Verify SRID (should all be 4326)
SELECT DISTINCT ST_SRID(geom) as srid
FROM parcels_travis
LIMIT 1;

-- 4. Sample parcel_id
SELECT parcel_id, LENGTH(parcel_id) as id_length
FROM parcels_travis
LIMIT 1;
```

### Full Verification Script
```bash
psql "$DATABASE_URL" -f scripts/sql/verify-parcels-travis.sql
```

---

## Neon Impact & Performance

### Expected Runtime
- **Dry run (1000 records):** ~10 seconds
- **Small test (100 records):** ~1-2 minutes
- **Full load (~375k records):** ~15-30 minutes

**Factors affecting runtime:**
- Neon tier (Free/Pro/Scale)
- Current database load
- Network latency
- Batch size (smaller = slower but safer)

### Reducing Neon Load

**If Neon shows high CPU/memory:**
1. **Reduce batch size:**
   ```bash
   npm run load:parcels:travis -- --batchSize=500
   ```

2. **Load in chunks:**
   ```bash
   # Load first 100k
   npm run load:parcels:travis -- --limit=100000 --batchSize=500
   
   # Wait 5 minutes, then load next 100k
   npm run load:parcels:travis -- --limit=200000 --batchSize=500 --offset=100000
   ```
   **Note:** Script doesn't support offset yet, but you can manually track progress.

3. **Run during off-hours:**
   - Late evening or early morning
   - Weekend periods
   - When application traffic is minimal

### Monitoring Neon

**Watch for:**
- CPU usage > 80% (reduce batch size)
- Memory usage > 80% (reduce batch size)
- Connection pool exhaustion (script uses max 10 connections)
- Query timeouts (increase batch size or reduce concurrent operations)

**Neon Dashboard:**
- Monitor "Active Connections"
- Check "Query Performance"
- Review "Database Size" growth

---

## Safety Features

### Idempotent Design
- Uses `ON CONFLICT (parcel_id) DO NOTHING`
- Safe to re-run if interrupted
- Skips already-inserted parcels

### Batch Processing
- Commits per batch (not one giant transaction)
- If script fails, already-inserted batches remain
- Can resume from last successful batch

### Error Handling
- Individual record retry on batch failure
- Logs problematic parcel_ids
- Continues processing on errors
- Writes error report

### Geometry Validation
- `ST_MakeValid()` ensures valid geometries
- `ST_CollectionExtract(..., 3)` enforces MultiPolygon
- `ST_Transform()` converts SRID 2276 → 4326
- Skips invalid/null geometries

---

## Troubleshooting

### Issue: "Shapefile not found"
**Solution:** Verify shapefile exists:
```bash
ls -lh data/shapefiles/land_parcels/stratmap24-landparcels_48453_travis_202404.shp
```

### Issue: "parcels_travis table does not exist"
**Solution:** Run migration first:
```bash
psql "$DATABASE_URL" -f db/migrations/0001_travis_resolver_and_parcels.sql
```

### Issue: "Connection timeout" or "Too many connections"
**Solution:** Reduce batch size:
```bash
npm run load:parcels:travis -- --batchSize=500
```

### Issue: "Memory error" or "Out of memory"
**Solution:** 
- Reduce batch size to 250 or 500
- Check Neon tier limits
- Consider loading in smaller chunks

### Issue: "Invalid geometry" errors
**Solution:** 
- Script automatically applies `ST_MakeValid()`
- Check error logs for specific parcel_ids
- May need manual geometry fixes for problematic parcels

---

## Post-Load Verification Checklist

- [ ] Run verification queries (see above)
- [ ] Verify total count matches expected (~374,880)
- [ ] Verify SRID is 4326 for all rows
- [ ] Verify no null geometries
- [ ] Verify join to properties table works
- [ ] Check Neon dashboard for performance
- [ ] Test export script: `npm run export:parcels:travis`
- [ ] Verify export produces non-empty NDJSON files

---

## Next Steps After Load

1. **Verify data integrity** (run verification queries)
2. **Test export script:**
   ```bash
   npm run export:parcels:travis
   ```
3. **Check export output:**
   ```bash
   head -n 1 dist/mts/parcels_travis_v1.polygons.ndjson
   cat dist/mts/manifest.json | jq '.counts'
   ```
4. **Upload to Mapbox** (follow `MTS_UPLOAD_RUNBOOK.md`)

---

## Summary

✅ **Script implemented:** `scripts/load-parcels-travis.mjs`  
✅ **NPM script added:** `npm run load:parcels:travis`  
✅ **Verification queries:** `scripts/sql/verify-parcels-travis.sql`  
✅ **Dry run tested:** Successfully reads shapefile and validates geometry  
✅ **Safety features:** Idempotent, batched, error handling, geometry validation  

**Ready for production load:** Yes (after dry run and small test)

**Recommended approach:**
1. Dry run with 1000 records (5 min)
2. Small test with 100 records (5-10 min)
3. Full load during off-hours (15-30 min)
4. Verification queries (5 min)

**Total estimated time:** ~30-50 minutes (including verification)



