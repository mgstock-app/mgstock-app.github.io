# GestLok — relanzamiento seguro

## Alcance de esta rama
- Identidad general de **GestLok**: ingreso, cabecera, menú, metadatos, manifiesto, iconos de iOS/Android y estilo responsive.
- **Sin suscripciones, pagos, cobros ni prueba temporal.** El registro sigue sujeto a aprobación del equipo administrador.
- Directorio de proveedores asociado al catálogo existente de cada local.
- Chat interno por local con ruta de datos `<id_local>/chat`, sujeto a los permisos existentes de Supabase. Solo quienes pueden editar envían mensajes.
- Al trabajar sin conexión se mantiene el borrador de stock existente por local, y el mensaje de guardado aclara que debe revisarse al regresar si se cierra la app.
- Identidad visual por **cuenta**, no por rol: el logo de Mi Gusto aparece únicamente si el perfil autorizado contiene `logoId: "mi-gusto"`. **No asignar la marca a otras cuentas**. Evitar incrustar en el frontend correos personales.

## Protección de datos — requisito obligatorio
**No incorporar la cafetería ni otros negocios todavía a la tabla global de locales.**

La implementación actual de Supabase tiene `public.docs` y usa roles globales: `creadora` y `dueno` leen todos los locales. Lo comprobamos contra las políticas RLS activas de `docs`. Si se crea un local de otra empresa bajo esta estructura, la dueña de Mi Gusto podría acceder a información de esa empresa y viceversa si los privilegios se amplían. El chat nuevo también heredaría ese alcance.

Antes de habilitar a un comercio ajeno:
1. Diseñar un `business_id`/tenant_id inmutable y asignar los locales **Munro y Torcuato al tenant Mi Gusto** sin borrar ni recrear documentos.
2. Migrar cuentas y permisos a membresías por empresa. El rol dueño debe administrar solamente los locales de su empresa.
3. Hacer cumplir esa relación **en RLS de PostgreSQL**, no solo escondiendo botones; separar también el equipo, las importaciones y el chat.
4. Validar con pruebas reales y transacciones reversibles: dueña de Mi Gusto ve Munro/Torcuato y jamás otra empresa; cafetería no ve registros ni equipo de Mi Gusto; usuarios no aprobados no ven nada.
5. Incorporar la cafetería únicamente después de aprobar esos controles.

## Condiciones para merge a producción
- Ejecutar `npm run lint`, `npm test`, `npm run build`, Cypress y pruebas Android/iOS, incluso sin internet.
- Verificar login por Google y por contraseña, aprobación de altas, selector de local, conteos, importaciones, cambios y respaldos en **Munro y Torcuato**.
- Verificar que el chat en Munro no acceda al de Torcuato y que el usuario de solo lectura no pueda enviarlo.
- El logo de Mi Gusto deberá asignarse *solo* al perfil de Gisela mediante la opción administrativa validada; no usar el rol `dueno` como identificador.
- No cambiar el dominio de GitHub Pages, URL OAuth, base ni credenciales hasta planificar una migración de dominio sin pérdida de sesiones.
- Conservar el nombre técnico y el prefijo de caché existente para actualizar sin invalidar a otras aplicaciones, incluida ReciboNet.
- Hacer copia de respaldo antes de todo cambio de esquema; no eliminar ni reescribir registros reales.

## Funciones que requieren una fase adicional
- **Multiempresa comercial:** política RLS por empresa y migración controlada.
- **Sincronización offline avanzada:** cola durable por usuario y negocio, idempotencia, manejo de conflictos, pruebas de recarga y cambios simultáneos. En esta rama se conserva el borrador offline existente; NO prometer sincronización infalible tras cerrar la app.
- **Proveedores con contactos propios:** el directorio actual agrupa el campo proveedor de los productos. Una libreta de teléfonos, domicilios y contactos requerirá un modelo nuevo y validación de privacidad.
- **Personalización visual de perfil:** agregar controles administrativos para asignar marca por cuenta. No asignar logos desde configuración pública.

## Datos en vivo
No se ejecutaron migraciones SQL ni escrituras en tablas de negocio durante esta implementación. Solo se consultaron las políticas RLS para revisar la separación.
