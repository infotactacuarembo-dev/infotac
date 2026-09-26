const { createClient } = require('@supabase/supabase-js');
const { requireSession, getSessionUser } = require('./_auth');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fechaValida(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }
  if (!requireSession(req, res)) return;

  const user = getSessionUser(req);
  if (!user || !UUID.test(user.empresa_id || '')) {
    return res.status(401).json({ ok: false, error: 'Sesión de empresa inválida.' });
  }
  if (user.rol !== 'admin' && user.rol !== 'user') {
    return res.status(403).json({ ok: false, error: 'No tenés acceso al balance.' });
  }

  const desde = req.query && req.query.desde;
  const hasta = req.query && req.query.hasta;
  if (!fechaValida(desde) || !fechaValida(hasta) || desde > hasta) {
    return res.status(400).json({ ok: false, error: 'Período inválido.' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Balance: configuración de base de datos ausente.');
    return res.status(500).json({ ok: false, error: 'No se pudo consultar el balance.' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase.rpc('balance_taller_entregadas', {
      p_empresa_id: user.empresa_id,
      p_desde: desde,
      p_hasta: hasta
    });

    if (error) throw error;
    const fila = Array.isArray(data) ? data[0] : data;
    if (!fila) throw new Error('La consulta no devolvió un resumen.');

    return res.status(200).json({
      ok: true,
      data: {
        cantidadOrdenes: Number(fila.cantidad_ordenes),
        manoObra: Number(fila.mano_obra),
        repuestos: Number(fila.repuestos),
        servicios: Number(fila.servicios),
        totalFacturado: Number(fila.total_facturado),
        senas: Number(fila.senas),
        pagos: Number(fila.pagos),
        totalCobrado: Number(fila.total_cobrado),
        saldoPendiente: Number(fila.saldo_pendiente),
        desde: desde,
        hasta: hasta
      }
    });
  } catch (error) {
    console.error('balance-taller error:', error);
    return res.status(500).json({ ok: false, error: 'No se pudo consultar el balance.' });
  }
};
