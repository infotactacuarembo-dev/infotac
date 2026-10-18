import { createClient } from '@supabase/supabase-js';
import { requireSession } from './_auth.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  const session = requireSession(req, res);
  if (!session) return;

  const empresaId = session.empresa_id;

  if (!empresaId) {
    return res.status(403).json({
      ok: false,
      error: 'No se pudo identificar el taller de la sesión.'
    });
  }

  try {
    const [empresa, usuarios, clientes, ordenes, orden_items, pagos, configuracion] = await Promise.all([
      supabase.from('empresas').select('*').eq('id', empresaId).single(),
      supabase.from('usuarios').select('id, identificador, rol, creado_en, activo, empresa_id').eq('empresa_id', empresaId),
      supabase.from('clientes').select('*').eq('empresa_id', empresaId),
      supabase.from('ordenes').select('*').eq('empresa_id', empresaId),
      supabase.from('orden_items').select('*').eq('empresa_id', empresaId),
      supabase.from('pagos').select('*').eq('empresa_id', empresaId),
      supabase.from('configuracion').select('clave, valor').eq('empresa_id', empresaId)
    ]);

    if (empresa.error || !empresa.data) {
      return res.status(404).json({
        ok: false,
        error: 'No se encontró el taller de la sesión.'
      });
    }

    const backupData = {
      app: 'infotac',
      version: 1,
      fecha_exportacion: new Date().toISOString(),
      empresa_id: empresaId,
      empresa_nombre: empresa.data?.nombre || 'Taller',
      resumen: {
        usuarios: usuarios.data?.length || 0,
        clientes: clientes.data?.length || 0,
        ordenes: ordenes.data?.length || 0,
        orden_items: orden_items.data?.length || 0,
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
    const nombreEmpresa = (empresa.data?.nombre || 'taller')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .toLowerCase();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup_${nombreEmpresa}_${fechaHoy}.json"`);
    res.setHeader('Cache-Control', 'no-store');

    return res.status(200).send(JSON.stringify(backupData, null, 2));

  } catch (error) {
    console.error('Error generando backup:', error);
    return res.status(500).json({ ok: false, error: 'No se pudo generar el backup.' });
  }
}
