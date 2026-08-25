const { createClient } = require('@supabase/supabase-js');
const { requireSession } = require('./_auth');

const ORDER_FIELDS = `
  id, fecha, cliente_id, cliente, tel, tipo, serie, pass,
  sena, falla, presupuesto, presupuesta, estetico,
  diagnostico, trabajo_realizar, aprobacion_presupuesto,
  estado, fecha_entrega`;

const ALLOWED_STATES = new Set([
  'ingresado',
  'revision',
  'presupuesto',
  'reparando',
  'terminado',
  'entregado',
  'sinreparar'
]);
const INFOTAC_EMPRESA_ID =
  'ce95321a-ea37-47d1-81bb-f25f0dd58eeb';

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Base de datos no configurada.');
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
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function orderInput(body, options) {
  const source = body || {};
  const now = new Date().toISOString();
  const estado = ALLOWED_STATES.has(source.estado) ? source.estado : 'ingresado';

  const order = {
    fecha: isoDate(source.fecha, now),
    cliente: text(source.cliente, 160),
    tel: text(source.tel, 40),
    tipo: text(source.tipo, 160),
    serie: text(source.serie, 160),
    pass: text(source.pass, 160),
    sena: number(source.sena),
    falla: text(source.falla, 2000),
    presupuesta: text(source.presupuesta, 2000),
    estetico: text(source.estetico, 2000),
    diagnostico: text(source.diagnostico, 4000),
    trabajo_realizar: text(source.trabajo_realizar, 4000),
    aprobacion_presupuesto: text(
    source.aprobacion_presupuesto || "pendiente",
    20
  ),
   estado,
    fecha_entrega:
      estado === 'entregado' || estado === 'sinreparar'
        ? isoDate(source.fecha_entrega, now)
        : null
  };

  if (validId(source.cliente_id)) order.cliente_id = source.cliente_id;

  if (options && options.requireClient && !order.cliente) {
    throw new Error('El cliente es obligatorio.');
  }

  return order;
}

module.exports = async function handler(req, res) {
  if (!requireSession(req, res)) return;

  try {
    const supabase = db();

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('ordenes')
        .select(ORDER_FIELDS)
        .order('fecha', { ascending: false })
        .limit(1000);

      if (error) throw error;
      return res.status(200).json({ ok: true, data: data || [] });
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      if (body.action === 'import') {
        const rows = Array.isArray(body.ordenes) ? body.ordenes : [];

        if (rows.length > 500) {
          return res.status(400).json({
            ok: false,
            error: 'El backup supera el límite de 500 órdenes.'
          });
        }

        const orders = rows.map(function (row) {
          return orderInput(row, { requireClient: true });
        });

        const { error: importError } = await supabase.rpc(
  'reemplazar_ordenes_importadas',
  { p_ordenes: orders }
);

if (importError) throw importError;

        return res.status(200).json({ ok: true });
      }

      const order = orderInput(body, { requireClient: true });

      const { data, error } = await supabase
        .from('ordenes')
        .insert(order)
        .select(ORDER_FIELDS)
        .single();

      if (error) throw error;
      return res.status(201).json({ ok: true, data });
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

      const update = {
      estado: body.estado,
      diagnostico: text(body.diagnostico, 4000),
      trabajo_realizar: text(body.trabajo_realizar, 4000),
      sena: number(body.sena),
      presupuesto: number(body.presupuesto),
      aprobacion_presupuesto: text(
      body.aprobacion_presupuesto || "pendiente",
      20
    )
  };

      if (body.estado === 'entregado' || body.estado === 'sinreparar') {
        update.fecha_entrega = isoDate(body.fecha_entrega, new Date().toISOString());
      } else {
        update.fecha_entrega = null;
      }

      const { data, error } = await supabase
        .from('ordenes')
        .update(update)
        .eq('id', body.id)
        .select(ORDER_FIELDS)
        .single();

      if (error) throw error;
      return res.status(200).json({ ok: true, data });
    }

    if (req.method === 'DELETE') {
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
        .eq('id', id);

      if (error) throw error;
      return res.status(200).json({ ok: true });
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
