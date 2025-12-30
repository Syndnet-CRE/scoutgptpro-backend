-- Materialize Tier 1 + Tier 2 fields from parcels_travis_enrichment.raw into columns
-- Safe casts, only updates NULL columns, handles key variants and nested paths

-- Step 1: Add columns if they don't exist
ALTER TABLE parcels_travis_enrichment
  ADD COLUMN IF NOT EXISTS owner_name TEXT,
  ADD COLUMN IF NOT EXISTS owner_type TEXT,
  ADD COLUMN IF NOT EXISTS mailing_address TEXT,
  ADD COLUMN IF NOT EXISTS situs_address TEXT,
  ADD COLUMN IF NOT EXISTS land_use_code TEXT,
  ADD COLUMN IF NOT EXISTS land_use_description TEXT,
  ADD COLUMN IF NOT EXISTS assessed_land_value NUMERIC,
  ADD COLUMN IF NOT EXISTS assessed_improvement_value NUMERIC,
  ADD COLUMN IF NOT EXISTS assessed_total_value NUMERIC,
  ADD COLUMN IF NOT EXISTS year_built INTEGER,
  ADD COLUMN IF NOT EXISTS acreage NUMERIC,
  ADD COLUMN IF NOT EXISTS zoning_code TEXT,
  ADD COLUMN IF NOT EXISTS flood_zone TEXT,
  ADD COLUMN IF NOT EXISTS tax_delinquent_flag BOOLEAN,
  ADD COLUMN IF NOT EXISTS last_sale_date DATE,
  ADD COLUMN IF NOT EXISTS last_sale_price NUMERIC,
  ADD COLUMN IF NOT EXISTS homestead_exemption_flag BOOLEAN;

-- Step 2: Update columns from raw JSONB (only NULL columns)
UPDATE parcels_travis_enrichment
SET
  -- owner_name: top-level variants + nested path (TCAD: OWNER_NAME)
  owner_name = COALESCE(
    owner_name,  -- Keep existing if not NULL
    NULLIF(btrim(raw->>'OWNER_NAME'), ''),
    NULLIF(btrim(raw->>'owner_name'), ''),
    NULLIF(btrim(raw->>'ownerName'), ''),
    NULLIF(btrim(raw->>'owner'), ''),
    NULLIF(btrim(raw #>> '{owner,name}'), '')
  ),

  -- owner_type: top-level variants + nested path
  owner_type = COALESCE(
    owner_type,
    NULLIF(btrim(raw->>'owner_type'), ''),
    NULLIF(btrim(raw->>'OWNER_TYPE'), ''),
    NULLIF(btrim(raw->>'ownerType'), ''),
    NULLIF(btrim(raw #>> '{owner,type}'), '')
  ),

  -- mailing_address: TCAD keys (MAIL_ADDR or construct from MAIL_LINE1, MAIL_LINE2, MAIL_CITY, MAIL_STAT, MAIL_ZIP)
  mailing_address = COALESCE(
    mailing_address,
    CASE 
      WHEN NULLIF(btrim(raw->>'MAIL_ADDR'), '') IS NULL THEN NULL
      WHEN NULLIF(btrim(raw->>'MAIL_ADDR'), '') ~ '^\s*,\s*,\s*$' THEN NULL
      ELSE NULLIF(btrim(raw->>'MAIL_ADDR'), '')
    END,
    NULLIF(
      concat_ws(', ',
        NULLIF(btrim(raw->>'MAIL_LINE1'), ''),
        NULLIF(btrim(raw->>'MAIL_LINE2'), ''),
        NULLIF(btrim(raw->>'MAIL_CITY'), ''),
        NULLIF(btrim(raw->>'MAIL_STAT'), ''),
        NULLIF(btrim(raw->>'MAIL_ZIP'), '')
      ),
      ''
    ),
    NULLIF(btrim(raw->>'mailing_address'), ''),
    NULLIF(btrim(raw->>'MAILING_ADDRESS'), ''),
    NULLIF(btrim(raw->>'mailingAddress'), ''),
    NULLIF(btrim(raw->>'mail_address1'), ''),
    NULLIF(btrim(raw->>'MAIL_ADDRESS1'), ''),
    NULLIF(btrim(raw->>'mail_addr1'), ''),
    NULLIF(btrim(raw #>> '{owner,mailingAddress}'), '')
  ),

  -- situs_address: TCAD keys (SITUS_ADDR or construct from SITUS_NUM, SITUS_ST_1, SITUS_ST_2, SITUS_CITY, SITUS_STAT, SITUS_ZIP)
  situs_address = COALESCE(
    situs_address,
    CASE 
      WHEN NULLIF(btrim(raw->>'SITUS_ADDR'), '') IS NULL THEN NULL
      WHEN NULLIF(btrim(raw->>'SITUS_ADDR'), '') ~ '^,\s*TX(\s+\d{5})?$' THEN NULL
      ELSE NULLIF(btrim(raw->>'SITUS_ADDR'), '')
    END,
    NULLIF(
      concat_ws(' ',
        NULLIF(btrim(raw->>'SITUS_NUM'), ''),
        NULLIF(btrim(raw->>'SITUS_ST_1'), ''),
        NULLIF(btrim(raw->>'SITUS_ST_2'), '')
      )
      || CASE WHEN NULLIF(btrim(raw->>'SITUS_CITY'), '') IS NOT NULL THEN ', ' || NULLIF(btrim(raw->>'SITUS_CITY'), '') ELSE '' END
      || CASE WHEN NULLIF(btrim(raw->>'SITUS_STAT'), '') IS NOT NULL THEN ', ' || NULLIF(btrim(raw->>'SITUS_STAT'), '') ELSE '' END
      || CASE WHEN NULLIF(btrim(raw->>'SITUS_ZIP'), '') IS NOT NULL THEN ' ' || NULLIF(btrim(raw->>'SITUS_ZIP'), '') ELSE '' END,
      ''
    ),
    NULLIF(btrim(raw->>'situs_address'), ''),
    NULLIF(btrim(raw->>'SITUS_ADDRESS'), ''),
    NULLIF(btrim(raw->>'situsAddress'), ''),
    NULLIF(btrim(raw->>'address'), ''),
    NULLIF(btrim(raw #>> '{situs,address}'), '')
  ),

  -- land_use_code: TCAD key (LOC_LAND_U)
  land_use_code = COALESCE(
    land_use_code,
    NULLIF(btrim(raw->>'LOC_LAND_U'), ''),
    NULLIF(btrim(raw->>'land_use'), ''),
    NULLIF(btrim(raw->>'LAND_USE'), ''),
    NULLIF(btrim(raw->>'landUse'), ''),
    NULLIF(btrim(raw->>'land_use_code'), ''),
    NULLIF(btrim(raw->>'LAND_USE_CODE'), ''),
    NULLIF(btrim(raw #>> '{landUse,code}'), '')
  ),

  -- land_use_description: TCAD keys (STAT_LAND_ preferred, fallback to LOC_LAND_U)
  land_use_description = COALESCE(
    land_use_description,
    NULLIF(btrim(raw->>'STAT_LAND_'), ''),
    NULLIF(btrim(raw->>'LOC_LAND_U'), ''),
    NULLIF(btrim(raw->>'land_use_desc'), ''),
    NULLIF(btrim(raw->>'LAND_USE_DESC'), ''),
    NULLIF(btrim(raw->>'landUseDesc'), ''),
    NULLIF(btrim(raw->>'land_use_description'), ''),
    NULLIF(btrim(raw->>'LAND_USE_DESCRIPTION'), ''),
    NULLIF(btrim(raw #>> '{landUse,description}'), '')
  ),

  -- assessed_land_value: TCAD key (LAND_VALUE)
  assessed_land_value = COALESCE(
    assessed_land_value,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'LAND_VALUE'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'land_value'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'landValue'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric,
    NULLIF(regexp_replace(NULLIF(btrim(raw #>> '{values,assessed,land}'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric
  ),

  -- assessed_improvement_value: TCAD key (IMP_VALUE)
  assessed_improvement_value = COALESCE(
    assessed_improvement_value,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'IMP_VALUE'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'improvement_value'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'IMPROVEMENT_VALUE'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'improvementValue'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric,
    NULLIF(regexp_replace(NULLIF(btrim(raw #>> '{values,assessed,improvement}'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric
  ),

  -- assessed_total_value: TCAD key (MKT_VALUE)
  assessed_total_value = COALESCE(
    assessed_total_value,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'MKT_VALUE'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'market_value'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'MARKET_VALUE'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'assessed_value'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'ASSESSED_VALUE'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'assessedValue'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric,
    NULLIF(regexp_replace(NULLIF(btrim(raw #>> '{values,assessed,total}'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric
  ),

  -- year_built: TCAD key (YEAR_BUILT)
  year_built = COALESCE(
    year_built,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'YEAR_BUILT'), ''), '[^0-9\\-]', '', 'g'), '')::int,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'year_built'), ''), '[^0-9\\-]', '', 'g'), '')::int,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'yearBuilt'), ''), '[^0-9\\-]', '', 'g'), '')::int,
    NULLIF(regexp_replace(NULLIF(btrim(raw #>> '{building,yearBuilt}'), ''), '[^0-9\\-]', '', 'g'), '')::int
  ),

  -- acreage: TCAD key (GIS_AREA)
  acreage = COALESCE(
    acreage,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'GIS_AREA'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'acres'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'ACRES'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric,
    NULLIF(regexp_replace(NULLIF(btrim(raw #>> '{site,acreage}'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric
  ),

  -- zoning_code: top-level variants + nested path
  zoning_code = COALESCE(
    zoning_code,
    NULLIF(btrim(raw->>'zoning'), ''),
    NULLIF(btrim(raw->>'ZONING'), ''),
    NULLIF(btrim(raw #>> '{zoning,code}'), '')
  ),

  -- flood_zone: nested path only
  flood_zone = COALESCE(
    flood_zone,
    NULLIF(btrim(raw #>> '{flood,zone}'), '')
  ),

  -- tax_delinquent_flag: nested path only
  tax_delinquent_flag = COALESCE(
    tax_delinquent_flag,
    CASE
      WHEN NULLIF(btrim(raw->>'tax_delinquent'), '') IS NULL THEN NULL
      WHEN upper(NULLIF(btrim(raw->>'tax_delinquent'), '')) IN ('Y','YES','TRUE','1') THEN TRUE
      WHEN upper(NULLIF(btrim(raw->>'tax_delinquent'), '')) IN ('N','NO','FALSE','0') THEN FALSE
      ELSE NULL
    END,
    CASE
      WHEN NULLIF(btrim(raw->>'TAX_DELINQUENT'), '') IS NULL THEN NULL
      WHEN upper(NULLIF(btrim(raw->>'TAX_DELINQUENT'), '')) IN ('Y','YES','TRUE','1') THEN TRUE
      WHEN upper(NULLIF(btrim(raw->>'TAX_DELINQUENT'), '')) IN ('N','NO','FALSE','0') THEN FALSE
      ELSE NULL
    END,
    CASE
      WHEN NULLIF(btrim(raw #>> '{tax,delinquent}'), '') IS NULL THEN NULL
      WHEN upper(NULLIF(btrim(raw #>> '{tax,delinquent}'), '')) IN ('Y','YES','TRUE','1') THEN TRUE
      WHEN upper(NULLIF(btrim(raw #>> '{tax,delinquent}'), '')) IN ('N','NO','FALSE','0') THEN FALSE
      ELSE NULL
    END
  ),

  -- last_sale_date: nested path only
  last_sale_date = COALESCE(
    last_sale_date,
    CASE WHEN NULLIF(btrim(raw->>'last_sale_date'), '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (NULLIF(btrim(raw->>'last_sale_date'), '')::date) ELSE NULL END,
    CASE WHEN NULLIF(btrim(raw->>'LAST_SALE_DATE'), '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (NULLIF(btrim(raw->>'LAST_SALE_DATE'), '')::date) ELSE NULL END,
    CASE WHEN NULLIF(btrim(raw #>> '{sale,lastDate}'), '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (NULLIF(btrim(raw #>> '{sale,lastDate}'), ''))::date ELSE NULL END
  ),

  -- last_sale_price: nested path only
  last_sale_price = COALESCE(
    last_sale_price,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'last_sale_price'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric,
    NULLIF(regexp_replace(NULLIF(btrim(raw->>'LAST_SALE_PRICE'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric,
    NULLIF(regexp_replace(NULLIF(btrim(raw #>> '{sale,lastPrice}'), ''), '[^0-9\\.-]', '', 'g'), '')::numeric
  ),

  -- homestead_exemption_flag: nested path only
  homestead_exemption_flag = COALESCE(
    homestead_exemption_flag,
    CASE
      WHEN NULLIF(btrim(raw->>'homestead_exemption'), '') IS NULL THEN NULL
      WHEN upper(NULLIF(btrim(raw->>'homestead_exemption'), '')) IN ('Y','YES','TRUE','1') THEN TRUE
      WHEN upper(NULLIF(btrim(raw->>'homestead_exemption'), '')) IN ('N','NO','FALSE','0') THEN FALSE
      ELSE NULL
    END,
    CASE
      WHEN NULLIF(btrim(raw->>'HOMESTEAD_EXEMPTION'), '') IS NULL THEN NULL
      WHEN upper(NULLIF(btrim(raw->>'HOMESTEAD_EXEMPTION'), '')) IN ('Y','YES','TRUE','1') THEN TRUE
      WHEN upper(NULLIF(btrim(raw->>'HOMESTEAD_EXEMPTION'), '')) IN ('N','NO','FALSE','0') THEN FALSE
      ELSE NULL
    END,
    CASE
      WHEN NULLIF(btrim(raw #>> '{exemptions,homestead}'), '') IS NULL THEN NULL
      WHEN upper(NULLIF(btrim(raw #>> '{exemptions,homestead}'), '')) IN ('Y','YES','TRUE','1') THEN TRUE
      WHEN upper(NULLIF(btrim(raw #>> '{exemptions,homestead}'), '')) IN ('N','NO','FALSE','0') THEN FALSE
      ELSE NULL
    END
  )

WHERE raw IS NOT NULL;

-- Step 3: Create indexes (minimal set)
CREATE INDEX IF NOT EXISTS parcels_travis_enrichment_land_use_code_idx 
  ON parcels_travis_enrichment (land_use_code) 
  WHERE land_use_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS parcels_travis_enrichment_assessed_total_value_idx 
  ON parcels_travis_enrichment (assessed_total_value) 
  WHERE assessed_total_value IS NOT NULL;

CREATE INDEX IF NOT EXISTS parcels_travis_enrichment_year_built_idx 
  ON parcels_travis_enrichment (year_built) 
  WHERE year_built IS NOT NULL;

CREATE INDEX IF NOT EXISTS parcels_travis_enrichment_acreage_idx 
  ON parcels_travis_enrichment (acreage) 
  WHERE acreage IS NOT NULL;

CREATE INDEX IF NOT EXISTS parcels_travis_enrichment_zoning_code_idx 
  ON parcels_travis_enrichment (zoning_code) 
  WHERE zoning_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS parcels_travis_enrichment_flood_zone_idx 
  ON parcels_travis_enrichment (flood_zone) 
  WHERE flood_zone IS NOT NULL;

-- Log summary
DO $$
DECLARE
  v_total INTEGER;
  v_with_owner_name INTEGER;
  v_with_mailing_address INTEGER;
  v_with_situs INTEGER;
  v_with_assessed INTEGER;
  v_with_acreage INTEGER;
  v_with_year_built INTEGER;
BEGIN
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE owner_name IS NOT NULL),
    COUNT(*) FILTER (WHERE mailing_address IS NOT NULL),
    COUNT(*) FILTER (WHERE situs_address IS NOT NULL),
    COUNT(*) FILTER (WHERE assessed_total_value IS NOT NULL),
    COUNT(*) FILTER (WHERE acreage IS NOT NULL),
    COUNT(*) FILTER (WHERE year_built IS NOT NULL)
  INTO v_total, v_with_owner_name, v_with_mailing_address, v_with_situs, v_with_assessed, v_with_acreage, v_with_year_built
  FROM parcels_travis_enrichment;
  
  RAISE NOTICE 'Materialization complete. Total rows: %, With owner_name: %, With mailing_address: %, With situs_address: %, With assessed_total_value: %, With acreage: %, With year_built: %', 
    v_total, v_with_owner_name, v_with_mailing_address, v_with_situs, v_with_assessed, v_with_acreage, v_with_year_built;
END $$;
