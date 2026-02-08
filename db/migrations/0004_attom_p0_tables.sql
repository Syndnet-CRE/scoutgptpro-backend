-- ================================================================
-- ATTOM P0 Migration: Create tables for TAX_ASSESSOR, PARCELS, and PREFORECLOSURE
-- Source: ATTOM_SYNDNET_SHARE.DELIVERY (Snowflake data share)
-- Target: Travis County (FIPS 48453)
-- Created: February 5, 2026
-- ================================================================

-- Enable PostGIS if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- ================================================================
-- ATTOM P0: TAX_ASSESSOR → attom_assessor
-- Source: ATTOM_SYNDNET_SHARE.DELIVERY.TAX_ASSESSOR
-- Filter: SITUSSTATECOUNTYFIPS = '48453' (Travis County)
-- Expected rows: ~444,312
-- ================================================================

CREATE TABLE IF NOT EXISTS attom_assessor (
    -- === IDENTITY ===
    attom_id               BIGINT PRIMARY KEY,
    fips                   VARCHAR(5) NOT NULL,          -- SITUSSTATECOUNTYFIPS
    apn_raw                TEXT,                          -- PARCELNUMBERRAW
    apn_formatted          TEXT,                          -- PARCELNUMBERFORMATTED

    -- === LOCATION ===
    address_full           TEXT,                          -- PROPERTYADDRESSFULL
    address_house_number   TEXT,                          -- PROPERTYADDRESSHOUSENUMBER
    address_street_dir     TEXT,                          -- PROPERTYADDRESSSTREETDIRECTION
    address_street_name    TEXT,                          -- PROPERTYADDRESSSTREETNAME
    address_street_suffix  TEXT,                          -- PROPERTYADDRESSTREETSUFFIX
    address_unit           TEXT,                          -- PROPERTYADDRESSUNITNUMBER
    address_city           TEXT,                          -- PROPERTYADDRESSCITY
    address_state          VARCHAR(2),                    -- PROPERTYADDRESSSTATE
    address_zip            VARCHAR(10),                   -- PROPERTYADDRESSZIP
    latitude               NUMERIC(10,7),                 -- LATITUDE
    longitude              NUMERIC(11,7),                 -- LONGITUDE

    -- === OWNERSHIP ===
    owner1_name            TEXT,                          -- PARTYOWNER1NAMEFULL
    owner2_name            TEXT,                          -- PARTYOWNER2NAMEFULL
    owner_type_desc        TEXT,                          -- OWNERTYPEDESCRIPTION1
    company_flag           BOOLEAN,                       -- COMPANYFLAG
    owner_occupied         BOOLEAN,                       -- STATUSOWNEROCCUPIEDFLAG

    -- === CLASSIFICATION ===
    property_use_group     TEXT,                          -- PROPERTYUSEGROUP
    property_use_standard  TEXT,                          -- PROPERTYUSESTANDARDIZED
    zoned_code_local       TEXT,                          -- ZONEDCODELOCAL

    -- === PHYSICAL ===
    year_built             INTEGER,                       -- YEARBUILT
    building_sqft          NUMERIC,                       -- AREABUILDING
    lot_sqft               NUMERIC,                       -- AREALOTSF
    lot_acres              NUMERIC(12,4),                 -- AREALOTACRES
    stories_count          NUMERIC(4,1),                  -- STORIESCOUNT
    bedrooms_count         INTEGER,                       -- BEDROOMSCOUNT
    bath_count             NUMERIC(4,1),                  -- BATHCOUNT
    units_count            INTEGER,                       -- UNITSCOUNT
    rooms_count            INTEGER,                       -- ROOMSCOUNT
    parking_spaces         INTEGER,                       -- PARKINGSPACES
    pool_flag              BOOLEAN,                       -- POOLFLAG

    -- === VALUATION ===
    assessed_total         NUMERIC(14,2),                 -- TAXASSESSEDVALUETOTAL
    market_value_total     NUMERIC(14,2),                 -- TAXMARKETVALUETOTAL
    market_value_land      NUMERIC(14,2),                 -- TAXMARKETVALUELAND
    market_value_improve   NUMERIC(14,2),                 -- TAXMARKETVALUEIMPROVEMENTS

    -- === TAX ===
    tax_billed_amount      NUMERIC(12,2),                 -- TAXBILLEDAMOUNT
    tax_delinquent_year    INTEGER,                       -- TAXDELINQUENTYEAR
    tax_year               INTEGER,                       -- TAXYEAR
    homestead_exempt       BOOLEAN,                       -- TAXEXEMPTIONHOMEOWNERFLAG

    -- === SALES ===
    last_sale_date         DATE,                          -- DEEDLASTSALEDATE
    last_sale_price        NUMERIC(14,2),                 -- DEEDLASTSALEPRICE
    prior_sale_date        DATE,                          -- PRIORSALEDATE
    prior_sale_price       NUMERIC(14,2),                 -- PRIORSALEAMOUNT

    -- === DERIVED (compute on import) ===
    value_per_sqft         NUMERIC(10,2),                 -- market_value_total / building_sqft
    value_per_acre         NUMERIC(14,2),                 -- market_value_total / lot_acres
    improvement_ratio      NUMERIC(5,4),                  -- market_value_improve / market_value_total

    -- === METADATA ===
    data_source            VARCHAR(20) DEFAULT 'attom',
    imported_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for attom_assessor
CREATE INDEX idx_attom_assessor_fips ON attom_assessor(fips);
CREATE INDEX idx_attom_assessor_zip ON attom_assessor(address_zip);
CREATE INDEX idx_attom_assessor_city ON attom_assessor(address_city);
CREATE INDEX idx_attom_assessor_use_group ON attom_assessor(property_use_group);
CREATE INDEX idx_attom_assessor_use_standard ON attom_assessor(property_use_standard);
CREATE INDEX idx_attom_assessor_zoning ON attom_assessor(zoned_code_local);
CREATE INDEX idx_attom_assessor_acres ON attom_assessor(lot_acres);
CREATE INDEX idx_attom_assessor_market_value ON attom_assessor(market_value_total);
CREATE INDEX idx_attom_assessor_year_built ON attom_assessor(year_built);
CREATE INDEX idx_attom_assessor_tax_delinquent ON attom_assessor(tax_delinquent_year) WHERE tax_delinquent_year IS NOT NULL;
CREATE INDEX idx_attom_assessor_last_sale ON attom_assessor(last_sale_date);
CREATE INDEX idx_attom_assessor_owner_type ON attom_assessor(owner_type_desc);
CREATE INDEX idx_attom_assessor_company ON attom_assessor(company_flag) WHERE company_flag = true;
CREATE INDEX idx_attom_assessor_latlon ON attom_assessor(latitude, longitude);
CREATE INDEX idx_attom_assessor_apn ON attom_assessor(apn_formatted);

-- Full-text search on owner names
CREATE INDEX idx_attom_assessor_owner_fts ON attom_assessor USING gin(to_tsvector('english', coalesce(owner1_name, '') || ' ' || coalesce(owner2_name, '')));
-- Full-text search on address
CREATE INDEX idx_attom_assessor_address_fts ON attom_assessor USING gin(to_tsvector('english', coalesce(address_full, '')));

-- ================================================================
-- ATTOM P0: PARCELS → attom_parcels
-- Source: ATTOM_SYNDNET_SHARE.DELIVERY.PARCELS
-- Filter: FIPSSTATE = '48' AND FIPSCOUNTY = '453'
-- Expected rows: ~428,529
-- ================================================================

DROP TABLE IF EXISTS attom_parcels;

CREATE TABLE attom_parcels (
    id                     TEXT PRIMARY KEY,              -- ID
    apn                    TEXT,                          -- APN
    apn2                   TEXT,                          -- APN2
    fips_state             TEXT,                          -- FIPSSTATE
    fips_county            TEXT,                          -- FIPSCOUNTY
    addr_line1             TEXT,                          -- ADDRLINE1
    city                   TEXT,                          -- CITY
    state                  TEXT,                          -- STATE
    zip5                   TEXT,                          -- ZIP5
    latitude               DOUBLE PRECISION,              -- LATITUDE
    longitude              DOUBLE PRECISION,              -- LONGITUDE
    geom                   geometry(MultiPolygon, 4326)   -- GEOMETRY (converted from GeoJSON)
);

-- Indexes for attom_parcels
CREATE INDEX idx_attom_parcels_fips ON attom_parcels(fips_state, fips_county);
CREATE INDEX idx_attom_parcels_apn ON attom_parcels(apn);
CREATE INDEX idx_attom_parcels_geom ON attom_parcels USING GIST(geom);

-- ================================================================
-- ATTOM P0: PREFORECLOSURE → attom_preforeclosure
-- Source: ATTOM_SYNDNET_SHARE.DELIVERY.PREFORECLOSURE
-- Filter: SITUSSTATECOUNTYFIPS = '48453'
-- Expected rows: ~45,820
-- ================================================================

CREATE TABLE IF NOT EXISTS attom_preforeclosure (
    transaction_id         BIGINT PRIMARY KEY,            -- TRANSACTIONID
    attom_id               BIGINT NOT NULL,               -- ATTOMID (FK to attom_assessor)
    fips                   VARCHAR(5) NOT NULL,           -- SITUSSTATECOUNTYFIPS

    -- === PROPERTY LOCATION ===
    address_full           TEXT,                          -- PROPERTYADDRESSFULL
    address_city           TEXT,                          -- PROPERTYADDRESSCITY
    address_zip            VARCHAR(10),                   -- PROPERTYADDRESSZIP

    -- === RECORDING ===
    record_type            VARCHAR(10),                   -- RECORDTYPE (LIS, NOS, REO, etc.)
    document_number        TEXT,                          -- DOCUMENTNUMBER

    -- === FORECLOSURE DETAILS ===
    foreclosure_recording_date DATE,                     -- FORECLOSURERECORDINGDATE
    default_amount         NUMERIC(14,2),                 -- DEFAULTAMOUNT
    judgment_amount        NUMERIC(14,2),                 -- JUDGMENTAMOUNT
    judgment_date          DATE,                          -- JUDGMENTDATE
    auction_date           DATE,                          -- AUCTIONDATE
    auction_min_bid        NUMERIC(14,2),                 -- STARTINGBID

    -- === LOAN ===
    original_loan_amount   NUMERIC(14,2),                 -- ORIGINALLOANAMOUNT
    original_loan_rate     NUMERIC(6,3),                  -- ORIGINALLOANINTERESTRATE
    loan_maturity_date     DATE,                          -- LOANMATURITYDATE
    loan_balance           NUMERIC(14,2),                 -- LOANBALANCE
    lender_name            TEXT,                          -- LENDERNAME

    -- === OWNER ===
    borrower_name          TEXT,                          -- BORROWERNAME
    trustee_name           TEXT,                          -- TRUSTEENAME

    -- === METADATA ===
    data_source            VARCHAR(20) DEFAULT 'attom',
    imported_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for attom_preforeclosure
CREATE INDEX idx_attom_preforeclosure_attom_id ON attom_preforeclosure(attom_id);
CREATE INDEX idx_attom_preforeclosure_fips ON attom_preforeclosure(fips);
CREATE INDEX idx_attom_preforeclosure_record_type ON attom_preforeclosure(record_type);
CREATE INDEX idx_attom_preforeclosure_auction_date ON attom_preforeclosure(auction_date) WHERE auction_date IS NOT NULL;
CREATE INDEX idx_attom_preforeclosure_default_amount ON attom_preforeclosure(default_amount) WHERE default_amount IS NOT NULL;
CREATE INDEX idx_attom_preforeclosure_zip ON attom_preforeclosure(address_zip);

-- FK constraint (deferred — assessor data may not be loaded yet)
-- ALTER TABLE attom_preforeclosure ADD CONSTRAINT fk_preforeclosure_assessor
--   FOREIGN KEY (attom_id) REFERENCES attom_assessor(attom_id);

-- ================================================================
-- BRIDGE: Links attom_assessor to existing parcel_features_travis
-- via APN matching. Create AFTER both tables are populated.
-- ================================================================

CREATE OR REPLACE VIEW attom_parcel_bridge AS
SELECT
    a.attom_id,
    p.id AS attom_parcel_id,
    a.apn_formatted AS attom_apn,
    pft.parcel_id AS legacy_parcel_id,
    a.address_full AS attom_address,
    pft.situs_address AS legacy_address
FROM attom_assessor a
LEFT JOIN attom_parcels p ON a.apn_formatted = p.apn
LEFT JOIN parcel_features_travis pft ON a.apn_formatted = pft.parcel_id
WHERE a.fips = '48453';

-- ================================================================
-- Migration Complete
-- ================================================================