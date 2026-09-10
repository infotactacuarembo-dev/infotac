const { createClient } = require('@supabase/supabase-js');
const { requireSession, getSessionUser } = require('./_auth');
const { registrarAuditoriaOrden } = require('./_orden-audit');

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

const INFOTAC_EMPRESA_ID =
  'ce95321a-ea37-47d1-81bb-f25f0dd58eeb';

async function obtenerOrdenPermitida(supabase, ordenId) {
  const { data: orden, error } = await supabase
    .from('ordenes')
    .select('id, empresa_id')
    .eq('id', ordenId)
    .eq('empresa_id', INFOTAC_EMPRESA_ID)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return orden;
}

function esTecnico(user) {
  return user && user.rol === 'tecnico';
}

function esAdmin(user) {
  return user && user.rol === 'admin';
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

    if (esTecnico(user)) {
      return res.status(403).json({
      ok: false,
      error: 'Los técnicos no tienen acceso a pagos.'
      });
    }

    // ===== GET: Listar pagos de una orden =====
    if (req.method === 'GET') {
      const ordenId = req.query && req.query.orden_id;

      if (!validOrdenId(ordenId)) {
        return res.status(400).json({
          ok: false,
          error: 'Identificador de orden inválido.'
        });
      }

      const orden = await obtenerOrdenPermitida(supabase, ordenId);

        if (!orden) {
          return res.status(404).json({
          ok: false,
          error: 'Orden no encontrada.'
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
      const orden = await obtenerOrdenPermitida(supabase, ordenId);

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
          await registrarAuditoriaOrden(supabase, user, {
          
          orden_id: data.orden_id,
          empresa_id: orden.empresa_id,
          accion: 'pago_registrado',
          detalle: 'Pago registrado por $ ' + data.monto + '.',
          datos_nuevos: {
          pago_id: data.id,
          monto: data.monto,
          fecha: data.fecha,
          notas: data.notas
        }
      });

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
        .select('id, orden_id, monto, notas')
        .eq('id', pagoId)
        .maybeSingle();

      if (pagoError) throw pagoError;

      if (!pagoExistente) {
        return res.status(404).json({
          ok: false,
          error: 'Pago no encontrado.'
        });
      }

      const orden = await obtenerOrdenPermitida(
      supabase,
      pagoExistente.orden_id
      );

if (!orden) {
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

        const datosAnteriores = {
        monto: pagoExistente.monto,
        notas: pagoExistente.notas
      };

      const datosNuevos = {
        monto: data.monto,
        notas: data.notas
      };

      const huboCambios =
        String(datosAnteriores.monto ?? '') !==
          String(datosNuevos.monto ?? '') ||
        String(datosAnteriores.notas ?? '') !==
          String(datosNuevos.notas ?? '');

      if (huboCambios) {
        await registrarAuditoriaOrden(supabase, user, {
          orden_id: data.orden_id,
          empresa_id: orden.empresa_id,
          accion: 'pago_actualizado',
          detalle:
            'Pago actualizado: $ ' +
            datosAnteriores.monto +
            ' → $ ' +
            datosNuevos.monto +
            '.',
          datos_anteriores: datosAnteriores,
          datos_nuevos: datosNuevos
        });
      }

      return res.status(200).json({
        ok: true,
        data: data
      });
    }


    // ===== DELETE: Eliminar un pago =====
    if (req.method === 'DELETE') {
      if (!esAdmin(user)) {
          return res.status(403).json({
          ok: false,
          error: 'Solo un administrador puede eliminar pagos.'
        });
      }
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
        .select('id, orden_id, monto, fecha, notas, creado_en')
        .eq('id', pagoId)
        .maybeSingle();

      if (pagoError) throw pagoError;

      if (!pago) {
        return res.status(404).json({
          ok: false,
          error: 'Pago no encontrado.'
        });
      }

      const orden = await obtenerOrdenPermitida(
      supabase,
      pago.orden_id
      );

if (!orden) {
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

      await registrarAuditoriaOrden(supabase, user, {
        orden_id: pago.orden_id,
        empresa_id: orden.empresa_id,
        accion: 'pago_eliminado',
        detalle: 'Se eliminó un pago por $ ' + pago.monto + '.',
        datos_anteriores: {
          pago_id: pago.id,
          monto: pago.monto,
          fecha: pago.fecha,
          notas: pago.notas,
          creado_en: pago.creado_en
        }
      });

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
