# Registro por módulos · #58

Implementación del pedido del 25/10/2026: un dueño puede solicitar Administración de empleados, Administración de su empresa o Ambas. La selección comercial corresponde a `comercial`; empleados corresponde a `recibos_personal`. La elección no crea una cuenta de dueño aprobada ni concede acceso a datos.

## Recorrido

- Registro por email: exige indicar Dueño/a o Colaborador/a. Dueños eligen una de las tres opciones. La preferencia viaja como dato de registro, y se valida y guarda en backend después de confirmar el correo e iniciar sesión.
- Primer ingreso por Google sin asignación: la pantalla pendiente permite elegir y guardar la misma solicitud. No cambia el OAuth existente.
- El servidor usa la identidad de una cuenta verificada; no acepta email, empresa o usuario de destino suministrado por el cliente. `user_metadata` solo sirve como preferencia inicial, nunca para autorización.
- La solicitud persiste en una tabla privada separada. Un usuario puede consultar su solicitud, corregirla y reenviarla si fue rechazada. Solo la creadora puede listar y revisar las solicitudes de todos.
- La creadora ve la opción elegida. Una solicitud de dueño no se aprueba como gerente de locales existentes. Las solicitudes de colaborador conservan la asignación manual de rol/local existente; se cierran solo después de que el acceso se haya asignado.

## Backend y seguridad

Nueva tabla `gestlok_platform.registration_requests`, con RLS y sin acceso directo de `anon` ni `authenticated`. RPC de solicitud/consulta propia y RPC exclusivos de creadora para listado/revisión. No se modifican las políticas de datos comerciales ni las cuentas aprobadas, ni el backend de ReciboNet.

Se detectó que `pedir_acceso` no admite nuevas personas sin empresa por el trigger de tenant. La nueva cola evita ese bloqueo y no inserta la solicitud dentro de la empresa de otra persona. No se desactiva ni relaja el trigger.

Pruebas SQL en `supabase/tests/registration-module-requests.sql`: fixtures ficticios, transacción y rollback; tres opciones, validaciones, correo confirmado, suplantación, visitante, lectura propia, bloqueo de autoaprobación y revisión exclusiva de creadora. Cypress cubre formulario de email, pantalla de primer ingreso, guardado fallido/reintento, panel, rechazo de dueño y asignación de colaborador. No se envían correos reales desde las pruebas.

## Alcance de esta publicación

Este cambio publica **la elección y gestión de solicitudes**. No habilita aún el funcionamiento de ReciboNet dentro de GESTLOK ni los permisos efectivos de módulos por empresa. La solicitud de empleados o ambas permanece pendiente de esa integración, respaldos completos y pruebas. No presentar la migración total como terminada ni habilitar automáticamente `recibos_personal`.

Continuar la integración funcional desde `docs/recibonet-inventario-58.md`. Conserva Munro y Torcuato y sus permisos existentes. La tabla nueva no contiene datos previos migrados. Los fixtures de prueba se revierten.

## Reversión

Puede revertirse el frontend al commit anterior y conservar la cola privada. No eliminar la tabla si recibió solicitudes reales. Las nuevas funciones no sustituyen a las funciones existentes de acceso o datos. La publicación se realiza después de aprobar las pruebas; la migración aditiva se aplica antes del frontend.
