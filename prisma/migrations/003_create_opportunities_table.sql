-- Migration: Create opportunities table
-- Purpose: Store scored property opportunities with breakdowns
-- Created: 2025-01-08

CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  parcel_id TEXT NOT NULL UNIQUE,
  county_fips TEXT NOT NULL DEFAULT '48453',
  
  -- Scores (0-100)
  opportunity_score NUMERIC(5,2) DEFAULT 0,
  distress_score NUMERIC(5,2) DEFAULT 0,
  offmarket_score NUMERIC(5,2) DEFAULT 0,
  value_score NUMERIC(5,2) DEFAULT 0,
  
  -- Score breakdowns (JSONB for flexibility)
  distress_breakdown JSONB,
  offmarket_breakdown JSONB,
  value_breakdown JSONB,
  
  -- Tags and reasons
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  reasons_json JSONB,
  
  -- Model metadata
  model_version TEXT DEFAULT '1.0',
  scored_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  signal_count INTEGER DEFAULT 0,
  
  -- Denormalized fields (for fast filtering without joins)
  acres_calc NUMERIC,
  market_value NUMERIC,
  asset_class TEXT,
  owner_entity_type TEXT,
  is_absentee BOOLEAN DEFAULT false,
  situs_city TEXT,
  situs_zip TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_opportunities_parcel FOREIGN KEY (parcel_id) 
    REFERENCES parcel_features_travis(parcel_id) 
    ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_opportunities_parcel_id ON opportunities(parcel_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_opportunity_score ON opportunities(opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_distress_score ON opportunities(distress_score DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_offmarket_score ON opportunities(offmarket_score DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_value_score ON opportunities(value_score DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_tags ON opportunities USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_opportunities_county_fips ON opportunities(county_fips);
CREATE INDEX IF NOT EXISTS idx_opportunities_asset_class ON opportunities(asset_class);
CREATE INDEX IF NOT EXISTS idx_opportunities_model_version ON opportunities(model_version);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_opportunities_score_asset ON opportunities(opportunity_score DESC, asset_class) WHERE asset_class IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_score_county ON opportunities(opportunity_score DESC, county_fips);

COMMENT ON TABLE opportunities IS 'Scored property opportunities with detailed breakdowns';
COMMENT ON COLUMN opportunities.opportunity_score IS 'Overall opportunity score (0-100)';
COMMENT ON COLUMN opportunities.distress_score IS 'Distress indicator score (tax delinquency, foreclosure, etc.)';
COMMENT ON COLUMN opportunities.offmarket_score IS 'Off-market potential score (absentee owner, long hold, etc.)';
COMMENT ON COLUMN opportunities.value_score IS 'Value opportunity score (undervalued, development potential, etc.)';
COMMENT ON COLUMN opportunities.tags IS 'Array of opportunity tags: tax_delinquent, absentee_owner, vacant_land, etc.';
