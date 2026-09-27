-- Stage 1: private storage only. Requires review/test in disposable Supabase project.
-- Does not activate licenses, create admins, change public tables or expose APIs.
BEGIN;
CREATE SCHEMA platform_private;
REVOKE ALL ON SCHEMA platform_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE platform_private.platform_admins (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform_private.licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL UNIQUE REFERENCES public.empresas(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('trial','active','grace','suspended','expired','cancelled')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  grace_started_at timestamptz,
  grace_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT licenses_valid_interval CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT licenses_grace_period CHECK (
    (status = 'grace' AND grace_started_at IS NOT NULL AND grace_ends_at = grace_started_at + interval '7 days')
    OR (status <> 'grace' AND (grace_started_at IS NULL OR grace_ends_at IS NOT NULL))
  )
);
CREATE TABLE platform_private.license_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES platform_private.licenses(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES platform_private.platform_admins(auth_user_id) ON DELETE RESTRICT,
  old_status text,
  new_status text NOT NULL,
  reason text NOT NULL CHECK (char_length(trim(reason)) BETWEEN 3 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT license_events_old_status CHECK (old_status IS NULL OR old_status IN ('trial','active','grace','suspended','expired','cancelled')),
  CONSTRAINT license_events_new_status CHECK (new_status IN ('trial','active','grace','suspended','expired','cancelled'))
);
CREATE INDEX license_events_license_created_idx ON platform_private.license_events (license_id, created_at DESC);

ALTER TABLE platform_private.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_private.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_private.license_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA platform_private FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION platform_private.reject_license_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'license_events are append-only';
END;
$$;
REVOKE ALL ON FUNCTION platform_private.reject_license_event_mutation() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER license_events_immutable_row
BEFORE UPDATE OR DELETE ON platform_private.license_events
FOR EACH ROW EXECUTE FUNCTION platform_private.reject_license_event_mutation();
CREATE TRIGGER license_events_immutable_truncate
BEFORE TRUNCATE ON platform_private.license_events
FOR EACH STATEMENT EXECUTE FUNCTION platform_private.reject_license_event_mutation();
COMMIT;

-- No database role/API permission to write licensing data is granted here.
-- Remaining before production: verify exposed schemas and inherited privileges;
-- decide privileged server/transaction interface, atomic state transitions,
-- provisioning idempotency and notices (panel + email at day 0, day-5 reminder).
-- Manual decision is required before suspension after seven-day grace period.
-- Object owner/privileged DDL can bypass audit trigger; external audit if required.
