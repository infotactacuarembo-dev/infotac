const { createClient } = require('@supabase/supabase-js');
const { requireSession } = require('./_auth');

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

function validOrdenId(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

module.exports = async function handler(req, res) {
  if (!requireSession(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Método no permitido.'
    });
  }

  const ordenId = req.query && req.query.orden_id;

  if (!validOrdenId(ordenId)) {
    return res.status(400).json({
      ok: false,
      error: 'Identificador de orden inválido.'
    });
  }

  try {
    const supabase = db();

    const { data: orden, error: ordenError } = await supabase
      .from('ordenes')
      .select('id')
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
  } catch (error) {
    console.error('orden-items error:', error);

    return res.status(500).json({
      ok: false,
      error: 'No se pudieron cargar los ítems de la orden.'
    });
  }
};
