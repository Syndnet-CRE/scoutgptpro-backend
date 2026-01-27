-- CreateTable: sessions
CREATE TABLE IF NOT EXISTS "sessions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT,
    "state" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "idx_sessions_session_id" ON "sessions"("session_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_sessions_user_id" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_sessions_last_active" ON "sessions"("last_active_at");

-- CreateTable: claude_sessions
CREATE TABLE IF NOT EXISTS "claude_sessions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "session_id" TEXT,
    "user_id" TEXT,
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    "system_prompt" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "tool_use_count" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claude_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_claude_sessions_session_id" ON "claude_sessions"("session_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_claude_sessions_user_id" ON "claude_sessions"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_claude_sessions_started_at" ON "claude_sessions"("started_at");

-- CreateTable: claude_messages
CREATE TABLE IF NOT EXISTS "claude_messages" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "claude_session_id" TEXT NOT NULL,
    "message_index" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tool_uses" JSONB,
    "tool_results" JSONB,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claude_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "claude_messages_claude_session_id_message_index_key" ON "claude_messages"("claude_session_id", "message_index");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_claude_messages_session_id" ON "claude_messages"("claude_session_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_claude_messages_role" ON "claude_messages"("role");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_claude_messages_created_at" ON "claude_messages"("created_at");

-- CreateTable: parcel_enrichments
CREATE TABLE IF NOT EXISTS "parcel_enrichments" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "parcel_id" TEXT NOT NULL,
    "claude_session_id" TEXT,
    "enrichment_type" TEXT NOT NULL,
    "enrichment_data" JSONB NOT NULL,
    "confidence_score" DECIMAL(3,2),
    "source_tool" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_by" TEXT,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_enrichments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_parcel_enrichments_parcel_id" ON "parcel_enrichments"("parcel_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_parcel_enrichments_session_id" ON "parcel_enrichments"("claude_session_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_parcel_enrichments_type" ON "parcel_enrichments"("enrichment_type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_parcel_enrichments_verified" ON "parcel_enrichments"("verified");

-- CreateTable: training_export_log
CREATE TABLE IF NOT EXISTS "training_export_log" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "export_type" TEXT NOT NULL,
    "session_ids" TEXT[],
    "date_range_start" TIMESTAMPTZ(6),
    "date_range_end" TIMESTAMPTZ(6),
    "message_count" INTEGER,
    "enrichment_count" INTEGER,
    "file_path" TEXT,
    "file_size_bytes" BIGINT,
    "checksum" TEXT,
    "exported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exported_by" TEXT,
    "metadata" JSONB,

    CONSTRAINT "training_export_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_training_export_log_exported_at" ON "training_export_log"("exported_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_training_export_log_type" ON "training_export_log"("export_type");

-- AddForeignKey
ALTER TABLE "claude_messages" ADD CONSTRAINT "claude_messages_claude_session_id_fkey" FOREIGN KEY ("claude_session_id") REFERENCES "claude_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_enrichments" ADD CONSTRAINT "parcel_enrichments_claude_session_id_fkey" FOREIGN KEY ("claude_session_id") REFERENCES "claude_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: artifacts - Add new Claude-related columns
ALTER TABLE "artifacts" 
ADD COLUMN IF NOT EXISTS "claude_session_id" TEXT,
ADD COLUMN IF NOT EXISTS "generated_by_tool" TEXT,
ADD COLUMN IF NOT EXISTS "generation_prompt" TEXT,
ADD COLUMN IF NOT EXISTS "claude_metadata" JSONB;

-- CreateIndex on artifacts for claude_session_id
CREATE INDEX IF NOT EXISTS "idx_artifacts_claude_session_id" ON "artifacts"("claude_session_id");

-- AddForeignKey for artifacts.claude_session_id
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_claude_session_id_fkey" FOREIGN KEY ("claude_session_id") REFERENCES "claude_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
