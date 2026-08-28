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

async function registrarAuditoria(supabase, identificador, resultado, detalle) {
  const { error } = await supabase.from('login_audit').insert({
    identificador,
    resultado,
    detalle
  });

  if (error) {
    console.error('No se pudo registrar auditoría de login:', error);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Método no permitido.'
    });
  }

  try {
    const { identificador, password } = req.body || {};

    if (!identificador || typeof identificador !== 'string' || identificador.length > 256) {
      return res.status(400).json({
        ok: false,
        error: 'Identificador inválido.'
      });
    }

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
    const identificadorNormalizado = identificador.trim().toLowerCase();

    // Buscar usuario en la tabla usuarios
    const { data: usuario, error: usuarioError } = await supabase
      .from('usuarios')
      .select('id, identificador, password_hash, rol')
      .eq('identificador', identificadorNormalizado)
      .single();

    if (usuarioError || !usuario) {
      // Intento con usuario inexistente
      await registrarAuditoria(
        supabase,
        identificadorNormalizado,
        'fallo',
        'Usuario no encontrado'
      );

      return res.status(401).json({
        ok: false,
        error: 'Usuario o contraseña incorrectos.'
      });
    }

    // Validar contraseña
    const valid = bcrypt.compareSync(password, usuario.password_hash);

    if (!valid) {
      await registrarAuditoria(
        supabase,
        identificadorNormalizado,
        'fallo',
        'Contraseña incorrecta'
      );

      return res.status(401).json({
        ok: false,
        error: 'Usuario o contraseña incorrectos.'
      });
    }

    // Login exitoso
    await registrarAuditoria(
      supabase,
      identificadorNormalizado,
      'exito',
      'Inicio de sesión correcto'
    );

    createSessionToken(identificadorNormalizado, usuario.rol);
    res.setHeader('Set-Cookie', sessionCookie(token));

    return res.status(200).json({
      ok: true,
      rol: usuario.rol
    });
  } catch (error) {
    console.error('verify-password error:', error);

    return res.status(500).json({
      ok: false,
      error: 'No se pudo iniciar sesión.'
    });
  }
};
