import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { requireSession } from './_auth.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido. Utilizar POST.' });
  }

  const session = requireSession(req, res);
  if (!session) return;

  try {
    const { payload, admin_password } = req.body;

    if (!payload || payload.app !== 'infotac' || !payload.data) {
      return res.status(400).json({ ok: false, error: 'Formato de archivo de respaldo no compatible.' });
    }

    if (!admin_password) {
      return res.status(401).json({
        ok: false,
        error: 'Se requiere la contraseña del administrador para autorizar la restauración.'
      });
    }

    const {
      empresa,
      clientes,
      ordenes,
      orden_items,
      pagos,
      configuracion
    } = payload.data;

    const empresaId = payload.empresa_id || empresa?.id;

    if (!empresaId) {
      return res.status(400).json({
        ok: false,
        error: 'No se identificó el ID de empresa en el respaldo.'
      });
    }

    const empresaActualId = session.empresa_id;

    if (empresaId !== empresaActualId) {
      return res.status(403).json({
        ok: false,
        error: 'El respaldo pertenece a otro taller. No es posible restaurarlo en este taller.'
      });
    }

    const { data: admin, error: adminError } = await supabase
      .from('usuarios')
      .select('id, password_hash, rol')
      .eq('empresa_id', empresaActualId)
      .eq('rol', 'admin')
      .eq('activo', true)
      .limit(1)
      .maybeSingle();

    if (adminError || !admin) {
      return res.status(403).json({
        ok: false,
        error: 'No se encontró un administrador activo para autorizar la restauración.'
      });
    }

    const passwordValida = await bcrypt.compare(admin_password, admin.password_hash);

    if (!passwordValida) {
      return res.status(401).json({
        ok: false,
        error: 'Contraseña de administrador incorrecta. La restauración fue cancelada.'
      });
    }

    if (empresa && empresa.id) {
      await supabase.from('empresas').upsert([empresa], { onConflict: 'id' });
    }

    if (Array.isArray(clientes) && clientes.length > 0) {
      const clientesFormateados = clientes.map(c => ({
        id: c.id,
        nombre: c.nombre || '',
        whatsapp: c.whatsapp || '',
        created_at: c.created_at || new Date().toISOString(),
        empresa_id: empresaId
      }));

      await supabase.from('clientes').upsert(clientesFormateados, { onConflict: 'id' });
    }

    if (Array.isArray(ordenes) && ordenes.length > 0) {
      const ordenesFormateadas = ordenes.map(o => ({
        id: o.id,
        fecha: o.fecha || new Date().toISOString(),
        cliente: o.cliente || '',
        tel: o.tel || '',
        tipo: o.tipo || '',
        serie: o.serie || '',
        pass: o.pass || '',
        sena: Number(o.sena || 0),
        falla: o.falla || '',
        presupuesto: Number(o.presupuesto || 0),
        presupuesta: Number(o.presupuesta || 0),
        estetico: o.estetico || '',
        estado: o.estado || 'Pendiente',
        fecha_entrega: o.fecha_entrega || null,
        cliente_id: o.cliente_id || null,
        diagnostico: o.diagnostico || '',
        trabajo_realizar: o.trabajo_realizar || '',
        aprobacion_presupuesto: o.aprobacion_presupuesto || 'pendiente',
        empresa_id: empresaId,
        pago_final: Number(o.pago_final || 0),
        tecnico_id: o.tecnico_id || null,
        created_at: o.created_at || new Date().toISOString(),
        vista_por_tecnico_en: o.vista_por_tecnico_en || null,
        terminado_en: o.terminado_en || null,
        fecha_prometida_entrega: o.fecha_prometida_entrega || null,
        presupuesto_detalle: o.presupuesto_detalle || null,
        motivo_devolucion: o.motivo_devolucion || null
      }));

      await supabase.from('ordenes').upsert(ordenesFormateadas, { onConflict: 'id' });
    }

    if (Array.isArray(orden_items) && orden_items.length > 0) {
      const itemsFormateados = orden_items.map(it => ({
        id: it.id,
        orden_id: it.orden_id,
        tipo: it.tipo || 'servicio',
        descripcion: it.descripcion || '',
        cantidad: Number(it.cantidad || 1),
        precio_unitario: Number(it.precio_unitario || 0),
        creado_en: it.creado_en || new Date().toISOString(),
        empresa_id: empresaId
      }));

      await supabase.from('orden_items').upsert(itemsFormateados, { onConflict: 'id' });
    }

    if (Array.isArray(pagos) && pagos.length > 0) {
      const pagosFormateados = pagos.map(p => ({
        id: p.id,
        orden_id: p.orden_id,
        monto: Number(p.monto || 0),
        fecha: p.fecha || new Date().toISOString(),
        notas: p.notas || '',
        creado_en: p.creado_en || new Date().toISOString(),
        empresa_id: empresaId
      }));

      await supabase.from('pagos').upsert(pagosFormateados, { onConflict: 'id' });
    }

    await supabase.from('configuracion').insert([
      {
        empresa_id: empresaId,
        clave: 'ultimo_backup_restaurado',
        valor: JSON.stringify({
          fecha: new Date().toISOString(),
          archivo_fecha: payload.fecha_exportacion || null,
          restaurado_por: session.identificador || 'administrador',
          clientes: clientes?.length || 0,
          ordenes: ordenes?.length || 0,
          items: orden_items?.length || 0,
          pagos: pagos?.length || 0
        })
      }
    ]);

    return res.status(200).json({
      ok: true,
      mensaje: 'Restauración autorizada y completada con éxito',
      resumen: {
        clientes: clientes?.length || 0,
        ordenes: ordenes?.length || 0,
        items: orden_items?.length || 0,
        pagos: pagos?.length || 0
      }
    });

  } catch (error) {
    console.error('Error restaurando el backup:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Error interno al restaurar el respaldo.'
    });
  }
}
