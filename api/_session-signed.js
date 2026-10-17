const crypto = require('crypto');

const VERSION = 'v1';
const TTL = 8 * 60 * 60 * 1000;
const MAX_LENGTH = 3800;

function getKey() {
  const value = process.env.TALLER_SESSION_SECRET;
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error('TALLER_SESSION_SECRET must be 64 hexadecimal characters');
  }
  return Buffer.from(value, 'hex');
}

function validSession(s, now) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return Boolean(
    s && typeof s === 'object' && !Array.isArray(s) &&
    typeof s.user_id === 'string' && uuid.test(s.user_id) &&
    typeof s.empresa_id === 'string' && uuid.test(s.empresa_id) &&
    ['admin', 'user', 'tecnico'].includes(s.rol) &&
    Number.isSafeInteger(s.iat) && Number.isSafeInteger(s.exp) &&
    s.iat > 0 && s.iat <= now && s.exp > now &&
    s.exp > s.iat && s.exp - s.iat <= TTL
  );
}

function signature(payload, key) {
  return crypto.createHmac('sha256', key)
    .update(VERSION + '.' + payload).digest();
}

function firmarSesion(datos) {
  const key = getKey();
  const now = Date.now();
  const session = { ...datos, iat: now, exp: now + TTL };
  if (!validSession(session, now)) throw new Error('Invalid session');
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  const value = VERSION + '.' + payload + '.' + signature(payload, key).toString('hex');
  if (value.length > MAX_LENGTH) throw new Error('Session cookie too large');
  return value;
}

function verificarSesionFirmada(value) {
  const key = getKey();
  if (typeof value !== 'string' || value.length > MAX_LENGTH) return null;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION ||
      !/^[A-Za-z0-9_-]+$/.test(parts[1]) ||
      !/^[0-9a-f]{64}$/.test(parts[2])) return null;
  const expected = signature(parts[1], key);
  const received = Buffer.from(parts[2], 'hex');
  if (!crypto.timingSafeEqual(expected, received)) return null;
  try {
    const session = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return validSession(session, Date.now()) ? session : null;
  } catch (_) {
    return null;
  }
}

module.exports = { firmarSesion, verificarSesionFirmada };
