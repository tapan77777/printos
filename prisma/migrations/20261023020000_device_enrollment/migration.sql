-- Pending only. Rehearse locally; do not apply without separate approval.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';
-- CreateTable
CREATE TABLE "DesktopDevice" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "processingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesktopDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCredential" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevicePairing" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvalAttempts" INTEGER NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "shopId" TEXT,
    "printerId" TEXT,
    "consumedAt" TIMESTAMP(3),
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevicePairing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DesktopDevice_shopId_createdAt_idx" ON "DesktopDevice"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCredential_tokenHash_key" ON "DeviceCredential"("tokenHash");

-- CreateIndex
CREATE INDEX "DeviceCredential_deviceId_idx" ON "DeviceCredential"("deviceId");

-- CreateIndex
CREATE INDEX "DevicePairing_expiresAt_idx" ON "DevicePairing"("expiresAt");

-- AddForeignKey
ALTER TABLE "DesktopDevice" ADD CONSTRAINT "DesktopDevice_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesktopDevice" ADD CONSTRAINT "DesktopDevice_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCredential" ADD CONSTRAINT "DeviceCredential_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "DesktopDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePairing" ADD CONSTRAINT "DevicePairing_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePairing" ADD CONSTRAINT "DevicePairing_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE UNIQUE INDEX "DesktopDevice_one_unrevoked_printer" ON "DesktopDevice"("printerId") WHERE "revokedAt" IS NULL;
ALTER TABLE "DesktopDevice" ADD CONSTRAINT "device_mode_valid" CHECK (mode IN ('cups','mock','windows'));
ALTER TABLE "DevicePairing" ADD CONSTRAINT "pair_mode_valid" CHECK (mode IN ('cups','mock','windows'));
-- A reviewed later activation stage must explicitly replace this fail-closed gate.
ALTER TABLE "DesktopDevice" ADD CONSTRAINT "device_processing_not_released" CHECK ("processingEnabled" = false);
CREATE FUNCTION public.printos_guard_device_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p_shop text; simulated boolean;
BEGIN
 IF TG_OP='UPDATE' AND (OLD."shopId" IS DISTINCT FROM NEW."shopId" OR OLD."printerId" IS DISTINCT FROM NEW."printerId" OR OLD."publicKey" IS DISTINCT FROM NEW."publicKey" OR OLD.mode IS DISTINCT FROM NEW.mode) THEN
  RAISE EXCEPTION 'Device identity/scope is immutable';
 END IF;
 SELECT "shopId","simulationOnly" INTO p_shop,simulated FROM public."Printer" WHERE id=NEW."printerId";
 IF p_shop IS NULL OR p_shop IS DISTINCT FROM NEW."shopId" OR simulated IS DISTINCT FROM (NEW.mode='mock') THEN RAISE EXCEPTION 'Device printer scope mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER printos_device_scope BEFORE INSERT OR UPDATE ON "DesktopDevice" FOR EACH ROW EXECUTE FUNCTION public.printos_guard_device_scope();
DO $$
DECLARE t text; r text;
BEGIN
 FOREACH t IN ARRAY ARRAY['DesktopDevice','DeviceCredential','DevicePairing'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC',t);
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',t,r); END IF;
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL PRIVILEGES ON FUNCTION public.printos_guard_device_scope() FROM PUBLIC;
DO $$ DECLARE r text; BEGIN FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION public.printos_guard_device_scope() FROM %I',r); END IF;
END LOOP; END $$;
COMMIT;
