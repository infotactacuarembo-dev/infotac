const {
  getSessionUser,
  clearSessionCookie
} = require('./_auth');

function validId(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value.trim()
    )
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ ok: false, error: 'Método no permitido' });
  }

  let sessionUser = null;

  try {
    sessionUser = getSessionUser(req);
  } catch (error) {
    console.error('logout: sesión inválida:', error?.message || error);
  }

  try {
    if (
      sessionUser &&
      sessionUser.empresa_id &&
      validId(sessionUser.empresa_id)
    ) {
      const { createClient } = require('@supabase/supabase-js');

      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { error } = await supabase.from('login_audit').insert({
        empresa_id: sessionUser.empresa_id,
        identificador:
          sessionUser.identificador ||
          sessionUser.usuario ||
          'desconocido',
        resultado: 'logout',
        detalle: 'Cierre de sesión voluntario'
      });

      if (error) {
        console.error('logout: error en login_audit:', error);
      }
    }
  } catch (error) {
    console.error('logout: error de auditoría:', error);
  }

  try {
    clearSessionCookie(res);
  } catch (error) {
    console.error('logout: error limpiando cookie:', error);
  }

  return res.status(200).json({ ok: true });
};
