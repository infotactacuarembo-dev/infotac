const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { createSessionToken, sessionCookie } = require('./_auth');

async function registrarAuditoria(supabase, identificador, resultado, detalle) {
  const { error } = await supabase
    .from('login_audit')
    .insert({
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
    const { codigo_empresa, identificador, password } = req.body || {};

    if (
      !codigo_empresa ||
      typeof codigo_empresa !== 'string' ||
      codigo_empresa.trim().length === 0 ||
      codigo_empresa.length > 80
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Código de empresa inválido.'
      });
    }

    if (
      !identificador ||
      typeof identificador !== 'string' ||
      identificador.trim().length === 0 ||
      identificador.length > 256
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Usuario inválido.'
      });
    }

    if (
      !password ||
      typeof password !== 'string' ||
      password.length > 256
    ) {
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

    const codigoEmpresa = codigo_empresa.trim().toUpperCase();
    const identificadorNormalizado =
      identificador.trim().toLowerCase();

    const { data: empresa, error: empresaError } = await supabase
      .from('empresas')
      .select('id, nombre, codigo_acceso')
      .eq('codigo_acceso', codigoEmpresa)
      .maybeSingle();

    if (empresaError) throw empresaError;

    if (!empresa) {
      await registrarAuditoria(
        supabase,
        identificadorNormalizado,
        'fallo',
        'Código de empresa inválido'
      );

      return res.status(401).json({
        ok: false,
        error: 'Empresa, usuario o contraseña incorrectos.'
      });
    }

    const { data: usuario, error: usuarioError } = await supabase
      .from('usuarios')
      .select(
        'id, empresa_id, identificador, password_hash, rol, activo'
      )
      .eq('empresa_id', empresa.id)
      .eq('identificador', identificadorNormalizado)
      .maybeSingle();

    if (usuarioError || !usuario) {
      await registrarAuditoria(
        supabase,
        identificadorNormalizado,
        'fallo',
        'Usuario no encontrado para la empresa indicada'
      );

      return res.status(401).json({
        ok: false,
        error: 'Empresa, usuario o contraseña incorrectos.'
      });
    }

    if (usuario.activo === false) {
      await registrarAuditoria(
        supabase,
        identificadorNormalizado,
        'fallo',
        'Intento de acceso con usuario inactivo'
      );

      return res.status(403).json({
        ok: false,
        error: 'Este usuario está desactivado.'
      });
    }

    const passwordCorrecta = bcrypt.compareSync(
      password,
      usuario.password_hash
    );

    if (!passwordCorrecta) {
      await registrarAuditoria(
        supabase,
        identificadorNormalizado,
        'fallo',
        'Contraseña incorrecta'
      );

      return res.status(401).json({
        ok: false,
        error: 'Empresa, usuario o contraseña incorrectos.'
      });
    }

    await registrarAuditoria(
      supabase,
      identificadorNormalizado,
      'exito',
      'Inicio de sesión correcto'
    );

    const token = createSessionToken(
      usuario.id,
      usuario.identificador,
      usuario.rol,
      usuario.empresa_id,
      empresa.codigo_acceso
    );

    res.setHeader('Set-Cookie', sessionCookie(token));

    return res.status(200).json({
      ok: true,
      rol: usuario.rol,
      empresa_id: usuario.empresa_id,
      codigo_empresa: empresa.codigo_acceso,
      empresa_nombre: empresa.nombre
    });
  } catch (error) {
    console.error('verify-password error:', error);

    return res.status(500).json({
      ok: false,
      error: 'No se pudo iniciar sesión.'
    });
  }
};
