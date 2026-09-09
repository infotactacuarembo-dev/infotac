const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { requireSession, getSessionUser } = require('./_auth');

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
  return crypto
    .createHash('sha256')
    .update(obtenerIp(req))
    .digest('hex');
}

async function registrarCambio(supabase, req, resultado, detalle) {
  try {
    const { error } = await supabase
      .from('password_changes')
      .insert({
        resultado: resultado,
        ip: huellaIp(req),
        detalle: detalle
      });

    if (error) {
      console.error('No se pudo registrar auditoría de contraseña:', error);
    }
  } catch (error) {
    console.error('Error al registrar auditoría de contraseña:', error);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Método no permitido.'
    });
  }

  if (!requireSession(req, res)) {
    return;
  }

  const usuarioSesion = getSessionUser(req);

  if (!usuarioSesion || !usuarioSesion.id) {
    return res.status(401).json({
      ok: false,
      error: 'Sesión inválida. Volvé a iniciar sesión.'
    });
  }

  const { currentPassword, newPassword } = req.body || {};

  if (
    !currentPassword ||
    typeof currentPassword !== 'string' ||
    currentPassword.length > 256
  ) {
    return res.status(400).json({
      ok: false,
      error: 'Ingresá la contraseña actual.'
    });
  }

  if (
    !newPassword ||
    typeof newPassword !== 'string' ||
    newPassword.trim().length < 10 ||
    newPassword.length > 256
  ) {
    return res.status(400).json({
      ok: false,
      error: 'La nueva contraseña debe tener entre 10 y 256 caracteres.'
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

  try {
    const supabase = createClient(url, key);

    const { data: usuario, error: usuarioError } = await supabase
      .from('usuarios')
      .select('id, identificador, password_hash, activo')
      .eq('id', usuarioSesion.id)
      .maybeSingle();

    if (usuarioError) {
      throw usuarioError;
    }

    if (!usuario || usuario.activo === false) {
      return res.status(401).json({
        ok: false,
        error: 'Tu usuario ya no está activo. Volvé a iniciar sesión.'
      });
    }

    const coincide = await bcrypt.compare(
      currentPassword,
      usuario.password_hash
    );

    if (!coincide) {
      await registrarCambio(
        supabase,
        req,
        'fallo',
        'Contraseña actual incorrecta. Usuario: ' + usuario.identificador
      );

      return res.status(401).json({
        ok: false,
        error: 'La contraseña actual es incorrecta.'
      });
    }

    const nuevoHash = await bcrypt.hash(newPassword.trim(), 10);

    const { error: updateError } = await supabase
      .from('usuarios')
      .update({
        password_hash: nuevoHash
      })
      .eq('id', usuarioSesion.id);

    if (updateError) {
      throw updateError;
    }

    await registrarCambio(
      supabase,
      req,
      'exito',
      'Contraseña actualizada. Usuario: ' + usuario.identificador
    );

    return res.status(200).json({
      ok: true,
      message: 'Contraseña actualizada correctamente.'
    });
  } catch (error) {
    console.error('set-password error:', error);

    return res.status(500).json({
      ok: false,
      error: 'No se pudo actualizar la contraseña.'
    });
  }
};
