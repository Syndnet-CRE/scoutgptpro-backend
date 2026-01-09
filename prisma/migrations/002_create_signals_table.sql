-- Migration: Create signals table
-- Purpose: Store property signals (tax delinquency, sales, foreclosures, etc.)
-- Created: 2025-01-08

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  parcel_id TEXT NOT NULL,
  county_fips TEXT NOT NULL DEFAULT '48453',
  signal_type TEXT NOT NULL,
  signal_subtype TEXT,
  signal_date DATE,
  signal_value NUMERIC,
  signal_years INTEGER,
  signal_severity TEXT CHECK (signal_severity IN ('low', 'medium', 'high', 'critical')),
  source_system TEXT NOT NULL,
  source_id TEXT,
  source_url TEXT,
  raw_data JSONB,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_signals_parcel FOREIGN KEY (parcel_id) 
    REFERENCES parcel_features_travis(parcel_id) 
    ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_signals_parcel_id ON signals(parcel_id);
CREATE INDEX IF NOT EXISTS idx_signals_signal_type ON signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_signals_is_active ON signals(is_active);
CREATE INDEX IF NOT EXISTS idx_signals_signal_severity ON signals(signal_severity);
CREATE INDEX IF NOT EXISTS idx_signals_county_fips ON signals(county_fips);
CREATE INDEX IF NOT EXISTS idx_signals_signal_date ON signals(signal_date);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_signals_parcel_active ON signals(parcel_id, is_active) WHERE is_active = true;

COMMENT ON TABLE signals IS 'Property signals indicating distress, opportunities, or market activity';
COMMENT ON COLUMN signals.signal_type IS 'Type of signal: tax_delinquent, foreclosure, sale, permit, etc.';
COMMENT ON COLUMN signals.signal_severity IS 'Severity level: low, medium, high, critical';
COMMENT ON COLUMN signals.source_system IS 'Source system: tcad, recorder, attom, etc.';
