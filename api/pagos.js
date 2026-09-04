const { createClient } = require('@supabase/supabase-js');
const { requireSession } = require('./_auth');

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

function numeroPositivo(value, valorPorDefecto) {
  const numero = Number(value);

  if (!Number.isFinite(numero) || numero < 0) {
    return valorPorDefecto;
  }

  return numero;
}

function validOrdenId(value) {
  return typeof value === 'string' && value.trim().length > 0;
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

    // ===== GET: Listar pagos de una orden =====
    if (req.method === 'GET') {
      const ordenId = req.query && req.query.orden_id;

      if (!validOrdenId(ordenId)) {
        return res.status(400).json({
          ok: false,
          error: 'Identificador de orden inválido.'
        });
      }

      const { data, error } = await supabase
        .from('pagos')
        .select('id, orden_id, monto, fecha, notas, creado_en')
        .eq('orden_id', ordenId)
        .order('fecha', { ascending: true });

      if (error) throw error;

      return res.status(200).json({
        ok: true,
        data: data || []
      });
    }

    // ===== POST: Registrar un nuevo pago =====
    if (req.method === 'POST') {
      const body = req.body || {};

      const ordenId = texto(body.orden_id, 200);
      const monto = numeroPositivo(body.monto, 0);
      const fecha = body.fecha ? new Date(body.fecha).toISOString() : new Date().toISOString();
      const notas = texto(body.notas || '', 500);

      if (!validOrdenId(ordenId)) {
        return res.status(400).json({
          ok: false,
          error: 'Identificador de orden inválido.'
        });
      }

      if (monto <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'El monto debe ser mayor que cero.'
        });
      }

      // Verificar que la orden existe
      const { data: orden, error: ordenError } = await supabase
        .from('ordenes')
        .select('id')
        .eq('id', ordenId)
        .maybeSingle();

      if (ordenError) throw ordenError;

      if (!orden) {
        return res.status(404).json({
          ok: false,
          error: 'Orden no encontrada.'
        });
      }

      const { data, error } = await supabase
        .from('pagos')
        .insert({
          orden_id: ordenId,
          monto: monto,
          fecha: fecha,
          notas: notas
        })
        .select('id, orden_id, monto, fecha, notas, creado_en')
        .single();

      if (error) throw error;

      return res.status(201).json({
        ok: true,
        data: data
      });
    }


        // ===== PATCH: Editar un pago =====
    if (req.method === 'PATCH') {
      const body = req.body || {};

      const pagoId = texto(body.id || body.pago_id, 200);
      const monto = numeroPositivo(body.monto, 0);
      const notas = texto(body.notas || '', 500);

      if (!validOrdenId(pagoId)) {
        return res.status(400).json({
          ok: false,
          error: 'Identificador de pago inválido.'
        });
      }

      if (monto <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'El monto debe ser mayor que cero.'
        });
      }

      const { data: pagoExistente, error: pagoError } = await supabase
        .from('pagos')
        .select('id, orden_id')
        .eq('id', pagoId)
        .maybeSingle();

      if (pagoError) throw pagoError;

      if (!pagoExistente) {
        return res.status(404).json({
          ok: false,
          error: 'Pago no encontrado.'
        });
      }

      const { data, error } = await supabase
        .from('pagos')
        .update({
          monto: monto,
          notas: notas
        })
        .eq('id', pagoId)
        .select('id, orden_id, monto, fecha, notas, creado_en')
        .single();

      if (error) throw error;

      return res.status(200).json({
        ok: true,
        data: data
      });
    }


    // ===== DELETE: Eliminar un pago =====
    if (req.method === 'DELETE') {
      const pagoId = texto(
        req.query && (req.query.id || req.query.pago_id),
        200
      );

      if (!validOrdenId(pagoId)) {
        return res.status(400).json({
          ok: false,
          error: 'Identificador de pago inválido.'
        });
      }

      const { data: pago, error: pagoError } = await supabase
        .from('pagos')
        .select('id, orden_id')
        .eq('id', pagoId)
        .maybeSingle();

      if (pagoError) throw pagoError;

      if (!pago) {
        return res.status(404).json({
          ok: false,
          error: 'Pago no encontrado.'
        });
      }

      const { error: deleteError } = await supabase
        .from('pagos')
        .delete()
        .eq('id', pagoId);

      if (deleteError) throw deleteError;

      return res.status(200).json({
        ok: true
      });
    }

  } catch (error) {
    console.error('pagos error:', error);

    return res.status(500).json({
      ok: false,
      error: error.message || 'No se pudieron procesar los pagos.'
    });
  }
};
