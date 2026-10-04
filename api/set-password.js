const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function readSession(req) {
  const raw = req.headers.cookie || '';
  const found = raw.split(';').map(v => v.trim()).find(v => v.startsWith('taller_session='));
  if (!found) return null;
  try {
    return JSON.parse(decodeURIComponent(found.split('=').slice(1).join('=')));
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });

  const session = readSession(req);
  if (!session) return res.status(401).json({ ok: false, error: 'Sesión requerida o vencida' });

  const { currentPassword, newPassword, password } = req.body || {};
  const nuevaPassword = newPassword || password;

  if (!nuevaPassword || nuevaPassword.length < 6) {
    return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const hash = await bcrypt.hash(nuevaPassword, 10);
  const { error } = await supabase
    .from('usuarios')
    .update({ password_hash: hash, debe_cambiar_password: false })
    .eq('id', session.user_id)
    .eq('empresa_id', session.empresa_id);

  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.status(200).json({ ok: true });
};
