const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { createSessionToken, sessionCookie } = require('./_auth');

function obtenerIp(req) {
  const forwarded = req.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  return req.socket && req.socket.remoteAddress
    ? req.socket.remoteAddress
    : 'desconocida';
}

function huellaIp(req) {
  const ip = obtenerIp(req);

  return crypto
    .createHash('sha256')
    .update(ip)
    .digest('hex');
}

function minutosRestantes(segundos) {
  return Math.max(1, Math.ceil(Number(segundos || 0) / 60));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Método no permitido.'
    });
  }

  try {
    const { password } = req.body || {};

    if (!password || typeof password !== 'string' || password.length > 256) {
      return res.status(400).json({
        ok: false,
        error: 'Contraseña inválida.'
      });
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
    const identificador = huellaIp(req);

    const { data: estado, error: estadoError } = await supabase.rpc(
      'estado_intento_login',
      { p_identificador: identificador }
    );

    if (estadoError) throw estadoError;

    const intentoActual = Array.isArray(estado) ? estado[0] : estado;

    if (intentoActual && intentoActual.bloqueado) {
      return res.status(429).json({
        ok: false,
        error:
          'Demasiados intentos. Esperá ' +
          minutosRestantes(intentoActual.segundos_restantes) +
          ' minutos e intentá nuevamente.'
      });
    }

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
      const { data: fallo, error: falloError } = await supabase.rpc(
        'registrar_fallo_login',
        { p_identificador: identificador }
      );

      if (falloError) throw falloError;

      const resultadoFallo = Array.isArray(fallo) ? fallo[0] : fallo;

      if (resultadoFallo && resultadoFallo.bloqueado) {
        return res.status(429).json({
          ok: false,
          error:
            'Demasiados intentos. Esperá ' +
            minutosRestantes(resultadoFallo.segundos_restantes) +
            ' minutos e intentá nuevamente.'
        });
      }

      return res.status(401).json({
        ok: false,
        error: 'Contraseña incorrecta.'
      });
    }

    const { error: limpiarError } = await supabase.rpc(
      'limpiar_fallos_login',
      { p_identificador: identificador }
    );

    if (limpiarError) throw limpiarError;

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
