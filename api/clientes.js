const { createClient } = require('@supabase/supabase-js');
const { requireSession, getSessionUser } = require('./_auth');

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Base de datos no configurada.');
  }

  return createClient(url, key);
}

function texto(value, max) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, max);
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

function esTecnico(user) {
  return user && user.rol === 'tecnico';
}

module.exports = async function handler(req, res) {
  if (!requireSession(req, res)) return;

  const user = getSessionUser(req);
  const empresaId = getEmpresaId(user);

  if (!user || !empresaId) {
    return res.status(401).json({
      ok: false,
      error: 'Sesión de empresa inválida. Volvé a iniciar sesión.'
    });
  }

  try {
    const supabase = db();

    if (esTecnico(user)) {
      return res.status(403).json({
        ok: false,
        error: 'Los técnicos no tienen acceso a clientes.'
      });
    }

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, whatsapp')
        .eq('empresa_id', empresaId)
        .order('nombre', { ascending: true });

      if (error) throw error;

      return res.status(200).json({
        ok: true,
        data: data || []
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const nombre = texto(body.nombre, 160);
      const whatsapp = texto(body.whatsapp, 40);

      if (!nombre) {
        return res.status(400).json({
          ok: false,
          error: 'El nombre del cliente es obligatorio.'
        });
      }

      const { data: existente, error: buscarError } = await supabase
        .from('clientes')
        .select('id, nombre, whatsapp')
        .eq('empresa_id', empresaId)
        .ilike('nombre', nombre)
        .maybeSingle();

      if (buscarError) throw buscarError;

      if (existente) {
        return res.status(409).json({
          ok: false,
          error: 'Ese cliente ya existe.',
          data: existente
        });
      }

      const { data, error } = await supabase
        .from('clientes')
        .insert({
          empresa_id: empresaId,
          nombre,
          whatsapp
        })
        .select('id, nombre, whatsapp')
        .single();

      if (error) throw error;

      return res.status(201).json({
        ok: true,
        data: data
      });
    }


    // ===== PUT: Editar cliente =====
if (req.method === 'PUT') {
  const body = req.body || {};
  const id = body.id;

  if (!validId(id)) {
    return res.status(400).json({
      ok: false,
      error: 'ID de cliente inválido.'
    });
  }

  const nombre = texto(body.nombre, 160);
  const whatsapp = texto(body.whatsapp, 40);

  if (!nombre) {
    return res.status(400).json({
      ok: false,
      error: 'El nombre del cliente es obligatorio.'
    });
  }

  const { data: existente, error: buscarError } = await supabase
    .from('clientes')
    .select('id')
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (buscarError) throw buscarError;

  if (!existente) {
    return res.status(404).json({
      ok: false,
      error: 'Cliente no encontrado.'
    });
  }

  const { data, error } = await supabase
    .from('clientes')
    .update({ nombre, whatsapp })
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .select('id, nombre, whatsapp')
    .single();

  if (error) throw error;

  return res.status(200).json({
    ok: true,
    data: data
  });
}

// ===== DELETE: Eliminar cliente =====
if (req.method === 'DELETE') {
  const body = req.body || {};
  const id = body.id;

  if (!validId(id)) {
    return res.status(400).json({
      ok: false,
      error: 'ID de cliente inválido.'
    });
  }

  const { data: existente, error: buscarError } = await supabase
    .from('clientes')
    .select('id')
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (buscarError) throw buscarError;

  if (!existente) {
    return res.status(404).json({
      ok: false,
      error: 'Cliente no encontrado.'
    });
  }

  const { error } = await supabase
    .from('clientes')
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
    console.error('clientes error:', error);

    return res.status(500).json({
      ok: false,
      error: 'No se pudo procesar clientes.'
    });
  }
};
