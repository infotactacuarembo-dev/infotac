const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  try {
    const { empresa, identificador, password } = req.body || {};
    const empresaInput = String(empresa || '').trim();
    const usuarioInput = String(identificador || '').trim();
    const passwordInput = String(password || '');

    if (!empresaInput || !usuarioInput || !passwordInput) {
      return res.status(400).json({ ok: false, error: 'Empresa, usuario y contraseña son requeridos' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: empresas, error: empresaError } = await supabase
      .from('empresas')
      .select('id, nombre, codigo_acceso')
      .or(`codigo_acceso.eq.${empresaInput},nombre.eq.${empresaInput}`)
      .limit(1);

    if (empresaError || !empresas || empresas.length === 0) {
      return res.status(401).json({ ok: false, error: 'Empresa, usuario o contraseña incorrectos' });
    }

    const empresaEncontrada = empresas[0];
    const { data: usuario, error: usuarioError } = await supabase
      .from('usuarios')
      .select('id, empresa_id, identificador, password_hash, rol, activo, debe_cambiar_password')
      .eq('empresa_id', empresaEncontrada.id)
      .eq('identificador', usuarioInput)
      .maybeSingle();

    if (usuarioError || !usuario || !usuario.activo) {
      return res.status(401).json({ ok: false, error: 'Empresa, usuario o contraseña incorrectos' });
    }

    const passwordValida = await bcrypt.compare(passwordInput, usuario.password_hash);
    if (!passwordValida) {
      await supabase.from('login_audit').insert({
        identificador: usuarioInput,
        resultado: 'fallo',
        detalle: 'Contraseña inválida',
        empresa_id: empresaEncontrada.id
      });
      return res.status(401).json({ ok: false, error: 'Empresa, usuario o contraseña incorrectos' });
    }

    await supabase.from('login_audit').insert({
      identificador: usuarioInput,
      resultado: 'exito',
      detalle: 'Inicio de sesión correcto',
      empresa_id: empresaEncontrada.id
    });

    return res.status(200).json({
      ok: true,
      user: {
        id: usuario.id,
        empresa_id: usuario.empresa_id,
        identificador: usuario.identificador,
        rol: usuario.rol,
        debe_cambiar_password: Boolean(usuario.debe_cambiar_password)
      },
      empresa: {
        id: empresaEncontrada.id,
        nombre: empresaEncontrada.nombre,
        codigo_acceso: empresaEncontrada.codigo_acceso
      }
    });
  } catch (error) {
    console.error('verify-password error:', error);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};