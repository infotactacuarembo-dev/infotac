const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const FALLBACK = 'infotac2026';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { password } = req.body || {};
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ ok: false, error: 'Falta password' });
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      // Sin config de backend: usar fallback local
      return res.status(200).json({ ok: password === FALLBACK, source: 'fallback' });
    }

    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'password_taller')
      .single();

    if (error || !data || !data.valor) {
      return res.status(200).json({ ok: password === FALLBACK, source: 'fallback' });
    }

    const stored = data.valor;
    let valid;
    if (stored.startsWith('$2')) {
      valid = bcrypt.compareSync(password, stored);
    } else {
      // Compatibilidad con datos viejos en texto plano
      valid = password === stored;
    }

    if (!valid && password === FALLBACK) {
      valid = true;
    }

    return res.status(200).json({ ok: valid, source: 'db' });
  } catch (e) {
    console.error('verify-password error', e);
    return res.status(200).json({ ok: false, error: 'internal_error' });
  }
};
