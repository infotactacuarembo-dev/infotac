const { requireSession, getSessionUser } = require('./_auth');

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

  const user = getSessionUser(req);

  return res.status(200).json({
    ok: true,
    authenticated: true,
    user: {
      identificador: user.identificador,
      rol: user.rol
    }
  });
};
