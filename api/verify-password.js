const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  try {
    const { empresa, codigo_empresa, identificador, usuario, password } = req.body || {};
    const empresaInput = String(empresa || codigo_empresa || '').trim();
    const usuarioInput = String(identificador || usuario || '').trim();
    const passwordInput = String(password || '');

    if (!empresaInput || !usuarioInput || !passwordInput) {
      return res.status(400).json({ ok: false, error: 'Empresa, usuario y contraseña son requeridos' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    let empresaEncontrada = null;
    const { data: porNombre } = await supabase.from('empresas').select('id, nombre, codigo_acceso').ilike('nombre', empresaInput).limit(1);
    if (porNombre?.length) empresaEncontrada = porNombre[0];
    if (!empresaEncontrada) {
      const { data: porCodigo } = await supabase.from('empresas').select('id, nombre, codigo_acceso').ilike('codigo_acceso', empresaInput).limit(1);
      if (porCodigo?.length) empresaEncontrada = porCodigo[0];
    }
    if (!empresaEncontrada) return res.status(401).json({ ok: false, error: 'Empresa, usuario o contraseña incorrectos' });

    const { data: usuarioDb } = await supabase.from('usuarios').select('id, empresa_id, identificador, password_hash, rol, activo, debe_cambiar_password').eq('empresa_id', empresaEncontrada.id).eq('identificador', usuarioInput).maybeSingle();
    if (!usuarioDb || !usuarioDb.activo || !(await bcrypt.compare(passwordInput, usuarioDb.password_hash))) {
      await supabase.from('login_audit').insert({ identificador: usuarioInput, resultado: 'fallo', detalle: 'Credenciales inválidas', empresa_id: empresaEncontrada.id });
      return res.status(401).json({ ok: false, error: 'Empresa, usuario o contraseña incorrectos' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const session = {
      token,
      user_id: usuarioDb.id,
      empresa_id: usuarioDb.empresa_id,
      identificador: usuarioDb.identificador,
      rol: usuarioDb.rol,
      exp: Date.now() + 8 * 60 * 60 * 1000
    };

    res.setHeader('Set-Cookie', `taller_session=${encodeURIComponent(JSON.stringify(session))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`);
    const user = { id: usuarioDb.id, empresa_id: usuarioDb.empresa_id, identificador: usuarioDb.identificador, rol: usuarioDb.rol, debe_cambiar_password: Boolean(usuarioDb.debe_cambiar_password) };
    await supabase.from('login_audit').insert({ identificador: usuarioDb.identificador, resultado: 'exito', detalle: 'Inicio de sesión correcto', empresa_id: empresaEncontrada.id });

    return res.status(200).json({ ok: true, ...user, user, empresa: { id: empresaEncontrada.id, nombre: empresaEncontrada.nombre, codigo_acceso: empresaEncontrada.codigo_acceso } });
  } catch (error) {
    console.error('verify-password error:', error);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};
