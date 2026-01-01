# Debug Parcel ID Matching

**Flag:** `--debugIds`

## Usage

```bash
cd /Users/braydonirwin/scoutgptpro-backend
export DATABASE_URL="your_database_url"
node scripts/ingest-travis-enrichment-local.mjs --zip ~/Downloads/stratmap25-landparcels_48453_lp.zip --limit 10 --truncateStage --debugIds
```

## Output Format

When `--debugIds` is enabled, the script will:

1. **Log all DBF headers** detected in the file
2. **Identify the parcel_id column** being used
3. **Show first 10 records** with:
   - Raw parcel_id from DBF
   - Normalized parcel_id (after normalization)
   - Exists in parcels_travis (TRUE/FALSE)

### Example Output

```
🔍 DEBUG: Detected DBF headers (45 columns):
   1. OBJECTID
   2. prop_id
   3. geo_id
   4. owner_name
   5. situs_address
   ...

   Detected parcel ID column: prop_id

🔍 DEBUG: Loaded 372826 parcel_ids from parcels_travis

🔍 DEBUG: Parcel ID Matching Samples (first 10 records):
   Format: raw_id → normalized_id → exists(true/false)
   Column used: prop_id
   1. "970897" → "970897" → TRUE
   2. "123456" → "123456" → TRUE
   3. "789012" → "789012" → TRUE
   4. "TX-345678" → "345678" → TRUE
   5. "123" → "000123" → FALSE
   6. "456789" → "456789" → TRUE
   7. "ABC123" → "ABC123" → FALSE
   8. "987654" → "987654" → TRUE
   9. "111222" → "111222" → TRUE
   10. "999" → "000999" → FALSE

   Summary: 7 TRUE, 3 FALSE
```

## Interpreting Results

- **TRUE** = Normalized parcel_id exists in `parcels_travis` → Will be enriched
- **FALSE** = Normalized parcel_id NOT found in `parcels_travis` → Will remain in staging only

## If FALSE Dominates

If most samples show FALSE, check:

1. **Column selection** - Is the correct column being used?
2. **Normalization logic** - Does normalization match `parcels_travis.parcel_id` format?
3. **Data format** - Are source IDs in a different format than expected?

The script will propose a single correction if FALSE dominates.


