const { createClient } = require('@supabase/supabase-js');
const { requireSession, getSessionUser } = require('./_auth');
const bcrypt = require('bcryptjs');

async function registrarAuditoriaUsuario(
  supabase,
  actorIdentificador,
  accion,
  usuarioAfectado,
  detalle
) {
  try {
    const { error } = await supabase
      .from('user_audit')
      .insert({
        actor_identificador: actorIdentificador,
        accion: accion,
        usuario_afectado: usuarioAfectado,
        detalle: detalle
      });

    if (error) {
      console.error('No se pudo registrar auditoría de usuario:', error);
    }
  } catch (error) {
    console.error('Error al registrar auditoría de usuario:', error);
  }
}

module.exports = async function handler(req, res) {
  // Solo permitir GET, POST, PUT, DELETE
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
    return res.status(405).json({
      ok: false,
      error: 'Método no permitido.'
    });
  }

  // Verificar sesión
  if (!requireSession(req, res)) {
    return;
  }

  // Verificar que el usuario sea admin
  const user = getSessionUser(req);
  if (!user || user.rol !== 'admin') {
    return res.status(403).json({
      ok: false,
      error: 'Acceso no autorizado.'
    });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return res.status(503).json({
      ok: false,
      error: 'Servicio no disponible.'
    });
  }

  const supabase = createClient(url, key);

  try {
    // LISTAR USUARIOS
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, identificador, rol, activo, creado_en')
        .order('creado_en', { ascending: false });

      if (error) throw error;

      return res.status(200).json({
        ok: true,
        usuarios: data || []
      });
    }

    // CREAR USUARIO
    if (req.method === 'POST') {
      const { identificador, password, rol } = req.body || {};

      if (!identificador || typeof identificador !== 'string' || identificador.trim().length === 0) {
        return res.status(400).json({
          ok: false,
          error: 'El identificador es requerido.'
        });
      }

      if (!password || typeof password !== 'string' || password.length < 10) {
        return res.status(400).json({
          ok: false,
          error: 'La contraseña debe tener al menos 10 caracteres.'
        });
      }

      if (!['user', 'admin'].includes(rol)) {
        return res.status(400).json({
          ok: false,
          error: 'El rol debe ser "user" o "admin".'
        });
      }

      // Verificar si ya existe
      const { data: existe } = await supabase
        .from('usuarios')
        .select('id')
        .eq('identificador', identificador.trim().toLowerCase())
        .single();

      if (existe) {
        return res.status(409).json({
          ok: false,
          error: 'Ya existe un usuario con ese identificador.'
        });
      }

      // Hashear contraseña
      const passwordHash = bcrypt.hashSync(password, 10);

      const { data, error } = await supabase
        .from('usuarios')
        .insert({
          identificador: identificador.trim().toLowerCase(),
          password_hash: passwordHash,
          rol: rol
        })
        .select('id, identificador, rol, creado_en')
        .single();

      if (error) throw error;

      const actor = getSessionUser(req);

      await registrarAuditoriaUsuario(
      supabase,
      actor ? actor.identificador : 'desconocido',
      'usuario_creado',
      data.identificador,
      'Rol asignado: ' + data.rol
    );
      
      return res.status(201).json({
        ok: true,
        usuario: data
      });
    }

    // EDITAR USUARIO (PUT)
    if (req.method === 'PUT') {
      const { id, password, rol } = req.body || {};

      if (!id || typeof id !== 'string') {
        return res.status(400).json({
          ok: false,
          error: 'ID de usuario inválido.'
        });
      }

      // Verificar que el usuario existe
      const { data: usuarioExistente, error: fetchError } = await supabase
        .from('usuarios')
        .select('id, identificador, rol')
        .eq('id', id)
        .single();

      if (fetchError || !usuarioExistente) {
        return res.status(404).json({
          ok: false,
          error: 'Usuario no encontrado.'
        });
      }

      // Validar que si cambia a rol, haya al menos otro admin
      if (rol && rol !== usuarioExistente.rol) {
        if (usuarioExistente.rol === 'admin') {
          // Contar cuántos admins hay
          const { data: admins } = await supabase
            .from('usuarios')
            .select('id', { count: 'exact' })
            .eq('rol', 'admin');

          if (admins && admins.length <= 1) {
            return res.status(400).json({
              ok: false,
              error: 'Debe haber al menos un usuario admin.'
            });
          }
        }
      }

      // Actualizar
      const updateData = {};
      if (rol) updateData.rol = rol;
      if (password && password.length >= 10) {
        updateData.password_hash = bcrypt.hashSync(password, 10);
      }

      const { data, error } = await supabase
        .from('usuarios')
        .update(updateData)
        .eq('id', id)
        .select('id, identificador, rol, creado_en')
        .single();

      if (error) throw error;

      const cambios = [];

      if (rol && rol !== usuarioExistente.rol) {
        cambios.push('Rol: ' + usuarioExistente.rol + ' → ' + data.rol);
      }

      if (password && password.length >= 10) {
        cambios.push('Contraseña restablecida');
      }

      if (cambios.length > 0) {
        await registrarAuditoriaUsuario(
        supabase,
        user.identificador,
        'usuario_editado',
        data.identificador,
        cambios.join('. ')
      );
    }

    return res.status(200).json({
    ok: true,
    usuario: data
  });
    }

    // ELIMINAR USUARIO (DELETE)
    if (req.method === 'DELETE') {
      const { id } = req.body || {};

      if (!id || typeof id !== 'string') {
        return res.status(400).json({
          ok: false,
          error: 'ID de usuario inválido.'
        });
      }

      // Verificar que el usuario existe
      const { data: usuarioExistente } = await supabase
        .from('usuarios')
        .select('id, identificador, rol')
        .eq('id', id)
        .single();

      if (!usuarioExistente) {
        return res.status(404).json({
          ok: false,
          error: 'Usuario no encontrado.'
        });
      }

      // Si es admin, verificar que haya al menos otro admin
      if (usuarioExistente.rol === 'admin') {
        const { data: admins } = await supabase
          .from('usuarios')
          .select('id', { count: 'exact' })
          .eq('rol', 'admin');

        if (admins && admins.length <= 1) {
          return res.status(400).json({
            ok: false,
            error: 'Debe haber al menos un usuario admin.'
          });
        }
      }

        await registrarAuditoriaUsuario(
        supabase,
        user.identificador,
        'usuario_eliminado',
        usuarioExistente.identificador,
        'Usuario eliminado. Rol anterior: ' + usuarioExistente.rol
      );
      const { error } = await supabase
        .from('usuarios')
        .delete()
        .eq('id', id);

      if (error) throw error;
        return res.status(200).json({
        ok: true
      });
    }
  } catch (error) {
    console.error('users api error:', error);

    return res.status(500).json({
      ok: false,
      error: 'No se pudo completar la operación.'
    });
  }
}
