# GestLok · Soporte por WhatsApp (24/10/2026)

## Para Dueño y Gerente
En cada local, aparece abajo a la derecha un botón discreto verde con el ícono de WhatsApp y la etiqueta **Soporte**.

Al tocarlo, WhatsApp o WhatsApp Web abre una conversación con el número de la creadora, prellenando (sin enviar automáticamente) el mensaje:

> Hola soy de {Local} de la empresa de {Nombre del dueño} necesito ayuda en el sector de {Hoja o carpeta actual}

Ejemplo real de contexto: **Hola soy de Munro de la empresa de Gisela necesito ayuda en el sector de Stock cajas**.

El sector surge de la navegación actual (Stock, Conteo, Pedido, Proveedores, carpeta de proveedor, Chat, Vencimientos, hojas personalizadas, etc.). Se toma el local autorizado de la sesión y el nombre que figura en la ficha del Dueño de su propia empresa. No se adjuntan fotos, historial, existencias ni datos del cliente.

El vínculo sigue el formato oficial **wa.me** con teléfono internacional sin espacios y texto codificado. El usuario confirma el envío en WhatsApp. No hay envío automático ni registro de ese mensaje dentro del chat GestLok.

## Para la creadora
El panel privado incluye una tarjeta **Soporte por WhatsApp** que muestra el número activo y permite cambiarlo.
Número inicial: **+54 9 11 4471 5168**, guardado globalmente en Supabase como **5491144715168**.

- Solo la creadora autenticada puede editar el teléfono.
- Los usuarios autorizados con sesión iniciada pueden consultar la configuración.
- Los dueños y gerentes ven el botón, pero no pueden cambiar el número. El perfil "Solo ver" y la creadora no ven el botón flotante.
- El botón se oculta si no se puede leer la configuración o no hay un local abierto para evitar enviar el mensaje a un número obsoleto.
- La configuración se vuelve a consultar periódicamente y al regresar a la aplicación.

## Nuevas empresas
La preparación de empresa solicita también el **nombre del Dueño**, que se guarda durante el alta. Esto evita mensajes genéricos como “empresa de dueño” para nuevos clientes.

## Seguridad y privacidad
Migración aislada: tabla `public.gestlok_support_settings` con RLS, lectura autenticada restringida a miembros de empresas, RPC de edición exclusivo de la tabla privada de administradores de plataforma. No se modifica ningún registro existente de Gisela, Munro o Torcuato, ni los perfiles, contraseñas, pedidos o inventarios.

## Testing
Comprobar manualmente en Android e iOS que el vínculo abre WhatsApp y aparece el mensaje esperado para Dueño de Munro, Gerente de Munro, gerente de otro local y hoja personalizada. Automatizar la comprobación de la URL sin enviar un mensaje real. La validación final de integración del proyecto sigue independiente.
