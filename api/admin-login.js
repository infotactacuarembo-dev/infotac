const { clients, cookie } = require('./_admin-auth');
module.exports = async function(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || email.length > 254 || !password || password.length > 1024) return res.status(400).json({ ok: false, error: 'Datos inválidos.' });
  try {
    const { service } = clients();
    const { data, error } = await service.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) return res.status(401).json({ ok: false, error: 'Acceso denegado.' });
    const { data: allowed, error: permissionError } = await clients(data.session.access_token).user.rpc('is_platform_admin');
    if (permissionError || allowed !== true) return res.status(401).json({ ok: false, error: 'Acceso denegado.' });
    res.setHeader('Set-Cookie', cookie(data.session.access_token, Math.min(3600, data.session.expires_in || 3600)));
    return res.status(200).json({ ok: true });
  } catch (_) { return res.status(503).json({ ok: false, error: 'No se pudo iniciar sesión.' }); }
};
