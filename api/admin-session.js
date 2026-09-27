const { check } = require('./_admin-auth');
module.exports = async function(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  const admin = await check(req, res);
  if (admin) return res.status(200).json({ ok: true, admin: { id: admin.id, email: admin.email } });
};
