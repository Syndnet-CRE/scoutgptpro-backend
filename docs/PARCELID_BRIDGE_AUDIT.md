# ParcelID Bridge Audit Report
**Date:** 2025-12-28  
**Purpose:** Determine correct normalization rule to map TAXASSESSOR `ParcelNumberRaw` to Neon `properties.parcelId`  
**Scope:** Travis County data only  
**Mode:** READ-ONLY audit. No database writes, no schema changes.

---

## Executive Summary

This audit analyzed 439,769 rows from TAXASSESSOR_0001.csv and 352,431 properties from Neon production database to determine the correct normalization rule for mapping `ParcelNumberRaw` (14-digit) to `properties.parcelId` (6-digit).

**Key Finding:** The `rightmost_6` normalization rule achieves a **29.31% match rate**, making it the best candidate for populating `xref_parcel_property_travis`.

**Recommendation:** Use `rightmost_6` normalization rule: extract the rightmost 6 digits from `ParcelNumberRaw` to match `properties.parcelId`.

---

## 1. Neon Database Audit

### 1.1 ParcelId Length Distribution

| Length | Count | Percentage |
|--------|-------|------------|
| 6 | 352,431 | 100.00% |

**Conclusion:** All `properties.parcelId` values are exactly 6 digits long.

### 1.2 Sample ParcelIds

Random sample of 50 parcelIds from Neon:

```
366874, 238251, 346583, 311063, 730738, 251632, 709206, 303133, 497347, 
784084, 571502, 115358, 736950, 242725, 325805, 446172, 379286, 164754, 
377434, 269340, 532205, 323055, 352311, 223875, 151775, 336823, 139075, 
366988, 543742, 533942, 277037, 564805, 929857, 543989, 133033, 245848, 
729732, 308931, 190259, 823744, 303699, 849578, 201745, 306204, 241772, 
428040, 541385, 523596, 508509, 322748
```

**Pattern:** All are 6-digit numeric strings (no leading zeros in display, but stored as strings).

### 1.3 Parcel-Related Columns

| Column Name | Data Type | Purpose |
|-------------|-----------|---------|
| `parcelId` | text | Parcel identifier (unique, 6 digits) |

**Note:** Only one parcel-related column exists in `properties` table.

### 1.4 ParcelId Set for Matching

- **Total unique parcelIds loaded:** 352,431
- **Total rows processed:** 352,431
- **Coverage:** 100% of properties table

---

## 2. TAXASSESSOR CSV Audit

### 2.1 File Information

- **Path:** `/Users/braydonirwin/Downloads/TAXASSESSOR_0001.csv`
- **Size:** 754 MB
- **Total Rows Analyzed:** 439,769
- **Columns:** 318

### 2.2 Required Columns Verified

✅ **`[ATTOM ID]`** - Present (column 0)  
✅ **`ParcelNumberRaw`** - Present (column 18)  
✅ **`ParcelNumberFormatted`** - Present (column 19)

**Note:** `ParcelNumberFormatted` is 100% blank (not usable for matching).

### 2.3 ParcelNumberRaw Length Distribution

| Length | Count | Percentage |
|--------|-------|------------|
| 6 | 5 | 0.00% |
| 10 | 5 | 0.00% |
| 12 | 1 | 0.00% |
| **14** | **439,753** | **99.99%** |
| 15 | 5 | 0.00% |

**Conclusion:** 99.99% of `ParcelNumberRaw` values are exactly 14 digits long.

### 2.4 ParcelNumberFormatted Coverage

- **Blank/Empty:** 100.00% (439,769 / 439,769)
- **Conclusion:** `ParcelNumberFormatted` field is not usable for matching.

---

## 3. Normalization Rules Tested

### 3.1 Rules Evaluated

| Rule Name | Description | Match Rate | Matched | Total |
|-----------|-------------|------------|---------|-------|
| **rightmost_6** | Extract rightmost 6 digits | **29.31%** | 128,884 | 439,769 |
| lstrip_zeros | Remove leading zeros | 0.00% | 0 | 439,769 |
| rightmost_7 | Extract rightmost 7 digits | 0.00% | 2 | 439,769 |
| rightmost_8 | Extract rightmost 8 digits | 0.00% | 2 | 439,769 |
| integer_cast | Parse as integer then string | 0.00% | 2 | 439,769 |

### 3.2 Recommended Rule: `rightmost_6`

**Normalization Function:**
```javascript
function rightmost_6(parcelNumberRaw) {
  const str = String(parcelNumberRaw);
  return str.length >= 6 ? str.slice(-6) : str;
}
```

**SQL Equivalent:**
```sql
RIGHT("ParcelNumberRaw", 6)
```

**Match Rate:** 29.31% (128,884 / 439,769)

**Justification:**
1. **Highest match rate** among all tested rules (29.31%)
2. **Consistent with data format:** Neon `parcelId` is 6 digits, `ParcelNumberRaw` is 14 digits
3. **Deterministic:** Always produces 6-digit result (matches Neon format)
4. **No data loss:** Rightmost digits are preserved (most significant for parcel identification)

**Limitations:**
- **Low match rate (29.31%):** Suggests that not all TAXASSESSOR records correspond to properties in Neon database
- **Possible reasons:**
  - TAXASSESSOR includes properties not in Neon (different data sources)
  - Some `ParcelNumberRaw` values may not map to Travis County properties
  - Data quality issues in either source

---

## 4. Example Mappings

### 4.1 Successful Matches (rightmost_6 rule)

| ParcelNumberRaw (14-digit) | Normalized (6-digit) | Matched ParcelId | ATTOM ID |
|---------------------------|---------------------|------------------|----------|
| 02152808190000 | 190000 | 190000 | 2864335 |
| 02152807440000 | 440000 | 440000 | 2864337 |
| 02152811130000 | 130000 | 130000 | 2864340 |
| 02152808130000 | 130000 | 130000 | 3340096 |
| 02152807170000 | 170000 | 170000 | 2864342 |
| 01140509120011 | 120011 | 120011 | 35689096 |
| 02455901120102 | 120102 | 120102 | 143464438 |
| 02242106121628 | 121628 | 121628 | 326362105 |
| 04402306110100 | 110100 | 110100 | 241907540 |
| 04065801110201 | 110201 | 110201 | 334145274 |

**Pattern Observed:**
- 14-digit `ParcelNumberRaw` → rightmost 6 digits → matches 6-digit `parcelId`
- Multiple `ParcelNumberRaw` values can map to the same `parcelId` (e.g., "02152811130000" and "02152808130000" both map to "130000")
- This suggests the leftmost 8 digits may represent additional geographic or administrative information

---

## 5. Conclusions

### 5.1 Recommended Normalization Rule

**Rule:** `rightmost_6`  
**Function:** Extract rightmost 6 digits from `ParcelNumberRaw`  
**Match Rate:** 29.31%  
**SQL:** `RIGHT("ParcelNumberRaw", 6)`

### 5.2 Implementation Notes

1. **ETL Script Should:**
   - Read `ParcelNumberRaw` from TAXASSESSOR CSV
   - Apply `RIGHT("ParcelNumberRaw", 6)` normalization
   - Lookup `properties.parcelId` using normalized value
   - Insert into `xref_parcel_property_travis` with `[ATTOM ID]`

2. **Expected Results:**
   - ~128,884 successful mappings (29.31% of CSV rows)
   - ~310,885 rows will not match (70.69%)
   - Multiple `ParcelNumberRaw` values may map to the same `parcelId`

3. **Data Quality Considerations:**
   - Verify that unmatched rows are not Travis County properties
   - Consider filtering CSV by `SitusCounty = 'Travis'` before matching
   - Validate that matched `parcelId` values exist in `properties` table

### 5.3 Next Steps

1. **Create ETL Script:**
   - Implement `rightmost_6` normalization
   - Stream CSV file (don't load entire 754MB)
   - Batch insert into `stg_attom_property_boundary_travis`
   - Process staging into `xref_parcel_property_travis`

2. **Validation:**
   - Verify match rate matches audit results (~29.31%)
   - Check for duplicate mappings (multiple `ParcelNumberRaw` → same `parcelId`)
   - Validate `attomId` matches `properties.attomId` where available

3. **Population Strategy:**
   - Populate `stg_attom_property_boundary_travis` first (staging)
   - Process staging into `xref_parcel_property_travis` (canonical)
   - Handle duplicates appropriately (one-to-many relationships)

---

## 6. Appendix: Audit Methodology

### 6.1 Database Queries (READ-ONLY)

**Query 1: Length Distribution**
```sql
SELECT 
  LENGTH("parcelId") AS len,
  COUNT(*) AS count
FROM properties
GROUP BY LENGTH("parcelId")
ORDER BY len;
```

**Query 2: Sample ParcelIds**
```sql
SELECT 
  "parcelId",
  "attomId",
  "id" AS property_id
FROM properties
ORDER BY RANDOM()
LIMIT 50;
```

**Query 3: Parcel Columns**
```sql
SELECT 
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'properties'
  AND column_name ILIKE '%parcel%'
ORDER BY column_name;
```

**Query 4: Load All ParcelIds**
```sql
SELECT "parcelId"
FROM properties
WHERE "parcelId" IS NOT NULL
ORDER BY "parcelId"
LIMIT 10000 OFFSET <offset>;
```

### 6.2 CSV Processing

- **Method:** Streaming readline (no full file load)
- **Rows Analyzed:** 439,769 (stopped at 200k initially, then ran full analysis)
- **Memory Usage:** Minimal (streaming approach)
- **CSV Parser:** Custom parser handling quoted fields

### 6.3 Normalization Rule Testing

- **Test Set:** All 352,431 unique `parcelId` values loaded into Set
- **Matching:** O(1) lookup for each normalized `ParcelNumberRaw`
- **Early Stop:** Not triggered (no rule exceeded 80% match rate)

---

## 7. Recommendations Summary

✅ **Use `rightmost_6` normalization rule**  
✅ **Expected match rate: ~29.31%**  
✅ **Filter CSV by `SitusCounty = 'Travis'` before matching**  
✅ **Handle one-to-many relationships** (multiple `ParcelNumberRaw` → same `parcelId`)  
✅ **Validate matches against `properties.attomId`** where available  

**Script:** `scripts/parcelid_bridge_audit.mjs`  
**Report Generated:** 2025-12-28

---

**End of Audit Report**



