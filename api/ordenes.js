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

function sanitizeDateOrNull(value) {
  if (!value || typeof value !== 'string' || !value.trim()) return null;
  return value.trim();
}

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
  

  const estadosEnProceso = [
  'ingresado',
  'revision',
  'presupuesto',
  'reparando'
];

  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);

  const haceTresDias = new Date(inicioHoy);
  haceTresDias.setDate(haceTresDias.getDate() - 3);

  const haceCuatroDias = new Date(inicioHoy);
  haceCuatroDias.setDate(haceCuatroDias.getDate() - 4);

  

  if (req.method === 'GET') {
    try {
      const {
        id,
        q,
        buscar,
        alerta,
        estado,
        estado_in,
        tecnico,
        tecnico_id,
        limite,
        pagina,
        filtro_fecha,
        fecha_desde,
        fecha_hasta,
        con_diagnostico_pendiente,
        con_presupuesto_pendiente
      } = req.query;

      if (id) {
        let query = supabase
          .from('ordenes')
          .select('id, fecha, cliente, tel, tipo, serie, pass, sena, falla, presupuesto, presupuesta, estetico, estado, fecha_entrega, cliente_id, diagnostico, trabajo_realizar, aprobacion_presupuesto, empresa_id, pago_final, tecnico_id, created_at, vista_por_tecnico_en, terminado_en, fecha_prometida_entrega, presupuesto_detalle, motivo_devolucion')
          .eq('empresa_id', empresaId)
          .eq('id', id);

        if (!esAdmin && userId) {
          query = query.eq('tecnico_id', userId);
        }

        const { data, error } = await query.single();
        if (error) {
          return res.status(404).json({ ok: false, error: 'Orden no encontrada' });
        }
        return res.status(200).json({ ok: true, data });
      }

      let tecnicoIdFiltro = null;
      if (esAdmin) {
        if (tecnico_id && validId(tecnico_id)) {
          tecnicoIdFiltro = tecnico_id.trim();
        } else if (tecnico && tecnico.trim() && tecnico.trim() !== 'todos') {
          const { data: usuarioTecnico } = await supabase
            .from('usuarios')
            .select('id')
            .eq('empresa_id', empresaId)
            .eq('identificador', tecnico.trim())
            .maybeSingle();

          if (usuarioTecnico) {
            tecnicoIdFiltro = usuarioTecnico.id;
          }
        }
      } else {
        tecnicoIdFiltro = userId;
      }

      let query = supabase
        .from('ordenes')
        .select('id, fecha, cliente, tel, tipo, serie, pass, sena, falla, presupuesto, presupuesta, estetico, estado, fecha_entrega, cliente_id, diagnostico, trabajo_realizar, aprobacion_presupuesto, empresa_id, pago_final, tecnico_id, created_at, vista_por_tecnico_en, terminado_en, fecha_prometida_entrega, presupuesto_detalle, motivo_devolucion', { count: 'exact' })
        .eq('empresa_id', empresaId)
        .order('fecha', { ascending: false });

      if (tecnicoIdFiltro) {
  query = query.eq('tecnico_id', tecnicoIdFiltro);
}

if (alerta === 'demoradas') {
  query = query
    .in('estado', estadosEnProceso)
    .lt('fecha', haceTresDias.toISOString());
}

if (alerta === 'fecha-prometida') {
  query = query
    .lt('fecha_prometida_entrega', inicioHoy.toISOString())
    .not('estado', 'in', '("entregado","sinreparar")');
}

if (estado) {
  query = query.eq('estado', estado);
} else if (estado_in) {
  const estados = estado_in
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);

  if (estados.length > 0) {
    query = query.in('estado', estados);
  }
}

if (con_diagnostico_pendiente === 'true') {
  query = query.or('diagnostico.is.null,diagnostico.eq.""');
}

if (con_presupuesto_pendiente === 'true') {
  query = query.eq('aprobacion_presupuesto', 'pendiente');
}

if (filtro_fecha && fecha_desde && fecha_hasta) {
  query = query
    .gte(filtro_fecha, `${fecha_desde}T00:00:00.000Z`)
    .lte(filtro_fecha, `${fecha_hasta}T23:59:59.999Z`);
}

const terminoBusqueda = buscar || q;

if (terminoBusqueda && terminoBusqueda.trim()) {
  const busqueda = `%${terminoBusqueda.trim()}%`;

  query = query.or(
    `cliente.ilike.${busqueda},tel.ilike.${busqueda},tipo.ilike.${busqueda},serie.ilike.${busqueda}`
  );
}
      const limiteNum = Math.min(parseInt(limite, 10) || 50, 100);
      const paginaNum = Math.max(parseInt(pagina, 10) || 1, 1);
      const desde = (paginaNum - 1) * limiteNum;
      const hasta = desde + limiteNum - 1;

      query = query.range(desde, hasta);

      const { data, error, count } = await query;
      if (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }

      return res.status(200).json({
        ok: true,
        data: data || [],
        total: count || 0,
        pagina: paginaNum,
        limite: limiteNum
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Error al consultar órdenes' });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const {
        cliente,
        tel,
        tipo,
        serie,
        pass,
        sena,
        falla,
        presupuesto,
        presupuesta,
        estetico,
        estado,
        fecha_entrega,
        cliente_id,
        diagnostico,
        trabajo_realizar,
        aprobacion_presupuesto,
        pago_final,
        tecnico_id,
        fecha_prometida_entrega,
        presupuesto_detalle,
        motivo_devolucion
      } = body;

      if (!cliente || !tipo) {
        return res.status(400).json({
          ok: false,
          error: 'Cliente y tipo de equipo son obligatorios'
        });
      }

      let finalClienteId = null;
      if (cliente_id && validId(cliente_id)) {
        finalClienteId = cliente_id.trim();
      }

      let finalTecnicoId = null;
      if (esAdmin) {
        if (tecnico_id && validId(tecnico_id)) {
          finalTecnicoId = tecnico_id.trim();
        }
      } else {
        finalTecnicoId = userId;
      }

      const nuevaOrden = {
        empresa_id: empresaId,
        cliente: cliente.trim(),
        tel: (tel || '').trim(),
        tipo: tipo.trim(),
        serie: (serie || '').trim(),
        pass: (pass || '').trim(),
        sena: Number(sena) || 0,
        falla: (falla || '').trim(),
        presupuesto: Number(presupuesto) || 0,
        presupuesta: (presupuesta || '').trim(),
        estetico: (estetico || '').trim(),
        estado: estado || 'ingresado',
        fecha_entrega: sanitizeDateOrNull(fecha_entrega),
        cliente_id: finalClienteId,
        diagnostico: (diagnostico || '').trim(),
        trabajo_realizar: (trabajo_realizar || '').trim(),
        aprobacion_presupuesto: aprobacion_presupuesto || 'pendiente',
        pago_final: Number(pago_final) || 0,
        tecnico_id: finalTecnicoId,
        fecha_prometida_entrega: sanitizeDateOrNull(fecha_prometida_entrega),
        presupuesto_detalle: (presupuesto_detalle || '').trim(),
        motivo_devolucion: (motivo_devolucion || '').trim()
      };

      const { data, error } = await supabase
        .from('ordenes')
        .insert(nuevaOrden)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }

      await registrarAuditoriaOrden({
        req,
        empresa_id: empresaId,
        orden_id: data.id,
        accion: 'crear',
        detalle: `Orden #${data.id} creada por ${sessionUser.identificador || sessionUser.usuario || 'usuario'}`,
        datos_nuevos: data
      });

      return res.status(201).json({ ok: true, data });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Error al crear orden' });
    }
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    try {
      const { id, ...updates } = req.body || {};
      if (!id || !validId(id)) {
        return res.status(400).json({ ok: false, error: 'ID de orden inválido' });
      }

      const { data: ordenActual, error: errFetch } = await supabase
        .from('ordenes')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('id', id)
        .single();

      if (errFetch || !ordenActual) {
        return res.status(404).json({ ok: false, error: 'Orden no encontrada' });
      }

      if (!esAdmin && ordenActual.tecnico_id !== userId) {
        return res.status(403).json({
          ok: false,
          error: 'No tienes permiso para modificar esta orden'
        });
      }

      const ordenActualizada = { ...updates };
      delete ordenActualizada.id;
      delete ordenActualizada.empresa_id;
      delete ordenActualizada.created_at;

      if (!esAdmin) {
        delete ordenActualizada.tecnico_id;
      }

      if (ordenActualizada.fecha_entrega !== undefined) {
        ordenActualizada.fecha_entrega = sanitizeDateOrNull(ordenActualizada.fecha_entrega);
      }
      if (ordenActualizada.fecha_prometida_entrega !== undefined) {
        ordenActualizada.fecha_prometida_entrega = sanitizeDateOrNull(ordenActualizada.fecha_prometida_entrega);
      }

      if (ordenActualizada.estado === 'terminado' && ordenActual.estado !== 'terminado') {
        ordenActualizada.terminado_en = new Date().toISOString();
      }

      if (
        !esAdmin &&
        !ordenActual.vista_por_tecnico_en &&
        ordenActual.tecnico_id === userId
      ) {
        ordenActualizada.vista_por_tecnico_en = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('ordenes')
        .update(ordenActualizada)
        .eq('empresa_id', empresaId)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }

      await registrarAuditoriaOrden({
        req,
        empresa_id: empresaId,
        orden_id: id,
        accion: 'actualizar',
        detalle: `Orden #${id} actualizada por ${sessionUser.identificador || sessionUser.usuario || 'usuario'}`,
        datos_anteriores: ordenActual,
        datos_nuevos: data
      });

      return res.status(200).json({ ok: true, data });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Error al actualizar orden' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      if (!esAdmin) {
        return res.status(403).json({
          ok: false,
          error: 'Solo los administradores pueden eliminar órdenes'
        });
      }

      const { id } = req.query;
      if (!id || !validId(id)) {
        return res.status(400).json({ ok: false, error: 'ID de orden inválido' });
      }

      const { data: ordenEliminada, error: errFetch } = await supabase
        .from('ordenes')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('id', id)
        .single();

      if (errFetch || !ordenEliminada) {
        return res.status(404).json({ ok: false, error: 'Orden no encontrada' });
      }

      const { error } = await supabase
        .from('ordenes')
        .delete()
        .eq('empresa_id', empresaId)
        .eq('id', id);

      if (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }

      await registrarAuditoriaOrden({
        req,
        empresa_id: empresaId,
        orden_id: id,
        accion: 'eliminar',
        detalle: `Orden #${id} eliminada por ${sessionUser.identificador || sessionUser.usuario || 'usuario'}`,
        datos_anteriores: ordenEliminada
      });

      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Error al eliminar orden' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Método no permitido' });
};
