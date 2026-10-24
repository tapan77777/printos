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
