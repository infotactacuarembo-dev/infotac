const bcrypt = require('bcryptjs');
const { supabase } = require('./_supabase');
const { readSession } = require('./_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  const session = readSession(req);
  if (!session) return res.status(401).json({ ok: false, error: 'Sesión requerida o vencida' });
  const { password } = req.body || {};
  if (!password || password.length < 6) return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres' });
  const hash = await bcrypt.hash(password, 10);
  const { error } = await supabase.from('usuarios').update({ password_hash: hash, debe_cambiar_password: false }).eq('id', session.user_id).eq('empresa_id', session.empresa_id);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.status(200).json({ ok: true });
};