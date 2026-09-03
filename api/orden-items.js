const { createClient } = require('@supabase/supabase-js');
const { requireSession } = require('./_auth');

const INFOTAC_EMPRESA_ID =
  'ce95321a-ea37-47d1-81bb-f25f0dd58eeb';

const TIPOS_PERMITIDOS = new Set([
  'repuesto',
  'mano_obra'
]);

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

function texto(value, maximo) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maximo);
}

function numeroPositivo(value, valorPorDefecto) {
  const numero = Number(value);

  if (!Number.isFinite(numero) || numero < 0) {
    return valorPorDefecto;
  }

  return numero;
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

    if (req.method === 'GET') {
      const ordenId = req.query && req.query.orden_id;

      if (!validOrdenId(ordenId)) {
        return res.status(400).json({
          ok: false,
          error: 'Identificador de orden inválido.'
        });
      }

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
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      const ordenId = texto(body.orden_id, 200);
      const tipo = texto(body.tipo, 30);
      const descripcion = texto(body.descripcion, 300);
      const cantidad = numeroPositivo(body.cantidad, 0);
      const precioUnitario = numeroPositivo(
        body.precio_unitario,
        0
      );

      if (!validOrdenId(ordenId)) {
        return res.status(400).json({
          ok: false,
          error: 'Identificador de orden inválido.'
        });
      }

      if (!TIPOS_PERMITIDOS.has(tipo)) {
        return res.status(400).json({
          ok: false,
          error: 'Tipo de ítem inválido.'
        });
      }

      if (!descripcion) {
        return res.status(400).json({
          ok: false,
          error: 'La descripción es obligatoria.'
        });
      }

      if (cantidad <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'La cantidad debe ser mayor que cero.'
        });
      }

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
        .insert({
          orden_id: ordenId,
          tipo: tipo,
          descripcion: descripcion,
          cantidad: cantidad,
          precio_unitario: precioUnitario
        })
        .select(
          'id, orden_id, tipo, descripcion, cantidad, precio_unitario, creado_en'
        )
        .single();

      if (error) throw error;

      return res.status(201).json({
        ok: true,
        data: data
      });
    }


      if (req.method === 'PATCH') {
      const body = req.body || {};

      const itemId = texto(body.id || body.item_id, 200);
      const tipo = texto(body.tipo, 30);
      const descripcion = texto(body.descripcion, 300);
      const cantidad = numeroPositivo(body.cantidad, 0);
      const precioUnitario = numeroPositivo(
        body.precio_unitario,
        0
      );

      if (!validOrdenId(itemId)) {
        return res.status(400).json({
          ok: false,
          error: 'Identificador de ítem inválido.'
        });
      }

      if (!TIPOS_PERMITIDOS.has(tipo)) {
        return res.status(400).json({
          ok: false,
          error: 'Tipo de ítem inválido.'
        });
      }

      if (!descripcion) {
        return res.status(400).json({
          ok: false,
          error: 'La descripción es obligatoria.'
        });
      }

      if (cantidad <= 0) {
        return res.status(400).json({
          ok: false,
          error: 'La cantidad debe ser mayor que cero.'
        });
      }

      const { data: item, error: itemError } = await supabase
        .from('orden_items')
        .select('id, orden_id')
        .eq('id', itemId)
        .maybeSingle();

      if (itemError) throw itemError;

      if (!item) {
        return res.status(404).json({
          ok: false,
          error: 'Ítem no encontrado.'
        });
      }

      const { data: orden, error: ordenError } = await supabase
        .from('ordenes')
        .select('id')
        .eq('id', item.orden_id)
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
        .update({
          tipo: tipo,
          descripcion: descripcion,
          cantidad: cantidad,
          precio_unitario: precioUnitario
        })
        .eq('id', itemId)
        .select(
          'id, orden_id, tipo, descripcion, cantidad, precio_unitario, creado_en'
        )
        .single();

      if (error) throw error;

      return res.status(200).json({
        ok: true,
        data: data
      });
    }
        
        if (req.method === 'DELETE') {
      const itemId = texto(
        req.query && (req.query.id || req.query.item_id),
        200
      );

      if (!validOrdenId(itemId)) {
        return res.status(400).json({
          ok: false,
          error: 'Identificador de ítem inválido.'
        });
      }

      const { data: item, error: itemError } = await supabase
        .from('orden_items')
        .select('id, orden_id')
        .eq('id', itemId)
        .maybeSingle();

      if (itemError) throw itemError;

      if (!item) {
        return res.status(404).json({
          ok: false,
          error: 'Ítem no encontrado.'
        });
      }

      const { data: orden, error: ordenError } = await supabase
        .from('ordenes')
        .select('id')
        .eq('id', item.orden_id)
        .eq('empresa_id', INFOTAC_EMPRESA_ID)
        .maybeSingle();

      if (ordenError) throw ordenError;

      if (!orden) {
        return res.status(404).json({
          ok: false,
          error: 'Orden no encontrada.'
        });
      }

      const { error: deleteError } = await supabase
        .from('orden_items')
        .delete()
        .eq('id', itemId);

      if (deleteError) throw deleteError;

      return res.status(200).json({
        ok: true
      });
    }
    
  } catch (error) {

    
    console.error('orden-items error:', error);

    return res.status(500).json({
      ok: false,
      error: 'No se pudieron procesar los ítems de la orden.'
    });
  }
};
