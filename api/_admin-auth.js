const { createClient } = require('@supabase/supabase-js');
const COOKIE = 'infotac_admin_access';
function clients(token) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Configuración incompleta');
  const options = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
  return { service: createClient(url, key, options), user: token ? createClient(url, key, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } }) : null };
}
function cookie(token, maxAge) { return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`; }
function clearCookie() { return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`; }
function read(req) { try { const item = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '=')); return item ? decodeURIComponent(item.slice(COOKIE.length + 1)) : null; } catch (_) { return null; } }
async function check(req, res) {
  try {
    const token = read(req);
    if (!token) { res.status(401).json({ ok: false, error: 'Sesión requerida.' }); return null; }
    const db = clients(token);
    const { data, error } = await db.service.auth.getUser(token);
    if (error || !data.user) { res.status(401).json({ ok: false, error: 'Sesión inválida.' }); return null; }
    const { data: allowed, error: permissionError } = await db.user.rpc('is_platform_admin');
    if (permissionError) throw permissionError;
    if (allowed !== true) { res.status(403).json({ ok: false, error: 'Acceso denegado.' }); return null; }
    const { data: licenses, error: licensesError } = await db.user.rpc('admin_license_overview');
    if (licensesError) throw licensesError;
    return { id: data.user.id, email: data.user.email || null, service: db.service, licenses: licenses || [] };
  } catch (_) { res.status(503).json({ ok: false, error: 'No se pudo verificar la sesión.' }); return null; }
}
module.exports = { clients, cookie, clearCookie, read, check };
