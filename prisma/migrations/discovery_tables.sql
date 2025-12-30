-- Discovery Engine Tables Migration
-- Creates new tables without modifying existing tables
-- Run with: npx prisma db execute --file prisma/migrations/discovery_tables.sql

-- Create enum type for EntityType if it doesn't exist
DO $$ BEGIN
    CREATE TYPE entity_type AS ENUM ('PERSON', 'LLC', 'INC', 'LP', 'TRUST', 'UNKNOWN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. owners table
CREATE TABLE IF NOT EXISTS owners (
    id TEXT PRIMARY KEY,
    "ownerNameRaw" TEXT,
    "ownerNameNorm" TEXT,
    "mailingAddressRaw" TEXT,
    "mailingAddressNorm" TEXT,
    "mailingState" TEXT,
    "entityType" entity_type NOT NULL DEFAULT 'UNKNOWN',
    "isCorporate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_owners_ownerNameNorm ON owners("ownerNameNorm");
CREATE INDEX IF NOT EXISTS idx_owners_mailingState ON owners("mailingState");
CREATE INDEX IF NOT EXISTS idx_owners_entityType ON owners("entityType");
CREATE INDEX IF NOT EXISTS idx_owners_isCorporate ON owners("isCorporate");

-- 2. owner_properties table
CREATE TABLE IF NOT EXISTS owner_properties (
    id TEXT PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "owner_properties_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES owners(id) ON DELETE CASCADE,
    UNIQUE("ownerId", "parcelId")
);

CREATE INDEX IF NOT EXISTS idx_owner_properties_parcelId ON owner_properties("parcelId");
CREATE INDEX IF NOT EXISTS idx_owner_properties_ownerId ON owner_properties("ownerId");

-- 3. owner_features_tx table
CREATE TABLE IF NOT EXISTS owner_features_tx (
    id TEXT PRIMARY KEY,
    "ownerId" TEXT NOT NULL UNIQUE,
    "parcelCountTx" INTEGER NOT NULL DEFAULT 0,
    "totalAssessedValueTx" DECIMAL(15, 2),
    "assetClassMix" JSONB,
    "absenteeRate" DECIMAL(5, 4),
    "outOfState" BOOLEAN NOT NULL DEFAULT false,
    "avgHoldYears" DECIMAL(5, 2),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "owner_features_tx_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES owners(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_owner_features_tx_parcelCountTx ON owner_features_tx("parcelCountTx");
CREATE INDEX IF NOT EXISTS idx_owner_features_tx_outOfState ON owner_features_tx("outOfState");

-- 4. owner_segments table
CREATE TABLE IF NOT EXISTS owner_segments (
    "segmentKey" TEXT PRIMARY KEY,
    description TEXT,
    "ruleJson" JSONB NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_owner_segments_segmentKey ON owner_segments("segmentKey");

-- 5. tx_enrichment_rollups table
CREATE TABLE IF NOT EXISTS tx_enrichment_rollups (
    "parcelId" TEXT PRIMARY KEY,
    "pop1mi" DECIMAL(10, 0),
    "medIncome1mi" DECIMAL(10, 2),
    "poiCounts" JSONB,
    "nearestPoi" JSONB,
    "trafficIndex" DECIMAL(5, 2),
    "floodPct" DECIMAL(5, 4),
    "inFloodplain" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tx_enrichment_rollups_parcelId ON tx_enrichment_rollups("parcelId");

-- 6. buyboxes table
CREATE TABLE IF NOT EXISTS buyboxes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    "intentJson" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_buyboxes_createdBy ON buyboxes("createdBy");

-- 7. discover_runs table
CREATE TABLE IF NOT EXISTS discover_runs (
    id TEXT PRIMARY KEY,
    "queryText" TEXT,
    "intentJson" JSONB NOT NULL,
    "createdBy" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    stats JSONB,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_discover_runs_createdBy ON discover_runs("createdBy");
CREATE INDEX IF NOT EXISTS idx_discover_runs_startedAt ON discover_runs("startedAt");

-- 8. discover_results table
CREATE TABLE IF NOT EXISTS discover_results (
    id TEXT PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    score DECIMAL(10, 6) NOT NULL,
    reasons JSONB NOT NULL,
    breakdown JSONB NOT NULL,
    CONSTRAINT "discover_results_runId_fkey" FOREIGN KEY ("runId") REFERENCES discover_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_discover_results_runId ON discover_results("runId");
CREATE INDEX IF NOT EXISTS idx_discover_results_parcelId ON discover_results("parcelId");
CREATE INDEX IF NOT EXISTS idx_discover_results_score ON discover_results(score);

-- 9. scoring_models table
CREATE TABLE IF NOT EXISTS scoring_models (
    "modelId" TEXT PRIMARY KEY,
    "assetClass" TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0',
    "modelJson" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scoring_models_assetClass ON scoring_models("assetClass");
CREATE INDEX IF NOT EXISTS idx_scoring_models_version ON scoring_models(version);

-- Create function to update updatedAt timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updatedAt (only if they don't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_owners_updated_at') THEN
        CREATE TRIGGER update_owners_updated_at BEFORE UPDATE ON owners
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_owner_features_tx_updated_at') THEN
        CREATE TRIGGER update_owner_features_tx_updated_at BEFORE UPDATE ON owner_features_tx
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_owner_segments_updated_at') THEN
        CREATE TRIGGER update_owner_segments_updated_at BEFORE UPDATE ON owner_segments
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_tx_enrichment_rollups_updated_at') THEN
        CREATE TRIGGER update_tx_enrichment_rollups_updated_at BEFORE UPDATE ON tx_enrichment_rollups
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_buyboxes_updated_at') THEN
        CREATE TRIGGER update_buyboxes_updated_at BEFORE UPDATE ON buyboxes
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_scoring_models_updated_at') THEN
        CREATE TRIGGER update_scoring_models_updated_at BEFORE UPDATE ON scoring_models
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
