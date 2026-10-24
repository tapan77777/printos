BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';
-- AlterTable
ALTER TABLE "DesktopDevice" ADD COLUMN     "configurationConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "localPrinterIdentifier" TEXT,
ADD COLUMN     "rendererSha256" TEXT;


-- Replace the intentionally unreleased activation gate; no device is enabled here.
ALTER TABLE "DesktopDevice" DROP CONSTRAINT "device_processing_not_released";
ALTER TABLE "DesktopDevice" ADD CONSTRAINT device_activation_configuration CHECK (
 NOT "processingEnabled" OR ("confirmedAt" IS NOT NULL AND "revokedAt" IS NULL AND "localPrinterIdentifier" IS NOT NULL AND "localPrinterIdentifier" ~ '^[a-f0-9]{64}$' AND "configurationConfirmedAt" IS NOT NULL AND (mode='mock' OR (mode='windows' AND "rendererSha256" IS NOT NULL AND "rendererSha256" ~ '^[a-f0-9]{64}$')))
);
-- Fence concurrent disable/revoke against new claims and submission ACKs.
CREATE FUNCTION public.printos_active_device_barrier() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE enabled boolean; device_shop text; device_printer text; revoked timestamp;
BEGIN
 IF NEW."shopId" IS NOT NULL AND ((OLD."attemptId" IS NULL AND NEW."attemptId" IS NOT NULL) OR (OLD."submissionAuthorizedAt" IS NULL AND NEW."submissionAuthorizedAt" IS NOT NULL)) THEN
  SELECT "processingEnabled","shopId","printerId","revokedAt" INTO enabled,device_shop,device_printer,revoked FROM public."DesktopDevice" WHERE id=NEW."claimedBy" FOR SHARE;
  IF enabled IS DISTINCT FROM true OR revoked IS NOT NULL THEN RAISE EXCEPTION 'Active device required'; END IF;
  IF device_shop IS DISTINCT FROM NEW."shopId" OR device_printer IS DISTINCT FROM NEW."printerId" THEN RAISE EXCEPTION 'Device scope mismatch'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public."DeviceCredential" WHERE "deviceId"=NEW."claimedBy" AND "revokedAt" IS NULL AND "expiresAt">(now() AT TIME ZONE 'UTC')) THEN RAISE EXCEPTION 'Unexpired credential required'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER printos_active_device_barrier BEFORE UPDATE ON "PrintJob" FOR EACH ROW EXECUTE FUNCTION public.printos_active_device_barrier();
REVOKE ALL ON FUNCTION public.printos_active_device_barrier() FROM PUBLIC;
DO $$ DECLARE r text; BEGIN FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON FUNCTION public.printos_active_device_barrier() FROM %I',r); END IF; END LOOP; END $$;
COMMIT;
