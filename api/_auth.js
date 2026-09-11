const crypto = require('crypto');

const COOKIE_NAME = 'infotac_session';
const MAX_AGE_SECONDS = 60 * 60 * 8;

function secret() {
  const value = process.env.SESSION_SECRET;

  if (!value || value.length < 32) {
    throw new Error('SESSION_SECRET no está configurada correctamente.');
  }

  return value;
}

function sign(payload) {
  return crypto
    .createHmac('sha256', secret())
    .update(payload)
    .digest('base64url');
}

function createSessionToken(id, identificador, rol, empresaId, codigoEmpresa) {
  const payloadData = {
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
    nonce: crypto.randomBytes(16).toString('hex'),
    id: id || null,
    identificador: identificador || null,
    rol: rol || null,
    empresa_id: empresaId || null,
    codigo_empresa: codigoEmpresa || null
  };

  const payload = Buffer
    .from(JSON.stringify(payloadData))
    .toString('base64url');

  return payload + '.' + sign(payload);
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;

  const parts = token.split('.');

  if (parts.length !== 2) return false;

  const payload = parts[0];
  const signature = parts[1];
  const expected = sign(payload);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return false;
  }

  try {
    const data = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    );

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const rolesPermitidos = new Set([
      'admin',
      'user',
      'tecnico'
    ]);

    return (
      Number.isInteger(data.exp) &&
      data.exp > Math.floor(Date.now() / 1000) &&
      typeof data.id === 'string' &&
      uuidPattern.test(data.id) &&
      typeof data.identificador === 'string' &&
      data.identificador.trim().length > 0 &&
      data.identificador.length <= 120 &&
      typeof data.rol === 'string' &&
      rolesPermitidos.has(data.rol) &&
      typeof data.empresa_id === 'string' &&
      uuidPattern.test(data.empresa_id) &&
      typeof data.codigo_empresa === 'string' &&
      data.codigo_empresa.trim().length > 0 &&
      data.codigo_empresa.length <= 80
    );
  } catch (_) {
    return false;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';

  return header.split(';').reduce(function (cookies, part) {
    const index = part.indexOf('=');

    if (index === -1) return cookies;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    cookies[key] = decodeURIComponent(value);

    return cookies;
  }, {});
}

function requireSession(req, res) {
  try {
    const token = parseCookies(req)[COOKIE_NAME];

    if (!verifySessionToken(token)) {
      res.status(401).json({
        ok: false,
        error: 'Sesión requerida o vencida.'
      });

      return false;
    }

    return true;
  } catch (_) {
    res.status(401).json({
      ok: false,
      error: 'Sesión inválida.'
    });

    return false;
  }
}

function getSessionUser(req) {
  try {
    const token = parseCookies(req)[COOKIE_NAME];

    if (!verifySessionToken(token)) {
      return null;
    }

    const payload = token.split('.')[0];

    const data = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    );

    return {
      id: data.id,
      identificador: data.identificador,
      rol: data.rol,
      empresa_id: data.empresa_id,
      codigo_empresa: data.codigo_empresa
    };
  } catch (_) {
    return null;
  }
}

function sessionCookie(token) {
  return [
    COOKIE_NAME + '=' + encodeURIComponent(token),
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Max-Age=' + MAX_AGE_SECONDS
  ].join('; ');
}

function clearSessionCookie() {
  return [
    COOKIE_NAME + '=',
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Max-Age=0'
  ].join('; ');
}

module.exports = {
  createSessionToken,
  requireSession,
  getSessionUser,
  sessionCookie,
  clearSessionCookie
};
