-- REVIEW ONLY: this migration is not applied to Supabase by committing it.
BEGIN;
CREATE OR REPLACE FUNCTION public.platform_transition_license(
  p_license_id uuid, p_status text, p_reason text
) RETURNS TABLE (license_id uuid, old_status text, new_status text, event_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_old text;
  v_event uuid;
  v_now timestamptz := transaction_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     OR v_actor IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM platform_private.platform_admins a
       WHERE a.auth_user_id = v_actor AND a.active = true
     ) THEN
    RAISE EXCEPTION 'Active platform administrator required' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN
      ('trial','active','grace','suspended','expired','cancelled') THEN
    RAISE EXCEPTION 'Invalid license status' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Reason must contain 3 to 500 characters' USING ERRCODE = '22023';
  END IF;

  SELECT l.status INTO v_old FROM platform_private.licenses l
   WHERE l.id = p_license_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'License not found' USING ERRCODE = 'P0002'; END IF;
  IF v_old = p_status THEN
    RAISE EXCEPTION 'No change of license status' USING ERRCODE = '22023';
  END IF;

  UPDATE platform_private.licenses
     SET status = p_status,
         grace_started_at = CASE WHEN p_status = 'grace' THEN v_now ELSE NULL END,
         grace_ends_at = CASE WHEN p_status = 'grace' THEN v_now + interval '7 days' ELSE NULL END,
         updated_at = v_now
   WHERE id = p_license_id;

  INSERT INTO platform_private.license_events
    (license_id, actor_id, old_status, new_status, reason)
  VALUES (p_license_id, v_actor, v_old, p_status, btrim(p_reason))
  RETURNING id INTO v_event;

  RETURN QUERY SELECT p_license_id, v_old, p_status, v_event;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_transition_license(uuid,text,text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_transition_license(uuid,text,text)
TO authenticated;
COMMIT;
