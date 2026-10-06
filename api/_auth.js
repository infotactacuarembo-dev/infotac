const crypto = require('crypto');

function readSession(req) {
  const header = req.headers.cookie || '';
  const match = header.match(/(?:^|; )taller_session=([^;]+)/);
  if (!match) return null;
  try {
    const session = JSON.parse(decodeURIComponent(match[1]));
    if (!session.user_id || !session.empresa_id || !session.exp || session.exp < Date.now()) return null;
    return session;
  } catch (_) { return null; }
}

function requireAuth(req, res) {
  const session = readSession(req);
  if (!session) {
    res.status(401).json({ ok: false, error: 'Sesión requerida o vencida' });
    return null;
  }
  return session;
}

function requireSession(req, res) {
  return requireAuth(req, res);
}

function getSessionUser(req) {
  return readSession(req);
}

function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    'taller_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  );
}

module.exports = {
  readSession,
  requireAuth,
  requireSession,
  getSessionUser,
  clearSessionCookie
};
