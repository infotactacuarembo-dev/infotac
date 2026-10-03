const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

function json(res, status, body) {
  return res.status(status).json(body);
}

function validUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function temporaryPassword() {
  return crypto.randomBytes(12).toString('base64url');
}

function database() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Base de datos no configurada.');
  return createClient(url, key);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Método no permitido.' });
  }

  const expectedSecret = process.env.PORTAL_PROVISIONING_SECRET;
  const providedSecret = req.headers['x-portal-provisioning-secret'];
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return json(res, 401, { ok: false, error: 'No autorizado.' });
  }

  const body = req.body || {};
  const portalEmpresaId = text(body.portal_empresa_id, 80);
  const nombre = text(body.nombre, 200);
  const telefono = text(body.telefono, 50);
  const empresa = text(body.empresa, 200);

  if (!validUuid(portalEmpresaId) || !nombre) {
    return json(res, 400, { ok: false, error: 'portal_empresa_id y nombre son obligatorios.' });
  }

  const supabase = database();
  const { data: existingCompany, error: existingCompanyError } = await supabase
    .from('empresas')
    .select('id, nombre')
    .eq('portal_empresa_id', portalEmpresaId)
    .maybeSingle();

  if (existingCompanyError) throw existingCompanyError;
  if (existingCompany) {
    return json(res, 409, { ok: false, error: 'La empresa ya fue aprovisionada.' });
  }

  const password = temporaryPassword();
  const passwordHash = bcrypt.hashSync(password, 10);

  const { data: company, error: companyError } = await supabase
    .from('empresas')
    .insert({
      nombre,
      portal_empresa_id: portalEmpresaId
    })
    .select('id, nombre, portal_empresa_id')
    .single();

  if (companyError) throw companyError;

  const { data: user, error: userError } = await supabase
    .from('usuarios')
    .insert({
      empresa_id: company.id,
      identificador: 'admin',
      password_hash: passwordHash,
      rol: 'admin',
      activo: true,
      debe_cambiar_password: true
    })
    .select('id, identificador, rol, activo, empresa_id, debe_cambiar_password')
    .single();

  if (userError) {
    await supabase.from('empresas').delete().eq('id', company.id);
    throw userError;
  }

  return json(res, 201, {
    ok: true,
    empresa: company,
    usuario: user,
    credenciales_iniciales: {
      identificador: 'admin',
      password_temporal: password
    }
  });
};
