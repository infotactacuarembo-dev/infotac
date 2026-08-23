const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { requireSession } = require('./auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Método no permitido.'
    });
  }

  if (!requireSession(req, res)) return;

  try {
    const { currentPassword, newPassword } = req.body || {};

    if (
      !currentPassword ||
      typeof currentPassword !== 'string' ||
      !newPassword ||
      typeof newPassword !== 'string' ||
      newPassword.trim().length < 4
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Datos inválidos. La nueva clave debe tener al menos 4 caracteres.'
      });
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return res.status(503).json({
        ok: false,
        error: 'Backend no disponible.'
      });
    }

    const supabase = createClient(url, key);

    const { data, error } = await supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'password_taller')
      .single();

    if (error || !data || !data.valor) {
      console.error('set-password lectura de configuración:', error);
      return res.status(503).json({
        ok: false,
        error: 'No se pudo verificar la contraseña actual.'
      });
    }

    const stored = data.valor;

    const currentValid = stored.startsWith('$2')
      ? bcrypt.compareSync(currentPassword, stored)
      : currentPassword === stored;

    if (!currentValid) {
      return res.status(401).json({
        ok: false,
        error: 'La contraseña actual no es correcta.'
      });
    }

    const hash = bcrypt.hashSync(newPassword.trim(), 10);

    const { error: updateError } = await supabase
      .from('configuracion')
      .update({
        valor: hash,
        password: null
      })
      .eq('clave', 'password_taller');

    if (updateError) {
      console.error('set-password actualización:', updateError);
      return res.status(500).json({
        ok: false,
        error: 'No se pudo guardar la nueva clave.'
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('set-password error:', error);
    return res.status(500).json({
      ok: false,
      error: 'Error interno del servidor.'
    });
  }
};
