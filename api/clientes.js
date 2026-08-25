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

function texto(value, max) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  if (!requireSession(req, res)) return;

  try {
    const supabase = db();

    if (req.method === 'GET') {
      const { data, error } = await supabase
      .from('clientes')
      .select('id, nombre, whatsapp')
      .eq('empresa_id', INFOTAC_EMPRESA_ID)
      .order('nombre', { ascending: true });

      if (error) throw error;
      return res.status(200).json({ ok: true, data: data || [] });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const nombre = texto(body.nombre, 160);
      const whatsapp = texto(body.whatsapp, 40);

      if (!nombre) {
        return res.status(400).json({
          ok: false,
          error: 'El nombre del cliente es obligatorio.'
        });
      }
      
      const { data: existente, error: buscarError } = await supabase
        .from('clientes')
        .select('id, nombre, whatsapp')
        .eq('empresa_id', INFOTAC_EMPRESA_ID)
        .ilike('nombre', nombre)
        .maybeSingle();

      if (buscarError) throw buscarError;

      if (existente) {
        return res.status(409).json({
        ok: false,
        error: 'Ese cliente ya existe.',
        data: existente
  });
}
      const { data, error } = await supabase
        .from('clientes')
        .insert({
        empresa_id: INFOTAC_EMPRESA_ID,
        nombre,
        whatsapp
      })
        .select('id, nombre, whatsapp')
        .single();

      if (error) throw error;
      return res.status(201).json({ ok: true, data });
    }

    return res.status(405).json({
      ok: false,
      error: 'Método no permitido.'
    });
  } catch (error) {
    console.error('clientes error:', error);
    return res.status(500).json({
      ok: false,
      error: 'No se pudo procesar clientes.'
    });
  }
};
