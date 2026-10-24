BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';
-- AlterTable
ALTER TABLE "PrintJob" ADD COLUMN     "pricingSnapshot" JSONB;

-- CreateTable
CREATE TABLE "ShopRateCard" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "minimumPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopRateCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopRateCard_shopId_createdAt_idx" ON "ShopRateCard"("shopId", "createdAt");

-- AddForeignKey
ALTER TABLE "ShopRateCard" ADD CONSTRAINT "ShopRateCard_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "ShopRateCard" ADD CONSTRAINT rate_minimum_valid CHECK ("minimumPaise">=0);
CREATE FUNCTION public.printos_immutable_rate_card() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Rate cards are append only'; END $$;
CREATE TRIGGER printos_immutable_rate BEFORE UPDATE OR DELETE ON "ShopRateCard" FOR EACH ROW EXECUTE FUNCTION public.printos_immutable_rate_card();
CREATE FUNCTION public.printos_immutable_job_quote() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD."pricingSnapshot" IS DISTINCT FROM NEW."pricingSnapshot" OR (OLD."pricingSnapshot" IS NOT NULL AND (OLD.price IS DISTINCT FROM NEW.price OR OLD.copies IS DISTINCT FROM NEW.copies OR OLD."pageCount" IS DISTINCT FROM NEW."pageCount" OR OLD."pageRange" IS DISTINCT FROM NEW."pageRange" OR OLD."paperSize" IS DISTINCT FROM NEW."paperSize" OR OLD.duplex IS DISTINCT FROM NEW.duplex OR OLD."colorMode" IS DISTINCT FROM NEW."colorMode")) THEN RAISE EXCEPTION 'Job quote is immutable'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER printos_immutable_quote BEFORE UPDATE ON "PrintJob" FOR EACH ROW EXECUTE FUNCTION public.printos_immutable_job_quote();
ALTER TABLE "ShopRateCard" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "ShopRateCard" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.printos_immutable_rate_card(),public.printos_immutable_job_quote() FROM PUBLIC;
DO $$ DECLARE r text; BEGIN FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
 EXECUTE format('REVOKE ALL ON TABLE public."ShopRateCard" FROM %I',r);
 EXECUTE format('REVOKE ALL ON FUNCTION public.printos_immutable_rate_card(),public.printos_immutable_job_quote() FROM %I',r);
 END IF; END LOOP; END $$;
COMMIT;
