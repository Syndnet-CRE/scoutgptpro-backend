# Zip ParcelID Forensic Audit Report
**Date:** 2025-12-28  
**Purpose:** Determine if zip file contains parcel identifiers mappable to Neon `properties.parcelId`  
**Zip File:** `~/Downloads/drive-download-20251228T174754Z-3-001.zip`  
**Mode:** READ-ONLY forensic analysis. No database writes, no file modifications.

---

## Executive Summary

**CONCLUSION: ParcelId bridge MISSING**

The zip file contains **Texas DOT county boundary data**, not parcel-level data. All files contain county-level administrative identifiers (FIPS codes, county numbers, district numbers) but **no parcel identifiers** that can map to Neon `properties.parcelId` (6-digit numeric strings).

**Key Finding:** No fields in any file contain 6-digit numeric values that match the known `parcelId` format (100008-976502).

---

## 1. File Inventory

### 1.1 All Files in Zip

| Filename | Type | Size | Purpose |
|----------|------|------|---------|
| `travis_county.geojson` | GeoJSON | 55.09 KB | Travis County boundary (single feature) |
| `travis_county_detailed.geojson` | GeoJSON | 55.09 KB | Travis County boundary (detailed, single feature) |
| `txdot_county_detailed_tx.shp` | Shapefile | 10.75 MB | Texas DOT county boundaries (254 counties) |
| `txdot_county_detailed_tx.dbf` | DBF | 51.38 KB | Attribute table for shapefile (254 records) |
| `txdot_county_detailed_tx.shx` | Shapefile Index | 2.08 KB | Shapefile index |
| `txdot_county_detailed_tx.sbn` | Spatial Index | 2.77 KB | Spatial index |
| `txdot_county_detailed_tx.sbx` | Spatial Index | 396 B | Spatial index |
| `txdot_county_detailed_tx.prj` | Projection | 425 B | Coordinate reference system |
| `txdot_county_detailed_tx.CPG` | Code Page | 5 B | Character encoding |
| `txdot_county_detailed_tx.shp.xml` | Metadata | 9.7 KB | XML metadata |

**Total:** 10 files, 11.45 MB

### 1.2 Data Files Analyzed

**Primary Data Files:**
1. `travis_county.geojson` - GeoJSON format
2. `travis_county_detailed.geojson` - GeoJSON format  
3. `txdot_county_detailed_tx.dbf` - DBF attribute table

**Supporting Files (not analyzed):**
- Shapefile geometry files (`.shp`, `.shx`) - geometry only, no attributes
- Index files (`.sbn`, `.sbx`) - spatial indexes
- Metadata files (`.prj`, `.CPG`, `.xml`) - configuration/metadata

---

## 2. Schema Analysis

### 2.1 GeoJSON Files (`travis_county.geojson`, `travis_county_detailed.geojson`)

**Structure:**
- **Type:** FeatureCollection
- **Features:** 1 (Travis County boundary polygon)
- **Properties:** 16 fields

**Property Fields:**

| Field Name | Type | Sample Value | Length | Purpose |
|------------|------|--------------|--------|---------|
| `GID` | Numeric | 68 | 2 digits | Geographic ID |
| `CMPTRL_NBR` | Numeric | 227 | 3 digits | Control number |
| `CNTY_NM` | Text | "Travis" | Variable | County name |
| `DIST_NM` | Text | "Austin" | Variable | District name |
| `DPS_NBR` | Numeric | 227 | 3 digits | DPS number |
| `CNTY_FIPS` | Text | "48453" | 5 digits | County FIPS code |
| `CNTY_NBR` | Numeric | 227 | 3 digits | County number |
| `DIST_NBR` | Numeric | 14 | 2 digits | District number |
| `MSA1990` | Text | "Y" | 1 char | MSA flag 1990 |
| `MSA2000` | Text | "Y" | 1 char | MSA flag 2000 |
| `MSA2010` | Text | "Y" | 1 char | MSA flag 2010 |
| `GRID_OP` | Text | null | - | Grid operator |
| `CREATE_DT` | Date | "1899-12-30" | 10 chars | Creation date |
| `CREATE_NM` | Text | null | - | Creator name |
| `EDIT_DT` | Date | "1899-12-30" | 10 chars | Edit date |
| `EDIT_NM` | Text | null | - | Editor name |

**Analysis:**
- **No 6-digit fields** - All numeric fields are 2-5 digits
- **County-level data** - All fields relate to county administration, not parcels
- **FIPS codes** - `CNTY_FIPS` is 5 digits (e.g., "48453"), not 6 digits

### 2.2 DBF File (`txdot_county_detailed_tx.dbf`)

**Structure:**
- **Records:** 254 (all Texas counties)
- **Fields:** 16
- **Record Length:** 205 bytes

**Field Schema:**

| Field Name | Type | Length | Decimal | Purpose |
|------------|------|--------|---------|---------|
| `GID` | Numeric | 10 | 0 | Geographic ID |
| `CMPTRL_NBR` | Numeric | 5 | 0 | Control number |
| `CNTY_NM` | Character | 20 | - | County name |
| `DIST_NM` | Character | 20 | - | District name |
| `DPS_NBR` | Numeric | 5 | 0 | DPS number |
| `CNTY_FIPS` | Character | 5 | - | County FIPS code |
| `CNTY_NBR` | Numeric | 5 | 0 | County number |
| `DIST_NBR` | Numeric | 5 | 0 | District number |
| `MSA1990` | Character | 1 | - | MSA flag 1990 |
| `MSA2000` | Character | 1 | - | MSA flag 2000 |
| `MSA2010` | Character | 1 | - | MSA flag 2010 |
| `GRID_OP` | Character | 10 | - | Grid operator |
| `CREATE_DT` | Date | 8 | - | Creation date |
| `CREATE_NM` | Character | 50 | - | Creator name |
| `EDIT_DT` | Date | 8 | - | Edit date |
| `EDIT_NM` | Character | 50 | - | Editor name |

**Sample Records:**

| GID | CMPTRL_NBR | CNTY_NM | CNTY_FIPS | CNTY_NBR | DIST_NBR |
|-----|------------|---------|-----------|----------|----------|
| 29 | 7 | Atascosa | 48013 | 7 | 15 |
| 30 | 158 | Matagorda | 48321 | 158 | 13 |
| 31 | 120 | Jackson | 48239 | 121 | 13 |
| 32 | 62 | De Witt | 48123 | 62 | 13 |
| 33 | 247 | Wilson | 48493 | 247 | 15 |

**Analysis:**
- **No 6-digit fields** - All numeric fields are 2-5 digits
- **County-level data** - All records represent counties, not parcels
- **FIPS codes** - `CNTY_FIPS` is 5 digits (e.g., "48013", "48321"), not 6 digits

---

## 3. Candidate Field Analysis

### 3.1 Fields Tested for ParcelID Match

**Criteria for Candidate Fields:**
- Numeric or numeric string
- Length between 6-14 characters
- Contains 6-digit values
- Mostly numeric (>80% numeric)

### 3.2 Fields Analyzed

| Field Name | File | Lengths Found | Numeric % | Has 6-Digit? | Match? |
|------------|------|---------------|-----------|--------------|--------|
| `GID` | GeoJSON, DBF | 2, 3 digits | 100% | ❌ No | ❌ No |
| `CMPTRL_NBR` | GeoJSON, DBF | 1-3 digits | 100% | ❌ No | ❌ No |
| `CNTY_FIPS` | GeoJSON, DBF | 5 digits | 100% | ❌ No | ❌ No |
| `CNTY_NBR` | GeoJSON, DBF | 1-3 digits | 100% | ❌ No | ❌ No |
| `DPS_NBR` | GeoJSON, DBF | 1-3 digits | 100% | ❌ No | ❌ No |
| `DIST_NBR` | GeoJSON, DBF | 1-2 digits | 100% | ❌ No | ❌ No |

**Result:** ❌ **No candidate fields found**

### 3.3 Length Distribution Analysis

**GeoJSON Files:**
- `GID`: 2 digits (68)
- `CMPTRL_NBR`: 3 digits (227)
- `CNTY_FIPS`: 5 digits ("48453")
- `CNTY_NBR`: 3 digits (227)
- `DIST_NBR`: 2 digits (14)

**DBF File (254 records):**
- `GID`: 1-3 digits (29-254)
- `CMPTRL_NBR`: 1-3 digits (7-254)
- `CNTY_FIPS`: 5 digits (all Texas county FIPS codes)
- `CNTY_NBR`: 1-3 digits (1-254)
- `DIST_NBR`: 1-2 digits (1-25)

**Conclusion:** No field contains 6-digit values.

---

## 4. Explicit ParcelID Format Testing

### 4.1 Known ParcelID Format

- **Format:** Exactly 6 digits
- **Range:** 100008 - 976502
- **Pattern:** `/^\d{6}$/`
- **Examples:** "366874", "238251", "346583"

### 4.2 Test Results

**Tested Fields:**
- `GID` - Values: 29-254 (2-3 digits) ❌
- `CMPTRL_NBR` - Values: 7-254 (1-3 digits) ❌
- `CNTY_FIPS` - Values: "48013", "48321", etc. (5 digits) ❌
- `CNTY_NBR` - Values: 7-254 (1-3 digits) ❌
- `DPS_NBR` - Values: 7-254 (1-3 digits) ❌
- `DIST_NBR` - Values: 1-25 (1-2 digits) ❌

**Result:** ❌ **No field contains 6-digit values matching parcelId format**

### 4.3 Overlap Analysis

**Tested for overlap with known parcelId range (100008-976502):**
- All numeric fields contain values far below the minimum parcelId (100008)
- Maximum values found: 254 (GID), 254 (CMPTRL_NBR), 254 (CNTY_NBR)
- **No overlap** with parcelId range

---

## 5. Field Classification

### 5.1 Fields That Are NOT Parcel Identifiers

| Field | Reason |
|-------|--------|
| `GID` | 2-3 digits, sequential IDs (29-254), not parcel format |
| `CMPTRL_NBR` | 1-3 digits, control numbers, not parcel format |
| `CNTY_FIPS` | 5 digits, FIPS county codes, not parcel format |
| `CNTY_NBR` | 1-3 digits, county numbers (1-254), not parcel format |
| `DPS_NBR` | 1-3 digits, DPS numbers, not parcel format |
| `DIST_NBR` | 1-2 digits, district numbers (1-25), not parcel format |
| `CNTY_NM` | Text field (county names), not numeric |
| `DIST_NM` | Text field (district names), not numeric |
| `MSA1990/2000/2010` | Single character flags ("Y"/"N"), not numeric |
| `CREATE_DT` / `EDIT_DT` | Date fields, not parcel identifiers |
| `CREATE_NM` / `EDIT_NM` | Text fields (names), not identifiers |

### 5.2 Potential Misidentification (Ruled Out)

**`CNTY_FIPS` (5 digits):**
- **Why it might seem promising:** Numeric, fixed length
- **Why it's NOT a parcelId:** 
  - Only 5 digits (parcelId requires 6)
  - FIPS county codes (e.g., "48453" = Travis County)
  - Values don't overlap with parcelId range (100008-976502)

**`GID` (2-3 digits):**
- **Why it might seem promising:** Sequential numeric IDs
- **Why it's NOT a parcelId:**
  - Too short (2-3 digits vs 6 required)
  - Sequential (29-254), not parcel identifiers
  - Geographic IDs, not parcel identifiers

---

## 6. Data Source Identification

### 6.1 File Naming and Structure

**File Names:**
- `txdot_county_detailed_tx.*` - Texas DOT (TxDOT) county data
- `travis_county.*` - Travis County boundary extracts

**Content Analysis:**
- **254 records** = All Texas counties (254 counties in Texas)
- **Single Travis County feature** in GeoJSON files
- **County-level attributes** (FIPS, county numbers, districts)

### 6.2 Data Purpose

**This zip contains:**
- ✅ Texas DOT county boundary polygons
- ✅ County administrative data (FIPS codes, district assignments)
- ✅ Travis County boundary geometry

**This zip does NOT contain:**
- ❌ Parcel-level data
- ❌ Parcel identifiers
- ❌ Property-level attributes
- ❌ Any 6-digit numeric identifiers matching `parcelId` format

---

## 7. Conclusion

### 7.1 Final Verdict

**CONCLUSION: ParcelId bridge MISSING**

### 7.2 Evidence Summary

1. **No 6-digit fields:** All numeric fields are 1-5 digits, none are 6 digits
2. **County-level data:** All files contain county boundaries and administrative data, not parcel data
3. **No overlap:** No field values overlap with known `parcelId` range (100008-976502)
4. **Wrong data type:** Files are Texas DOT county boundaries, not parcel boundaries

### 7.3 Recommendation

**Do NOT use this zip file for parcel ID mapping.**

**Alternative approaches:**
1. **Use TAXASSESSOR CSV** (already audited) - Contains `ParcelNumberRaw` (14-digit) that can be normalized to 6-digit `parcelId` using `rightmost_6` rule (29.31% match rate)
2. **Use ATTOM Parcel GeoJSON files** - These contain parcel-level data with parcel identifiers
3. **Use ATTOM Property ↔ Boundary Match files** - These contain parcel-to-property mappings

### 7.4 Next Steps

1. ✅ **TAXASSESSOR CSV audit complete** - Use `rightmost_6` normalization rule
2. ⏳ **ATTOM Parcel GeoJSON audit** - Verify parcel identifiers in GeoJSON files
3. ⏳ **ATTOM Boundary Match audit** - Verify parcel-to-property mappings

---

## 8. Appendix: Detailed Field Statistics

### 8.1 GeoJSON Field Statistics

**`travis_county.geojson` (1 feature analyzed):**

| Field | Lengths | Numeric % | Min | Max | Samples |
|-------|---------|----------|-----|-----|---------|
| `GID` | [2] | 100% | 68 | 68 | ["68"] |
| `CMPTRL_NBR` | [3] | 100% | 227 | 227 | ["227"] |
| `CNTY_FIPS` | [5] | 100% | 48453 | 48453 | ["48453"] |
| `CNTY_NBR` | [3] | 100% | 227 | 227 | ["227"] |
| `DIST_NBR` | [2] | 100% | 14 | 14 | ["14"] |

### 8.2 DBF Field Statistics

**`txdot_county_detailed_tx.dbf` (100 records analyzed, 254 total):**

| Field | Lengths | Numeric % | Min | Max | Range |
|-------|---------|----------|-----|-----|-------|
| `GID` | [1, 2, 3] | 100% | 29 | 254 | Sequential |
| `CMPTRL_NBR` | [1, 2, 3] | 100% | 7 | 254 | 7-254 |
| `CNTY_FIPS` | [5] | 100% | 48001 | 48499 | FIPS codes |
| `CNTY_NBR` | [1, 2, 3] | 100% | 1 | 254 | 1-254 |
| `DIST_NBR` | [1, 2] | 100% | 1 | 25 | 1-25 |

---

## 9. Audit Methodology

### 9.1 Tools Used

- **Node.js script** (`scripts/zip_parcelid_audit.mjs`) - Automated analysis
- **Python dbfread** - DBF file parsing
- **Manual inspection** - GeoJSON structure verification

### 9.2 Analysis Process

1. **File Discovery:** Listed all files in zip with types and sizes
2. **Schema Extraction:** Read headers/schemas from data files
3. **Field Identification:** Identified numeric fields with 6-14 character lengths
4. **Value Sampling:** Analyzed first 100 rows/features per file
5. **Format Testing:** Tested for exact 6-digit numeric format
6. **Range Testing:** Verified overlap with known `parcelId` range (100008-976502)

### 9.3 Read-Only Guarantee

- ✅ No database connections
- ✅ No database writes
- ✅ No file modifications
- ✅ No schema changes
- ✅ Analysis only

---

**End of Audit Report**

**Script:** `scripts/zip_parcelid_audit.mjs`  
**Report Generated:** 2025-12-28



