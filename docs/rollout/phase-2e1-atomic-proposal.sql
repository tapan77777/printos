-- PROPOSAL ONLY: replace the pending migration with these exact bytes only after final approval.
-- Keeps account-table creation and Supabase permission lockdown in one transaction.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

-- AlterTable
ALTER TABLE "Printer" ADD COLUMN     "shopId" TEXT;

-- AlterTable
ALTER TABLE "PrintJob" ADD COLUMN     "shopId" TEXT;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "activeOrganizationId" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviterId" TEXT NOT NULL,

    CONSTRAINT "ShopInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_key_key" ON "RateLimit"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_slug_key" ON "Shop"("slug");

-- CreateIndex
CREATE INDEX "ShopMembership_userId_idx" ON "ShopMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopMembership_organizationId_userId_key" ON "ShopMembership"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "ShopInvitation_organizationId_email_idx" ON "ShopInvitation"("organizationId", "email");

-- CreateIndex
CREATE INDEX "Printer_shopId_idx" ON "Printer"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "Printer_id_shopId_key" ON "Printer"("id", "shopId");

-- CreateIndex
CREATE INDEX "PrintJob_shopId_createdAt_idx" ON "PrintJob"("shopId", "createdAt");

-- AddForeignKey
ALTER TABLE "Printer" ADD CONSTRAINT "Printer_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopMembership" ADD CONSTRAINT "ShopMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopMembership" ADD CONSTRAINT "ShopMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopInvitation" ADD CONSTRAINT "ShopInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopInvitation" ADD CONSTRAINT "ShopInvitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Tenant identity is immutable. No existing record is assigned to any new shop.
CREATE FUNCTION printos_guard_printer_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."shopId" IS DISTINCT FROM NEW."shopId" THEN
    RAISE EXCEPTION 'Printer shop identity is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER printos_printer_tenant BEFORE UPDATE OF "shopId" ON "Printer"
FOR EACH ROW EXECUTE FUNCTION printos_guard_printer_tenant();

CREATE FUNCTION printos_guard_job_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE printer_shop text;
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD."shopId" IS DISTINCT FROM NEW."shopId" OR OLD."printerId" IS DISTINCT FROM NEW."printerId") THEN
    RAISE EXCEPTION 'Job tenant and printer identity are immutable';
  END IF;
  SELECT "shopId" INTO printer_shop FROM "Printer" WHERE id = NEW."printerId";
  IF NOT FOUND OR printer_shop IS DISTINCT FROM NEW."shopId" THEN
    RAISE EXCEPTION 'Job and printer tenant must match';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER printos_job_tenant BEFORE INSERT OR UPDATE OF "shopId", "printerId" ON "PrintJob"
FOR EACH ROW EXECUTE FUNCTION printos_guard_job_tenant();

ALTER TABLE "ShopMembership" ADD CONSTRAINT "membership_role_valid" CHECK (role IN ('owner','staff'));

-- PROPOSED ONLY. Requires separate approval together with the Phase 2E.1 migration.
-- Scope: PrintOS tables/functions only; no rows, secrets or global default grants change.
-- Apply AFTER 20261023010000_tenant_accounts, in the same controlled transaction.
-- The server connects as postgres (verified); table-owner bypass remains enabled.
DO $$
DECLARE t text; r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['User','Session','Account','Verification','RateLimit',
      'Shop','ShopMembership','ShopInvitation','Printer','PrintJob','AgentHealth','_prisma_migrations']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC',t);
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',t,r);
      END IF;
    END LOOP;
  END LOOP;
END $$;
REVOKE ALL PRIVILEGES ON FUNCTION public.printos_guard_printer_tenant() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.printos_guard_job_tenant() FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION public.printos_guard_printer_tenant() FROM %I',r);
      EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION public.printos_guard_job_tenant() FROM %I',r);
    END IF;
  END LOOP;
END $$;
-- No anon/authenticated policies are added. Application access goes through Next.js
-- server-side authorization and the verified server DB role, never Supabase Data API.

COMMIT;
