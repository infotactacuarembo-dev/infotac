const { createClient } = require('@supabase/supabase-js');
const { requireSession, getSessionUser } = require('./_auth');

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fechaValida(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const fecha = new Date(value + 'T00:00:00.000Z');

  return (
    !Number.isNaN(fecha.getTime()) &&
    fecha.toISOString().slice(0, 10) === value
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');

    return res.status(405).json({
      ok: false,
      error: 'Método no permitido.'
    });
  }

  if (!requireSession(req, res)) return;

  const user = getSessionUser(req);

  if (!user || !UUID.test(user.empresa_id || '')) {
    return res.status(401).json({
      ok: false,
      error: 'Sesión de empresa inválida.'
    });
  }

  if (user.rol !== 'admin' && user.rol !== 'user') {
    return res.status(403).json({
      ok: false,
      error: 'No tenés acceso a la evolución del taller.'
    });
  }

  const desde = req.query && req.query.desde;
  const hasta = req.query && req.query.hasta;

  if (
    !fechaValida(desde) ||
    !fechaValida(hasta) ||
    desde > hasta
  ) {
    return res.status(400).json({
      ok: false,
      error: 'Período inválido.'
    });
  }

  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.error('Evolución: configuración de base de datos ausente.');

    return res.status(500).json({
      ok: false,
      error: 'No se pudo consultar la evolución del taller.'
    });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase.rpc(
      'evolucion_taller_entregadas',
      {
        p_empresa_id: user.empresa_id,
        p_desde: desde,
        p_hasta: hasta
      }
    );

    if (error) throw error;

    const meses = (data || []).map(function (fila) {
      return {
        mes: fila.mes,
        manoObra: Number(fila.mano_obra || 0),
        repuestos: Number(fila.repuestos || 0),
        servicios: Number(fila.servicios || 0)
      };
    });

    return res.status(200).json({
      ok: true,
      data: {
        desde: desde,
        hasta: hasta,
        meses: meses
      }
    });
  } catch (error) {
    console.error('evolucion-taller error:', error);

    return res.status(500).json({
      ok: false,
      error: 'No se pudo consultar la evolución del taller.'
    });
  }
};
