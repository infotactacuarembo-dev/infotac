const crypto = require('crypto');

function readSession(req) {
  const header = req.headers.cookie || "";

  console.log("Cookie header recibido:", Boolean(header));
  console.log(
    "Nombres de cookies recibidas:",
    header
      .split(";")
      .map(function (parte) {
        return parte.trim().split("=")[0];
      })
      .filter(Boolean)
  );

  const cookies = header.split(";").reduce((resultado, parte) => {
    const indice = parte.indexOf("=");

    if (indice === -1) {
      return resultado;
    }

    const nombre = parte.slice(0, indice).trim();
    const valor = parte.slice(indice + 1).trim();

    resultado[nombre] = valor;
    return resultado;
  }, {});

  const raw = cookies.taller_session;

  console.log("taller_session recibida:", Boolean(raw));

  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(decodeURIComponent(raw));

    console.log("Sesión tiene user_id:", Boolean(session.user_id));
    console.log("Sesión tiene empresa_id:", Boolean(session.empresa_id));
    console.log("Sesión tiene exp:", Boolean(session.exp));
    console.log(
      "Sesión vencida:",
      Number(session.exp) < Date.now()
    );

    if (
      !session ||
      !session.user_id ||
      !session.empresa_id ||
      !session.exp ||
      Number(session.exp) < Date.now()
    ) {
      return null;
    }

    return session;
  } catch (error) {
    console.error("Error leyendo taller_session:", error.message);
    return null;
  }
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

