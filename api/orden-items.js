const { createClient } = require('@supabase/supabase-js');
const { requireSession, getSessionUser } = require('./_auth');
const { registrarAuditoriaOrden } = require('./_orden-audit');

const INFOTAC_EMPRESA_ID =
  'ce95321a-ea37-47d1-81bb-f25f0dd58eeb';

const TIPOS_PERMITIDOS = new Set([
  'repuesto',
  'mano_obra'
]);

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Base de datos no configurada.');
  }

  return createClient(url, key);
}

function validOrdenId(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function texto(value, maximo) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maximo);
}

function numeroPositivo(value, valorPorDefecto) {
  const numero = Number(value);

  if (!Number.isFinite(numero) || numero < 0) {
    return valorPorDefecto;
  }

  return numero;
}

function esTecnico(user) {
  return user && user.rol === 'tecnico';
}

async function obtenerOrdenPermitida(supabase, ordenId, user) {
  let query = supabase
    .from('ordenes')
    .select('id, empresa_id, tecnico_id')
    .eq('id', ordenId)
    .eq('empresa_id', INFOTAC_EMPRESA_ID);

  if (esTecnico(user)) {
    query = query.eq('tecnico_id', user.id);
  }

  const { data: orden, error } = await query.maybeSingle();

  if (error) throw error;

  return orden;
}

module.exports = async function handler(req, res) {
  if (!requireSession(req, res)) return;

  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).json({
      ok: false,
      error: 'Método no permitido.'
    });
  }

  try {
    const supabase = db();
    const user = getSessionUser(req);

    if (!user) {
      return res.status(401).json({
        ok: false,
        error: 'Sesión inválida. Volvé a iniciar sesión.'
      });
    }

    // ===== GET: listar ítems de una orden =====
    if (req.method === 'GET') {
      const ordenId = req.query && req.query.orden_id;

      if (!validOrdenId(ordenId)) {
        return res.status(400).json({
          ok: false,
          error: 'Identificador de orden inválido.'
        });
      }

      const orden = await obtenerOrdenPermitida(
        supabase,
        ordenId,
        user
      );

      if (!orden) {
        return res.status(404).json({
          ok: false,
          error: 'Orden no encontrada.'
        });
      }

      const { data, error } = await supabase
        .from('orden_items')
        .select(
          'id, orden_id, tipo, descripcion, cantidad, precio_unitario, creado_en'
        )
        .eq('orden_id', ordenId)
        .order('creado_en', { ascending: true });

      if (error) throw error;

      return res.status(200).json({
        ok: true,
        data: data || []
      });
    }

    // ===== POST: crear ítem =====
    if (req.method === 'POST') {
      const body = req.body || {};
      const ordenId = texto(body.orden_id, 200);
      const tipo = texto(body.tipo, 30);
      const descripcion = texto(body.descripcion, 300);
      const cantidad = numeroPositivo(body.cantidad, 0);

      // Un técnico no puede definir precios.
      const precioUnitario = esTecnico(user)
        ? 0
        : numeroPositivo(body.precio_unitario, 0);

      if (!validOrdenId(ordenId)) {
        return res.status(400).json({
          ok: false,
          error: 'Identificador de orden inválido.'
        });
      }

      if (!TIPOS_PERMITIDOS.has(tipo)) {
        return res.status(400).json({
          ok: false,
          error: 'Tipo de ítem inválido.'
        });
      }

      if (!descripcion) {
        return res.status(400).json({
          ok: false,
          error: 'La descripción es obligatoria.'
        });
      }

      if (cantidad <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'La cantidad debe ser mayor que cero.'
        });
      }

      const orden = await obtenerOrdenPermitida(
        supabase,
        ordenId,
        user
      );

      if (!orden) {
        return res.status(404).json({
          ok: false,
          error: 'Orden no encontrada.'
        });
      }

      const { data, error } = await supabase
        .from('orden_items')
        .insert({
          orden_id: ordenId,
          tipo: tipo,
          descripcion: descripcion,
          cantidad: cantidad,
          precio_unitario: precioUnitario
        })
        .select(
          'id, orden_id, tipo, descripcion, cantidad, precio_unitario, creado_en'
        )
        .single();

            if (error) throw error;

      const tipoVisible =
        data.tipo === 'repuesto' ? 'repuesto' : 'mano de obra';

      await registrarAuditoriaOrden(supabase, user, {
        orden_id: data.orden_id,
        empresa_id: orden.empresa_id,
        accion: 'item_agregado',
        detalle:
          'Se agregó ' +
          tipoVisible +
          ': ' +
          data.descripcion +
          '.',
        datos_nuevos: {
          item_id: data.id,
          tipo: data.tipo,
          descripcion: data.descripcion,
          cantidad: data.cantidad,
          precio_unitario: data.precio_unitario
        }
      });

      return res.status(201).json({
        ok: true,
        data: data
      });
    }

    // ===== PATCH: editar ítem =====
    if (req.method === 'PATCH') {
      const body = req.body || {};
      const itemId = texto(body.id || body.item_id, 200);
      const tipo = texto(body.tipo, 30);
      const descripcion = texto(body.descripcion, 300);
      const cantidad = numeroPositivo(body.cantidad, 0);

      if (!validOrdenId(itemId)) {
        return res.status(400).json({
          ok: false,
          error: 'Identificador de ítem inválido.'
        });
      }

      if (!TIPOS_PERMITIDOS.has(tipo)) {
        return res.status(400).json({
          ok: false,
          error: 'Tipo de ítem inválido.'
        });
      }

      if (!descripcion) {
        return res.status(400).json({
          ok: false,
          error: 'La descripción es obligatoria.'
        });
      }

      if (cantidad <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'La cantidad debe ser mayor que cero.'
        });
      }

        const { data: item, error: itemError } = await supabase
        .from('orden_items')
        .select(
          'id, orden_id, tipo, descripcion, cantidad, precio_unitario'
        )
        .eq('id', itemId)
        .maybeSingle();

      if (itemError) throw itemError;

      if (!item) {
        return res.status(404).json({
          ok: false,
          error: 'Ítem no encontrado.'
        });
      }

      const orden = await obtenerOrdenPermitida(
        supabase,
        item.orden_id,
        user
      );

      if (!orden) {
        return res.status(404).json({
          ok: false,
          error: 'Orden no encontrada.'
        });
      }

      // Un técnico conserva el precio anterior; user/admin sí pueden cambiarlo.
      const precioUnitario = esTecnico(user)
        ? numeroPositivo(item.precio_unitario, 0)
        : numeroPositivo(body.precio_unitario, 0);

      const { data, error } = await supabase
        .from('orden_items')
        .update({
          tipo: tipo,
          descripcion: descripcion,
          cantidad: cantidad,
          precio_unitario: precioUnitario
        })
        .eq('id', itemId)
        .select(
          'id, orden_id, tipo, descripcion, cantidad, precio_unitario, creado_en'
        )
        .single();

            if (error) throw error;

      const datosAnteriores = {
        tipo: item.tipo,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario
      };

      const datosNuevos = {
        tipo: data.tipo,
        descripcion: data.descripcion,
        cantidad: data.cantidad,
        precio_unitario: data.precio_unitario
      };

      const huboCambios =
        String(datosAnteriores.tipo ?? '') !==
          String(datosNuevos.tipo ?? '') ||
        String(datosAnteriores.descripcion ?? '') !==
          String(datosNuevos.descripcion ?? '') ||
        String(datosAnteriores.cantidad ?? '') !==
          String(datosNuevos.cantidad ?? '') ||
        String(datosAnteriores.precio_unitario ?? '') !==
          String(datosNuevos.precio_unitario ?? '');

      if (huboCambios) {
        await registrarAuditoriaOrden(supabase, user, {
          orden_id: data.orden_id,
          empresa_id: orden.empresa_id,
          accion: 'item_actualizado',
          detalle: 'Se actualizó el ítem: ' + data.descripcion + '.',
          datos_anteriores: datosAnteriores,
          datos_nuevos: datosNuevos
        });
      }

      return res.status(200).json({
        ok: true,
        data: data
      });
    }

    // ===== DELETE: eliminar ítem =====
    if (req.method === 'DELETE') {
      const itemId = texto(
        req.query && (req.query.id || req.query.item_id),
        200
      );

      if (!validOrdenId(itemId)) {
        return res.status(400).json({
          ok: false,
          error: 'Identificador de ítem inválido.'
        });
      }

      const { data: item, error: itemError } = await supabase
        .from('orden_items')
        .select('id, orden_id')
        .eq('id', itemId)
        .maybeSingle();

      if (itemError) throw itemError;

      if (!item) {
        return res.status(404).json({
          ok: false,
          error: 'Ítem no encontrado.'
        });
      }

      const orden = await obtenerOrdenPermitida(
        supabase,
        item.orden_id,
        user
      );

      if (!orden) {
        return res.status(404).json({
          ok: false,
          error: 'Orden no encontrada.'
        });
      }

      const { error: deleteError } = await supabase
        .from('orden_items')
        .delete()
        .eq('id', itemId);

      if (deleteError) throw deleteError;

      return res.status(200).json({
        ok: true
      });
    }
  } catch (error) {
    console.error('orden-items error:', error);

    return res.status(500).json({
      ok: false,
      error: 'No se pudieron procesar los ítems de la orden.'
    });
  }
};
