# Integración #58 · continuidad y límites del bloque

## Implementación del PR #62

- Corrige las huellas SHA-256 de app.js y CSS después de revisar los cambios. Conserva todas las pruebas.
- Sustituye la carpeta Empleados ficticia («Próximamente») por un inicio que consulta capacidades en backend. Actualmente el área comercial existente está operativa; Empleados se oculta porque su servicio todavía no está integrado. No anunciar dos áreas funcionales.
- `gestlok_owner_area_context` deriva empresa y locales de la identidad verificada, membresía y reglas existentes de acceso. No lee autorizaciones desde user_metadata ni desde la selección del registro. No acepta empresa/usuario de destino por parámetro. No crea nuevos permisos efectivos de módulos.
- Mantiene el logo Mi Gusto asignado en Equipo, la empresa y sus dos locales. La demo utiliza el mismo inicio con capacidades ficticias en memoria, sin consultar datos reales.
- Nuevo registro administrativo: lista empresas, locales y cantidad de dueños asignados. Solo información general, sin recibos, productos, datos de colaboradores ni acciones de modificación. Requiere la identidad aprobada en el registro privado de administradores; un rol visual no concede acceso.

## Respaldos efectivamente comprobados

Se creó un esquema privado `gestlok_integration_backup` en las dos bases confirmadas. No es accesible por los clientes anon/authenticated/service_role. El operador creó instantáneas y verificó cada conjunto mediante restauración en tablas temporales, comparación íntegra JSON, SHA-256 y conteos:

- ReciboNet: 38 tablas, 741 filas.
- GESTLOK: 18 tablas, 360 filas.

Incluye las filas de la aplicación, columnas, índices, restricciones, políticas, definiciones de funciones y vistas. No copia contraseñas ni credenciales de Auth. No representa una exportación independiente ni una restauración completa de esquema/Auth/Storage en otro proyecto. Todavía falta esa prueba antes de retirar ReciboNet. No ejecutar un restore destructivo a partir de estos scripts.

Código del procedimiento: `scripts/recibonet/verified-database-snapshot.sql`. La primera llamada conjunta devolvió error de estado expirado del conector; se comprobó que no había cambios parciales. Se dividieron definición y captura, y ambas capturas terminaron y se verificaron.

## Correspondencia Mi Gusto / Alessandro

Se contrastaron los registros reales en las dos bases, además de la instrucción explícita de la usuaria:

- La empresa comercial existente de Mi Gusto tiene Munro y Torcuato y su dueña verificada con logo asignado.
- ReciboNet tiene la organización Alessandro, número visible 2026002; su propietario verificado corresponde al co-dueño indicado por la usuaria. Munro semanal y Torcuato mensual pertenecen a esa organización y a una sola compañía de recibos. Hay 17 planillas de esa organización.
- El identificador original de Torcuato en ReciboNet es `dt`; en stock es `torcuato`. No se renombraron IDs ni se copiaron datos entre proyectos.
- Después del respaldo se preautorizó al co-dueño solicitado como Dueño del MISMO tenant comercial. No se creó empresa, no se creó cuenta Auth, no se cambió contraseña. Conserva el logo de la empresa. La misma operación es idempotente y rechaza otra asignación existente.
- Confirmación posterior: una sola empresa compartida, dos asignaciones de dueño, y los 350 documentos anteriores exactamente iguales. Solo se agregó la invitación de co-dueño. Sus datos de ReciboNet no cambiaron.
- Esto NO une todavía los UUID de Auth de ambos proyectos. El co-dueño debe realizar su primer ingreso verificado a GESTLOK; la vinculación de identidades de origen/destino continúa pendiente. No afirmar que su sesión de ReciboNet fue migrada.

## Administradora General de ReciboNet

Se verificó mediante transacción READ ONLY que la identidad real de Administradora General tiene autorización de backend y puede consultar las 17 planillas sin ingresar como los dueños. La ausencia de filas en owner_support_access NO implica que esa administradora carezca de permiso: existe el control específico is_general_administrator, aprobado por identidad y registro privado.

Ese permiso no puede sustituirse por el rol visual de GESTLOK, ni se debe transmitir un JWT de un proyecto al otro como si fueran intercambiables. El portal nuevo solo expone metadatos; todavía no se implementó el puente de sesión y consultas de ReciboNet, ni la restricción de solo lectura por defecto para ese puente.

## Pendientes y bloqueos concretos

1. Implementar el puente de identidades autenticadas entre los dos proyectos, con mapeo explícito de UUID y empresas/locales y autorización por acción. Evitar un enlace simple, credenciales copiadas o acceso basado solo en email.
2. Implementar concesión y revocación efectivas de módulos por empresa en TODOS los endpoints/RLS; el contexto actual solo proyecta el acceso comercial existente y no habilita recibos.
3. Integrar de verdad las pantallas y contratos originales de horarios, planillas, recibos, liquidaciones, personal, enlaces e historial. Conservar cálculos originales y exportaciones. Las 17 planillas siguen en ReciboNet.
4. Para creadora, construir consultas privadas autorizadas y acceso de escritura explícito respaldado en servidor. El registro administrativo de este bloque es únicamente de información general.
5. Verificar restauración independiente, identidades, aislamiento completo, reglas de turnos/horas/pagos y todas las exportaciones integradas.
6. Cypress y vista móvil no equivalen a verificar Android/iPhone físicos. Pendientes dispositivos reales, Safari/iOS, instalación y actualización PWA. Las correcciones publicadas de Proveedores, PDF, historial, sugerido y observaciones deben seguir en la suite integral.

No apagar ni eliminar ReciboNet. No marcar #58 como completada. La publicación de este bloque queda condicionada a lint, Node, build y Cypress aprobados. Reportar el resultado real en #58 y el PR #62.
