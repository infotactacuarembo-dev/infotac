const { createClient } = require('@supabase/supabase-js');
const { requireSession } = require('./_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Método no permitido.'
    });
  }

  if (!requireSession(req, res)) {
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return res.status(503).json({
      ok: false,
      error: 'Servicio de auditoría no disponible.'
    });
  }

  try {
    const supabase = createClient(url, key);

    const [
      { data: accesos, error: accesosError },
      { data: cambiosClave, error: cambiosError }
    ] = await Promise.all([
      supabase
        .from('login_audit')
        .select('id, creado_en, identificador, resultado, detalle')
        .order('creado_en', { ascending: false })
        .limit(30),

      supabase
        .from('password_changes')
        .select('id, cambiado_en, ip, resultado, detalle')
        .order('cambiado_en', { ascending: false })
        .limit(30)
    ]);

    if (accesosError) throw accesosError;
    if (cambiosError) throw cambiosError;

    return res.status(200).json({
      ok: true,
      accesos: accesos || [],
      cambiosClave: cambiosClave || []
    });
  } catch (error) {
    console.error('audit-log error:', error);

    return res.status(500).json({
      ok: false,
      error: 'No se pudo cargar la auditoría.'
    });
  }
};
