-- Execute in disposable Supabase test project after applying stage1 migration.
-- Static checks only; DO NOT RUN in production. Does not seed admins or licenses.
BEGIN;
DO $$
DECLARE
  role_name text;
  object_name text;
BEGIN
  IF to_regnamespace('platform_private') IS NULL THEN
    RAISE EXCEPTION 'Missing private schema';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_schema_privilege(role_name, 'platform_private', 'USAGE') THEN
      RAISE EXCEPTION 'Role % unexpectedly has schema USAGE', role_name;
    END IF;
  END LOOP;
  FOREACH object_name IN ARRAY ARRAY['platform_admins','licenses','license_events'] LOOP
    IF to_regclass(format('platform_private.%I',object_name)) IS NULL THEN
      RAISE EXCEPTION 'Missing table %',object_name;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='platform_private' AND c.relname=object_name AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS disabled for %',object_name;
    END IF;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_table_privilege(role_name,format('platform_private.%I',object_name),'SELECT')
        OR has_table_privilege(role_name,format('platform_private.%I',object_name),'INSERT')
        OR has_table_privilege(role_name,format('platform_private.%I',object_name),'UPDATE')
        OR has_table_privilege(role_name,format('platform_private.%I',object_name),'DELETE') THEN
        RAISE EXCEPTION 'Role % unexpectedly has direct privileges on %',role_name,object_name;
      END IF;
    END LOOP;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='platform_private.licenses'::regclass AND conname='licenses_grace_period') THEN
    RAISE EXCEPTION 'Missing seven-day grace constraint';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='platform_private.license_events'::regclass AND tgname='license_events_immutable_row' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Missing event row immutability trigger';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='platform_private.license_events'::regclass AND tgname='license_events_immutable_truncate' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Missing event truncate immutability trigger';
  END IF;
END;
$$;
ROLLBACK;

-- TODO: integration tests with seeded fake auth user, fake company and roles
-- in a disposable database: full denial for non-admin, no auto-suspension,
-- atomic event + status change, notification retry/idempotency.
