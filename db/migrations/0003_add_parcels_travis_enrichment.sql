-- ============================================================================
-- Migration: 0003_add_parcels_travis_enrichment.sql
-- Purpose: Add enrichment table for Travis County parcel attributes from TxGIO
-- Date: 2024-12-30
-- ============================================================================

SET search_path TO public;

-- Create enrichment table
CREATE TABLE IF NOT EXISTS parcels_travis_enrichment (
    parcel_id TEXT PRIMARY KEY REFERENCES parcels_travis(parcel_id) ON DELETE CASCADE,
    owner_name TEXT,
    owner2 TEXT,
    mail_address1 TEXT,
    mail_address2 TEXT,
    mail_city TEXT,
    mail_state TEXT,
    mail_zip TEXT,
    situs_address TEXT,
    land_use TEXT,
    land_use_desc TEXT,
    legal_desc TEXT,
    year_built INT,
    acres NUMERIC,
    land_value NUMERIC,
    improvement_value NUMERIC,
    market_value NUMERIC,
    assessed_value NUMERIC,
    last_update DATE,
    source_layer TEXT,
    raw JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for common query fields
CREATE INDEX IF NOT EXISTS parcels_travis_enrichment_owner_name_idx 
    ON parcels_travis_enrichment (owner_name);

CREATE INDEX IF NOT EXISTS parcels_travis_enrichment_land_use_idx 
    ON parcels_travis_enrichment (land_use);

CREATE INDEX IF NOT EXISTS parcels_travis_enrichment_market_value_idx 
    ON parcels_travis_enrichment (market_value);

CREATE INDEX IF NOT EXISTS parcels_travis_enrichment_year_built_idx 
    ON parcels_travis_enrichment (year_built);

-- Staging table for raw ingestion
CREATE TABLE IF NOT EXISTS parcels_travis_enrichment_stage (
    id BIGSERIAL PRIMARY KEY,
    raw JSONB NOT NULL,
    detected_id TEXT,
    ingested_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS parcels_travis_enrichment_stage_detected_id_idx 
    ON parcels_travis_enrichment_stage (detected_id);

-- Comments
COMMENT ON TABLE parcels_travis_enrichment IS 
    'Enrichment attributes for Travis County parcels from Texas ArcGIS REST service';

COMMENT ON TABLE parcels_travis_enrichment_stage IS 
    'Staging table for raw enrichment data before matching to parcel_id';

