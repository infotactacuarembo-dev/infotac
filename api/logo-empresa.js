const fs = require('fs');
const { formidable } = require('formidable');
const { createClient } = require('@supabase/supabase-js');
const { requireSession, getSessionUser } = require('./_auth');

const MAX_FILE_SIZE = 2 * 1024 * 1024;

const TIPOS_PERMITIDOS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function obtenerClienteSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Faltan variables de Supabase en Vercel.');
  }

  return createClient(url, key);
}

function esAdministrador(req, res) {
  if (!requireSession(req, res)) return false;

  const usuario = getSessionUser(req);

  if (!usuario || usuario.rol !== 'admin') {
    res.status(403).json({
      ok: false,
      error: 'No tenés permisos de administrador.'
    });
    return false;
  }

  return true;
}

function leerFormulario(req) {
  return new Promise(function (resolve, reject) {
    const form = formidable({
      multiples: false,
      maxFileSize: MAX_FILE_SIZE,
      filter: function (part) {
        return !!TIPOS_PERMITIDOS[part.mimetype];
      }
    });

    form.parse(req, function (error, fields, files) {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        fields: fields,
        files: files
      });
    });
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Método no permitido.'
    });
  }

  if (!esAdministrador(req, res)) return;

  try {
    const resultado = await leerFormulario(req);

    const empresaId = Array.isArray(resultado.fields.empresa_id)
      ? resultado.fields.empresa_id[0]
      : resultado.fields.empresa_id;

    const archivo = Array.isArray(resultado.files.logo)
      ? resultado.files.logo[0]
      : resultado.files.logo;

    if (
      !empresaId ||
      typeof empresaId !== 'string' ||
      empresaId.length > 100
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Empresa inválida.'
      });
    }

    if (!archivo) {
      return res.status(400).json({
        ok: false,
        error: 'Seleccioná una imagen para subir.'
      });
    }

    if (!TIPOS_PERMITIDOS[archivo.mimetype]) {
      return res.status(400).json({
        ok: false,
        error: 'Formato no permitido. Usá JPG, PNG o WebP.'
      });
    }

    if (archivo.size > MAX_FILE_SIZE) {
      return res.status(400).json({
        ok: false,
        error: 'La imagen supera el límite de 2 MB.'
      });
    }

    const supabase = obtenerClienteSupabase();

    const { data: empresa, error: empresaError } = await supabase
      .from('empresas')
      .select('id')
      .eq('id', empresaId)
      .maybeSingle();

    if (empresaError) {
      throw empresaError;
    }

    if (!empresa) {
      return res.status(404).json({
        ok: false,
        error: 'La empresa no existe.'
      });
    }

    const extension = TIPOS_PERMITIDOS[archivo.mimetype];
    const rutaArchivo = 'empresa/' + empresaId + '/logo.' + extension;
    const contenido = fs.readFileSync(archivo.filepath);

    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(rutaArchivo, contenido, {
        contentType: archivo.mimetype,
        upsert: true,
        cacheControl: '3600'
      });

    if (uploadError) {
      throw uploadError;
    }

    // Guardar la ruta estable en la base
const { error: actualizacionError, data: empresaActualizada } = await supabase
  .from('empresas')
  .update({
    logo_url: rutaArchivo,
    updated_at: new Date().toISOString()
  })
  .eq('id', empresaId)
  .select('logo_url')
  .maybeSingle();

if (actualizacionError) {
  console.error('Error al actualizar logo_url:', actualizacionError);
  throw actualizacionError;
}

if (!empresaActualizada || !empresaActualizada.logo_url) {
  console.error('logo_url no se actualizó correctamente:', empresaActualizada);
  return res.status(500).json({
    ok: false,
    error: 'No se pudo guardar la ruta del logo.'
  });
}

// Generar URL firmada solo para la vista previa inmediata
const { data: enlace, error: enlaceError } = await supabase.storage
  .from('logos')
  .createSignedUrl(rutaArchivo, 60 * 60); // 1 hora

if (enlaceError) {
  throw enlaceError;
}

return res.status(200).json({
  ok: true,
  logo_url: enlace.signedUrl,
  logo_path: rutaArchivo
});
    
  } catch (error) {
    console.error('logo-empresa API error:', error);

    if (error && error.code === 1009) {
      return res.status(400).json({
        ok: false,
        error: 'La imagen supera el límite de 2 MB.'
      });
    }

    return res.status(500).json({
      ok: false,
      error: 'No se pudo subir el logo.'
    });
  }
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
