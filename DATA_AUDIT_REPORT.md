# Comprehensive Data Audit Report - Phase 0

**Generated:** 2026-01-09T05:47:21.175Z
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
| 100748 | FMAC PROPERTIES LP | NULL | NULL | NULL | NULL | NULL | NULL | FORSYTHE DR, TX 78759 | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | {"FIPS":"48453","COUNTY":"TRAVIS","GEO_ID":"262100748","SOURCE":"TRAVIS APPRAISAL DISTRICT","Prop_ID | "2025-12-30T17:12:41.641Z" | "2025-12-30T08:00:25.666Z" | NULL | 3903 EDGEROCK DR, AUSTIN, TX 78731 | NULL | NULL | 0 | 0 | 49805 | 3.13576005 | NULL | NULL | NULL | NULL | NULL | NULL |
| 100804 | BAILEY JENNIFER | NULL | NULL | NULL | NULL | NULL | NULL | BARRICKS CV, TX 78727 | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | 826200.00 | NULL | NULL | {"FIPS":"48453","COUNTY":"TRAVIS","GEO_ID":"264100804","SOURCE":"TRAVIS APPRAISAL DISTRICT","Prop_ID | "2025-12-30T17:12:41.641Z" | "2025-12-30T08:00:25.666Z" | NULL | 12603 BARRICKS CV, AUSTIN, TX 78727 | NULL | NULL | 0 | 0 | 45660 | 2.38299159 | SF-3 | NULL | false | NULL | NULL | NULL |
| 100823 | REED RYLAN | NULL | NULL | NULL | NULL | NULL | NULL | CEDARVIEW DR, TX 78704 | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | 887900.00 | NULL | NULL | {"FIPS":"48453","COUNTY":"TRAVIS","GEO_ID":"400100823","SOURCE":"TRAVIS APPRAISAL DISTRICT","Prop_ID | "2025-12-30T17:12:41.641Z" | "2025-12-30T08:00:25.666Z" | NULL | 2503 CEDARVIEW DR, AUSTIN, TX 78704 | NULL | NULL | 0 | 0 | 166197 | 2.95573753 | SF-3 | NULL | false | NULL | NULL | NULL |
| 100911 | TEMPLO BETHEL PENTECOSTES OF AUSTIN INC | NULL | NULL | NULL | NULL | NULL | NULL | SANTA ROSA ST, TX 78702 | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | 799031.00 | NULL | NULL | {"FIPS":"48453","COUNTY":"TRAVIS","GEO_ID":"202100911","SOURCE":"TRAVIS APPRAISAL DISTRICT","Prop_ID | "2025-12-30T17:12:41.641Z" | "2025-12-30T08:00:25.666Z" | NULL | 2320 SANTA MARIA ST, AUSTIN, TX 78702 | NULL | NULL | 0 | 0 | 26361 | 0.92461932 | SF-3-NP | NULL | false | NULL | NULL | NULL |
| 100908 | WILCHER AUSTIN J | NULL | NULL | NULL | NULL | NULL | NULL | CHRYSLER BND, TX 78744 | NULL | NULL | NULL | NULL | NULL | NULL | NULL | NULL | 1305682.00 | NULL | NULL | {"FIPS":"48453","COUNTY":"TRAVIS","GEO_ID":"336100908","SOURCE":"TRAVIS APPRAISAL DISTRICT","Prop_ID | "2025-12-30T17:12:41.641Z" | "2025-12-30T08:00:25.666Z" | NULL | 7804 CHRYSLER BND, AUSTIN, TX 78744 | NULL | NULL | 0 | 0 | 60462 | 2.71770006 | SF-3-NP | NULL | false | NULL | NULL | NULL |

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
  "GEO_ID": "241101058",
  "SOURCE": "TRAVIS APPRAISAL DISTRICT",
  "Prop_ID": "0241101058",
  "DATE_ACQ": 20250801,
  "GIS_AREA": 1.89484985,
  "MAIL_ZIP": "78708",
  "TAX_YEAR": 2025,
  "IMP_VALUE": 0,
  "MAIL_ADDR": "PO BOX 82203, AUSTIN, TX 78708",
  "MAIL_CITY": "AUSTIN",
  "MAIL_STAT": "TX",
  "MKT_VALUE": 39390,
  "NAME_CARE": null,
  "SITUS_NUM": null,
  "SITUS_ZIP": "78757",
  "GIS_AREA_U": "Acres",
  "LAND_VALUE": 0,
  "LEGAL_AREA": null,
  "LEGAL_DESC": "LOT 6 BLK B WOOTEN TERRACE SEC 1-A",
  "LGL_AREA_U": "Acres",
  "LOC_LAND_U": null,
  "MAIL_LINE1": "PO BOX 82203",
  "MAIL_LINE2": null,
  "OWNER_NAME": "MDTT LLC",
  "SITUS_ADDR": ", TX 78757",
  "SITUS_CITY": null,
  "SITUS_STAT": "TX",
  "SITUS_STRE": null,
  "SITUS_ST_1": "SPEARMAN",
  "SITUS_ST_2": "DR",
  "STAT_LAND_": null,
  "YEAR_BUILT": null
}
```

```json
{
  "FIPS": "48453",
  "COUNTY": "TRAVIS",
  "GEO_ID": "241101060",
  "SOURCE": "TRAVIS APPRAISAL DISTRICT",
  "Prop_ID": "0241101060",
  "DATE_ACQ": 20250801,
  "GIS_AREA": 1.67151633,
  "MAIL_ZIP": "78633",
  "TAX_YEAR": 2025,
  "IMP_VALUE": 0,
  "MAIL_ADDR": "7009 N INTERSTATE 35, GEORGETOWN, TX 78633",
  "MAIL_CITY": "GEORGETOWN",
  "MAIL_STAT": "TX",
  "MKT_VALUE": 39338,
  "NAME_CARE": null,
  "SITUS_NUM": null,
  "SITUS_ZIP": "78757",
  "GIS_AREA_U": "Acres",
  "LAND_VALUE": 0,
  "LEGAL_AREA": null,
  "LEGAL_DESC": "LOT 8 BLK B WOOTEN TERRACE SEC 1-A",
  "LGL_AREA_U": "Acres",
  "LOC_LAND_U": null,
  "MAIL_LINE1": "7009 N INTERSTATE 35",
  "MAIL_LINE2": null,
  "OWNER_NAME": "GOTTSCHALK TRUST",
  "SITUS_ADDR": ", TX 78757",
  "SITUS_CITY": null,
  "SITUS_STAT": "TX",
  "SITUS_STRE": null,
  "SITUS_ST_1": "SPEARMAN",
  "SITUS_ST_2": "DR",
  "STAT_LAND_": null,
  "YEAR_BUILT": null
}
```

```json
{
  "FIPS": "48453",
  "COUNTY": "TRAVIS",
  "GEO_ID": "241101069",
  "SOURCE": "TRAVIS APPRAISAL DISTRICT",
  "Prop_ID": "0241101069",
  "DATE_ACQ": 20250801,
  "GIS_AREA": 1.78094395,
  "MAIL_ZIP": "78757",
  "TAX_YEAR": 2025,
  "IMP_VALUE": 0,
  "MAIL_ADDR": "8525 PUTNAM DR, AUSTIN, TX 78757",
  "MAIL_CITY": "AUSTIN",
  "MAIL_STAT": "TX",
  "MKT_VALUE": 58023,
  "NAME_CARE": null,
  "SITUS_NUM": null,
  "SITUS_ZIP": "78757",
  "GIS_AREA_U": "Acres",
  "LAND_VALUE": 0,
  "LEGAL_AREA": null,
  "LEGAL_DESC": "LOT 5 BLK C WOOTEN TERRACE SEC 2",
  "LGL_AREA_U": "Acres",
  "LOC_LAND_U": null,
  "MAIL_LINE1": "8525 PUTNAM DR",
  "MAIL_LINE2": null,
  "OWNER_NAME": "FRENCH MICHAEL & EMILY",
  "SITUS_ADDR": ", TX 78757",
  "SITUS_CITY": null,
  "SITUS_STAT": "TX",
  "SITUS_STRE": null,
  "SITUS_ST_1": "PUTNAM",
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

