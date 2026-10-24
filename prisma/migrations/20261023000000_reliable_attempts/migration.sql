-- Additive only. Do not deploy until server and agents are upgraded together.
ALTER TYPE "PrintStatus" ADD VALUE IF NOT EXISTS 'RECONCILIATION_REQUIRED';
ALTER TABLE "Printer" ADD COLUMN "simulationOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PrintJob"
  ADD COLUMN "attemptId" TEXT,
  ADD COLUMN "submissionAuthorizedAt" TIMESTAMP(3),
  ADD COLUMN "lastAgentEventId" TEXT,
  ADD COLUMN "lastAgentEventHash" TEXT,
  ADD COLUMN "reconciledAt" TIMESTAMP(3),
  ADD COLUMN "reconciliationNote" TEXT,
  ADD COLUMN "simulation" BOOLEAN NOT NULL DEFAULT false;
-- Existing simulator output is recognizable from the previous adapter's explicit tags.
UPDATE "PrintJob" SET "simulation" = true
WHERE "cupsJobId" LIKE 'SIM-%' OR "claimedBy" LIKE 'sim-%';
CREATE UNIQUE INDEX "PrintJob_attemptId_key" ON "PrintJob" ("attemptId");
CREATE TABLE "AgentHealth" (
  "agentId" TEXT NOT NULL PRIMARY KEY,
  "printerId" TEXT NOT NULL REFERENCES "Printer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "version" TEXT NOT NULL,
  "operatingSystem" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "processingState" TEXT NOT NULL,
  "printerAvailable" BOOLEAN,
  "lastHeartbeat" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AgentHealth_printerId_lastHeartbeat_idx" ON "AgentHealth" ("printerId", "lastHeartbeat");
