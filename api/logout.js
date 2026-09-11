const { createClient } = require('@supabase/supabase-js');
const {
  getSessionUser,
  clearSessionCookie
} = require('./_auth');

function validId(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Método no permitido.'
    });
  }

  const user = getSessionUser(req);

  try {
    if (
      user &&
      user.identificador &&
      validId(user.empresa_id)
    ) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (url && key) {
        const supabase = createClient(url, key);

        const { error } = await supabase
          .from('login_audit')
          .insert({
            empresa_id: user.empresa_id,
            identificador: user.identificador,
            resultado: 'logout',
            detalle: 'Cierre de sesión correcto'
          });

        if (error) {
          console.error(
            'No se pudo registrar cierre de sesión:',
            error
          );
        }
      }
    }
  } catch (error) {
    // Un problema de auditoría no debe impedir cerrar sesión.
    console.error(
      'Error al registrar cierre de sesión:',
      error
    );
  }

  res.setHeader('Set-Cookie', clearSessionCookie());

  return res.status(200).json({
    ok: true
  });
};
