-- ============================================================================
-- DDL ONLY. APPLY MANUALLY AFTER REVIEW.
-- ============================================================================
-- Migration: 0001_travis_resolver_and_parcels.sql
-- Purpose: Create staging, xref, and parcel polygon tables for Travis County
-- Date: 2025-12-28
-- 
-- NON-DESTRUCTIVE: This migration only creates new tables.
-- No existing tables are modified, dropped, or altered.
-- No data is inserted, updated, or deleted.
-- ============================================================================

SET search_path TO public;

-- Ensure PostGIS extension is available (non-destructive if already exists)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- 1. Staging Table: stg_attom_property_boundary_travis
-- ============================================================================
-- Purpose: Staging table for ATTOM property boundary match data ingestion
-- This table will be populated from ATTOM Property ↔ Boundary Match files
-- before being processed into the canonical xref table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stg_attom_property_boundary_travis (
    id BIGSERIAL PRIMARY KEY,
    parcel_id TEXT NOT NULL,
    attom_id TEXT NOT NULL,
    county TEXT,
    source_file TEXT,
    ingested_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    raw JSONB
);

-- Indexes for lookups during ingestion and processing
CREATE INDEX IF NOT EXISTS stg_attom_property_boundary_travis_parcel_id_idx 
    ON stg_attom_property_boundary_travis(parcel_id);

CREATE INDEX IF NOT EXISTS stg_attom_property_boundary_travis_attom_id_idx 
    ON stg_attom_property_boundary_travis(attom_id);

-- Composite index for common lookup pattern (parcel_id + attom_id)
CREATE INDEX IF NOT EXISTS stg_attom_property_boundary_travis_parcel_attom_idx 
    ON stg_attom_property_boundary_travis(parcel_id, attom_id);

COMMENT ON TABLE stg_attom_property_boundary_travis IS 
    'Staging table for ATTOM property boundary match data. Populated during ingestion, then processed into xref_parcel_property_travis.';

COMMENT ON COLUMN stg_attom_property_boundary_travis.parcel_id IS 
    'Parcel identifier from ATTOM boundary match file (numeric string, e.g., "970897")';

COMMENT ON COLUMN stg_attom_property_boundary_travis.attom_id IS 
    'ATTOM property ID from boundary match file';

COMMENT ON COLUMN stg_attom_property_boundary_travis.county IS 
    'County name (should be "Travis" for this table)';

COMMENT ON COLUMN stg_attom_property_boundary_travis.source_file IS 
    'Source filename or identifier for traceability';

COMMENT ON COLUMN stg_attom_property_boundary_travis.raw IS 
    'Optional raw JSON data from source file for debugging/reprocessing';

-- ============================================================================
-- 2. Cross-Reference Table: xref_parcel_property_travis
-- ============================================================================
-- Purpose: Canonical mapping between parcel_id and attom_id for Travis County
-- This table provides the authoritative source for parcel ↔ property resolution
-- and will be used by the /api/properties/resolve endpoint.
-- ============================================================================

CREATE TABLE IF NOT EXISTS xref_parcel_property_travis (
    parcel_id TEXT NOT NULL,
    attom_id TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'attom_property_boundary_match',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    PRIMARY KEY (parcel_id, attom_id)
);

-- Indexes for fast lookups in both directions
CREATE INDEX IF NOT EXISTS xref_parcel_property_travis_parcel_id_idx 
    ON xref_parcel_property_travis(parcel_id);

CREATE INDEX IF NOT EXISTS xref_parcel_property_travis_attom_id_idx 
    ON xref_parcel_property_travis(attom_id);

COMMENT ON TABLE xref_parcel_property_travis IS 
    'Canonical mapping between parcel_id and attom_id for Travis County. Used for parcel ↔ property resolution.';

COMMENT ON COLUMN xref_parcel_property_travis.parcel_id IS 
    'Parcel identifier (numeric string, e.g., "970897") - matches properties.parcelId';

COMMENT ON COLUMN xref_parcel_property_travis.attom_id IS 
    'ATTOM property ID - matches properties.attomId';

COMMENT ON COLUMN xref_parcel_property_travis.source IS 
    'Source of the mapping (e.g., "attom_property_boundary_match", "manual", etc.)';

-- ============================================================================
-- 3. Parcel Polygon Table: parcels_travis
-- ============================================================================
-- Purpose: PostGIS table storing parcel polygon geometries for Travis County
-- This table will be populated from ATTOM Parcel GeoJSON files and enables:
-- - Spatial queries (ST_Intersects, ST_Within, etc.)
-- - Vector tile generation
-- - Efficient spatial joins with other GIS layers
-- ============================================================================

CREATE TABLE IF NOT EXISTS parcels_travis (
    parcel_id TEXT PRIMARY KEY,
    geom GEOMETRY(MultiPolygon, 4326) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    -- Note: ETL scripts must use ST_MakeValid() when inserting geometries
    -- to ensure geometry validity. CHECK constraint removed to allow
    -- insertion of geometries that may need validation during ETL process.
);

-- GiST spatial index for efficient spatial queries
CREATE INDEX IF NOT EXISTS parcels_travis_geom_idx 
    ON parcels_travis USING GIST (geom);

-- Note: No separate index on parcel_id needed - PRIMARY KEY already creates one

COMMENT ON TABLE parcels_travis IS 
    'PostGIS table storing parcel polygon geometries for Travis County. Populated from ATTOM Parcel GeoJSON files.';

COMMENT ON COLUMN parcels_travis.parcel_id IS 
    'Parcel identifier (numeric string, e.g., "970897") - matches properties.parcelId';

COMMENT ON COLUMN parcels_travis.geom IS 
    'PostGIS MultiPolygon geometry in SRID 4326 (WGS84)';

-- ============================================================================
-- 4. Conflicts Table: xref_parcel_property_travis_conflicts
-- ============================================================================
-- Purpose: Quarantine parcel_id values that map to multiple ATTOM IDs
-- This table stores collisions for manual review and resolution.
-- ============================================================================

CREATE TABLE IF NOT EXISTS xref_parcel_property_travis_conflicts (
    parcel_id TEXT PRIMARY KEY,
    attom_ids TEXT[] NOT NULL,
    attom_id_count INTEGER NOT NULL,
    sample_rows JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS xref_parcel_property_travis_conflicts_attom_id_count_idx 
    ON xref_parcel_property_travis_conflicts(attom_id_count DESC);

COMMENT ON TABLE xref_parcel_property_travis_conflicts IS 
    'Quarantine table for parcel_id values that map to multiple ATTOM IDs. Requires manual review.';

COMMENT ON COLUMN xref_parcel_property_travis_conflicts.parcel_id IS 
    'Parcel identifier (6-digit numeric string) that has multiple ATTOM ID mappings';

COMMENT ON COLUMN xref_parcel_property_travis_conflicts.attom_ids IS 
    'Array of all ATTOM IDs that map to this parcel_id';

COMMENT ON COLUMN xref_parcel_property_travis_conflicts.attom_id_count IS 
    'Number of distinct ATTOM IDs (length of attom_ids array)';

COMMENT ON COLUMN xref_parcel_property_travis_conflicts.sample_rows IS 
    'Sample feature properties (up to 5) for debugging and manual review';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Next Steps (to be executed separately):
-- 1. Populate stg_attom_property_boundary_travis from ATTOM boundary match files
-- 2. Process staging data into xref_parcel_property_travis
-- 3. Populate parcels_travis from ATTOM Parcel GeoJSON files
-- 4. Verify data integrity and create foreign key relationships if needed
-- 5. Ingest ATTOM GeoJSON mappings into xref_parcel_property_travis (unique only)
-- 6. Quarantine collisions in xref_parcel_property_travis_conflicts
-- ============================================================================

