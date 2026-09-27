-- Test-only SQL; run only in a disposable database AFTER the revised stage1 migration.
-- Uses a fake company and no auth user; all writes are rolled back.
BEGIN;
DO $$
DECLARE
  fake_company uuid := gen_random_uuid();
  license_id uuid;
  start_time timestamptz := date_trunc('second', now());
  expected_failure boolean;
BEGIN
  INSERT INTO public.empresas (id, nombre) VALUES (fake_company, 'TEST ONLY grace constraint');
  INSERT INTO platform_private.licenses (empresa_id, status)
    VALUES (fake_company, 'active') RETURNING id INTO license_id;

  UPDATE platform_private.licenses SET status='grace', grace_started_at=start_time,
    grace_ends_at=start_time + interval '7 days' WHERE id=license_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Valid grace update failed'; END IF;

  expected_failure := false;
  BEGIN
    UPDATE platform_private.licenses SET grace_ends_at=start_time + interval '6 days' WHERE id=license_id;
  EXCEPTION WHEN check_violation THEN expected_failure := true;
  END;
  IF NOT expected_failure THEN RAISE EXCEPTION 'Accepted 6-day window'; END IF;

  expected_failure := false;
  BEGIN
    UPDATE platform_private.licenses SET grace_ends_at=NULL WHERE id=license_id;
  EXCEPTION WHEN check_violation THEN expected_failure := true;
  END;
  IF NOT expected_failure THEN RAISE EXCEPTION 'Accepted missing grace end'; END IF;

  expected_failure := false;
  BEGIN
    UPDATE platform_private.licenses SET status='active' WHERE id=license_id;
  EXCEPTION WHEN check_violation THEN expected_failure := true;
  END;
  IF NOT expected_failure THEN RAISE EXCEPTION 'Accepted active with residual grace dates'; END IF;

  UPDATE platform_private.licenses SET status='active', grace_started_at=NULL,
    grace_ends_at=NULL WHERE id=license_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Grace exit failed'; END IF;
END;
$$;
ROLLBACK;

-- Does NOT test transition audit, superadmin authentication, email notices or
-- privileges as non-owner. The migration does not implement them yet.
