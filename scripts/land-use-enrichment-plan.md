# Travis County Land Use Enrichment Plan

## Overview
Load 284,959 land use records from CSV into PostgreSQL and enrich the properties table with land use codes and asset classes.

**Source File:** `~/Downloads/Land_Use_Inventory_Detailed_20251231.csv`  
**Target:** Enrich `properties` table with `land_use_code` and `asset_class` based on land use data

---

## Step 1: Create Staging Table

```sql
CREATE TABLE austin_land_use (
    id SERIAL PRIMARY KEY,
    the_geom TEXT,
    objectid INTEGER,
    land_use_id INTEGER,
    land_use VARCHAR(10),
    general_land_use VARCHAR(10),
    parcel_id_10 VARCHAR(20),
    property_id INTEGER,
    created_by VARCHAR(50),
    created_date TIMESTAMP,
    modified_by VARCHAR(50),
    modified_date TIMESTAMP,
    shape_area NUMERIC,
    shape_length NUMERIC
);

-- Add index for faster joins
CREATE INDEX idx_austin_land_use_parcel_id ON austin_land_use(parcel_id_10);
CREATE INDEX idx_austin_land_use_land_use ON austin_land_use(land_use);
```

---

## Step 2: Load CSV Data

### Option A: Using psql \copy command (recommended)

```bash
psql $DATABASE_URL -c "\copy austin_land_use(the_geom, objectid, land_use_id, land_use, general_land_use, parcel_id_10, property_id, created_by, created_date, modified_by, modified_date, shape_area, shape_length) FROM '~/Downloads/Land_Use_Inventory_Detailed_20251231.csv' WITH (FORMAT csv, HEADER true, QUOTE '\"', ESCAPE '\"')"
```

### Option B: Using COPY command (if running as superuser)

```sql
COPY austin_land_use(the_geom, objectid, land_use_id, land_use, general_land_use, parcel_id_10, property_id, created_by, created_date, modified_by, modified_date, shape_area, shape_length)
FROM '/Users/braydonirwin/Downloads/Land_Use_Inventory_Detailed_20251231.csv'
WITH (FORMAT csv, HEADER true, QUOTE '"', ESCAPE '"');
```

### Option C: Using Node.js script (if CSV parsing needed)

```javascript
// scripts/load-land-use-csv.mjs
import { PrismaClient } from '@prisma/client';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';

const prisma = new PrismaClient();
const CSV_PATH = process.env.HOME + '/Downloads/Land_Use_Inventory_Detailed_20251231.csv';

// Parse and insert in batches
```

**Note:** The CSV has quoted values and commas in numbers (e.g., "219,277"), so ensure proper CSV parsing.

---

## Step 3: Verify Data Load

```sql
-- Check row count
SELECT COUNT(*) FROM austin_land_use;
-- Expected: 284,959

-- Check sample data
SELECT land_use, general_land_use, COUNT(*) as count
FROM austin_land_use
GROUP BY land_use, general_land_use
ORDER BY count DESC
LIMIT 20;

-- Check parcel_id_10 format
SELECT parcel_id_10, COUNT(*) as count
FROM austin_land_use
GROUP BY parcel_id_10
ORDER BY count DESC
LIMIT 10;

-- Check for NULLs
SELECT 
    COUNT(*) as total,
    COUNT(land_use) as has_land_use,
    COUNT(general_land_use) as has_general_land_use,
    COUNT(parcel_id_10) as has_parcel_id
FROM austin_land_use;
```

---

## Step 4: Create Land Use Lookup Table

```sql
CREATE TABLE land_use_codes (
    code VARCHAR(10) PRIMARY KEY,
    description VARCHAR(100),
    asset_class VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert known codes (expand based on actual data)
INSERT INTO land_use_codes (code, description, asset_class) VALUES
('100', 'Single Family Residential', 'residential'),
('200', 'Multi-Family Residential', 'multifamily'),
('300', 'Commercial/Retail', 'retail'),
('400', 'Office', 'office'),
('500', 'Industrial', 'industrial'),
('600', 'Civic/Institutional', 'civic'),
('700', 'Transportation/Utilities', 'infrastructure'),
('740', 'Transportation/Utilities - Specific', 'infrastructure'),
('800', 'Open Space/Parks', 'land'),
('900', 'Undeveloped/Vacant', 'land');

-- After loading data, discover additional codes:
SELECT DISTINCT land_use, COUNT(*) as count
FROM austin_land_use
WHERE land_use IS NOT NULL
GROUP BY land_use
ORDER BY land_use;
```

---

## Step 5: Add Columns to Properties Table (if not exists)

```sql
-- Add land_use_code column if it doesn't exist
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS land_use_code VARCHAR(10),
ADD COLUMN IF NOT EXISTS general_land_use_code VARCHAR(10);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_properties_land_use_code ON properties(land_use_code);
CREATE INDEX IF NOT EXISTS idx_properties_parcel_id_10 ON properties(SUBSTRING("parcelId", 1, 10));
```

---

## Step 6: Match Parcel IDs

**Important:** Need to understand the relationship between:
- `austin_land_use.parcel_id_10` (10-digit format, e.g., "0125360116")
- `properties.parcelId` (may be different format)

### Check parcel ID formats:

```sql
-- Check properties.parcelId format
SELECT "parcelId", LENGTH("parcelId") as len, SUBSTRING("parcelId", 1, 10) as first_10
FROM properties
LIMIT 20;

-- Check austin_land_use.parcel_id_10 format
SELECT parcel_id_10, LENGTH(parcel_id_10) as len
FROM austin_land_use
LIMIT 20;

-- Try to find matches
SELECT 
    COUNT(DISTINCT p."parcelId") as properties_count,
    COUNT(DISTINCT a.parcel_id_10) as land_use_count,
    COUNT(DISTINCT CASE WHEN SUBSTRING(p."parcelId", 1, 10) = a.parcel_id_10 THEN p."parcelId" END) as matched_count
FROM properties p
LEFT JOIN austin_land_use a ON SUBSTRING(p."parcelId", 1, 10) = a.parcel_id_10;
```

---

## Step 7: Update Properties Table

### Option A: Update using parcel_id_10 match

```sql
UPDATE properties p
SET 
    land_use_code = a.land_use,
    general_land_use_code = a.general_land_use,
    asset_class = COALESCE(
        lc.asset_class,
        CASE 
            WHEN a.general_land_use = '100' THEN 'residential'
            WHEN a.general_land_use = '200' THEN 'multifamily'
            WHEN a.general_land_use = '300' THEN 'retail'
            WHEN a.general_land_use = '400' THEN 'office'
            WHEN a.general_land_use = '500' THEN 'industrial'
            WHEN a.general_land_use = '600' THEN 'civic'
            WHEN a.general_land_use = '700' THEN 'infrastructure'
            WHEN a.general_land_use = '740' THEN 'infrastructure'
            WHEN a.general_land_use = '800' THEN 'land'
            WHEN a.general_land_use = '900' THEN 'land'
            ELSE p.asset_class
        END
    )
FROM austin_land_use a
LEFT JOIN land_use_codes lc ON a.land_use = lc.code
WHERE SUBSTRING(p."parcelId", 1, 10) = a.parcel_id_10
  AND a.land_use IS NOT NULL;
```

### Option B: Update using property_id match (if available)

```sql
UPDATE properties p
SET 
    land_use_code = a.land_use,
    general_land_use_code = a.general_land_use,
    asset_class = COALESCE(
        lc.asset_class,
        CASE 
            WHEN a.general_land_use = '100' THEN 'residential'
            WHEN a.general_land_use = '200' THEN 'multifamily'
            WHEN a.general_land_use = '300' THEN 'retail'
            WHEN a.general_land_use = '400' THEN 'office'
            WHEN a.general_land_use = '500' THEN 'industrial'
            WHEN a.general_land_use = '600' THEN 'civic'
            WHEN a.general_land_use = '700' THEN 'infrastructure'
            WHEN a.general_land_use = '740' THEN 'infrastructure'
            WHEN a.general_land_use = '800' THEN 'land'
            WHEN a.general_land_use = '900' THEN 'land'
            ELSE p.asset_class
        END
    )
FROM austin_land_use a
LEFT JOIN land_use_codes lc ON a.land_use = lc.code
WHERE p."propertyId" = a.property_id::text
  AND a.land_use IS NOT NULL;
```

---

## Step 8: Verify Results

```sql
-- Check how many properties were enriched
SELECT 
    COUNT(*) as total_properties,
    COUNT(land_use_code) as with_land_use_code,
    COUNT(general_land_use_code) as with_general_land_use_code,
    ROUND(100.0 * COUNT(land_use_code) / COUNT(*), 2) as pct_enriched
FROM properties;

-- Check asset_class distribution after enrichment
SELECT asset_class, COUNT(*) as count
FROM properties
GROUP BY asset_class
ORDER BY count DESC;

-- Check land_use_code distribution
SELECT land_use_code, COUNT(*) as count
FROM properties
WHERE land_use_code IS NOT NULL
GROUP BY land_use_code
ORDER BY count DESC
LIMIT 20;

-- Sample enriched properties
SELECT 
    "parcelId",
    land_use_code,
    general_land_use_code,
    asset_class,
    "propertyType"
FROM properties
WHERE land_use_code IS NOT NULL
LIMIT 20;
```

---

## Step 9: Handle Edge Cases

### Duplicate parcel_id_10 in land use data

```sql
-- Check for duplicates
SELECT parcel_id_10, COUNT(*) as count
FROM austin_land_use
GROUP BY parcel_id_10
HAVING COUNT(*) > 1
ORDER BY count DESC
LIMIT 20;

-- If duplicates exist, use most recent or most common land_use
-- Example: Use MODIFIED_DATE or most frequent land_use
```

### Properties without matches

```sql
-- Find properties without land use data
SELECT COUNT(*) as unmatched_count
FROM properties p
LEFT JOIN austin_land_use a ON SUBSTRING(p."parcelId", 1, 10) = a.parcel_id_10
WHERE a.parcel_id_10 IS NULL;
```

---

## Summary of SQL Commands (in order)

1. **Create staging table:**
   ```sql
   CREATE TABLE austin_land_use (...);
   CREATE INDEX idx_austin_land_use_parcel_id ON austin_land_use(parcel_id_10);
   ```

2. **Load CSV:**
   ```bash
   psql $DATABASE_URL -c "\copy austin_land_use(...) FROM '~/Downloads/Land_Use_Inventory_Detailed_20251231.csv' WITH (FORMAT csv, HEADER true, QUOTE '\"', ESCAPE '\"')"
   ```

3. **Verify load:**
   ```sql
   SELECT COUNT(*) FROM austin_land_use;
   ```

4. **Create lookup table:**
   ```sql
   CREATE TABLE land_use_codes (...);
   INSERT INTO land_use_codes VALUES (...);
   ```

5. **Add columns to properties:**
   ```sql
   ALTER TABLE properties ADD COLUMN IF NOT EXISTS land_use_code VARCHAR(10);
   ALTER TABLE properties ADD COLUMN IF NOT EXISTS general_land_use_code VARCHAR(10);
   ```

6. **Check parcel ID matching:**
   ```sql
   -- Run matching analysis queries
   ```

7. **Update properties:**
   ```sql
   UPDATE properties SET ... FROM austin_land_use ...;
   ```

8. **Verify results:**
   ```sql
   -- Run verification queries
   ```

---

## Notes

1. **CSV Format:** The CSV has quoted values and commas in numbers. Ensure proper CSV parsing.
2. **Parcel ID Matching:** Need to verify the exact format match between `parcel_id_10` and `properties.parcelId`.
3. **Land Use Codes:** May need to expand the lookup table based on actual codes found in the data.
4. **Performance:** For 284K rows, the UPDATE may take a few minutes. Consider batching if needed.
5. **Backup:** Consider backing up the properties table before running the UPDATE.

---

## Next Steps After Enrichment

1. Update `parcels_travis_enrichment` table with land use codes
2. Re-run asset class mapping using land use codes as primary source
3. Update discovery engine to use land use codes for filtering
4. Create reports on land use distribution


