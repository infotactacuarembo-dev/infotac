const { createClient } = require('@supabase/supabase-js');
const { requireSession, getSessionUser } = require('./_auth');

function texto(value, maxLength) {
  if (value === undefined || value === null) return '';

  if (typeof value !== 'string') {
    throw new Error('Formato de datos inválido.');
  }

  return value.trim().slice(0, maxLength);
}

function validId(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function obtenerClienteSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Faltan variables de Supabase en Vercel.');
  }

  return createClient(url, key);
}

function esAdministrador(user) {
  return user && user.rol === 'admin';
}

const CAMPOS_EMPRESA = [
  'id',
  'nombre',
  'nombre_comercial',
  'country_code',
  'country',
  'tax_id_type',
  'tax_id',
  'address_line1',
  'address_line2',
  'state_region',
  'city',
  'postal_code',
  'telefono',
  'whatsapp',
  'email',
  'website',
  'logo_url',
  'zona_horaria'
].join(', ');

async function obtenerEmpresaConLogo(supabase, empresaId) {
  const { data: empresa, error } = await supabase
    .from('empresas')
    .select(CAMPOS_EMPRESA)
    .eq('id', empresaId)
    .maybeSingle();

  if (error) throw error;

  if (!empresa) return null;

  let logoUrlPublica = null;

  if (
    empresa.logo_url &&
    typeof empresa.logo_url === 'string'
  ) {
    const ruta = empresa.logo_url.trim();

    if (ruta.startsWith('empresa/')) {
      const { data: enlace, error: enlaceError } =
        await supabase.storage
          .from('logos')
          .createSignedUrl(ruta, 60 * 60);

      if (!enlaceError && enlace) {
        logoUrlPublica = enlace.signedUrl;
      }
    }
  }

  return {
    ...empresa,
    logo_url: logoUrlPublica || empresa.logo_url
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return res.status(405).json({
      ok: false,
      error: 'Método no permitido.'
    });
  }

  if (!requireSession(req, res)) return;

  const user = getSessionUser(req);
  const empresaId = user && user.empresa_id;

  if (!user || !validId(empresaId)) {
    return res.status(401).json({
      ok: false,
      error: 'Sesión de empresa inválida. Volvé a iniciar sesión.'
    });
  }

  if (req.method === 'PUT' && !esAdministrador(user)) {
    return res.status(403).json({
      ok: false,
      error: 'No tenés permisos de administrador.'
    });
  }

  try {
    const supabase = obtenerClienteSupabase();

    // ===== GET: perfil de la empresa de la sesión =====
    if (req.method === 'GET') {
      const empresa = await obtenerEmpresaConLogo(
        supabase,
        empresaId
      );

      if (!empresa) {
        return res.status(404).json({
          ok: false,
          error: 'No se encontró una empresa configurada.'
        });
      }

      return res.status(200).json({
        ok: true,
        empresa: empresa
      });
    }

    // ===== PUT: actualizar solo la empresa de la sesión =====
    const datos = req.body || {};

    const nombre = texto(datos.nombre, 200);
    const nombreComercial = texto(datos.nombre_comercial, 200);
    const countryCode = texto(
      datos.country_code,
      10
    ).toUpperCase();
    const country = texto(datos.country, 100);
    const taxIdType = texto(datos.tax_id_type, 100);
    const taxId = texto(datos.tax_id, 100);
    const addressLine1 = texto(datos.address_line1, 250);
    const addressLine2 = texto(datos.address_line2, 250);
    const stateRegion = texto(datos.state_region, 150);
    const city = texto(datos.city, 150);
    const postalCode = texto(datos.postal_code, 30);
    const telefono = texto(datos.telefono, 50);
    const whatsapp = texto(datos.whatsapp, 50);
    const email = texto(datos.email, 254);
    const website = texto(datos.website, 500);
    const logoUrl = texto(datos.logo_url, 500);
    const zonaHoraria = texto(datos.zona_horaria, 100);

    if (!nombre) {
      return res.status(400).json({
        ok: false,
        error: 'El nombre legal de la empresa es obligatorio.'
      });
    }

    if (!countryCode) {
      return res.status(400).json({
        ok: false,
        error: 'Seleccioná un país.'
      });
    }

    const { data: empresaActualizada, error } = await supabase
      .from('empresas')
      .update({
        nombre: nombre,
        nombre_comercial: nombreComercial || null,
        country_code: countryCode,
        country: country || null,
        tax_id_type: taxIdType || null,
        tax_id: taxId || null,
        address_line1: addressLine1 || null,
        address_line2: addressLine2 || null,
        state_region: stateRegion || null,
        city: city || null,
        postal_code: postalCode || null,
        telefono: telefono || '',
        whatsapp: whatsapp || '',
        email: email || '',
        website: website || null,
        logo_url: logoUrl || '',
        direccion: addressLine1 || '',
        rut: taxId || '',
        zona_horaria: zonaHoraria || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', empresaId)
      .select(CAMPOS_EMPRESA)
      .maybeSingle();

    if (error) throw error;

    if (!empresaActualizada) {
      return res.status(404).json({
        ok: false,
        error: 'La empresa no existe o no pudo actualizarse.'
      });
    }

    const empresa = await obtenerEmpresaConLogo(
      supabase,
      empresaId
    );

    return res.status(200).json({
      ok: true,
      empresa: empresa || empresaActualizada
    });
  } catch (error) {
    console.error('empresa API error:', error);

    return res.status(500).json({
      ok: false,
      error: 'No se pudieron procesar los datos de la empresa.'
    });
  }
};
