-- Migration: Create scoring_models table
-- Purpose: Store scoring model configurations
-- Created: 2025-01-08

CREATE TABLE IF NOT EXISTS scoring_models (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL DEFAULT '1.0',
  model_config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  
  CONSTRAINT uq_scoring_models_name_version UNIQUE (model_name, model_version)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scoring_models_name ON scoring_models(model_name);
CREATE INDEX IF NOT EXISTS idx_scoring_models_version ON scoring_models(model_version);
CREATE INDEX IF NOT EXISTS idx_scoring_models_is_active ON scoring_models(is_active) WHERE is_active = true;

-- Insert default v1.0 model
INSERT INTO scoring_models (model_name, model_version, model_config, is_active, created_by)
VALUES (
  'default',
  '1.0',
  '{
    "weights": {
      "distress": {
        "tax_delinquent": 25,
        "foreclosure": 30,
        "back_taxes": 20,
        "lien": 15
      },
      "offmarket": {
        "absentee_owner": 20,
        "long_hold": 15,
        "out_of_state": 10,
        "entity_owned": 10
      },
      "value": {
        "undervalued": 20,
        "development_potential": 15,
        "location_premium": 10,
        "zoning_opportunity": 10
      }
    },
    "thresholds": {
      "high_opportunity": 70,
      "medium_opportunity": 50,
      "low_opportunity": 30
    },
    "factors": {
      "acres_weight": 0.1,
      "value_weight": 0.2,
      "location_weight": 0.3,
      "owner_weight": 0.4
    }
  }'::jsonb,
  true,
  'system'
) ON CONFLICT (model_name, model_version) DO NOTHING;

COMMENT ON TABLE scoring_models IS 'Scoring model configurations for opportunity scoring';
COMMENT ON COLUMN scoring_models.model_config IS 'JSONB configuration with weights, thresholds, and factors';
