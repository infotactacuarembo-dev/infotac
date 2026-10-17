const { verificarSesionFirmada } = require('./_session-signed');

function readSession(req) {
  const header = req.headers.cookie || '';
  if (typeof header !== 'string') return null;
  const sessionCookies = header
    .split(';')
    .map(value => value.trim())
    .filter(value => value.startsWith('taller_session='))
    .map(value => value.slice('taller_session='.length));
  if (!sessionCookies.length) return null;
  try {
    return verificarSesionFirmada(decodeURIComponent(sessionCookies[sessionCookies.length - 1]));
  } catch (_) {
    return null;
  }
}

function requireAuth(req, res) {
  const session = readSession(req);
  if (!session) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(401).json({ ok: false, error: 'Sesión requerida o vencida' });
    return null;
  }
  return session;
}

function requireSession(req, res) { return requireAuth(req, res); }
function getSessionUser(req) { return readSession(req); }

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'taller_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
}

module.exports = { readSession, requireAuth, requireSession, getSessionUser, clearSessionCookie };
