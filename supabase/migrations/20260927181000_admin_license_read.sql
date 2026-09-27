create or replace function public.admin_license_overview()
returns table(empresa_id uuid, status text, starts_at timestamptz, ends_at timestamptz, grace_started_at timestamptz, grace_ends_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select l.empresa_id, l.status, l.starts_at, l.ends_at, l.grace_started_at, l.grace_ends_at
  from platform_private.licenses l
  where auth.uid() is not null and exists (
    select 1 from platform_private.platform_admins a
    where a.auth_user_id = auth.uid() and a.active is true
  );
$$;
revoke all on function public.admin_license_overview() from public, anon, authenticated, service_role;
grant execute on function public.admin_license_overview() to authenticated;
