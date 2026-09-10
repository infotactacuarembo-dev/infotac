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

  if (!user) {
    return res.status(401).json({
      ok: false,
      error: 'Sesión inválida.'
    });
  }

  return res.status(200).json({
    ok: true,
    authenticated: true,
    user: {
      id: user.id,
      identificador: user.identificador,
      rol: user.rol,
      empresa_id: user.empresa_id,
      codigo_empresa: user.codigo_empresa
    }
  });
};
