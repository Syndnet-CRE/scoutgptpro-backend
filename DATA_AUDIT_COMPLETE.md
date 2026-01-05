# Comprehensive Data Audit - Travis County Enrichment

## 📁 DATA FILES AUDIT

### 1. Shapefile: stratmap25-landparcels_48453_travis_202508.dbf
**Location:** `/tmp/travis_shapefile_extract/shp/`  
**Size:** 1.7 GB  
**Records:** 834,936  
**Source:** TXGIO (Texas Geographic Information Office)

#### Columns (34):
1. `Prop_ID` - Parcel identifier
2. `GEO_ID` - Geographic identifier
3. `OWNER_NAME` - Owner name
4. `NAME_CARE` - Name care of
5. `LEGAL_AREA` - Legal area
6. `LGL_AREA_U` - Legal area unit
7. `GIS_AREA` - GIS calculated area (acres)
8. `GIS_AREA_U` - GIS area unit
9. `LEGAL_DESC` - Legal description
10. `STAT_LAND_` - State land use code (⚠️ EMPTY)
11. `LOC_LAND_U` - Local land use code (⚠️ EMPTY)
12. `LAND_VALUE` - Land value
13. `IMP_VALUE` - Improvement value
14. `MKT_VALUE` - Market value
15. `SITUS_ADDR` - Site address
16. `SITUS_NUM` - Site number
17. `SITUS_STRE` - Site street
18. `SITUS_ST_1` - Site street 1
19. `SITUS_ST_2` - Site street 2
20. `SITUS_CITY` - Site city
21. `SITUS_STAT` - Site state
22. `SITUS_ZIP` - Site ZIP
23. `MAIL_ADDR` - Mailing address
24. `MAIL_LINE1` - Mailing line 1
25. `MAIL_LINE2` - Mailing line 2
26. `MAIL_CITY` - Mailing city
27. `MAIL_STAT` - Mailing state
28. `MAIL_ZIP` - Mailing ZIP
29. `SOURCE` - Data source
30. `DATE_ACQ` - Date acquired
31. `FIPS` - FIPS code
32. `COUNTY` - County name
33. `TAX_YEAR` - Tax year
34. `YEAR_BUILT` - Year built

#### Sample Rows (20):

| Prop_ID | OWNER_NAME | LEGAL_DESC | MKT_VALUE | GIS_AREA | LOC_LAND_U | STAT_LAND_ |
|---------|------------|------------|-----------|----------|------------|------------|
| 0100050259 | KINNEY AVENUE BAPTIST CHURCH | LOT A RESUB OF LOTS 6-8 WENDLANDT | 738824 | 31.58 | NULL | NULL |
| 0100050266 | NEALE WILLIAM B | LOT 4 HALDEMAN LAMAR SUBD | 75963 | 2.07 | NULL | NULL |
| 0100050317 | 2021 SOUTH LAMAR LP | 0.5959 AC OF LOT 8-9 BLK 1 FREDERICKSBURG ROAD ACRES | 297856 | 6.04 | NULL | NULL |
| 0100050401 | CITY OF AUSTIN | TRI OF LOT 7 FREDERICKSBURG ROAD ACRES 2 | 28854 | 0.45 | NULL | NULL |
| 0100050417 | BUSTAMANTE MANUEL F & JILL | 50X164 FT AV OF LOT 13 EVERGREEN HEIGHTS | 126600 | 2.04 | NULL | NULL |
| 0100050501 | RD LAMAR LLC | .37 ACR OF LOT 12 EVERGREEN HEIGHTS | 513020 | 4.11 | NULL | NULL |
| 0100050702 | FC ZILKER HOUSING LP | 0.51AC OF LOT 11 EVERGREEN HEIGHTS | 588000 | 5.48 | NULL | NULL |
| 0100050703 | AUSPRO ENTERPRISES LP | 112.5X180.19 FT AV OF LOT 11 EVERGREEN HEIGHTS | 344350 | 4.97 | NULL | NULL |
| 0100060104 | ZILKER REDBUD GROUP LLC | ABS 8 SUR 20 DECKER I ACR .93 | 503700 | 9.99 | NULL | NULL |
| 0100060110 | STUDER YURIKO ISHIYAMA | E44 FT OF N135.7 FT OF LOT 34 * &W 6FT OF N135 FT | 71649 | 1.71 | NULL | NULL |

---

### 2. CSV Files

#### A. property_types.csv
**Location:** `data/exports/property_types.csv`  
**Size:** 8.8 MB

**Columns:**
- `parcelId`
- `propertyType`
- `is_vacant_land`

**Sample Rows:**
```
parcelId,propertyType,is_vacant_land
735549,Single Family,false
204689,Vacant Land,true
277067,Single Family,false
290704,Vacant Land,true
```

#### B. enrichment_data.csv
**Location:** `data/exports/enrichment_data.csv`  
**Size:** 28 MB

#### C. avm_data.csv
**Location:** `data/exports/avm_data.csv`  
**Size:** 15 MB

#### D. avm_matches_local.csv
**Location:** `data/exports/avm_matches_local.csv`  
**Size:** 15 MB

---

## 🗄️ DATABASE TABLES AUDIT

### 1. properties
**Rows:** 352,431  
**Columns:** 80 total

**Key Columns:**
- `parcelId` - Parcel identifier
- `owner` - Owner name
- `ownerName` - Owner name (alternate)
- `address` - Property address
- `propertyType` - Property type
- `asset_class` - Asset class (mapped)
- `mktValue` - Market value
- `landValue` - Land value
- `acres` - Acreage
- `yearBuilt` - Year built
- `latitude` / `longitude` - Coordinates

**Sample Rows (20):**

| parcelId | owner | propertyType | asset_class | acres | mktValue |
|----------|-------|--------------|-------------|-------|----------|
| 961144 | VPTM EASTON PARK LB LLC | Vacant Land | land | 0.1897 | |
| 960852 | VPTM EASTON PARK LB LLC | Vacant Land | land | 0.1897 | |
| 960693 | VPTM EASTON PARK LB LLC | Vacant Land | land | 0.1897 | |
| 198979 | RIVERA MOISES & JENNIFE | Vacant Land | land | 0.2582 | |
| 965560 | CEARLEY TRACT DEVELOPME | Agricultural | land | 58 | |

**Asset Class Distribution:**
- `other`: 255,367 (72.5%)
- `land`: 91,813 (26.0%)
- `commercial`: 3,350 (1.0%)
- `multifamily`: 1,040 (0.3%)
- `retail`: 355 (0.1%)
- `hospitality`: 290 (0.1%)
- `office`: 148 (0.0%)
- `industrial`: 34 (0.0%)
- `self_storage`: 22 (0.0%)
- `mobile_home_park`: 12 (0.0%)

---

### 2. parcels_travis_enrichment_stage
**Rows:** 834,936  
**Columns:** 4

**Columns:**
- `id` - BigInt primary key
- `raw` - JSONB (contains all shapefile fields)
- `detected_id` - Detected parcel ID
- `ingested_at` - Ingestion timestamp

**Sample Rows (20):**

| id | detected_id | ingested_at |
|----|-------------|-------------|
| 2504809 | 0100050259 | 2025-12-30 |
| 2504810 | 0100050266 | 2025-12-30 |
| 2504811 | 0100050317 | 2025-12-30 |

**Raw JSONB contains:**
- Prop_ID, OWNER_NAME, LEGAL_DESC, MKT_VALUE, GIS_AREA, etc.
- All 34 shapefile fields

---

### 3. parcels_travis_enrichment
**Rows:** 27,546  
**Columns:** 37

**Key Columns:**
- `parcel_id` - Parcel identifier
- `owner_name` - Owner name
- `legal_desc` - Legal description
- `land_value` - Land value
- `market_value` - Market value
- `acres` - Acreage
- `land_use_code` - Land use code (⚠️ mostly empty)
- `land_use_description` - Land use description (⚠️ mostly empty)
- `zoning_code` - Zoning code (⚠️ mostly empty)
- `flood_zone` - Flood zone

**Sample Rows (20):**

| parcel_id | owner_name | legal_desc | market_value | acres |
|-----------|------------|------------|--------------|-------|
| 100102 | KIKAPU LLC | | | |
| 100104 | SIERRA NATALIO | | | |
| 100105 | CONEVERY ROBERT | | | |

---

### 4. owners
**Rows:** 85,579  
**Columns:** 10

**Columns:**
- `id` - Owner ID
- `ownerNameRaw` - Raw owner name
- `ownerNameNorm` - Normalized owner name
- `mailingAddressRaw` - Raw mailing address
- `mailingAddressNorm` - Normalized mailing address
- `mailingState` - Mailing state
- `entityType` - Entity type (PERSON, LLC, INC, etc.)
- `isCorporate` - Is corporate flag

**Sample Rows (20):**

| id | ownerNameRaw | entityType | isCorporate |
|----|--------------|------------|-------------|
| 698c5d7c7bd4704 | #1 AUSTIN STONE | LLC | true |
| 97ede19fc030ce9 | #40 REAL ESTATE | LLC | true |
| 9ed6c64906d1e4e | (100.00) BOURQU | PERSON | false |

---

### 5. owner_features_tx
**Rows:** 85,579  
**Columns:** 9

**Columns:**
- `ownerId` - Owner ID
- `parcelCountTx` - Parcel count in Texas
- `totalAssessedValueTx` - Total assessed value
- `assetClassMix` - Asset class mix (JSONB)
- `absenteeRate` - Absentee rate
- `outOfState` - Out of state flag
- `avgHoldYears` - Average hold years

---

### 6. parcels_travis
**Rows:** 372,826  
**Columns:** 3

**Columns:**
- `parcel_id` - Parcel identifier
- `geom` - Geometry (PostGIS)
- `created_at` - Creation timestamp

---

### 7. xref_parcel_property_travis
**Rows:** 401,851  
**Columns:** 4

**Columns:**
- `parcel_id` - Parcel ID (from parcels_travis)
- `attom_id` - ATTOM ID (links to properties)
- `source` - Source identifier
- `created_at` - Creation timestamp

**Sample Rows (20):**

| parcel_id | attom_id | source |
|-----------|----------|--------|
| 705047 | d84579b28c32c13 | attom_geojson_a |
| 705037 | 2b7a69ec43709c0 | attom_geojson_a |
| 922822 | 3a41aec91415a34 | attom_geojson_a |

---

## 🎯 ENRICHMENT OPPORTUNITIES

### ✅ Available Data:

1. **Shapefile (834,936 records)**
   - ✅ Owner names (OWNER_NAME)
   - ✅ Legal descriptions (LEGAL_DESC)
   - ✅ Market values (MKT_VALUE)
   - ✅ Land values (LAND_VALUE)
   - ✅ Improvement values (IMP_VALUE)
   - ✅ Acreage (GIS_AREA)
   - ✅ Site addresses (SITUS_*)
   - ✅ Mailing addresses (MAIL_*)

2. **Database Tables**
   - ✅ properties (352K+ rows) - Main property data
   - ✅ parcels_travis_enrichment_stage (834K+ rows) - Raw shapefile data
   - ✅ owners/owner_features_tx - Owner analysis data

### ❌ Missing Data:

1. **LOC_LAND_U** - Land use codes (empty in shapefile)
2. **STAT_LAND_** - State land use codes (empty in shapefile)
3. **Zoning codes** - Not in shapefile
4. **Property use codes** - Need TCAD API or other source

### 🔄 Recommended Enrichment Actions:

1. **Extract shapefile data to enrichment table**
   - Process `parcels_travis_enrichment_stage.raw` JSONB
   - Populate `parcels_travis_enrichment` with actual values
   - Match Prop_ID → parcel_id

2. **Match shapefile to properties**
   - Join on Prop_ID → parcelId
   - Update owner names, values, acreage
   - Update addresses from SITUS_* fields

3. **Improve asset class mapping**
   - Use LEGAL_DESC for better classification
   - Analyze owner names for property types
   - Cross-reference with propertyType field

4. **Find alternative sources for land use codes**
   - TCAD API (Travis County Appraisal District)
   - Other appraisal district APIs
   - Property descriptions analysis

---

## 📊 DATA COVERAGE SUMMARY

| Data Source | Records | Coverage | Status |
|-------------|---------|----------|--------|
| Shapefile (DBF) | 834,936 | 100% Travis County | ✅ Available |
| properties table | 352,431 | ~94% of shapefile | ✅ Populated |
| parcels_travis_enrichment | 27,546 | ~3% of shapefile | ⚠️ Partial |
| owners | 85,579 | Unique owners | ✅ Complete |
| owner_features_tx | 85,579 | Owner features | ✅ Complete |

---

**Last Updated:** 2025-12-30  
**Audit Script:** `scripts/data-audit.mjs`



