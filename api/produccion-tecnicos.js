const { createClient } = require('@supabase/supabase-js');
const { requireSession, getSessionUser } = require('./_auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function validId(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/i.test(
      value.trim()
    )
  );
}

function esFechaISO(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
  );
}

function seleccionarDestacados(filas) {
  const tecnicos = (filas || []).filter(
    fila => fila.tecnico_id !== null
  );

  const mayorManoObra = Math.max(
    0,
    ...tecnicos.map(fila => Number(fila.mano_obra || 0))
  );

  const mayorRepuestos = Math.max(
    0,
    ...tecnicos.map(fila => Number(fila.repuestos || 0))
  );

  const destacadoManoObra = mayorManoObra > 0
    ? tecnicos.filter(
        fila => Number(fila.mano_obra || 0) === mayorManoObra
      )
    : [];

  const destacadoRepuestos = mayorRepuestos > 0
    ? tecnicos.filter(
        fila => Number(fila.repuestos || 0) === mayorRepuestos
      )
    : [];

  return {
    mayor_mano_obra: {
      criterio: 'Mayor facturación de mano de obra',
      importe: mayorManoObra,
      tecnicos: destacadoManoObra
    },
    mayor_repuestos: {
      criterio: 'Mayor facturación de repuestos',
      importe: mayorRepuestos,
      tecnicos: destacadoRepuestos
    }
  };
}

module.exports = async function handler(req, res) {
  if (!requireSession(req, res)) return;

  const sessionUser = getSessionUser(req);

  if (
    !sessionUser ||
    !sessionUser.empresa_id ||
    !validId(sessionUser.empresa_id)
  ) {
    return res.status(401).json({
      ok: false,
      error: 'Sesión inválida o empresa no identificada'
    });
  }

  const esAdmin = sessionUser.rol === 'admin';
  const esUser = sessionUser.rol === 'user';

  if (!esAdmin && !esUser) {
    return res.status(403).json({
      ok: false,
      error:
        'No tienes permiso para consultar la producción por técnico'
    });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Método no permitido'
    });
  }

  try {
    const { fecha_desde, fecha_hasta } = req.query;

    if (!esFechaISO(fecha_desde) || !esFechaISO(fecha_hasta)) {
      return res.status(400).json({
        ok: false,
        error:
          'Debés indicar fecha_desde y fecha_hasta en formato AAAA-MM-DD'
      });
    }

    const desde = `${fecha_desde.trim()}T00:00:00`;
    const hastaSiguienteDia = new Date(
      `${fecha_hasta.trim()}T00:00:00`
    );

    hastaSiguienteDia.setDate(hastaSiguienteDia.getDate() + 1);

    const hasta = hastaSiguienteDia.toISOString();

    const { data, error } = await supabase.rpc(
      'obtener_produccion_tecnicos',
      {
        p_empresa_id: sessionUser.empresa_id,
        p_fecha_desde: desde,
        p_fecha_hasta: hasta
      }
    );

    if (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }

    const filas = data || [];

    const sinTecnico = filas.find(
      fila => fila.tecnico_id === null
    );

    const tecnicos = filas.filter(
      fila => fila.tecnico_id !== null
    );

    return res.status(200).json({
      ok: true,
      data: {
        periodo: {
          fecha_desde: fecha_desde.trim(),
          fecha_hasta: fecha_hasta.trim()
        },
        tecnicos,
        sin_tecnico: sinTecnico || null,
        destacados: seleccionarDestacados(filas)
      }
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'No se pudo calcular la producción por técnico'
    });
  }
};
