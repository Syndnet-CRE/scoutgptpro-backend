# Comprehensive Data Audit Report - Phase 0

**Generated:** 2026-01-09T05:31:02.712Z
**Purpose:** Understand actual data in parcel_features_travis and related tables


# Executive Summary

This audit examines the actual data distribution in `parcel_features_travis` and related tables to identify usable data sources for populating `asset_class` and `owner_segment`.


# 1. parcel_features_travis Table Audit

**Total Rows:** 369,813


## 1.1 Column Structure

| Column Name | Data Type | Nullable |
| --- | --- | --- |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |
| NULL | NULL | NULL |


## 1.2 land_use_code

**Population:** 0 / 369813 (0.00%)

⚠️ **WARNING:** Column is 100% NULL


## 1.2 land_use_desc

**Population:** 0 / 369813 (0.00%)

⚠️ **WARNING:** Column is 100% NULL


## 1.2 asset_class

**Population:** 369813 / 369813 (100.00%)

**Top Values:**

| asset_class | Count |
| --- | --- |
| land | NULL |


## 1.2 owner_segment

**Population:** 369813 / 369813 (100.00%)

**Top Values:**

| owner_segment | Count |
| --- | --- |
| unknown | NULL |


## 1.2 owner_entity_type

**Population:** 369813 / 369813 (100.00%)

**Top Values:**

| owner_entity_type | Count |
| --- | --- |
| person | NULL |
| llc | NULL |
| trust_estate | NULL |
| corp | NULL |


## 1.2 owner_portfolio_count_travis

**Population:** 369813 / 369813 (100.00%)

**Top Values:**

| owner_portfolio_count_travis | Count |
| --- | --- |
| 0 | NULL |

**Statistics:**

- Min: 0
- Max: 0
- Avg: 0.00
- Median: 0


## 1.2 building_sqft

**Population:** 0 / 369813 (0.00%)

⚠️ **WARNING:** Column is 100% NULL


## 1.2 improvement_value

**Population:** 342267 / 369813 (92.55%)

**Top Values:**

| improvement_value | Count |
| --- | --- |
| 0.00000000 | NULL |

**Statistics:**

- Min: 0.00000000
- Max: 0.00000000
- Avg: 0.00
- Median: 0


## 1.2 market_value

**Population:** 342267 / 369813 (92.55%)

**Top Values:**

| market_value | Count |
| --- | --- |
| 0.00000000 | NULL |
| 75.00000000 | NULL |
| 5625.00000000 | NULL |
| 7500.00000000 | NULL |
| 30000.00000000 | NULL |
| 100.00000000 | NULL |
| 3190.00000000 | NULL |
| 40000.00000000 | NULL |
| 250.00000000 | NULL |
| 400.00000000 | NULL |
| 150.00000000 | NULL |
| 1.00000000 | NULL |
| 50.00000000 | NULL |
| 750.00000000 | NULL |
| 5629.00000000 | NULL |
| 120000.00000000 | NULL |
| 150000.00000000 | NULL |
| 300.00000000 | NULL |
| 600.00000000 | NULL |
| 110000.00000000 | NULL |

**Statistics:**

- Min: 0.00000000
- Max: 214748364.00000000
- Avg: 99966.48
- Median: 46311


## 1.2 year_built

**Population:** 0 / 369813 (0.00%)

⚠️ **WARNING:** Column is 100% NULL


## 1.2 tax_delinquent_flag

**Population:** 369813 / 369813 (100.00%)

**Top Values:**

| tax_delinquent_flag | Count |
| --- | --- |
| false | NULL |
| true | NULL |


## 1.2 mail_state

**Population:** 0 / 369813 (0.00%)

⚠️ **WARNING:** Column is 100% NULL


## 1.2 last_sale_date

**Population:** 6535 / 369813 (1.77%)

**Top Values:**

| last_sale_date | Count |
| --- | --- |
| "2005-10-21T05:00:00.000Z" | NULL |
| "2012-05-01T05:00:00.000Z" | NULL |
| "2004-09-02T05:00:00.000Z" | NULL |
| "2005-12-14T06:00:00.000Z" | NULL |
| "2004-06-30T05:00:00.000Z" | NULL |
| "2004-08-10T05:00:00.000Z" | NULL |
| "2004-10-01T05:00:00.000Z" | NULL |
| "2004-12-30T06:00:00.000Z" | NULL |
| "2006-09-21T05:00:00.000Z" | NULL |
| "2004-06-28T05:00:00.000Z" | NULL |
| "2006-05-02T05:00:00.000Z" | NULL |
| "2004-06-29T05:00:00.000Z" | NULL |
| "2004-08-03T05:00:00.000Z" | NULL |
| "2005-06-17T05:00:00.000Z" | NULL |
| "2004-08-31T05:00:00.000Z" | NULL |
| "2006-06-12T05:00:00.000Z" | NULL |
| "2005-03-07T06:00:00.000Z" | NULL |
| "2007-06-11T05:00:00.000Z" | NULL |
| "2006-03-14T06:00:00.000Z" | NULL |
| "2004-06-21T05:00:00.000Z" | NULL |


## 1.2 geom_centroid

**Population:** 369813 / 369813 (100.00%)

**Top Values:**

| geom_centroid | Count |
| --- | --- |
| 0101000020E61000006118F40CEF7058C0FD68EBF1664B3E40 | NULL |
| 0101000020E6100000B42976F7836C58C0473B21B5C3473E40 | NULL |
| 0101000020E6100000044D4386587858C0B4F26CF40B3F3E40 | NULL |
| 0101000020E6100000D8BB1B2BAA8158C0688C4591B1593E40 | NULL |
| 0101000020E6100000A7132F13E96658C07762F5E4046D3E40 | NULL |
| 0101000020E6100000608EDA169D7158C0B3C791AA56413E40 | NULL |
| 0101000020E6100000C34CEB30777558C018D356D68C4A3E40 | NULL |
| 0101000020E61000008181CC5F3D6358C0F58FDAA2335B3E40 | NULL |
| 0101000020E6100000B0B31E8DB77058C0A330AED4B8493E40 | NULL |
| 0101000020E61000001FB5BA0F787958C02A5A38121D4B3E40 | NULL |
| 0101000020E610000052F49F49D46458C0E8ACB1A29F713E40 | NULL |
| 0101000020E6100000DC576707067258C09B3D2D20B15D3E40 | NULL |
| 0101000020E61000006405FBD4E57058C07D4A2976D4353E40 | NULL |
| 0101000020E61000008B30CF809A6058C0F7A9F9B0815B3E40 | NULL |
| 0101000020E6100000E077F4549A7D58C01BC3BC00096A3E40 | NULL |
| 0101000020E61000005A7E3139106F58C027568B36F54C3E40 | NULL |
| 0101000020E61000008DB2D40D736F58C0401B0D2DBB443E40 | NULL |
| 0101000020E6100000C8EE6A77407E58C0A80C6CD19F613E40 | NULL |
| 0101000020E61000006CA9BFBB5D7B58C08E26045E6E663E40 | NULL |
| 0101000020E6100000DCB09A29FB7358C0EE297131F3313E40 | NULL |


## 1.3 Geometry Check

| Total | Has Geometry | No Geometry | % Has Geometry |
| --- | --- | --- | --- |
| NULL | NULL | NULL | NULL |


# 2. Related Tables Audit


## 2.1 parcels_travis_enrichment

**Total Rows:** 369813

**Columns:**

| Column Name | Data Type |
| --- | --- |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |

**Sample Rows:**

| parcel_id | owner_name | owner2 | mail_address1 | mail_address2 | mail_city | mail_state | mail_zip | situs_address | land_use | land_use_desc | legal_desc | year_built | acres | land_value | improvement_value | market_value | assessed_value | last_update | source_layer | raw | updated_at | ingested_at | owner_type | mailing_address | land_use_code | land_use_description | assessed_land_value | assessed_improvement_value | assessed_total_value | acreage | zoning_code | flood_zone | tax_delinquent_flag | last_sale_date | last_sale_price | homestead_exemption_flag |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 100108 | PANTOJA ISMAEL C & JUANITA E | NULL | NULL | NULL | NULL | NULL | NULL | COLTON-BLUFF SPRG RD, TX 78744 | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | {"FIPS":"48453","COUNTY":"TRAVIS","GEO_ID":"336100108","SOURCE":"TRAVIS APPRAISAL DISTRICT","Prop_ID | "2025-12-30T17:12:41.641Z" | "2025-12-30T08:00:25.666Z" | NULL | 5003 BRUSHY RIDGE DR, AUSTIN, TX 78744 | NULL | NULL | 0 | 0 | 8671 | 14.14860115 | NULL | NULL | NULL | NULL | NULL | NULL |
| 100162 | CAMPBELL GRANT | NULL | NULL | NULL | NULL | NULL | NULL | GILLIS ST, TX 78745 | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | 759199.00 | NULL | NULL | {"FIPS":"48453","COUNTY":"TRAVIS","GEO_ID":"409100162","SOURCE":"TRAVIS APPRAISAL DISTRICT","Prop_ID | "2025-12-30T17:12:41.641Z" | "2025-12-30T08:00:25.666Z" | NULL | 7305 TRENTON DR, AUSTIN, TX 78736 | NULL | NULL | 0 | 0 | 53676 | 2.67651741 | SF-3-NP | NULL | false | NULL | NULL | NULL |
| 100232 | MENDEZ MOISES | NULL | NULL | NULL | NULL | NULL | NULL | BRADSHER DR, TX 78745 | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | {"FIPS":"48453","COUNTY":"TRAVIS","GEO_ID":"418100232","SOURCE":"TRAVIS APPRAISAL DISTRICT","Prop_ID | "2025-12-30T17:12:41.641Z" | "2025-12-30T08:00:25.666Z" | NULL | 6401 BRADSHER DR, AUSTIN, TX 78745 | NULL | NULL | 0 | 0 | 51762 | 2.28779678 | NULL | NULL | NULL | NULL | NULL | NULL |
| 100244 | WHITE A J PROPERTIES LTD | NULL | NULL | NULL | NULL | NULL | NULL | VALLEY VIEW RD, TX 78704 | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | {"FIPS":"48453","COUNTY":"TRAVIS","GEO_ID":"406100244","SOURCE":"TRAVIS APPRAISAL DISTRICT","Prop_ID | "2025-12-30T17:12:41.641Z" | "2025-12-30T08:00:25.666Z" | NULL | PO BOX 160581, AUSTIN, TX 78716 | NULL | NULL | 0 | 0 | 64588 | 4.35012107 | NULL | NULL | NULL | NULL | NULL | NULL |
| 100257 | BLACKSHEAR NEIGHBORHOOD DEVELOPMENT CORP | NULL | NULL | NULL | NULL | NULL | NULL | HARVARD ST, TX 78702 | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | {"FIPS":"48453","COUNTY":"TRAVIS","GEO_ID":"206100257","SOURCE":"TRAVIS APPRAISAL DISTRICT","Prop_ID | "2025-12-30T17:12:41.641Z" | "2025-12-30T08:00:25.666Z" | NULL | PO BOX 19536, AUSTIN, TX 78760 | NULL | NULL | 0 | 0 | 65323 | 0.88420518 | NULL | NULL | NULL | NULL | NULL | NULL |

**Keys in `raw` JSONB column:**

- SITUS_NUM
- LAND_VALUE
- OWNER_NAME
- SITUS_STAT
- DATE_ACQ
- STAT_LAND_
- MAIL_ADDR
- FIPS
- MAIL_ZIP
- SITUS_ADDR
- MKT_VALUE
- SITUS_ZIP
- SITUS_ST_1
- NAME_CARE
- SITUS_STRE
- LEGAL_AREA
- YEAR_BUILT
- COUNTY
- TAX_YEAR
- MAIL_LINE2
- GIS_AREA_U
- SITUS_CITY
- MAIL_STAT
- GIS_AREA
- LEGAL_DESC
- IMP_VALUE
- LOC_LAND_U
- MAIL_LINE1
- SITUS_ST_2
- Prop_ID
- GEO_ID
- MAIL_CITY
- SOURCE
- LGL_AREA_U

**Sample `raw` JSONB values:**

```json
{
  "FIPS": "48453",
  "COUNTY": "TRAVIS",
  "GEO_ID": "338100524",
  "SOURCE": "TRAVIS APPRAISAL DISTRICT",
  "Prop_ID": "0338100524",
  "DATE_ACQ": 20250801,
  "GIS_AREA": 1.87375021,
  "MAIL_ZIP": "77094",
  "TAX_YEAR": 2025,
  "IMP_VALUE": 0,
  "MAIL_ADDR": "19506 CARDIFF PARK LN, HOUSTON, TX 77094",
  "MAIL_CITY": "HOUSTON",
  "MAIL_STAT": "TX",
  "MKT_VALUE": 51792,
  "NAME_CARE": null,
  "SITUS_NUM": null,
  "SITUS_ZIP": null,
  "GIS_AREA_U": "Acres",
  "LAND_VALUE": 0,
  "LEGAL_AREA": null,
  "LEGAL_DESC": "K 8 EASTON PARK SEC 2B PHS 2",
  "LGL_AREA_U": "Acres",
  "LOC_LAND_U": null,
  "MAIL_LINE1": "19506 CARDIFF PARK LN",
  "MAIL_LINE2": null,
  "OWNER_NAME": "NGUYEN ANTHONY TUAN & LENA MAI TRAN",
  "SITUS_ADDR": ", TX",
  "SITUS_CITY": null,
  "SITUS_STAT": "TX",
  "SITUS_STRE": null,
  "SITUS_ST_1": "PETRONAS",
  "SITUS_ST_2": "PASS",
  "STAT_LAND_": null,
  "YEAR_BUILT": null
}
```

```json
{
  "FIPS": "48453",
  "COUNTY": "TRAVIS",
  "GEO_ID": "213100628",
  "SOURCE": "TRAVIS APPRAISAL DISTRICT",
  "Prop_ID": "0213100628",
  "DATE_ACQ": 20250801,
  "GIS_AREA": 2.24651904,
  "MAIL_ZIP": "78722",
  "TAX_YEAR": 2025,
  "IMP_VALUE": 0,
  "MAIL_ADDR": "3006 BREEZE TER, AUSTIN, TX 78722",
  "MAIL_CITY": "AUSTIN",
  "MAIL_STAT": "TX",
  "MKT_VALUE": 73411,
  "NAME_CARE": null,
  "SITUS_NUM": null,
  "SITUS_ZIP": "78722",
  "GIS_AREA_U": "Acres",
  "LAND_VALUE": 0,
  "LEGAL_AREA": null,
  "LEGAL_DESC": "LOT 44 BLK 7 OLT 31 DIV C FOREST HILLS RESUB",
  "LGL_AREA_U": "Acres",
  "LOC_LAND_U": null,
  "MAIL_LINE1": "3006 BREEZE TER",
  "MAIL_LINE2": null,
  "OWNER_NAME": "LIPPS TAYLOR M & JORDAN S SMITH",
  "SITUS_ADDR": ", TX 78722",
  "SITUS_CITY": null,
  "SITUS_STAT": "TX",
  "SITUS_STRE": null,
  "SITUS_ST_1": "BREEZE",
  "SITUS_ST_2": "TER",
  "STAT_LAND_": null,
  "YEAR_BUILT": null
}
```

```json
{
  "FIPS": "48453",
  "COUNTY": "TRAVIS",
  "GEO_ID": "400100712",
  "SOURCE": "TRAVIS APPRAISAL DISTRICT",
  "Prop_ID": "0400100712",
  "DATE_ACQ": 20250801,
  "GIS_AREA": 1.91978671,
  "MAIL_ZIP": "78704",
  "TAX_YEAR": 2025,
  "IMP_VALUE": 0,
  "MAIL_ADDR": "KAILEA BROWNING, AUSTIN, TX 78704",
  "MAIL_CITY": "AUSTIN",
  "MAIL_STAT": "TX",
  "MKT_VALUE": 124497,
  "NAME_CARE": null,
  "SITUS_NUM": null,
  "SITUS_ZIP": "78704",
  "GIS_AREA_U": "Acres",
  "LAND_VALUE": 0,
  "LEGAL_AREA": null,
  "LEGAL_DESC": "LOT 12 BLK G BARTON HILLS SEC 1",
  "LGL_AREA_U": "Acres",
  "LOC_LAND_U": null,
  "MAIL_LINE1": "KAILEA BROWNING",
  "MAIL_LINE2": null,
  "OWNER_NAME": "CARBONE JOSHUA JOHN &",
  "SITUS_ADDR": "2411 ELMGLEN DR , TX 78704",
  "SITUS_CITY": null,
  "SITUS_STAT": "TX",
  "SITUS_STRE": null,
  "SITUS_ST_1": "ELMGLEN",
  "SITUS_ST_2": "DR",
  "STAT_LAND_": null,
  "YEAR_BUILT": null
}
```


## 2.2 properties Table

**Total Rows:** 352431

**Matched to parcel_features_travis:** 349642

**asset_class in properties table:**

| asset_class | Count |
| --- | --- |
| residential | NULL |
| other | NULL |
| land | NULL |
| multifamily | NULL |
| infrastructure | NULL |
| retail | NULL |
| office | NULL |
| industrial | NULL |
| civic | NULL |
| commercial | NULL |
| hospitality | NULL |
| self_storage | NULL |
| mobile_home_park | NULL |

**propertyType in properties table:**

| propertyType | Count |
| --- | --- |
| Single Family | NULL |
| Vacant Land | NULL |
| Agricultural | NULL |
| Commercial | NULL |
| Condo | NULL |
| Multi-Family | NULL |
| Mobile Home | NULL |

**Sample matched rows:**

| parcelId | propertyType | asset_class | acres | mktValue | pft_asset_class | land_use_code |
| --- | --- | --- | --- | --- | --- | --- |
| 960852 | Vacant Land | land | 0.1897 | NULL | land | NULL |
| 960693 | Vacant Land | land | 0.1897 | NULL | land | NULL |
| 198979 | Vacant Land | land | 0.2582 | NULL | land | NULL |
| 960797 | Vacant Land | land | 0.1897 | NULL | land | NULL |
| 960428 | Vacant Land | residential | 0.1897 | NULL | land | NULL |


## 2.3 owners and owner_features_tx Tables

**Total owners:** 85579

**Total owner_features_tx:** 85579

⚠️ Error accessing owners/owner_features_tx: column op.parcel_id does not exist


# 3. Usable Data Sources Analysis


## 3.1 asset_class Data Sources

⚠️ **land_use_code is empty**

⚠️ **land_use_desc is empty**

**Building/Improvement Status:**

| Building Status | Improvement Status | Count |
| --- | --- | --- |
| NULL | NULL | NULL |

**asset_class from properties table (matched):**

| asset_class | Count |
| --- | --- |
| residential | NULL |
| other | NULL |
| land | NULL |
| multifamily | NULL |
| infrastructure | NULL |
| retail | NULL |
| office | NULL |
| industrial | NULL |
| civic | NULL |
| commercial | NULL |
| hospitality | NULL |
| self_storage | NULL |
| mobile_home_park | NULL |


## 3.2 owner_segment Data Sources

**owner_entity_type values:**

| owner_entity_type | Count |
| --- | --- |
| person | NULL |
| llc | NULL |
| trust_estate | NULL |
| corp | NULL |

**owner_portfolio_count_travis distribution:**

| Portfolio Bucket | Count |
| --- | --- |
| NULL | NULL |

**Owner name patterns:**

| Pattern | Count |
| --- | --- |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |
| NULL | NULL |


# 4. Recommendations


## 4.1 asset_class Population Strategy

**Properties table has asset_class for:** 349,642 parcels

✅ **RECOMMENDATION:** Use properties.asset_class as primary source

**Can derive 'land' from building/improvements:** 369,813 parcels

✅ **RECOMMENDATION:** Use building_sqft/improvement_value to identify land


## 4.2 owner_segment Population Strategy

**owner_portfolio_count_travis populated:** 369,813 parcels

✅ **RECOMMENDATION:** Use owner_portfolio_count_travis for institutional/small_operator

**Can identify absentee from mail_state:** 0 parcels

**owner_entity_type populated:** 369,813 parcels

✅ **RECOMMENDATION:** Use owner_entity_type for mom_pop vs small_operator

---

## 5. Corrected ETL Scripts

Based on the audit findings, corrected ETL scripts have been created:

### 5.1 populate-asset-class-v2.sql

**Strategy:**
1. **Primary source:** `properties.asset_class` (349,642 parcels have this)
   - Map: residential/multifamily → 'residential'
   - Map: commercial/retail/office/industrial → 'commercial'
   - Map: land → 'land'
2. **Fallback:** Derive from `improvement_value`
   - improvement_value = 0 or NULL → 'land'
   - improvement_value > 0 → 'unknown' (can't determine type)

**Key Finding:** `land_use_code` and `land_use_desc` are 100% NULL, so we cannot use them.

### 5.2 populate-owner-segment-v2.sql

**Strategy:**
1. **Absentee detection:** Use `parcels_travis_enrichment.raw->>'MAIL_STAT'`
   - mail_state != 'TX' → 'absentee'
2. **Institutional detection:** Use owner name patterns
   - REIT, Holdings, Fund, etc. → 'institutional'
3. **Entity type mapping:**
   - LLC/Corp → 'small_operator'
   - Person → 'mom_pop'
   - Trust/Estate → 'local_owner'
4. **Default:** 'local_owner' (safer than 'unknown')

**Key Finding:** 
- `owner_portfolio_count_travis` is all 0 (not useful)
- `mail_state` in `parcel_features_travis` is NULL, but available in `parcels_travis_enrichment.raw`

### 5.3 Usage

```bash
# Run ETL scripts
./scripts/run-etl.sh# Verify results
psql $DATABASE_URL -f scripts/verify-etl.sql
```

### 5.4 Expected Results

**asset_class distribution:**
- residential: ~X% (from properties table)
- commercial: ~X% (from properties table)
- land: ~X% (from properties table + improvement_value = 0)
- unknown: ~X% (parcels with improvements but no classification)

**owner_segment distribution:**
- absentee: ~X% (from mail_state != 'TX')
- institutional: ~X% (from name patterns)
- small_operator: ~X% (LLC/Corp entities)
- mom_pop: ~X% (Person entities)
- local_owner: ~X% (Trust/Estate, TX residents, default)

---

## 6. Fields We Cannot Populate

These fields are missing entirely and would require external data sources:

1. **building_sqft** - 100% NULL
2. **year_built** - 100% NULL
3. **land_use_code** - 100% NULL
4. **land_use_desc** - 100% NULL
5. **mail_state** in `parcel_features_travis` - 100% NULL (but available in `parcels_travis_enrichment.raw`)
6. **owner_portfolio_count_travis** - All 0 (not useful for segmentation)

---

## 7. Next Steps

1. **Run ETL scripts** using `scripts/run-etl.sh`
2. **Verify results** using `scripts/verify-etl.sql`
3. **Update Claude prompts** to reflect actual data availability
4. **Consider enrichment** for missing fields if needed for specific use cases