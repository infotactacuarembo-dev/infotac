const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  try {
    const { empresa, codigo_empresa, identificador, password } = req.body || {};
    const empresaInput = String(empresa || codigo_empresa || '').trim();
    const usuarioInput = String(identificador || '').trim();
    const passwordInput = String(password || '');
    if (!empresaInput || !usuarioInput || !passwordInput) return res.status(400).json({ ok: false, error: 'Empresa, usuario y contraseña son requeridos' });
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    let empresaEncontrada = null;
    const { data: porNombre } = await supabase.from('empresas').select('id, nombre, codigo_acceso').ilike('nombre', empresaInput).limit(1);
    if (porNombre?.length) empresaEncontrada = porNombre[0];
    if (!empresaEncontrada) {
      const { data: porCodigo } = await supabase.from('empresas').select('id, nombre, codigo_acceso').ilike('codigo_acceso', empresaInput).limit(1);
      if (porCodigo?.length) empresaEncontrada = porCodigo[0];
    }
    if (!empresaEncontrada) return res.status(401).json({ ok: false, error: 'Empresa, usuario o contraseña incorrectos' });
    const { data: usuario } = await supabase.from('usuarios').select('id, empresa_id, identificador, password_hash, rol, activo, debe_cambiar_password').eq('empresa_id', empresaEncontrada.id).eq('identificador', usuarioInput).maybeSingle();
    if (!usuario || !usuario.activo || !(await bcrypt.compare(passwordInput, usuario.password_hash))) return res.status(401).json({ ok: false, error: 'Empresa, usuario o contraseña incorrectos' });
    const token = crypto.randomBytes(32).toString('hex');
    const session = { token, user_id: usuario.id, empresa_id: usuario.empresa_id, rol: usuario.rol, exp: Date.now() + 8 * 60 * 60 * 1000 };
    res.setHeader('Set-Cookie', `taller_session=${encodeURIComponent(JSON.stringify(session))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`);
    const user = { id: usuario.id, empresa_id: usuario.empresa_id, identificador: usuario.identificador, rol: usuario.rol, debe_cambiar_password: Boolean(usuario.debe_cambiar_password) };
    await supabase.from('login_audit').insert({ identificador: usuarioInput, resultado: 'exito', detalle: 'Inicio de sesión correcto', empresa_id: empresaEncontrada.id });
    return res.status(200).json({ ok: true, ...user, user, empresa: { id: empresaEncontrada.id, nombre: empresaEncontrada.nombre, codigo_acceso: empresaEncontrada.codigo_acceso } });
  } catch (error) { console.error('verify-password error:', error); return res.status(500).json({ ok: false, error: 'Error interno del servidor' }); }
};