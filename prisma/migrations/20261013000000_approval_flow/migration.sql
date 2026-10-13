-- Add new PrintStatus enum values
ALTER TYPE "PrintStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "PrintStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- Add new PrintJob columns
ALTER TABLE "PrintJob"
  ADD COLUMN IF NOT EXISTS "duplex"           BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "pageCount"        INTEGER,
  ADD COLUMN IF NOT EXISTS "pagesPrinted"     INTEGER,
  ADD COLUMN IF NOT EXISTS "approvedAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectedAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectionReason"  TEXT,
  ADD COLUMN IF NOT EXISTS "claimedAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "claimedBy"        TEXT,
  ADD COLUMN IF NOT EXISTS "claimExpiresAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cupsJobId"        TEXT,
  ADD COLUMN IF NOT EXISTS "agentError"       TEXT;

-- Default for new rows should be QUEUED, not CREATED
ALTER TABLE "PrintJob"
  ALTER COLUMN "printStatus" SET DEFAULT 'QUEUED';

-- New index for claim lookups
CREATE INDEX IF NOT EXISTS "PrintJob_printStatus_claimExpiresAt_idx"
  ON "PrintJob" ("printStatus", "claimExpiresAt");
