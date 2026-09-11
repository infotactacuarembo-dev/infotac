function limpiarTexto(value, maximo) {
  if (value === null || value === undefined) return '';

  return String(value).trim().slice(0, maximo);
}

function esUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function limpiarDatos(value) {
  if (!value || typeof value !== 'object') return null;

  const datos = { ...value };

  // Nunca guardar claves, contraseñas o secretos técnicos del equipo.
  delete datos.pass;
  delete datos.password;
  delete datos.password_hash;
  delete datos.clave;

  return datos;
}

async function registrarAuditoriaOrden(
  supabase,
  user,
  evento
) {
  const ordenId = limpiarTexto(evento && evento.orden_id, 200);
  const empresaIdEvento = limpiarTexto(
    evento && evento.empresa_id,
    100
  );
  const empresaIdSesion = limpiarTexto(
    user && user.empresa_id,
    100
  );
  const accion = limpiarTexto(evento && evento.accion, 80);
  const detalle = limpiarTexto(evento && evento.detalle, 2000);

  if (!ordenId || !accion) {
    console.error(
      'orden_audit omitido: faltan orden_id o accion.'
    );
    return;
  }

  if (!esUuid(empresaIdSesion)) {
    console.error(
      'orden_audit omitido: empresa de sesión inválida.'
    );
    return;
  }

  if (
    empresaIdEvento &&
    empresaIdEvento !== empresaIdSesion
  ) {
    console.error(
      'orden_audit omitido: empresa del evento no coincide con la sesión.'
    );
    return;
  }

  const payload = {
    orden_id: ordenId,
    empresa_id: empresaIdSesion,
    actor_id: esUuid(user && user.id) ? user.id : null,
    actor_identificador: limpiarTexto(
      user && user.identificador,
      160
    ),
    actor_rol: limpiarTexto(user && user.rol, 40),
    accion: accion,
    detalle: detalle,
    datos_anteriores: limpiarDatos(
      evento && evento.datos_anteriores
    ),
    datos_nuevos: limpiarDatos(
      evento && evento.datos_nuevos
    )
  };

  const { error } = await supabase
    .from('orden_audit')
    .insert(payload);

  if (error) {
    console.error('orden_audit error:', error);
  }
}

module.exports = {
  registrarAuditoriaOrden
};
