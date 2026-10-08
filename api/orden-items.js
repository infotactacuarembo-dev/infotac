const { createClient } = require('@supabase/supabase-js');
const { requireSession, getSessionUser } = require('./_auth');
const { registrarAuditoriaOrden } = require('./_orden-audit');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function validId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

const TIPOS_VALIDOS = ['servicio', 'repuesto', 'mano_obra'];

module.exports = async function handler(req, res) {
  if (!requireSession(req, res)) return;

  const sessionUser = getSessionUser(req);
  if (!sessionUser || !sessionUser.empresa_id || !validId(sessionUser.empresa_id)) {
    return res.status(401).json({
      ok: false,
      error: 'Sesión inválida o empresa no identificada'
    });
  }

  const empresaId = sessionUser.empresa_id;
  const esAdmin = sessionUser.rol === 'admin';
  const userId = sessionUser.user_id || sessionUser.id;

  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).json({
      ok: false,
      error: 'Método no permitido'
    });
  }

  try {
    // ===== GET: Listar ítems de una orden =====
    if (req.method === 'GET') {
      const { orden_id } = req.query;

      if (!orden_id || !validId(orden_id)) {
        return res.status(400).json({
          ok: false,
          error: 'ID de orden inválido o requerido'
        });
      }

      // Validar acceso a la orden
      let queryOrden = supabase
        .from('ordenes')
        .select('id, tecnico_id')
        .eq('empresa_id', empresaId)
        .eq('id', orden_id.trim());

      const { data: orden, error: errOrden } = await queryOrden.single();

      if (errOrden || !orden) {
        return res.status(404).json({
          ok: false,
          error: 'Orden no encontrada'
        });
      }

      if (!esAdmin && orden.tecnico_id !== userId) {
        return res.status(403).json({
          ok: false,
          error: 'No tienes permiso para ver los ítems de esta orden'
        });
      }

      const { data: items, error: errItems } = await supabase
        .from('orden_items')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('orden_id', orden_id.trim())
        .order('creado_en', { ascending: true });

      if (errItems) {
        return res.status(500).json({
          ok: false,
          error: errItems.message
        });
      }

      return res.status(200).json({
        ok: true,
        data: items || []
      });
    }

    // ===== POST: Agregar ítem =====
    if (req.method === 'POST') {
      const { orden_id, tipo, descripcion, cantidad, precio_unitario } = req.body || {};

      if (!orden_id || !validId(orden_id)) {
        return res.status(400).json({
          ok: false,
          error: 'ID de orden inválido o requerido'
        });
      }

      if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
        return res.status(400).json({
          ok: false,
          error: `Tipo de ítem inválido. Debe ser: ${TIPOS_VALIDOS.join(', ')}`
        });
      }

      if (!descripcion || typeof descripcion !== 'string' || !descripcion.trim()) {
        return res.status(400).json({
          ok: false,
          error: 'La descripción del ítem es obligatoria'
        });
      }

      const cant = Number(cantidad);
      if (isNaN(cant) || cant <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'La cantidad debe ser un número mayor a 0'
        });
      }

      const precio = Number(precio_unitario);
      if (isNaN(precio) || precio < 0) {
        return res.status(400).json({
          ok: false,
          error: 'El precio unitario debe ser un número igual o mayor a 0'
        });
      }

      // Validar acceso a la orden
      let queryOrden = supabase
        .from('ordenes')
        .select('id, tecnico_id')
        .eq('empresa_id', empresaId)
        .eq('id', orden_id.trim());

      const { data: orden, error: errOrden } = await queryOrden.single();

      if (errOrden || !orden) {
        return res.status(404).json({
          ok: false,
          error: 'Orden no encontrada'
        });
      }

      if (!esAdmin && orden.tecnico_id !== userId) {
        return res.status(403).json({
          ok: false,
          error: 'No tienes permiso para agregar ítems a esta orden'
        });
      }

      const nuevoItem = {
        empresa_id: empresaId,
        orden_id: orden_id.trim(),
        tipo,
        descripcion: descripcion.trim(),
        cantidad: cant,
        precio_unitario: precio
      };

      const { data: itemCreado, error: errInsert } = await supabase
        .from('orden_items')
        .insert(nuevoItem)
        .select()
        .single();

      if (errInsert) {
        return res.status(500).json({
          ok: false,
          error: errInsert.message
        });
      }

      // Auditoría
      await registrarAuditoriaOrden(
        supabase,
        sessionUser,
      {
        empresa_id: empresaId,
        orden_id: orden_id.trim(),
        accion: 'agregar_item',
        detalle: `Ítem agregado: "${itemCreado.descripcion}" (${itemCreado.tipo}, cant: ${itemCreado.cantidad}, precio: ${itemCreado.precio_unitario}) por ${
        sessionUser.identificador ||
        sessionUser.usuario ||
        'usuario'
      }`,
        datos_nuevos: itemCreado
      }
    );

      return res.status(201).json({
        ok: true,
        data: itemCreado
      });
    }

    // ===== PATCH: editar ítem =====
    if (req.method === 'PATCH') {
      const { id, descripcion, cantidad, precio_unitario, tipo } = req.body || {};

      if (!id || !validId(id)) {
        return res.status(400).json({
          ok: false,
          error: 'ID de ítem inválido o requerido'
        });
      }

      const { data: itemActual, error: errItem } = await supabase
        .from('orden_items')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('id', id.trim())
        .single();

      if (errItem || !itemActual) {
        return res.status(404).json({
          ok: false,
          error: 'Ítem no encontrado'
        });
      }

      if (!esAdmin) {
        const { data: orden, error: errOrden } = await supabase
          .from('ordenes')
          .select('id, tecnico_id')
          .eq('empresa_id', empresaId)
          .eq('id', itemActual.orden_id)
          .single();

        if (errOrden || !orden || orden.tecnico_id !== userId) {
          return res.status(403).json({
            ok: false,
            error: 'No tienes permiso para modificar ítems de esta orden'
          });
        }
      }

      const updates = {};
      if (descripcion !== undefined) {
        if (typeof descripcion !== 'string' || !descripcion.trim()) {
          return res.status(400).json({ ok: false, error: 'Descripción no puede estar vacía' });
        }
        updates.descripcion = descripcion.trim();
      }

      if (tipo !== undefined) {
        if (!TIPOS_VALIDOS.includes(tipo)) {
          return res.status(400).json({ ok: false, error: `Tipo inválido. Debe ser: ${TIPOS_VALIDOS.join(', ')}` });
        }
        updates.tipo = tipo;
      }

      if (cantidad !== undefined) {
        const cant = Number(cantidad);
        if (isNaN(cant) || cant <= 0) {
          return res.status(400).json({ ok: false, error: 'Cantidad debe ser mayor a 0' });
        }
        updates.cantidad = cant;
      }

      if (precio_unitario !== undefined) {
        const precio = Number(precio_unitario);
        if (isNaN(precio) || precio < 0) {
          return res.status(400).json({ ok: false, error: 'Precio unitario no puede ser negativo' });
        }
        updates.precio_unitario = precio;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ ok: false, error: 'No se enviaron campos para actualizar' });
      }

      const { data: itemActualizado, error: errUpdate } = await supabase
        .from('orden_items')
        .update(updates)
        .eq('empresa_id', empresaId)
        .eq('id', id.trim())
        .select()
        .single();

      if (errUpdate) {
        return res.status(500).json({ ok: false, error: errUpdate.message });
      }

      await registrarAuditoriaOrden(
        supabase,
        sessionUser,
      {
        empresa_id: empresaId,
        orden_id: itemActual.orden_id,
        accion: 'actualizar_item',
        detalle: `Ítem modificado #${id} por ${
        sessionUser.identificador ||
        sessionUser.usuario ||
        'usuario'
      }`,
        datos_anteriores: itemActual,
        datos_nuevos: itemActualizado
      }
    );

      return res.status(200).json({
        ok: true,
        data: itemActualizado
      });
    }

    // ===== DELETE: eliminar ítem =====
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id || !validId(id)) {
        return res.status(400).json({
          ok: false,
          error: 'ID de ítem inválido o requerido'
        });
      }

      const { data: itemActual, error: errItem } = await supabase
        .from('orden_items')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('id', id.trim())
        .single();

      if (errItem || !itemActual) {
        return res.status(404).json({
          ok: false,
          error: 'Ítem no encontrado'
        });
      }

      if (!esAdmin) {
        const { data: orden, error: errOrden } = await supabase
          .from('ordenes')
          .select('id, tecnico_id')
          .eq('empresa_id', empresaId)
          .eq('id', itemActual.orden_id)
          .single();

        if (errOrden || !orden || orden.tecnico_id !== userId) {
          return res.status(403).json({
            ok: false,
            error: 'No tienes permiso para eliminar ítems de esta orden'
          });
        }
      }

      const { error: errDelete } = await supabase
        .from('orden_items')
        .delete()
        .eq('empresa_id', empresaId)
        .eq('id', id.trim());

      if (errDelete) {
        return res.status(500).json({
          ok: false,
          error: errDelete.message
        });
      }

      await registrarAuditoriaOrden(
        supabase,
        sessionUser,
      {
        empresa_id: empresaId,
        orden_id: itemActual.orden_id,
        accion: 'eliminar_item',
        detalle: `Ítem eliminado: "${itemActual.descripcion}" por ${
        sessionUser.identificador ||
        sessionUser.usuario ||
        'usuario'
      }`,
      datos_anteriores: itemActual
      }
    );

      return res.status(200).json({
        ok: true
      });
    }
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'No se pudieron procesar los ítems de la orden'
    });
  }
};
