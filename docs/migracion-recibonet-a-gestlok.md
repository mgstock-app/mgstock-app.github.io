# Migración de ReciboNet a GESTLOK (independizar «Administrar a los empleados»)

Pedido (25/10/2026): que GESTLOK tenga toda la información y deje de depender de ReciboNet.
Regla: no borrar ni modificar nada en ReciboNet hasta verificar la copia. ReciboNet queda intacto como respaldo.

## Inventario (solo lectura, proyecto «Reporte Mensual Mi gusto», gpdrqxnqtofkkkqjsdqw)
- 17 tablas `public.rm_*` (filas: directory 6, images 9, local 5, settings 7, companies 4, manager_permissions 2,
  organization_admins 1, organization_members 5, organizations 4, schedules 2, test_documents 255, test_members 6,
  test_permissions 18, test_report_access 1, test_report_views 4, schedule_comments 0, test_registrations 0).
- Esquema privado `rm_test_private`: 21 tablas (auditorías, copias, invitaciones, códigos de dueño, vínculos) y 75 funciones.
- 53 funciones RPC públicas (envoltorios), 22 triggers, políticas RLS por organización.
- 6 usuarios en Auth (5 con Google). Solo 2 existen también en GESTLOK.

## Decisiones (confirmadas por la usuaria)
1. Imágenes de informes (9, ~1,3 MB): copiarlas y verificar huella por imagen.
2. Personas que solo existen en ReciboNet: no se crean cuentas ni se tocan contraseñas. Se vinculan por mail verificado al primer ingreso.

## Diseño
- Mismos nombres de tablas/RPC (`public.rm_*`, `rm_test_private`) en el proyecto GESTLOK (vgsepaaewbctjsjcpeta) para no reescribir el cliente.
- Identidad: `rm_test_private.uid()` devuelve el id que tenía la persona en ReciboNet (tabla `identity_map` por mail verificado)
  o `auth.uid()` si es nueva. Se sustituye `auth.uid()` por esa función. Se quitan las FK a `auth.users`.
- Corte: recién cuando la copia esté verificada (conteos + huellas) se cambia el cliente a GESTLOK. ReciboNet no se apaga ni borra en esta etapa.

## Etapas
1. Esquema (tablas, índices, políticas, triggers, funciones) en GESTLOK, vacío. [en curso: inventario completo; falta portar y aplicar]
2. Copia de datos con conteos y huellas por tabla. [pendiente]
3. Pruebas de seguridad/aislamiento (SQL revertible) y de equivalencia de resultados. [pendiente]
4. Cliente `/empleados/` apuntando a GESTLOK (sesión compartida). [pendiente]
5. Verificación con Gisela y Martín; recién después, decidir retiro de ReciboNet (borrado solo con confirmación expresa). [pendiente]

## Hallazgos de seguridad que obligan a adaptar (no es una copia mecánica)
- `rm_test_private.app_role()` exige identidad Google en `auth.identities` y directorio `approved`. En GESTLOK Gisela ingresa con mail y
  contraseña (sin Google): hay que aceptar mail confirmado de GESTLOK como identidad válida, manteniendo el resto de las comprobaciones.
- `is_general_administrator()` está fijada al mail de la creadora; en GESTLOK debe apoyarse en `gestlok_platform.admins` (sin ampliar privilegios).
- `activate_preapproved_shared_owner()` y `assign_confirmed_member()` (trigger sobre `auth.users`) dependen de la tabla de usuarios de ReciboNet.
- `provision_preset_owner_locals()` tiene un mail fijo (Martín): revisar que siga haciendo solo lo previsto.
- 105 usos de `auth.uid()` y 4 de `auth.users` en funciones privadas; 12 FK hacia `auth.users` a quitar (la identidad pasa por `identity_map`).
- Las 21 tablas privadas incluyen copias de seguridad históricas de ReciboNet (jsonb): decidir si se copian completas.
- Las fuentes de las 75 funciones se pueden volver a extraer del catálogo de ReciboNet con `pg_get_functiondef` (solo lectura).

## Próximo paso
Portar las 75 funciones privadas con `rm_test_private.uid()` y la identidad adaptada, aplicar como migración en GESTLOK
(tablas vacías), y escribir `supabase/tests/recibonet-aislamiento.sql` (revertible) antes de copiar un solo dato.
