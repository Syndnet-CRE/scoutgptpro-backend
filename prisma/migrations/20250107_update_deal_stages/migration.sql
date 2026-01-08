-- Migrate existing data BEFORE changing enum (using ACTUAL current values)
UPDATE "Deal" SET stage = 'inbound' WHERE stage = 'PIPELINE';
UPDATE "Deal" SET stage = 'buy_box_match' WHERE stage = 'ACTIVE';
UPDATE "Deal" SET stage = 'underwriting' WHERE stage = 'UNDERWRITING';
UPDATE "Deal" SET stage = 'offer_submitted' WHERE stage = 'PENDING';
UPDATE "Deal" SET stage = 'closed' WHERE stage = 'CLOSED';
UPDATE "Deal" SET stage = 'loi' WHERE stage = 'HOLD';

-- Alter the enum type (PostgreSQL approach)
ALTER TYPE "DealStage" RENAME TO "DealStage_old";

CREATE TYPE "DealStage" AS ENUM (
  'inbound',
  'buy_box_match',
  'initial_screen',
  'underwriting',
  'loi',
  'offer_submitted',
  'under_contract',
  'closed',
  'terminated'
);

ALTER TABLE "Deal" 
  ALTER COLUMN "stage" DROP DEFAULT,
  ALTER COLUMN "stage" TYPE "DealStage" USING stage::text::"DealStage",
  ALTER COLUMN "stage" SET DEFAULT 'inbound';

DROP TYPE "DealStage_old";
