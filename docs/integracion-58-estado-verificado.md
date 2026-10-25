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

## Cierre de verificación de esta sesión (25/10/2026)

Código revisado: `7af9a92e7e54a8ccab2c4886cb4d0738ed43b052`, PR #62.

- Lint, 128 pruebas Node y build: aprobados en GitHub Actions. Las huellas SHA-256 ya no fallan.
- SQL: matriz de permisos con datos ficticios y rollback, respaldos, conservación posterior y Administradora General de origen: aprobados. No equivale a probar todos los roles y recorridos de autenticación reales.
- Cypress [ejecución 40229110011](https://github.com/mgstock-app/mgstock-app.github.io/actions/runs/40229110011): **92/93 aprobadas**. Las tres pruebas nuevas del inicio y las suites Proveedores/observaciones/PDF/historial/PWA pasaron.
- Falla pendiente: `qa/cypress/e2e/ingreso.cy.js:100`, escenario «avisa si el archivo ya se importó, cancelar no guarda nada y la hoja muestra el stock real». Después de volver a cargar el CSV y elegir los productos, `#ing-ok` permanece deshabilitado. No se eliminó ni se relajó esa prueba; falta determinar y corregir la causa.
- El primer fallo de la prueba nueva del inicio era un selector ambiguo (tarjeta y botón); se corrigió el selector y las tres pruebas nuevas ahora pasan.
- Se intentó instalar Cypress localmente para reproducir el bloqueo; el binario descargado estaba incompleto (ZIP inválido). La ejecución integral válida es la de GitHub, cuyo fallo se conserva.
- **No fusionar ni desplegar este PR mientras haya un fallo.** Esta etapa no fue publicada; la versión pública sigue siendo la anterior de main. Los cambios de backend de solo lectura, los respaldos privados y la invitación segura sí quedaron aplicados según los apartados anteriores.

### Primer paso de la próxima sesión

Reproducir la segunda carga del remito con datos ficticios y observar `#ing-bloqueo`, destinos pendientes y selección de productos durante la actualización asíncrona. Corregir la causa preservando protección contra duplicados e idempotencia; ejecutar nuevamente lint, Node, build y las 93 pruebas Cypress. Solo con resultado íntegro aprobado, fusionar #62 y verificar el despliegue Pages y los archivos servidos. Después continuar con el puente de identidades y los pendientes de integración enumerados arriba. Mantener abierta #58.

## Sesión del 25/10/2026 (tarde) · PR #64

PR #64 reemplaza a #62 y #63 (incluye sus commits y el último `main`).

### Qué quedó implementado
- **Inicio de dueños con dos carpetas** con el diseño de la referencia de #63 («Bienvenido/a a GESTLOK», «Administrar mi empresa», «Administrar a los empleados»), sobre el contexto verificado en backend de #62. Empleados aparece solo si el backend lo autoriza; no hay carpetas decorativas.
- **Módulo `/empleados/` dentro de GESTLOK** (`modules/empleados`): cliente de ReciboNet del commit `5db34b8`, exportado como páginas estáticas en la misma dirección e instalación PWA, con barra GESTLOK. Reutiliza el motor original de planillas, liquidaciones, horarios, recibos, PDF/WhatsApp, historial y enlaces. El backend de ReciboNet no cambió: sus RPC y RLS siguen siendo la barrera. Sin migraciones ni documentos internos copiados (tienen datos personales).
- **Habilitación por empresa** (`gestlok_employee_module_entitlement`, aplicada): `company_modules`, `recibonet_links`, `admin_audit` privados. `gestlok_owner_area_context` autoriza empleados solo con vínculo verificado **y** habilitación de la creadora. Tabla «Módulos autorizados» en el panel de creadora, con confirmación y registro.
- **Vínculo verificado Mi Gusto ↔ Alessandro 2026002** registrado (`recibonet_links`, auditoría `recibonet_linked`). Evidencia: Martín es dueño de la organización 2026002 en ReciboNet y está preautorizado como dueño de Mi Gusto en GESTLOK; Munro y Torcuato (`dt`) en ambos; 17 planillas. No se renombró ni movió nada: el nombre interno «Alessandro» se muestra como «Mi Gusto» solo en pantalla.
- **Creadora en solo lectura por defecto** (`gestlok_creator_readonly_default`): disparadores por sentencia bloquean sus escrituras en datos operativos de la empresa (también por funciones privilegiadas como los remitos) salvo que habilite la edición 30 minutos con motivo. Altas y permisos del equipo siguen disponibles y quedan auditados.
- **Remitos**: una lectura de archivo vieja ya no pisa la revisión del archivo nuevo (causa probable del fallo intermitente de `ingreso.cy.js:100`).
- Supabase ReciboNet: se agregó `https://mgstock-app.github.io/empleados/**` a Redirect URLs (con autorización de la usuaria). Site URL y proveedores sin cambios.

### Verificaciones con datos reales (solo lectura o revertidas)
- GESTLOK: huella SHA-256 de los 357 documentos idéntica antes y después de las migraciones y del vínculo.
- Gerentes reales (3 de Munro, 1 de Torcuato): ven solo su local, no modifican ni insertan en el otro, no obtienen el contexto de dueño ni pueden habilitar módulos.
- ReciboNet con RLS real: Martín ve las 17 planillas y 223 documentos de 2026002; la Administradora General también; otro dueño y un gerente de otra empresa ven 0.

### Pendiente
- Primer ingreso de Martín a GESTLOK (Google, batallinim@gmail.com) y luego al módulo con su Google de ReciboNet.
- Gisela no tiene cuenta en ReciboNet: debe entrar al módulo con una cuenta Google y unirse como dueña con «ID de empresa + código privado» (Empresas → Invitar a otro dueño).
- Ingreso con dos sesiones (GESTLOK y ReciboNet son proyectos Supabase distintos): una sola vez por dispositivo. Un inicio de sesión único requiere unificar la autenticación de ambos proyectos.
- Pruebas físicas Android/iPhone de la PWA y del regreso de Google dentro de la app instalada (en iOS el almacenamiento de la PWA es independiente de Safari).
- Restauración independiente de ReciboNet en un proyecto aislado antes de retirarlo. ReciboNet sigue activo.
