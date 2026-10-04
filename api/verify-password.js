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
    const { data: porNombre } = await supabase.from('empresas').select('id, nombre, codigo_acceso, portal_empresa_id').ilike('nombre', empresaInput).limit(1);
    if (porNombre?.length) empresaEncontrada = porNombre[0];
    if (!empresaEncontrada) {
      const { data: porCodigo } = await supabase.from('empresas').select('id, nombre, codigo_acceso, portal_empresa_id').ilike('codigo_acceso', empresaInput).limit(1);
      if (porCodigo?.length) empresaEncontrada = porCodigo[0];
    }
    if (!empresaEncontrada) return res.status(401).json({ ok: false, error: 'Empresa, usuario o contraseña incorrectos' });

    // ===== VALIDACIÓN DE ESTADO DE LICENCIA =====
    const portalUrl = process.env.PORTAL_SUPABASE_URL;
    const portalKey = process.env.PORTAL_SUPABASE_SERVICE_ROLE_KEY || process.env.PORTAL_SUPABASE_ANON_KEY;

    let licenciaInfo = { estado: 'activa', dias_restantes: null, vence_at: null };

    if (portalUrl && portalKey && empresaEncontrada.portal_empresa_id) {
      try {
        const supabasePortal = createClient(portalUrl, portalKey);
        const { data: licList, error: errRpc } = await supabasePortal
          .rpc('verificar_licencia_taller', { p_taller_id: empresaEncontrada.portal_empresa_id });

        const lic = (licList && licList.length > 0) ? licList[0] : null;

        if (lic) {
          const ahora = new Date();
          const estado = lic.estado ? lic.estado.toLowerCase().trim() : 'prueba';

          if (estado === 'suspendida') {
            await supabase.from('login_audit').insert({
              identificador: usuarioInput,
              resultado: 'fallo',
              detalle: 'Intento de acceso con licencia suspendida',
              empresa_id: empresaEncontrada.id
            });
            return res.status(403).json({
              ok: false,
              error: 'El acceso a este taller se encuentra suspendido. Por favor, contacte a soporte.'
            });
          }

          if (estado === 'cancelada') {
            await supabase.from('login_audit').insert({
              identificador: usuarioInput,
              resultado: 'fallo',
              detalle: 'Intento de acceso con suscripción cancelada',
              empresa_id: empresaEncontrada.id
            });
            return res.status(403).json({
              ok: false,
              error: 'La suscripción de este taller fue cancelada.'
            });
          }

          if (lic.vence_at) {
            const fechaVence = new Date(lic.vence_at);
            const diasRestantes = Math.ceil((fechaVence - ahora) / (1000 * 60 * 60 * 24));

            if (fechaVence < ahora || estado === 'vencida') {
              await supabase.from('login_audit').insert({
                identificador: usuarioInput,
                resultado: 'fallo',
                detalle: 'Intento de acceso con licencia vencida',
                empresa_id: empresaEncontrada.id
              });
              return res.status(403).json({
                ok: false,
                error: 'La licencia de este taller ha expirado. Por favor, renueve su suscripción.'
              });
            }

            licenciaInfo = { estado, dias_restantes: diasRestantes, vence_at: lic.vence_at };
          } else {
            licenciaInfo = { estado, dias_restantes: null, vence_at: null };
          }
        }
      } catch (errLic) {
        console.error('Advertencia al consultar licencia en portal:', errLic);
      }
    }

    // ===== VALIDACIÓN DE USUARIO =====
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
      licencia: licenciaInfo,
      exp: Date.now() + 8 * 60 * 60 * 1000
    };

    res.setHeader('Set-Cookie', `taller_session=${encodeURIComponent(JSON.stringify(session))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`);
    const user = { id: usuarioDb.id, empresa_id: usuarioDb.empresa_id, identificador: usuarioDb.identificador, rol: usuarioDb.rol, debe_cambiar_password: Boolean(usuarioDb.debe_cambiar_password) };
    await supabase.from('login_audit').insert({ identificador: usuarioDb.identificador, resultado: 'exito', detalle: 'Inicio de sesión correcto', empresa_id: empresaEncontrada.id });

    return res.status(200).json({
      ok: true,
      ...user,
      user,
      empresa: { id: empresaEncontrada.id, nombre: empresaEncontrada.nombre, codigo_acceso: empresaEncontrada.codigo_acceso },
      licencia: licenciaInfo
    });
  } catch (error) {
    console.error('verify-password error:', error);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};
