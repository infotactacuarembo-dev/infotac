"use strict";
// Standalone review module. No route uses this until import/export are implemented.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TABLES = ["clientes", "usuarios", "ordenes", "orden_items", "pagos", "orden_audit"];
const MAX_ROWS = 10000;
const MAX_BYTES = 15 * 1024 * 1024;
const FIELDS = {
  empresa: "id nombre direccion telefono rut email whatsapp logo_url created_at nombre_comercial country_code country state_region city postal_code address_line1 address_line2 tax_id_type tax_id website updated_at zona_horaria",
  clientes: "id nombre whatsapp created_at empresa_id",
  usuarios: "id identificador rol creado_en activo empresa_id",
  ordenes: "id fecha cliente tel tipo serie pass sena falla presupuesto presupuesta estetico estado fecha_entrega cliente_id diagnostico trabajo_realizar aprobacion_presupuesto empresa_id pago_final tecnico_id created_at vista_por_tecnico_en terminado_en fecha_prometida_entrega presupuesto_detalle motivo_devolucion",
  orden_items: "id orden_id tipo descripcion cantidad precio_unitario creado_en empresa_id",
  pagos: "id orden_id monto fecha notas creado_en empresa_id",
  orden_audit: "id creado_en orden_id empresa_id actor_id actor_identificador actor_rol accion detalle datos_anteriores datos_nuevos"
};
const ALLOWED = Object.fromEntries(Object.entries(FIELDS).map(([t, f]) => [t, new Set(f.split(" "))]));
const TOP = new Set(["kind", "schema_version", "empresa_id", "exported_at", "empresa", ...TABLES]);
function validate(input, empresaId, existingUserIds) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(k => !TOP.has(k)) ||
      input.kind !== "infotac-restore-existing-v1" || input.schema_version !== 1 ||
      typeof empresaId !== "string" || !UUID.test(empresaId) ||
      input.empresa_id !== empresaId || !input.empresa || input.empresa.id !== empresaId)
    throw new Error("Formato o empresa inválidos");
  if (existingUserIds !== undefined && !(existingUserIds instanceof Set))
    throw new Error("Usuarios destino inválidos");
  if (Buffer.byteLength(JSON.stringify(input), "utf8") > MAX_BYTES)
    throw new Error("Paquete demasiado grande");
  function rowCheck(row, table) {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        Object.keys(row).some(k => !ALLOWED[table].has(k)))
      throw new Error("Campo inválido: " + table);
  }
  rowCheck(input.empresa, "empresa");
  const ids = {};
  for (const table of TABLES) {
    const rows = input[table];
    if (!Array.isArray(rows) || rows.length > MAX_ROWS)
      throw new Error("Tabla inválida: " + table);
    ids[table] = new Set();
    for (const row of rows) {
      rowCheck(row, table);
      if (row.empresa_id !== empresaId || typeof row.id !== "string" ||
          !UUID.test(row.id) || ids[table].has(row.id))
        throw new Error("Fila inválida: " + table);
      ids[table].add(row.id);
    }
  }
  if (existingUserIds && input.usuarios.some(row => !existingUserIds.has(row.id)))
    throw new Error("Usuario inexistente en destino");
  for (const row of input.ordenes) {
    if ((row.cliente_id != null && !ids.clientes.has(row.cliente_id)) ||
        (row.tecnico_id != null && !ids.usuarios.has(row.tecnico_id)))
      throw new Error("Relación de orden inválida");
  }
  for (const table of ["orden_items", "pagos", "orden_audit"]) {
    for (const row of input[table]) {
      if (typeof row.orden_id !== "string" || !ids.ordenes.has(row.orden_id))
        throw new Error("Orden referenciada ausente: " + table);
      if (table === "orden_audit" && row.actor_id != null && !ids.usuarios.has(row.actor_id))
        throw new Error("Actor referenciado ausente");
    }
  }
  return true;
}
module.exports = { validate, FIELDS };
