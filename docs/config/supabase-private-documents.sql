-- REVIEW / APPROVAL REQUIRED. Never executed by Prisma or application startup.
-- New dedicated bucket only; stop rather than altering any existing bucket.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='printos-documents') THEN
  RAISE EXCEPTION 'Bucket already exists: inspect it without changing existing files';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage' AND c.relname='objects' AND c.relrowsecurity) THEN
  RAISE EXCEPTION 'Storage objects RLS must already be enabled';
 END IF;
END $$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('printos-documents','printos-documents',false,26214400,ARRAY['application/pdf']);
-- Better Auth accounts are authorized by PrintOS, not Supabase Auth JWT claims.
-- Restrictive policies also deny this bucket if another permissive policy is broad.
CREATE POLICY printos_documents_client_deny ON storage.objects AS RESTRICTIVE
 FOR ALL TO anon,authenticated
 USING (bucket_id <> 'printos-documents') WITH CHECK (bucket_id <> 'printos-documents');
COMMIT;
