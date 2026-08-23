const { requireSession } = require('./_auth');

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Método no permitido.'
    });
  }

  if (!requireSession(req, res)) {
    return;
  }

  return res.status(200).json({
    ok: true,
    authenticated: true
  });
};
