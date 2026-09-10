const { createClient } = require('@supabase/supabase-js');
const { requireSession, getSessionUser } = require('./_auth');

const INFOTAC_EMPRESA_ID =
  'ce95321a-ea37-47d1-81bb-f25f0dd58eeb';

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Base de datos no configurada.');
  }

  return createClient(url, key);
}

function validId(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Método no permitido.'
    });
  }

  if (!requireSession(req, res)) return;

  const user = getSessionUser(req);

  if (!user || !['admin', 'user'].includes(user.rol)) {
    return res.status(403).json({
      ok: false,
      error: 'No tenés permiso para consultar el historial de órdenes.'
    });
  }

  const ordenId = req.query && req.query.orden_id;

  if (!validId(ordenId)) {
    return res.status(400).json({
      ok: false,
      error: 'Identificador de orden inválido.'
    });
  }

  try {
    const supabase = db();

    // Confirma que la orden existe y pertenece a Infotac antes de leer eventos.
    const { data: orden, error: ordenError } = await supabase
      .from('ordenes')
      .select('id, empresa_id')
      .eq('id', ordenId)
      .eq('empresa_id', INFOTAC_EMPRESA_ID)
      .maybeSingle();

    if (ordenError) throw ordenError;

    if (!orden) {
      return res.status(404).json({
        ok: false,
        error: 'Orden no encontrada.'
      });
    }

    const { data, error } = await supabase
      .from('orden_audit')
      .select(
        `
          id,
          creado_en,
          actor_identificador,
          actor_rol,
          accion,
          detalle,
          datos_anteriores,
          datos_nuevos
        `
      )
      .eq('orden_id', orden.id)
      .eq('empresa_id', orden.empresa_id)
      .order('creado_en', { ascending: false })
      .limit(100);

    if (error) throw error;

    return res.status(200).json({
      ok: true,
      data: data || []
    });
  } catch (error) {
    console.error('orden-historial error:', error);

    return res.status(500).json({
      ok: false,
      error: 'No se pudo cargar el historial de la orden.'
    });
  }
};
