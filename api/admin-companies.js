const { check } = require('./_admin-auth');
module.exports = async function(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  const admin = await check(req, res);
  if (!admin) return;
  const { data, error } = await admin.service.from('empresas').select('id,nombre').order('nombre');
  if (error) return res.status(503).json({ ok: false, error: 'No se pudieron obtener empresas.' });
  const byId = new Map(admin.licenses.map(l => [l.empresa_id, l]));
  return res.status(200).json({ ok: true, companies: data.map(c => ({ ...c, license: byId.get(c.id) || null })) });
};
