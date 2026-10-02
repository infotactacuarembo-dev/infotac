const { createClient } = require('@supabase/supabase-js');
const { requireSession, getSessionUser } = require('./_auth');

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Base de datos no configurada.');
  }

  return createClient(url, key);
}

module.exports = async function handler(req, res) {
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

  try {
    const supabase = db();

    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('activo, debe_cambiar_password')
      .eq('id', user.id)
      .eq('empresa_id', user.empresa_id)
      .maybeSingle();

    if (error) throw error;

    if (!usuario || usuario.activo === false) {
      return res.status(401).json({
        ok: false,
        error: 'Tu usuario ya no está activo. Volvé a iniciar sesión.'
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
        codigo_empresa: user.codigo_empresa,
        debe_cambiar_password:
          usuario.debe_cambiar_password === true
      }
    });
  } catch (error) {
    console.error('session error:', error);

    return res.status(500).json({
      ok: false,
      error: 'No se pudo validar la sesión.'
    });
  }
};
