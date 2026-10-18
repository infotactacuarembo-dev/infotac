import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  try {
    const { empresa_id } = req.query;

    if (!empresa_id) {
      return res.status(400).json({ ok: false, error: 'Falta empresa_id' });
    }

    // Consultamos todas las tablas de ese taller en paralelo
    const [empresa, usuarios, clientes, ordenes, orden_items, pagos, configuracion] = await Promise.all([
      supabase.from('empresas').select('*').eq('id', empresa_id).single(),
      supabase.from('usuarios').select('id, identificador, rol, creado_en, activo').eq('empresa_id', empresa_id),
      supabase.from('clientes').select('*').eq('empresa_id', empresa_id),
      supabase.from('ordenes').select('*').eq('empresa_id', empresa_id),
      supabase.from('orden_items').select('*').eq('empresa_id', empresa_id),
      supabase.from('pagos').select('*').eq('empresa_id', empresa_id),
      supabase.from('configuracion').select('clave, valor')
    ]);

    const backupData = {
      app: 'infotac',
      fecha_exportacion: new Date().toISOString(),
      empresa_id,
      resumen: {
        usuarios: usuarios.data?.length || 0,
        clientes: clientes.data?.length || 0,
        ordenes: ordenes.data?.length || 0,
        pagos: pagos.data?.length || 0
      },
      data: {
        empresa: empresa.data,
        usuarios: usuarios.data || [],
        clientes: clientes.data || [],
        ordenes: ordenes.data || [],
        orden_items: orden_items.data || [],
        pagos: pagos.data || [],
        configuracion: configuracion.data || []
      }
    };

    const fechaHoy = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup_infotac_${fechaHoy}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    
    return res.status(200).send(JSON.stringify(backupData, null, 2));

  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
