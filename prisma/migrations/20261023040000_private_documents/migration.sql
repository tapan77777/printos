BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';
-- CreateTable
CREATE TABLE "StoredDocument" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "jobId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "storageNamespace" TEXT NOT NULL,
    "uploadKey" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "expectedBytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "pageCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'UPLOADING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "uploadGrantExpiresAt" TIMESTAMP(3) NOT NULL,
    "quarantineDeletedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoredDocument_jobId_key" ON "StoredDocument"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "StoredDocument_uploadKey_key" ON "StoredDocument"("uploadKey");

-- CreateIndex
CREATE UNIQUE INDEX "StoredDocument_objectKey_key" ON "StoredDocument"("objectKey");

-- CreateIndex
CREATE INDEX "StoredDocument_shopId_status_createdAt_idx" ON "StoredDocument"("shopId", "status", "createdAt");

CREATE INDEX "StoredDocument_uploadGrantExpiresAt_quarantineDeletedAt_idx" ON "StoredDocument"("uploadGrantExpiresAt","quarantineDeletedAt");

-- AddForeignKey
ALTER TABLE "StoredDocument" ADD CONSTRAINT "StoredDocument_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredDocument" ADD CONSTRAINT "StoredDocument_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredDocument" ADD CONSTRAINT "StoredDocument_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PrintJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "StoredDocument" ADD CONSTRAINT document_metadata_valid CHECK (
 "expectedBytes">0 AND "expectedBytes"<=26214400 AND "tokenHash" ~ '^[a-f0-9]{64}$' AND
 (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$') AND ("pageCount" IS NULL OR "pageCount">0) AND
 status IN ('UPLOADING','VALIDATING','READY','INVALID','DELETING','DELETED') AND
 (status<>'READY' OR (sha256 IS NOT NULL AND "pageCount" IS NOT NULL))
);
CREATE FUNCTION public.printos_document_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p_shop text; j_shop text; j_printer text; j_file text;
BEGIN
 SELECT "shopId" INTO p_shop FROM public."Printer" WHERE id=NEW."printerId";
 IF p_shop IS NULL OR p_shop IS DISTINCT FROM NEW."shopId" THEN RAISE EXCEPTION 'Document printer scope mismatch'; END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(OLD.id,OLD."shopId",OLD."printerId",OLD."tokenHash",OLD."storageNamespace",OLD."uploadKey",OLD."objectKey",OLD."expectedBytes",OLD."createdAt",OLD."expiresAt",OLD."uploadGrantExpiresAt") IS DISTINCT FROM ROW(NEW.id,NEW."shopId",NEW."printerId",NEW."tokenHash",NEW."storageNamespace",NEW."uploadKey",NEW."objectKey",NEW."expectedBytes",NEW."createdAt",NEW."expiresAt",NEW."uploadGrantExpiresAt") THEN RAISE EXCEPTION 'Document identity is immutable'; END IF;
  IF (OLD."jobId" IS NOT NULL AND OLD."jobId" IS DISTINCT FROM NEW."jobId") OR (OLD.sha256 IS NOT NULL AND OLD.sha256 IS DISTINCT FROM NEW.sha256) OR (OLD."pageCount" IS NOT NULL AND OLD."pageCount" IS DISTINCT FROM NEW."pageCount") OR (OLD.status='DELETED' AND NEW.status<>'DELETED') THEN RAISE EXCEPTION 'Document binding is immutable'; END IF;
 END IF;
 IF NEW."jobId" IS NOT NULL THEN
  SELECT "shopId","printerId","fileId" INTO j_shop,j_printer,j_file FROM public."PrintJob" WHERE id=NEW."jobId";
  IF j_shop IS DISTINCT FROM NEW."shopId" OR j_printer IS DISTINCT FROM NEW."printerId" OR j_file IS DISTINCT FROM 'cloud:'||NEW.id THEN RAISE EXCEPTION 'Document job scope mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER printos_document_scope BEFORE INSERT OR UPDATE ON "StoredDocument" FOR EACH ROW EXECUTE FUNCTION public.printos_document_scope();
ALTER TABLE "StoredDocument" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "StoredDocument" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.printos_document_scope() FROM PUBLIC;
DO $$ DECLARE r text; BEGIN FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
 EXECUTE format('REVOKE ALL ON TABLE public."StoredDocument" FROM %I',r);
 EXECUTE format('REVOKE ALL ON FUNCTION public.printos_document_scope() FROM %I',r);
 END IF; END LOOP; END $$;
COMMIT;
