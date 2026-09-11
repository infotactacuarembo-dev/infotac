const { createClient } = require('@supabase/supabase-js');
const { requireSession, getSessionUser } = require('./_auth');
const bcrypt = require('bcryptjs');

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Base de datos no configurada.');
  }

  return createClient(url, key);
}

function validId(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function getEmpresaId(user) {
  return validId(user && user.empresa_id)
    ? user.empresa_id
    : null;
}

function normalizarIdentificador(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().slice(0, 120)
    : '';
}

async function registrarAuditoriaUsuario(
  supabase,
  empresaId,
  actorIdentificador,
  accion,
  usuarioAfectado,
  detalle
) {
  try {
    const { error } = await supabase
      .from('user_audit')
      .insert({
        empresa_id: empresaId,
        actor_identificador: actorIdentificador,
        accion: accion,
        usuario_afectado: usuarioAfectado,
        detalle: detalle
      });

    if (error) {
      console.error(
        'No se pudo registrar auditoría de usuario:',
        error
      );
    }
  } catch (error) {
    console.error(
      'Error al registrar auditoría de usuario:',
      error
    );
  }
}

async function contarAdminsActivos(supabase, empresaId) {
  const { count, error } = await supabase
    .from('usuarios')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .eq('rol', 'admin')
    .eq('activo', true);

  if (error) throw error;

  return count || 0;
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
    return res.status(405).json({
      ok: false,
      error: 'Método no permitido.'
    });
  }

  if (!requireSession(req, res)) return;

  const user = getSessionUser(req);
  const empresaId = getEmpresaId(user);

  if (!user || !empresaId) {
    return res.status(401).json({
      ok: false,
      error: 'Sesión de empresa inválida. Volvé a iniciar sesión.'
    });
  }

  const solicitaTecnicos =
    req.method === 'GET' &&
    req.query &&
    req.query.rol === 'tecnico';

  const userPuedeListarTecnicos =
    user.rol === 'user' && solicitaTecnicos;

  const esAdmin = user.rol === 'admin';

  if (!esAdmin && !userPuedeListarTecnicos) {
    return res.status(403).json({
      ok: false,
      error: 'Acceso no autorizado.'
    });
  }

  try {
    const supabase = db();

    // ===== GET: listar usuarios o técnicos =====
    if (req.method === 'GET') {
      const rol = req.query && req.query.rol;

      let query = supabase
        .from('usuarios')
        .select(
          'id, identificador, rol, activo, creado_en, empresa_id'
        )
        .eq('empresa_id', empresaId);

      if (rol) {
        query = query.eq('rol', rol);
      }

      if (userPuedeListarTecnicos) {
        query = query.eq('activo', true);
      }

      const { data, error } = await query.order('creado_en', {
        ascending: false
      });

      if (error) throw error;

      return res.status(200).json({
        ok: true,
        data: data || []
      });
    }

    // A partir de aquí, solo administradores.
    if (!esAdmin) {
      return res.status(403).json({
        ok: false,
        error: 'Solo un administrador puede administrar usuarios.'
      });
    }

    // ===== POST: crear usuario =====
    if (req.method === 'POST') {
      const body = req.body || {};
      const identificador = normalizarIdentificador(
        body.identificador
      );
      const password = body.password;
      const rol = body.rol;

      if (!identificador) {
        return res.status(400).json({
          ok: false,
          error: 'El identificador es requerido.'
        });
      }

      if (
        !password ||
        typeof password !== 'string' ||
        password.length < 10
      ) {
        return res.status(400).json({
          ok: false,
          error:
            'La contraseña debe tener al menos 10 caracteres.'
        });
      }

      if (!['user', 'tecnico', 'admin'].includes(rol)) {
        return res.status(400).json({
          ok: false,
          error:
            'El rol debe ser "user", "tecnico" o "admin".'
        });
      }

      const { data: existe, error: existeError } = await supabase
        .from('usuarios')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('identificador', identificador)
        .maybeSingle();

      if (existeError) throw existeError;

      if (existe) {
        return res.status(409).json({
          ok: false,
          error:
            'Ya existe un usuario con ese identificador en esta empresa.'
        });
      }

      const passwordHash = bcrypt.hashSync(password, 10);

      const { data, error } = await supabase
        .from('usuarios')
        .insert({
          empresa_id: empresaId,
          identificador: identificador,
          password_hash: passwordHash,
          rol: rol,
          activo: true
        })
        .select(
          'id, identificador, rol, activo, creado_en, empresa_id'
        )
        .single();

      if (error) throw error;

      await registrarAuditoriaUsuario(
        supabase,
        empresaId,
        user.identificador,
        'usuario_creado',
        data.identificador,
        'Rol asignado: ' + data.rol
      );

      return res.status(201).json({
        ok: true,
        usuario: data
      });
    }

    // ===== PUT: editar usuario =====
    if (req.method === 'PUT') {
      const body = req.body || {};
      const id = body.id;
      const password = body.password;
      const rol = body.rol;
      const activo = body.activo;

      if (!validId(id)) {
        return res.status(400).json({
          ok: false,
          error: 'ID de usuario inválido.'
        });
      }

      if (
        rol !== undefined &&
        !['user', 'tecnico', 'admin'].includes(rol)
      ) {
        return res.status(400).json({
          ok: false,
          error:
            'El rol debe ser "user", "tecnico" o "admin".'
        });
      }

      if (
        activo !== undefined &&
        typeof activo !== 'boolean'
      ) {
        return res.status(400).json({
          ok: false,
          error: 'El estado activo debe ser true o false.'
        });
      }

      if (
        password !== undefined &&
        (
          typeof password !== 'string' ||
          password.length < 10
        )
      ) {
        return res.status(400).json({
          ok: false,
          error:
            'La contraseña debe tener al menos 10 caracteres.'
        });
      }

      const {
        data: usuarioExistente,
        error: fetchError
      } = await supabase
        .from('usuarios')
        .select(
          'id, empresa_id, identificador, rol, activo'
        )
        .eq('id', id)
        .eq('empresa_id', empresaId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!usuarioExistente) {
        return res.status(404).json({
          ok: false,
          error: 'Usuario no encontrado.'
        });
      }

      if (
        activo === false &&
        normalizarIdentificador(
          usuarioExistente.identificador
        ) === normalizarIdentificador(user.identificador)
      ) {
        return res.status(400).json({
          ok: false,
          error:
            'No podés desactivar el usuario con el que iniciaste sesión.'
        });
      }

      const dejaDeSerAdmin =
        usuarioExistente.rol === 'admin' &&
        (
          activo === false ||
          (rol !== undefined && rol !== 'admin')
        );

      if (dejaDeSerAdmin) {
        const adminsActivos = await contarAdminsActivos(
          supabase,
          empresaId
        );

        if (
          usuarioExistente.activo === true &&
          adminsActivos <= 1
        ) {
          return res.status(400).json({
            ok: false,
            error:
              'Debe quedar al menos un administrador activo.'
          });
        }
      }

      const updateData = {};

      if (rol !== undefined) {
        updateData.rol = rol;
      }

      if (activo !== undefined) {
        updateData.activo = activo;
      }

      if (password !== undefined) {
        updateData.password_hash = bcrypt.hashSync(password, 10);
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          ok: false,
          error: 'No hay cambios para guardar.'
        });
      }

      const { data, error } = await supabase
        .from('usuarios')
        .update(updateData)
        .eq('id', id)
        .eq('empresa_id', empresaId)
        .select(
          'id, identificador, rol, activo, creado_en, empresa_id'
        )
        .single();

      if (error) throw error;

      const cambios = [];

      if (rol !== undefined && rol !== usuarioExistente.rol) {
        cambios.push(
          'Rol: ' +
            usuarioExistente.rol +
            ' → ' +
            data.rol
        );
      }

      if (password !== undefined) {
        cambios.push('Contraseña restablecida');
      }

      if (
        activo !== undefined &&
        activo !== usuarioExistente.activo
      ) {
        cambios.push(
          'Estado: ' +
            (usuarioExistente.activo
              ? 'Activo'
              : 'Inactivo') +
            ' → ' +
            (activo ? 'Activo' : 'Inactivo')
        );
      }

      if (cambios.length > 0) {
        await registrarAuditoriaUsuario(
          supabase,
          empresaId,
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

    // ===== DELETE: eliminar usuario =====
    if (req.method === 'DELETE') {
      const body = req.body || {};
      const id = body.id;

      if (!validId(id)) {
        return res.status(400).json({
          ok: false,
          error: 'ID de usuario inválido.'
        });
      }

      const { data: usuarioExistente, error: fetchError } =
        await supabase
          .from('usuarios')
          .select(
            'id, empresa_id, identificador, rol, activo'
          )
          .eq('id', id)
          .eq('empresa_id', empresaId)
          .maybeSingle();

      if (fetchError) throw fetchError;

      if (!usuarioExistente) {
        return res.status(404).json({
          ok: false,
          error: 'Usuario no encontrado.'
        });
      }

      if (
        normalizarIdentificador(
          usuarioExistente.identificador
        ) === normalizarIdentificador(user.identificador)
      ) {
        return res.status(400).json({
          ok: false,
          error:
            'No podés eliminar el usuario con el que iniciaste sesión.'
        });
      }

      if (
        usuarioExistente.rol === 'admin' &&
        usuarioExistente.activo === true
      ) {
        const adminsActivos = await contarAdminsActivos(
          supabase,
          empresaId
        );

        if (adminsActivos <= 1) {
          return res.status(400).json({
            ok: false,
            error:
              'Debe quedar al menos un administrador activo.'
          });
        }
      }

      await registrarAuditoriaUsuario(
        supabase,
        empresaId,
        user.identificador,
        'usuario_eliminado',
        usuarioExistente.identificador,
        'Usuario eliminado. Rol anterior: ' +
          usuarioExistente.rol
      );

      const { error } = await supabase
        .from('usuarios')
        .delete()
        .eq('id', id)
        .eq('empresa_id', empresaId);

      if (error) throw error;

      return res.status(200).json({
        ok: true
      });
    }

    return res.status(405).json({
      ok: false,
      error: 'Método no permitido.'
    });
  } catch (error) {
    console.error('users api error:', error);

    return res.status(500).json({
      ok: false,
      error: 'No se pudo completar la operación.'
    });
  }
};
