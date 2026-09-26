# Plataforma de licencias — Infotac

Estado: propuesta de arquitectura. Este archivo no activa rutas, licencias ni migraciones.

## Alcance

SuperAdmin separado de los usuarios de taller; administra altas de empresas vacías, vigencias y estados de licencia. La tabla operativa de empresa es `public.empresas`, identificada por `id` y `codigo_acceso`. `public.companies` existe, pero su papel aún no está aclarado: no se usará para licencias hasta revisar si es legado.

## Límites de seguridad

- El login de taller (`api/verify-password.js`, cookie `infotac_session`) no otorga privilegios de plataforma. No se añade `superadmin` a `public.usuarios`.
- Identidad de plataforma con Supabase Auth y TOTP; comprobar identidad permitida y `aal2` en el servidor antes de cada operación sensible. Sesión de plataforma separada y revocable.
- Ninguna operación de plataforma se ejecutará en Vercel Preview mientras sus credenciales compartan la base principal; habilitación explícita y denegación por defecto.
- Secretos solo en configuración segura, nunca en GitHub ni en logs. `main` y endpoints del taller permanecen intactos durante el desarrollo.

## Modelo propuesto, no aplicado

- `platform_private.platform_admins`: ID de usuario Auth autorizado, estado activo y fechas; la autorización no depende de datos editables por el taller.
- `platform_private.licenses`: `empresa_id` único hacia `public.empresas`, estado (prueba, activa, suspendida, vencida, cancelada), inicio y fin de vigencia, fecha de actualización. Fecha final nula solo cuando una regla explícita la permita.
- `platform_private.license_events`: historial inmutable de transición, actor, fecha, estado anterior/nuevo y motivo, sin secretos.
- `platform_private.platform_sessions`: sesiones opacas con identificador hash, vencimiento y revocación; almacenamiento seguro de tokens Auth si se necesitan renovaciones.
- Permisos mínimos y política RLS para el rol servidor dedicado; denegar acceso directo de `anon` y `authenticated`. Revisar grants reales antes de redactar SQL ejecutable.

## Operaciones previstas

- Lista y detalle de empresas con estado de licencia, fecha de expiración y eventos.
- Crear empresa vacía y licencia en una operación consistente, con código único, idempotencia y auditoría. No copiar clientes, órdenes ni usuarios existentes.
- Cambiar estado o vigencia con validación de transición, motivo obligatorio y registro de evento; no editar historial.
- Comprobar licencia en backend del taller antes de imponer una suspensión. Definir trato de sesiones existentes, período de gracia y modo de solo lectura antes de habilitar esta regla.

## Decisiones pendientes

1. Precio, moneda, método de cobro y si la gestión será manual o integrada: no se presuponen pagos automáticos.
2. Política de pruebas, vencimiento, gracia, suspensión y recuperación de datos.
3. Si un cliente podrá tener varias sedes o licencias: primera versión propone una licencia por `empresa_id`.
4. Revisar DDL, constraints, grants y políticas existentes; confirmar papel de `public.companies`.
5. Ensayar login, MFA, revocación, concurrencia, alta idempotente y aislamiento multiempresa antes de aplicar en producción.

## Entregas previstas

Primero revisión de migración SQL y tests; luego API de plataforma y panel; finalmente prueba controlada y activación. Cada modificación externa requiere confirmación específica.
