const { clearCookie } = require('./_admin-auth');
module.exports = function(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  res.setHeader('Set-Cookie', clearCookie());
  return res.status(200).json({ ok: true });
};
