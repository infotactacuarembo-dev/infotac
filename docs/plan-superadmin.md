# Plan de implementación: superadmin y licencias

Estado: diseño, no despliegue. Este documento no aplica migraciones ni modifica las rutas existentes del taller.

## Separación de acceso

- El operador de la plataforma usa Supabase Auth y una lista privada de administradores activos; nunca se deduce este privilegio del rol de `public.usuarios` del taller.
- El panel se sirve por rutas propias; cada solicitud de su API verifica identidad y autorización en el servidor. La clave privilegiada permanece solo en el servidor.
- Los talleres continúan usando la autenticación y API existentes hasta que una fase posterior, aprobada y probada, incorpore controles de licencia.

## Modelo de datos propuesto

- `platform_private.platform_admins`: `auth_user_id` (referencia a `auth.users`), `active`, marcas de tiempo.
- `platform_private.licenses`: `id`, `empresa_id` (FK única a `public.empresas`), estado, inicio, fin opcional, marcas de tiempo.
- `platform_private.license_events`: licencia, actor, estado previo/nuevo, motivo y fecha. Un cambio de estado y su evento deben confirmarse o revertirse juntos.
- Estados sugeridos: `trial`, `active`, `suspended`, `expired`, `cancelled`; aún faltan reglas de transición, renovaciones y caducidad.

## Seguridad y pruebas previas

1. Confirmar que el esquema privado no esté expuesto por la Data API; revisar privilegios de esquema, tablas, funciones y valores predeterminados para objetos futuros. Activar RLS como defensa adicional.
2. No permitir escritura directa de eventos desde rutas generales. Limitar `UPDATE` y `DELETE` y auditar cambios; un trigger no protege ante el propietario o superusuario de la base.
3. Alta de empresa vacía y licencia inicial en transacción, con identificador idempotente decidido antes de implementar; no asumir que nombre o correo son únicos.
4. Probar que invitados, usuarios de taller y administradores inactivos no acceden a datos privados; probar que falla toda la transacción si no se registra el evento.
5. Revisar que ningún secreto administrativo se incluya en código cliente o commits.

## Orden de trabajo

1. Auditar permisos reales de Supabase mediante consulta de solo lectura autorizada.
2. Revisar y probar migración en entorno aislado, no en producción. El borrador SQL inicial no es apto para ejecutar sin correcciones.
3. Implementar rutas privadas y panel mínimo en esta rama; probar autorización en cada operación.
4. Revisar diferencias y solicitar aprobación específica antes de cada cambio externo o despliegue.

No se crea un usuario superadmin ni se activan licencias por el mero hecho de agregar este documento.
