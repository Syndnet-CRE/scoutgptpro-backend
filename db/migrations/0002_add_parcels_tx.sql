-- ============================================================================
-- Migration: 0002_add_parcels_tx.sql
-- Purpose: Create parcels_tx table for Texas statewide parcel backbone
-- Date: 2024-12-30
-- ============================================================================

SET search_path TO public;

-- Ensure PostGIS extension is available
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create parcels_tx table
CREATE TABLE IF NOT EXISTS parcels_tx (
    parcel_uid TEXT PRIMARY KEY,
    geom GEOMETRY(MultiPolygon, 4326) NOT NULL,
    state_fips TEXT NOT NULL,
    county_fips TEXT NOT NULL,
    prop_id TEXT,
    geo_id TEXT,
    source_layer TEXT,
    ingested_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Spatial index for bbox queries
CREATE INDEX IF NOT EXISTS parcels_tx_geom_idx 
    ON parcels_tx USING GIST (geom);

-- Index for county filtering
CREATE INDEX IF NOT EXISTS parcels_tx_county_fips_idx 
    ON parcels_tx (county_fips);

-- Index for state filtering
CREATE INDEX IF NOT EXISTS parcels_tx_state_fips_idx 
    ON parcels_tx (state_fips);

-- Composite index for common lookups
CREATE INDEX IF NOT EXISTS parcels_tx_county_state_idx 
    ON parcels_tx (county_fips, state_fips);

-- Comments
COMMENT ON TABLE parcels_tx IS 
    'Texas statewide parcel geometries. Canonical backbone table for all Texas parcels.';

COMMENT ON COLUMN parcels_tx.parcel_uid IS 
    'Canonical parcel UID: state_fips + county_fips + prop_id (or geo_id fallback)';

COMMENT ON COLUMN parcels_tx.geom IS 
    'PostGIS MultiPolygon geometry in SRID 4326 (WGS84)';

COMMENT ON COLUMN parcels_tx.county_fips IS 
    'County FIPS code (e.g., "48453" for Travis County)';

COMMENT ON COLUMN parcels_tx.source_layer IS 
    'Source layer name from ArcGIS REST API (for traceability)';

