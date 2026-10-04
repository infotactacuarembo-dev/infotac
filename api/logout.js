const { createClient } = require('@supabase/supabase-js');
const {
  getSessionUser,
  clearSessionCookie
} = require('./_auth');

function validId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  const sessionUser = getSessionUser(req);

  if (
    sessionUser &&
    sessionUser.empresa_id &&
    validId(sessionUser.empresa_id)
  ) {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    await supabase.from('login_audit').insert({
      empresa_id: sessionUser.empresa_id,
      identificador: sessionUser.identificador || sessionUser.usuario || 'desconocido',
      resultado: 'logout',
      detalle: 'Cierre de sesión voluntario'
    }).then(() => {}).catch(() => {});
  }

  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
};
