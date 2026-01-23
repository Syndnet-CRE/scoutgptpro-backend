-- ============================================================
-- SCOUTGPT INVESTOR DEMO - CRM & DEAL ROOM SCHEMA
-- ============================================================

-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. CRM STAGING TABLE
-- Holds properties user has staged before promoting to Deal Room
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_staging (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    session_id TEXT,

    -- Property reference
    parcel_id TEXT NOT NULL,
    property_data JSONB NOT NULL DEFAULT '{}',

    -- Staging metadata
    source TEXT DEFAULT 'search',  -- 'search', 'map_click', 'import', 'ai_suggestion'
    notes TEXT,
    tags TEXT[] DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate staging per user
    UNIQUE(user_id, parcel_id)
);

-- Indexes for crm_staging
CREATE INDEX IF NOT EXISTS idx_crm_staging_user_id ON crm_staging(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_staging_session_id ON crm_staging(session_id);
CREATE INDEX IF NOT EXISTS idx_crm_staging_parcel_id ON crm_staging(parcel_id);
CREATE INDEX IF NOT EXISTS idx_crm_staging_created_at ON crm_staging(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_staging_tags ON crm_staging USING GIN(tags);

-- ============================================================
-- 2. DEAL ROOMS TABLE
-- One deal room per property, tracks entire deal lifecycle
-- ============================================================
CREATE TABLE IF NOT EXISTS deal_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Owner
    owner_id TEXT NOT NULL,

    -- Property reference (primary property for this deal room)
    parcel_id TEXT NOT NULL,
    property_data JSONB NOT NULL DEFAULT '{}',

    -- Deal metadata
    title TEXT NOT NULL,
    description TEXT,

    -- Deal stage tracking
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'closed_won', 'closed_lost')),
    stage TEXT DEFAULT 'discovery' CHECK (stage IN ('discovery', 'analysis', 'underwriting', 'negotiation', 'due_diligence', 'closing')),

    -- Sharing
    share_token TEXT UNIQUE,
    share_enabled BOOLEAN DEFAULT FALSE,
    share_expires_at TIMESTAMPTZ,

    -- Financial tracking (optional)
    asking_price NUMERIC(15, 2),
    offer_price NUMERIC(15, 2),
    estimated_value NUMERIC(15, 2),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One deal room per property per user
    UNIQUE(owner_id, parcel_id)
);

-- Indexes for deal_rooms
CREATE INDEX IF NOT EXISTS idx_deal_rooms_owner_id ON deal_rooms(owner_id);
CREATE INDEX IF NOT EXISTS idx_deal_rooms_parcel_id ON deal_rooms(parcel_id);
CREATE INDEX IF NOT EXISTS idx_deal_rooms_status ON deal_rooms(status);
CREATE INDEX IF NOT EXISTS idx_deal_rooms_stage ON deal_rooms(stage);
CREATE INDEX IF NOT EXISTS idx_deal_rooms_share_token ON deal_rooms(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deal_rooms_created_at ON deal_rooms(created_at DESC);

-- ============================================================
-- 3. DEAL ROOM ARTIFACTS TABLE
-- Links generated artifacts (PDFs, spreadsheets) to deal rooms
-- ============================================================
CREATE TABLE IF NOT EXISTS deal_room_artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_room_id UUID NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,

    -- Artifact details
    artifact_type TEXT NOT NULL CHECK (artifact_type IN (
        'acquisition_report',
        'site_analysis',
        'underwriting_model',
        'comp_analysis',
        'csv_export',
        'custom'
    )),
    title TEXT NOT NULL,
    description TEXT,

    -- File info
    file_path TEXT NOT NULL,
    file_format TEXT NOT NULL,  -- 'pdf', 'xlsx', 'csv'
    file_size_bytes INTEGER,

    -- Generation metadata
    generation_params JSONB DEFAULT '{}',
    generated_by TEXT,  -- user_id or 'system'

    -- Version control
    version INTEGER DEFAULT 1,
    is_latest BOOLEAN DEFAULT TRUE,
    previous_version_id UUID REFERENCES deal_room_artifacts(id),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for deal_room_artifacts
CREATE INDEX IF NOT EXISTS idx_deal_room_artifacts_deal_room_id ON deal_room_artifacts(deal_room_id);
CREATE INDEX IF NOT EXISTS idx_deal_room_artifacts_type ON deal_room_artifacts(artifact_type);
CREATE INDEX IF NOT EXISTS idx_deal_room_artifacts_latest ON deal_room_artifacts(deal_room_id, is_latest) WHERE is_latest = TRUE;
CREATE INDEX IF NOT EXISTS idx_deal_room_artifacts_created_at ON deal_room_artifacts(created_at DESC);

-- ============================================================
-- 4. DEAL ROOM MEMBERS TABLE
-- Team collaboration - who has access to each deal room
-- ============================================================
CREATE TABLE IF NOT EXISTS deal_room_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_room_id UUID NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,

    -- Member info
    user_id TEXT NOT NULL,
    email TEXT,
    name TEXT,

    -- Permissions
    role TEXT DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),

    -- Invitation tracking
    invited_by TEXT,
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One membership per user per deal room
    UNIQUE(deal_room_id, user_id)
);

-- Indexes for deal_room_members
CREATE INDEX IF NOT EXISTS idx_deal_room_members_deal_room_id ON deal_room_members(deal_room_id);
CREATE INDEX IF NOT EXISTS idx_deal_room_members_user_id ON deal_room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_deal_room_members_email ON deal_room_members(email) WHERE email IS NOT NULL;

-- ============================================================
-- 5. DEAL ROOM ACTIVITY LOG
-- Audit trail for all actions in a deal room
-- ============================================================
CREATE TABLE IF NOT EXISTS deal_room_activity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_room_id UUID NOT NULL REFERENCES deal_rooms(id) ON DELETE CASCADE,

    -- Actor
    user_id TEXT,
    user_name TEXT,

    -- Activity details
    action TEXT NOT NULL,  -- 'created', 'stage_changed', 'artifact_generated', 'shared', 'member_added', etc.
    action_type TEXT DEFAULT 'info' CHECK (action_type IN ('info', 'success', 'warning', 'milestone')),
    description TEXT,

    -- Optional metadata
    metadata JSONB DEFAULT '{}',

    -- Reference to related entity (artifact, member, etc.)
    related_entity_type TEXT,
    related_entity_id UUID,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for deal_room_activity
CREATE INDEX IF NOT EXISTS idx_deal_room_activity_deal_room_id ON deal_room_activity(deal_room_id);
CREATE INDEX IF NOT EXISTS idx_deal_room_activity_user_id ON deal_room_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_deal_room_activity_action ON deal_room_activity(action);
CREATE INDEX IF NOT EXISTS idx_deal_room_activity_created_at ON deal_room_activity(created_at DESC);

-- ============================================================
-- TRIGGER: Auto-update updated_at timestamps
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
DROP TRIGGER IF EXISTS trg_crm_staging_updated_at ON crm_staging;
CREATE TRIGGER trg_crm_staging_updated_at
    BEFORE UPDATE ON crm_staging
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_deal_rooms_updated_at ON deal_rooms;
CREATE TRIGGER trg_deal_rooms_updated_at
    BEFORE UPDATE ON deal_rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_deal_room_artifacts_updated_at ON deal_room_artifacts;
CREATE TRIGGER trg_deal_room_artifacts_updated_at
    BEFORE UPDATE ON deal_room_artifacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_deal_room_members_updated_at ON deal_room_members;
CREATE TRIGGER trg_deal_room_members_updated_at
    BEFORE UPDATE ON deal_room_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON TABLE crm_staging IS 'Staging area for properties before promoting to deal rooms';
COMMENT ON TABLE deal_rooms IS 'Deal rooms for tracking property acquisition workflow';
COMMENT ON TABLE deal_room_artifacts IS 'Generated documents attached to deal rooms';
COMMENT ON TABLE deal_room_members IS 'Team members with access to deal rooms';
COMMENT ON TABLE deal_room_activity IS 'Audit log of all deal room activities';

-- Report completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 001_crm_dealroom_schema completed successfully';
END $$;
