import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  const { password, newPassword } = req.body;

  if (!password || !newPassword) {
    return res.status(400).json({
      error: 'Faltan datos. Envíe "password" y "newPassword".'
    });
  }

  if (newPassword.trim().length < 10) {
    return res.status(400).json({
      error: 'La nueva contraseña debe tener al menos 10 caracteres.'
    });
  }

  const { data: config } = await supabase
    .from('configuracion')
    .select('valor')
    .eq('clave', 'password_taller')
    .single();

  const valor = config?.valor;
  if (!valor) {
    return res.status(500).json({
      error: 'No hay contraseña configurada en el sistema.'
    });
  }

  const coincide = valor === require('bcryptjs').hashSync(password, valor);

  if (!coincide) {
    const ip =
      req.headers['x-forwarded-for']?.split(',')[0] ||
      req.headers['x-real-ip'] ||
      'desconocida';

    await supabase.from('password_changes').insert({
      resultado: 'fallo',
      ip,
      detalle: 'Contraseña actual incorrecta'
    });

    return res.status(401).json({
      error: 'Contraseña actual incorrecta.'
    });
  }

  const nuevoHash = require('bcryptjs').hashSync(
    newPassword.trim(),
    10
  );

  const { error: updateError } = await supabase
    .from('configuracion')
    .update({
      valor: nuevoHash,
      password: null
    })
    .eq('clave', 'password_taller');

  if (updateError) {
    return res.status(500).json({
      error: 'No se pudo actualizar la contraseña.'
    });
  }

  const ip =
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    'desconocida';

  await supabase.from('password_changes').insert({
    resultado: 'exito',
    ip,
    detalle: 'Contraseña cambiada correctamente'
  });

  return res.status(200).json({
    success: true,
    message: 'Contraseña cambiada correctamente.'
  });
}
