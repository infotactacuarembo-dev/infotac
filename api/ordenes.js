const { createClient } = require('@supabase/supabase-js');
const { requireSession, getSessionUser } = require('./_auth');
const { registrarAuditoriaOrden } = require('./_orden-audit');

const ORDER_FIELDS = `
  id, fecha, cliente_id, cliente, tel, tipo, serie, pass,
  sena, falla, presupuesto, presupuesta, estetico,
  diagnostico, trabajo_realizar, aprobacion_presupuesto,
  estado, fecha_entrega, empresa_id, tecnico_id, tecnico_nombre`;

const ORDER_FIELDS_WRITABLE = `
  id, fecha, cliente_id, cliente, tel, tipo, serie, pass,
  sena, falla, presupuesto, presupuesta, estetico,
  diagnostico, trabajo_realizar, aprobacion_presupuesto,
  estado, fecha_entrega, empresa_id, tecnico_id`;

const ALLOWED_STATES = new Set([
  'ingresado',
  'revision',
  'presupuesto',
  'reparando',
  'terminado',
  'entregado',
  'sinreparar'
]);

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Base de datos no configurada.');
  }

  return createClient(url, key);
}

function text(value, max) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, max);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function isoDate(value, fallback) {
  const date = value ? new Date(value) : null;

  return date && !Number.isNaN(date.getTime())
    ? date.toISOString()
    : fallback;
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

function orderInput(body, options, empresaId) {
  const source = body || {};
  const now = new Date().toISOString();
  const estado = ALLOWED_STATES.has(source.estado)
    ? source.estado
    : 'ingresado';

  const order = {
    id: validId(source.id) ? source.id : undefined,
    empresa_id: empresaId,
    fecha: isoDate(source.fecha, now),
    cliente: text(source.cliente, 160),
    tel: text(source.tel, 40),
    tipo: text(source.tipo, 160),
    serie: text(source.serie, 160),
    pass: text(source.pass, 160),
    tecnico_id: validId(source.tecnico_id)
      ? source.tecnico_id
      : null,
    sena: number(source.sena),
    presupuesto: number(source.presupuesto),
    falla: text(source.falla, 2000),
    presupuesta: text(source.presupuesta, 2000),
    estetico: text(source.estetico, 2000),
    diagnostico: text(source.diagnostico, 4000),
    trabajo_realizar: text(source.trabajo_realizar, 4000),
    aprobacion_presupuesto: text(
      source.aprobacion_presupuesto || 'pendiente',
      20
    ),
    estado,
    fecha_entrega:
      estado === 'entregado' || estado === 'sinreparar'
        ? isoDate(source.fecha_entrega, now)
        : null
  };

  if (validId(source.cliente_id)) {
    order.cliente_id = source.cliente_id;
  }

  if (options && options.requireClient && !order.cliente) {
    throw new Error('El cliente es obligatorio.');
  }

  return order;
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

    if (req.method === 'GET') {
      const clienteId = req.query && req.query.cliente_id;

      // Órdenes de un cliente de la misma empresa.
      if (clienteId) {
        if (!validId(clienteId)) {
          return res.status(400).json({
            ok: false,
            error: 'Identificador de cliente inválido.'
          });
        }

        const { data, error } = await supabase
          .from('ordenes')
          .select(
            'id, fecha, tipo, falla, estado, cliente_id',
            { count: 'exact' }
          )
          .eq('empresa_id', empresaId)
          .eq('cliente_id', clienteId)
          .order('fecha', { ascending: false });

        if (error) throw error;

        return res.status(200).json({
          ok: true,
          data: data || []
        });
      }

      const pagina = parseInt(req.query.pagina || '1', 10);
      const limite = parseInt(req.query.limite || '25', 10);
      const offset = (pagina - 1) * limite;

      const desde = req.query.desde;
      const hasta = req.query.hasta;
      const estado = req.query.estado;
      const saldo = req.query.saldo;
      const buscar = req.query.buscar;

      let query = supabase
        .from('ordenes_resumen')
        .select(
          ORDER_FIELDS + ', total_items, total_pagos, saldo_real',
          { count: 'exact' }
        )
        .eq('empresa_id', empresaId);

      const { data: empresaConfig, error: empresaError } = await supabase
        .from('empresas')
        .select('zona_horaria')
        .eq('id', empresaId)
        .maybeSingle();

      if (empresaError) throw empresaError;

      const zonaHoraria =
        empresaConfig && empresaConfig.zona_horaria
          ? empresaConfig.zona_horaria
          : 'America/Montevideo';

      if (user.rol === 'tecnico') {
        if (!validId(user.id)) {
          return res.status(401).json({
            ok: false,
            error: 'Sesión de técnico inválida. Volvé a iniciar sesión.'
          });
        }

        query = query.eq('tecnico_id', user.id);
      }

      if (desde) {
        query = query.gte('fecha', desde);
      }

      if (hasta) {
        const hastaFinDelDia = new Date(
          `${hasta}T23:59:59.999`
        );

        if (!Number.isNaN(hastaFinDelDia.getTime())) {
          query = query.lte(
            'fecha',
            hastaFinDelDia.toISOString()
          );
        }
      }

      if (estado) {
        query = query.eq('estado', estado);
      }

      // Un técnico no puede alterar el filtro para ver órdenes ajenas.
      if (req.query.tecnico_id && user.rol !== 'tecnico') {
        query = query.eq('tecnico_id', req.query.tecnico_id);
      }

      if (saldo) {
        if (saldo === 'pendiente' || saldo === 'pagando') {
          query = query.gt('saldo_real', 0);
        } else if (saldo === 'pagado') {
          query = query.eq('saldo_real', 0);
        }
      }

      if (buscar) {
        const texto = '%' + buscar + '%';

        query = query.or(
          'cliente.ilike.' +
            texto +
            ',tipo.ilike.' +
            texto +
            ',serie.ilike.' +
            texto
        );
      }

      query = query.order('fecha', { ascending: false });
      query = query.range(offset, offset + limite - 1);

      let { data, error, count } = await query;

      if (error) throw error;

      if (data && Array.isArray(data)) {
        data = data.map(function (orden) {
          if (!orden.fecha) return orden;

          const fechaUTC = new Date(orden.fecha);

          if (Number.isNaN(fechaUTC.getTime())) {
            return orden;
          }

          const opciones = {
            timeZone: zonaHoraria,
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          };

          const formatter = new Intl.DateTimeFormat(
            'es-UY',
            opciones
          );

          const partes = formatter.formatToParts(fechaUTC);

          const año = partes.find(function (p) {
            return p.type === 'year';
          }).value;

          const mes = partes.find(function (p) {
            return p.type === 'month';
          }).value;

          const dia = partes.find(function (p) {
            return p.type === 'day';
          }).value;

          const hora = partes.find(function (p) {
            return p.type === 'hour';
          }).value;

          const minuto = partes.find(function (p) {
            return p.type === 'minute';
          }).value;

          const segundo = partes.find(function (p) {
            return p.type === 'second';
          }).value;

          orden.fecha =
            año +
            '-' +
            mes +
            '-' +
            dia +
            'T' +
            hora +
            ':' +
            minuto +
            ':' +
            segundo;

          return orden;
        });
      }

      return res.status(200).json({
        ok: true,
        data: data || [],
        total: count || 0,
        pagina: pagina,
        limite: limite
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      // Temporalmente bloqueado hasta adaptar la función SQL de importación
      // para trabajar de forma aislada por empresa.
      if (body.action === 'import') {
        return res.status(503).json({
          ok: false,
          error:
            'La importación está temporalmente en mantenimiento por la migración multiempresa.'
        });
      }

      if (user.rol === 'tecnico') {
        return res.status(403).json({
          ok: false,
          error: 'Los técnicos no pueden registrar órdenes.'
        });
      }

      if (
        !body.tecnico_id ||
        body.tecnico_id === '' ||
        body.tecnico_id === null
      ) {
        return res.status(400).json({
          ok: false,
          error: 'El técnico es obligatorio.'
        });
      }

      // El técnico indicado debe pertenecer a la empresa de la sesión.
      const { data: tecnico, error: tecnicoError } = await supabase
        .from('usuarios')
        .select('id, rol, activo')
        .eq('id', body.tecnico_id)
        .eq('empresa_id', empresaId)
        .maybeSingle();

      if (
        tecnicoError ||
        !tecnico ||
        tecnico.rol !== 'tecnico' ||
        tecnico.activo === false
      ) {
        return res.status(400).json({
          ok: false,
          error: 'Técnico inválido o inactivo.'
        });
      }

      const order = orderInput(
        body,
        { requireClient: true },
        empresaId
      );

      // Si viene cliente_id, confirmar que sea un cliente de esta empresa.
      if (order.cliente_id) {
        const { data: cliente, error: clienteError } = await supabase
          .from('clientes')
          .select('id')
          .eq('id', order.cliente_id)
          .eq('empresa_id', empresaId)
          .maybeSingle();

        if (clienteError || !cliente) {
          return res.status(400).json({
            ok: false,
            error: 'Cliente inválido para esta empresa.'
          });
        }
      }

      const { data, error } = await supabase
        .from('ordenes')
        .insert(order)
        .select(ORDER_FIELDS_WRITABLE)
        .single();

      if (error) throw error;

      await registrarAuditoriaOrden(supabase, user, {
        orden_id: data.id,
        empresa_id: data.empresa_id,
        accion: 'orden_creada',
        detalle: 'Se creó la orden.',
        datos_nuevos: {
          fecha: data.fecha,
          cliente_id: data.cliente_id,
          cliente: data.cliente,
          tel: data.tel,
          tipo: data.tipo,
          serie: data.serie,
          tecnico_id: data.tecnico_id,
          sena: data.sena,
          presupuesto: data.presupuesto,
          falla: data.falla,
          presupuesta: data.presupuesta,
          estetico: data.estetico,
          diagnostico: data.diagnostico,
          trabajo_realizar: data.trabajo_realizar,
          aprobacion_presupuesto:
            data.aprobacion_presupuesto,
          estado: data.estado,
          fecha_entrega: data.fecha_entrega
        }
      });

      return res.status(201).json({
        ok: true,
        data: data
      });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};

      if (!validId(body.id)) {
        return res.status(400).json({
          ok: false,
          error: 'Identificador de orden inválido.'
        });
      }

      if (!ALLOWED_STATES.has(body.estado)) {
        return res.status(400).json({
          ok: false,
          error: 'Estado de orden inválido.'
        });
      }

      let ordenQuery = supabase
        .from('ordenes')
        .select(
          `
            id,
            empresa_id,
            tecnico_id,
            estado,
            diagnostico,
            trabajo_realizar,
            sena,
            presupuesto,
            aprobacion_presupuesto,
            fecha_entrega
          `
        )
        .eq('id', body.id)
        .eq('empresa_id', empresaId);

      if (user.rol === 'tecnico') {
        if (!validId(user.id)) {
          return res.status(401).json({
            ok: false,
            error: 'Sesión de técnico inválida. Volvé a iniciar sesión.'
          });
        }

        ordenQuery = ordenQuery.eq('tecnico_id', user.id);
      }

      const { data: ordenActual, error: ordenError } =
        await ordenQuery.maybeSingle();

      if (ordenError) throw ordenError;

      if (!ordenActual) {
        return res.status(404).json({
          ok: false,
          error: 'Orden no encontrada.'
        });
      }

      if (user.rol === 'tecnico') {
        const estadosTecnicoPermitidos = new Set([
          'ingresado',
          'revision',
          'presupuesto',
          'reparando',
          'terminado'
        ]);

        if (!estadosTecnicoPermitidos.has(body.estado)) {
          return res.status(403).json({
            ok: false,
            error:
              'Los técnicos no pueden marcar órdenes como entregadas o devueltas.'
          });
        }
      }

      if (
        user.rol === 'tecnico' &&
        Object.prototype.hasOwnProperty.call(body, 'tecnico_id')
      ) {
        return res.status(403).json({
          ok: false,
          error: 'Los técnicos no pueden reasignar órdenes.'
        });
      }

      if (
        user.rol !== 'tecnico' &&
        Object.prototype.hasOwnProperty.call(body, 'tecnico_id') &&
        body.tecnico_id !== null &&
        body.tecnico_id !== ''
      ) {
        const { data: tecnico, error: tecnicoError } = await supabase
          .from('usuarios')
          .select('id, rol, activo')
          .eq('id', body.tecnico_id)
          .eq('empresa_id', empresaId)
          .maybeSingle();

        if (
          tecnicoError ||
          !tecnico ||
          tecnico.rol !== 'tecnico' ||
          tecnico.activo === false
        ) {
          return res.status(400).json({
            ok: false,
            error: 'Técnico inválido o inactivo.'
          });
        }
      }

      let update;

      if (user.rol === 'tecnico') {
        update = {
          estado: body.estado,
          diagnostico: text(body.diagnostico, 4000),
          trabajo_realizar: text(body.trabajo_realizar, 4000),
          fecha_entrega: null
        };
      } else {
        update = {
          estado: body.estado,
          diagnostico: text(body.diagnostico, 4000),
          trabajo_realizar: text(body.trabajo_realizar, 4000),
          sena: number(body.sena),
          presupuesto: number(body.presupuesto),
          aprobacion_presupuesto: text(
            body.aprobacion_presupuesto || 'pendiente',
            20
          ),
          fecha_entrega:
            body.estado === 'entregado' ||
            body.estado === 'sinreparar'
              ? isoDate(
                  body.fecha_entrega,
                  new Date().toISOString()
                )
              : null
        };

        if (
          Object.prototype.hasOwnProperty.call(body, 'tecnico_id')
        ) {
          update.tecnico_id = validId(body.tecnico_id)
            ? body.tecnico_id
            : null;
        }
      }

      const { error: updateError } = await supabase
        .from('ordenes')
        .update(update)
        .eq('id', body.id)
        .eq('empresa_id', empresaId);

      if (updateError) throw updateError;

      const cambios = {};

      Object.keys(update).forEach(function (campo) {
        const anterior = ordenActual[campo];
        const nuevo = update[campo];

        if (String(anterior ?? '') !== String(nuevo ?? '')) {
          cambios[campo] = {
            anterior: anterior ?? null,
            nuevo: nuevo ?? null
          };
        }
      });

      if (Object.keys(cambios).length > 0) {
        const camposCambiados = Object.keys(cambios).join(', ');

        await registrarAuditoriaOrden(supabase, user, {
          orden_id: ordenActual.id,
          empresa_id: ordenActual.empresa_id,
          accion: 'orden_actualizada',
          detalle:
            'Se actualizaron los campos: ' +
            camposCambiados +
            '.',
          datos_anteriores: Object.fromEntries(
            Object.entries(cambios).map(function (entrada) {
              return [entrada[0], entrada[1].anterior];
            })
          ),
          datos_nuevos: Object.fromEntries(
            Object.entries(cambios).map(function (entrada) {
              return [entrada[0], entrada[1].nuevo];
            })
          )
        });
      }

      const { data, error } = await supabase
        .from('ordenes_resumen')
        .select(
          ORDER_FIELDS + ', total_items, total_pagos, saldo_real'
        )
        .eq('id', body.id)
        .eq('empresa_id', empresaId)
        .single();

      if (error) throw error;

      return res.status(200).json({
        ok: true,
        data: data
      });
    }

    if (req.method === 'DELETE') {
      if (user.rol !== 'admin') {
        return res.status(403).json({
          ok: false,
          error: 'Solo un administrador puede eliminar órdenes.'
        });
      }

      const id = req.query && req.query.id;

      if (!validId(id)) {
        return res.status(400).json({
          ok: false,
          error: 'Identificador de orden inválido.'
        });
      }

      const { error } = await supabase
        .from('ordenes')
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
    console.error('ordenes error:', error);

    return res.status(500).json({
      ok: false,
      error: error.message || 'No se pudo procesar órdenes.'
    });
  }
};
