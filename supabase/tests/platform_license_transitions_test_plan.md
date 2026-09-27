# Platform license transitions — test plan (not yet executed)

Run integration tests on an isolated project with a genuine Supabase Auth test user. Do not simulate authentication by setting request.jwt.claim.sub with privileged SQL. Test with transaction rollback or disposable fixtures.

- No JWT and workshop cookie only: deny; no event or change.
- Authenticated non-admin and inactive admin: deny.
- Active admin with valid reason: change status; exactly one event with true actor, old/new status and reason.
- Any pair of distinct valid statuses is allowed; no-op is rejected.
- Reason NULL, 2 chars, >500 chars; invalid status; missing license: reject, no event.
- Enter grace: exactly seven days; leave grace: both grace dates NULL.
- Force event insertion failure: status update rolls back.
- Concurrent transitions: second receives correct prior status after row lock.
- API roles cannot directly read or write platform_private tables.
- Verify effective function owner/grants and ensure no privileged app path writes licenses directly.

This migration alone does not create users, login UI, automated suspension or exclusive backend access; the RPC may be called directly by any active administrator with a valid Supabase JWT.
