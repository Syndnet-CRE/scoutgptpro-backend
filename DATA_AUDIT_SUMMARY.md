# Data Audit Summary - Phase 0

**Date:** January 9, 2025  
**Purpose:** Understand actual data availability for populating `asset_class` and `owner_segment`

---

## Key Findings

### ✅ What We CAN Use

1. **properties.asset_class** - 349,642 parcels (94.5% of total)
   - Values: residential, commercial, land, multifamily, retail, office, industrial, etc.
   - **PRIMARY SOURCE** for asset_class population

2. **parcels_travis_enrichment.raw->>'MAIL_STAT'** - Available for absentee detection
   - Contains mailing state information
   - Can identify out-of-state owners

3. **owner_entity_type** - 369,813 parcels (100%)
   - Values: person, llc, corp, trust_estate
   - Can use for basic segmentation

4. **improvement_value** - 342,267 parcels (92.5%)
   - Can identify land (improvement_value = 0)
   - Most values are 0, indicating vacant land

5. **owner_name_raw** - Available for pattern matching
   - Can detect institutional owners (REIT, Holdings, Fund, etc.)

### ❌ What We CANNOT Use

1. **land_use_code** - 100% NULL (0 parcels)
2. **land_use_desc** - 100% NULL (0 parcels)
3. **building_sqft** - 100% NULL (0 parcels)
4. **year_built** - 100% NULL (0 parcels)
5. **mail_state** in `parcel_features_travis` - 100% NULL (but available in enrichment table)
6. **owner_portfolio_count_travis** - All 0 (not useful for segmentation)

---

## Population Strategy

### asset_class

**Primary Source:** `properties.asset_class` (349,642 parcels)

**Mapping:**
- `residential`, `multifamily`, `mobile_home_park` → `residential`
- `commercial`, `retail`, `office`, `industrial`, `hospitality`, `self_storage` → `commercial`
- `land` → `land`
- `other`, `infrastructure`, `civic` → `unknown`

**Fallback:** For parcels not in `properties` table:
- `improvement_value = 0 or NULL` → `land`
- `improvement_value > 0` → `unknown` (can't determine type without more data)

### owner_segment

**Strategy (in order):**

1. **Absentee Detection:** `parcels_travis_enrichment.raw->>'MAIL_STAT' != 'TX'` → `absentee`
2. **Institutional Detection:** Owner name patterns (REIT, Holdings, Fund, etc.) → `institutional`
3. **Entity Type Mapping:**
   - `llc`, `corp`, `inc`, `lp` → `small_operator`
   - `person` → `mom_pop`
   - `trust_estate` → `local_owner`
4. **Default:** `local_owner` (safer than `unknown`)

---

## Files Created

1. **DATA_AUDIT_REPORT.md** - Full audit report with all findings
2. **scripts/populate-asset-class-v2.sql** - Corrected ETL script for asset_class
3. **scripts/populate-owner-segment-v2.sql** - Corrected ETL script for owner_segment
4. **scripts/verify-etl.sql** - Verification queries
5. **scripts/run-etl.sh** - Shell script to run ETL in order

---

## Next Steps

1. **Review** the audit report: `DATA_AUDIT_REPORT.md`
2. **Run ETL scripts:**
   ```bash
   cd ~/scoutgptpro-backend
   ./scripts/run-etl.sh
   ```
3. **Verify results:**
   ```bash
   psql $DATABASE_URL -f scripts/verify-etl.sql
   ```
4. **Update Claude prompts** to reflect actual data availability
5. **Test queries** to ensure filtering works correctly

---

## Expected Results

After running ETL:

**asset_class distribution:**
- `residential`: ~X% (from properties table)
- `commercial`: ~X% (from properties table)
- `land`: ~X% (from properties table + improvement_value = 0)
- `unknown`: ~X% (parcels with improvements but no classification)

**owner_segment distribution:**
- `absentee`: ~X% (from mail_state != 'TX')
- `institutional`: ~X% (from name patterns)
- `small_operator`: ~X% (LLC/Corp entities)
- `mom_pop`: ~X% (Person entities)
- `local_owner`: ~X% (Trust/Estate, TX residents, default)

---

## Important Notes

1. **land_use_code is empty** - Previous ETL attempts failed because they relied on this field
2. **properties table is the key** - 94.5% of parcels have asset_class in properties table
3. **mail_state requires join** - Must use `parcels_travis_enrichment` table, not `parcel_features_travis`
4. **owner_portfolio_count is useless** - All values are 0, cannot use for institutional detection
5. **Name pattern matching** - Only way to detect institutional owners without portfolio count

---

**Audit Complete** ✅
