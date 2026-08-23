const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { createSessionToken, sessionCookie } = require('./_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }

  try {
    const { password } = req.body || {};

    if (!password || typeof password !== 'string' || password.length > 256) {
      return res.status(400).json({ ok: false, error: 'Contraseña inválida.' });
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      console.error('Faltan variables de Supabase en Vercel.');
      return res.status(503).json({
        ok: false,
        error: 'Servicio de autenticación no disponible.'
      });
    }

    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'password_taller')
      .single();

    if (error || !data || !data.valor) {
      console.error('No se encontró password_taller:', error);
      return res.status(503).json({
        ok: false,
        error: 'Servicio de autenticación no disponible.'
      });
    }

    const stored = data.valor;
    const valid = stored.startsWith('$2')
      ? bcrypt.compareSync(password, stored)
      : false;

    if (!valid) {
      return res.status(401).json({
        ok: false,
        error: 'Contraseña incorrecta.'
      });
    }

    const token = createSessionToken();
    res.setHeader('Set-Cookie', sessionCookie(token));

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('verify-password error:', error);
    return res.status(500).json({
      ok: false,
      error: 'No se pudo iniciar sesión.'
    });
  }
};
