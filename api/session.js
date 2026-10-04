const { readSession } = require('./_auth');

module.exports = async function handler(req, res) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ ok: false, error: 'Sesión requerida o vencida' });
  return res.status(200).json({ ok: true, session });
};