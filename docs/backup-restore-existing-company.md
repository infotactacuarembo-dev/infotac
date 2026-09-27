# InfoTac: respaldo cifrado para empresa existente (diseño, no operativo)

Este documento no activa exportación, importación ni cambia la base de datos. No reemplaza los botones actuales.

## Alcance
- Solo restaurar en una empresa existente con administrador activo validado contra la base. Rechazar empresa distinta.
- Clientes, órdenes, ítems y pagos mantienen sus IDs; la auditoría histórica no se borra. Validar todas las referencias antes de escribir.
- Los usuarios en el respaldo sirven como referencias por ID: no crear, borrar ni modificar cuentas, roles, estado o password_hash. Rechazar IDs de usuarios inexistentes.
- Mantener el codigo_acceso, credenciales y logo existentes; el archivo de logo no está respaldado. Esta función no permite recuperar una base perdida.
- Archivo nuevo cifrado y versionado, separado del JSON heredado de órdenes. No conectarlo a botones hasta probar exportación y restauración.

## Requisitos para implementar
- Validar sesión y administrador activo en cada endpoint; comprobar empresa, formato, columnas permitidas, tamaños, IDs únicos y relaciones en servidor y base.
- Exportar una instantánea consistente; no descargar nada si falla la lectura. El JSON puede contener ordenes.pass y es sensible.
- Restaurar en una única transacción, con bloqueo por empresa y rollback si falla cualquier paso. No borrar auditorías existentes.
- Revocar EXECUTE de funciones sensibles a PUBLIC, anon y authenticated; permitir solo el rol servidor necesario.
- Probar con base aislada datos ficticios, rollback real, concurrencia, clave incorrecta y archivo alterado antes de desplegar.

## Estado
Solo diseño. Ningún SQL de restauración ha sido ejecutado ni validado en Postgres.
