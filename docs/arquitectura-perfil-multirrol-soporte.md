# GESTLOK — perfil multiempresa, multirrol y soporte universal

## Invariantes de acceso
- Una identidad Google confirmada puede tener **múltiples membresías**. Nunca sobrescribir su rol global para darle otro rol en una empresa.
- Cada membresía se identifica por (auth_user_id, organization_id, company_id, local_id, role). El rol `owner` puede tener ámbito de empresa, y `manager`/`employee` de local. Una persona puede acumular roles y locales.
- El contexto activo de perfil solo selecciona una membresía **ya autorizada en el servidor**; cambiar un selector en el navegador jamás confiere permisos.
- Al cambiar empresa/local/rol, invalidar cachés, consultas, formularios, colas offline y suscripciones del contexto anterior. La cola offline debe incluir tenant, local y usuario y volver a verificar permisos al sincronizar.
- No tocar ni borrar roles, legajos, recibos, hojas ni invitaciones anteriores durante la migración. Migrar primero a tabla de membresías paralela, validar, y recién después retirar la restricción antigua de una sola organización/rol por usuario.

## Recibo privado del gerente
- El gerente conserva todos los permisos de gerente para el local donde está autorizado.
- Tiene adicionalmente acceso en **solo lectura** a su propio recibo (por turnos o por horas), sin permiso de modificarlo, enviarlo como si fuera otro usuario, ni leer el recibo de otros.
- La autorización del recibo se decide por `auth.uid()` y una vinculación verificada a su legajo/hoja. No alcanza con elegir un `sheet_id` o `employee_id` por URL.
- Si la misma persona es gerente de dos locales, puede tener dos legajos y dos recibos separados. No se combinan automáticamente.

## Ejemplo de aceptación
- `camilab.lopez99@gmail.com` es dueña de Perfumería y gerente en Mi Gusto Munro y Don Torcuato.
- En Mi perfil aparecen Perfumería · Dueña; Mi Gusto · Munro · Gerente; Mi Gusto · Don Torcuato · Gerente.
- Puede pasar de un espacio a otro sin cambiar de cuenta; cada pantalla solo muestra el ámbito elegido.
- En Munro ve su recibo Munro en lectura y gestiona colaboradores Munro. En Don Torcuato ocurre lo mismo. En Perfumería tiene funciones de dueña.
- Los permisos de Mi Gusto no se heredan en Perfumería ni viceversa.
- Un gerente puede ser colaborador de otro local o empresa sin que una asignación elimine la otra.
- Las invitaciones automáticas existentes no deben rechazar a un usuario que ya tenga un rol en otra empresa; el nuevo alta debe añadir una membresía y nunca reemplazar la anterior.

## Botón de soporte universal
- Componente único en el shell autenticado: visible en todas las pantallas de todas las empresas y locales, en roles owner, manager, employee y administradora.
- Posición fija inferior derecha, tamaño móvil accesible y respetar área segura; no tapar navegación inferior ni botones de guardar.
- Etiqueta y acción `Soporte`, icono de ayuda; abrir panel de contacto WhatsApp con texto que incluye empresa/local activos sin datos privados del colaborador.
- El número de WhatsApp lo configura la administradora general, nunca se incrusta un número personal en el código.
- Si el número no está configurado, mostrar estado no disponible; no abrir un enlace inventado.
- Tests: aislamiento multiempresa, selector y permisos servidor, recibo propio lectura, cambio de contexto con offline, soporte en cada rol y pantalla móvil.

## Publicación segura
La base actual de ReciboNet usa `rm_test_members` y `rm_organization_members` con un registro por usuario. La integración necesita migración de esquema, nuevas funciones RLS/RPC y cambios coordinados en AuthProvider, HomeEntry, ReportPortal, legajos e invitaciones. **No publicar solo el selector visual**: hasta que el servidor soporte varias membresías, el selector daría una falsa promesa de acceso y podría filtrar información.
