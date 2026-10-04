const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false }
});

module.exports = { supabase };