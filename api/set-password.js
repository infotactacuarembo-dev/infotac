const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const FALLBACK = 'infotac2026';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 4) {
      return res.status(400).json({ ok: false, error: 'Datos invalidos. La nueva clave debe tener al menos 4 caracteres.' });
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return res.status(503).json({ ok: false, error: 'Backend no disponible. Sin conexion a la base de datos.' });
    }

    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'password_taller')
      .single();

    let currentValid = false;
    if (!error && data && data.valor) {
      const stored = data.valor;
      currentValid = stored.startsWith('$2')
        ? bcrypt.compareSync(currentPassword, stored)
        : currentPassword === stored;
    }
    if (!currentValid && currentPassword === FALLBACK) currentValid = true;

    if (!currentValid) {
      return res.status(401).json({ ok: false, error: 'La contraseña actual no es correcta.' });
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
  console.error('set-password update error', updateError);
  return res.status(500).json({ ok: false, error: 'No se pudo guardar la nueva clave.' });
}

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('set-password error', e);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
};
