# Mi Gusto · Alertas de pedidos de WhatsApp Business en GESTLOK

**Vigencia:** 15/11/2026. Reemplaza las instrucciones anteriores de WhatsApp Cloud API y Embedded Signup.

## Objetivo y alcance
El agente de Meta atiende al cliente **dentro de WhatsApp Business** de cada sucursal. GESTLOK no interviene en esa conversación y **no necesita WhatsApp Cloud API** para esta modalidad. El personal debe recibir una alerta que indique que hay una conversación para revisar. El aviso, por sí solo, **no prueba que el pedido fue confirmado**.

- **Munro:** +54 11 7144-6654.
- **Don Torcuato:** +54 11 7661-7182.
- Cada sucursal usa el Android con su WhatsApp Business, clave propia y avisos separados.
- El aviso de GESTLOK incluye sucursal, fecha/hora y número del cliente **solamente si aparece como número en el título de la notificación Android**. Si Android muestra el nombre del contacto o no genera notificación, GESTLOK no puede inferir el teléfono.
- En GESTLOK: **Pedidos WhatsApp → Avisos de WhatsApp Business → Abrir chat / Copiar número → ✓ Revisado**. El OK no toca Caja, Stock ni Pagos Online.
- Dueños y creadora gestionan la clave; gerentes autorizados revisan y marcan avisos. Los datos de los locales no se cruzan.

## QR propio de GESTLOK (sin API)
- En **Pedidos WhatsApp → Vinculación** cada sucursal ve un QR real y un botón **Abrir en este celular**. La librería QR ya incluida en la app lo genera localmente.
- El QR de Munro abre `https://gestlok.com.ar/vincular-whatsapp/?local=munro`; el de Don Torcuato abre `https://gestlok.com.ar/vincular-whatsapp/?local=torcuato`. Es una **guía de configuración**, no un QR de WhatsApp Web ni una conexión automática.
- El enlace contiene **solo la sucursal**, jamás la clave privada de 64 caracteres ni datos de clientes. La clave se obtiene en la pantalla autenticada de GESTLOK, una sola vez.
- Esta solución no requiere Cloud API. Requiere MacroDroid y permisos de notificación en el Android de la sucursal. El estado de vínculo se comprueba únicamente mediante una señal real recibida y nunca al escanear el QR.
- Si el agente de Meta no crea una notificación Android reconocible, **no hay alerta**: el QR no soluciona esa limitación.

## Asistente de vinculación por QR (Munro y Torcuato)
- El QR de cada sucursal abre la página pública `/vincular-whatsapp/?local=munro` o `?local=torcuato`, ahora con **tres pasos interactivos**: Preparar Android, Configurar MacroDroid y Probar conexión.
- En la pantalla privada de GESTLOK → Pedidos WhatsApp → Vinculación se mantiene la clave de sucursal y se agrega **Iniciar prueba de conexión** y **Comprobar señal**. La conexión solo se valida si el servidor reporta una señal **nueva** posterior al inicio de la prueba; eventos antiguos y QR escaneados sin señal no se consideran conectados.
- Las dos sucursales mantienen su **número propio**, clave privada, control de acceso por rol, eventos y avisos aislados. No se incluye ningún número o clave en la URL ni en el QR público.
- Este asistente **no instala ni configura MacroDroid automáticamente**. Android debe autorizar manualmente el acceso a notificaciones y el operador debe completar el filtro correcto. No es un login de WhatsApp Web ni lee chats. Una señal recibida no demuestra que se hayan detectado todos los pedidos.

## Importar macro preparada desde el QR (nueva opción)
- El QR público de cada local sigue abriendo `/vincular-whatsapp/?local=munro` o `?local=torcuato`. Se incluye acceso a **Importar macro preparada**.
- En **GESTLOK autenticado → Mi Gusto → [local] → Pedidos WhatsApp → Vinculación**, botón **Descargar macro preparada para [local]**: genera un archivo nativo `.macro` con un solo disparador `NotificationTrigger` de WhatsApp Business (`com.whatsapp.w4b`) y acción `HttpRequestAction` **POST** con la URL existente, encabezados `X-Gestlok-Bridge-Key` y `Content-Type`, y el JSON `{"local":"munro|torcuato","customer_phone":"{not_title}"}` fijado al local.
- **Clave:** el QR y la página pública nunca incluyen la clave privada. El archivo se arma y descarga únicamente desde la sesión autorizada del local. Si la clave no está disponible en esa sesión, la RPC crea una nueva; se solicita confirmación antes de reemplazar una anterior (las macros antiguas dejarán de funcionar). El archivo incluye la clave y **no debe compartirse ni enviarse por WhatsApp**.
- **Importación:** el usuario abre el archivo con MacroDroid o lo importa desde el menú Macros. El archivo se genera con `m_enabled=false` para evitar avisos falsos: debe revisarse/ajustarse la frase del aviso de derivación, otorgar permisos de acceso a notificaciones y activar la macro manualmente. El contenido del disparador se puede indicar en el formulario opcional del panel (sin publicar ese texto en la URL).
- **Verificación:** después de importar y activar, generar notificación real y usar **Iniciar prueba de conexión → Comprobar señal**. El QR por sí mismo jamás marca conectado. Android y Meta pueden no generar una notificación visible; no se garantiza detectar todos los pedidos.
- Este sistema funciona sin WhatsApp Cloud API; no cambia los teléfonos ni los datos de Munro o Don Torcuato, ni Caja, Stock ni Pagos Online.

## Detalle de avisos y vista previa Android (18/11/2026)
- En **Pedidos WhatsApp → Avisos**, Munro y Don Torcuato disponen de tarjetas ordenadas, **Ver detalle**, **Abrir WhatsApp** y **Marcar como revisado**; historial de revisados por sucursal.
- Cada aviso sigue indicando una **conversación para revisar**, nunca un pedido confirmado. La pantalla no inventa clientes, importes, contenidos ni teléfonos.
- Si WhatsApp Business muestra texto en una notificación de Android, MacroDroid puede enviar el campo opcional `notification_preview` (variable `{not_text}`). Se almacena **solo esa vista previa**, máximo 240 caracteres, en la tabla privada de avisos. Si Android no lo muestra, la app señala **sin vista previa**, y el personal consulta WhatsApp Business.
- El número se usa para **Abrir WhatsApp** en el chat específico solamente si el título de la notificación contiene un teléfono válido. Si falta, el botón intenta abrir WhatsApp Business, pero se debe localizar la conversación manualmente en ese Android.
- El receptor usa la misma clave de cada local y conserva soporte de la macro anterior (solo señal). Para obtener la vista previa hay que **editar en MacroDroid** el cuerpo JSON de la solicitud HTTP o importar una macro nueva preparada con `notification_preview`; **no reemplazar claves activas sin necesidad**.
- Filtrar la notificación de derivación/atención. **No usar «Cualquier contenido» en producción**: enviaría alertas y vistas previas de todos los mensajes; es necesario comprobar la notificación real que emite el agente de Meta.
- Las credenciales privadas no viajan en el QR. Solo personal autorizado de cada sucursal ve el texto opcional. No se envían avisos editoriales de actualización a otras empresas.

## Vinculación de cada celular Android
1. Ingresar con dueño o creadora a **Mi Gusto → [sucursal] → Pedidos WhatsApp → Vincular WhatsApp Business**.
2. Generar clave de vínculo para ese local (se muestra una única vez). **No enviarla por WhatsApp ni ponerla en capturas.**
3. En **el Android de la misma sucursal**, instalar MacroDroid, conceder acceso a notificaciones y crear macro con **Notificación recibida → WhatsApp Business**.
4. Filtrar por el aviso real que produce el agente de Meta cuando deriva o termina la atención; **no usar todos los mensajes** o se producirían falsos positivos. Esto requiere inspeccionar la notificación en el dispositivo.
5. Acción MacroDroid **Solicitud HTTP POST** hacia la URL que muestra GESTLOK. Encabezados: `X-Gestlok-Bridge-Key`: clave, `Content-Type`: `application/json`.
6. Cuerpo JSON sugerido para Munro: `{"local":"munro","customer_phone":"{not_title}"}`. Para Torcuato: `{"local":"torcuato","customer_phone":"{not_title}"}`. `{not_title}` es la variable del **título de la notificación**; validar el nombre concreto de variable en la versión de MacroDroid instalada y usar el selector de variables propio de la app.
7. Realizar pedido real de prueba desde otro teléfono; verificar **notificación Android → llamada HTTP → aviso GESTLOK**. Repetir en la otra sucursal y comprobar que ninguno ve el aviso ajeno.

## Corrección de avisos consecutivos (18/11/2026)
- En las nuevas macros descargadas desde GESTLOK se desactiva `m_supressMultiples` para no descartar notificaciones consecutivas de WhatsApp Business. Se mantiene el filtro de derivación y la deduplicación inmediata en el servidor.
- **Macros ya instaladas:** en MacroDroid, editar el disparador «Notificación recibida» y desactivar «Evitar múltiples disparos». Verificar que el texto del filtro coincida con la notificación Android real. No reemplazar la clave vigente; una descarga de otra macro no modifica la que ya está activa.
- Esta corrección no puede detectar mensajes si WhatsApp Business o el agente de Meta no producen una notificación Android. La última señal registrada confirma una recepción pasada, nunca cobertura completa de futuros mensajes.

## Limitación principal
Meta Business Agent y WhatsApp Business pueden gestionar mensajes sin generar una notificación visible para Android. **Sin esa notificación, no se envía ningún aviso al puente.** El puente no puede detectar mensajes ocultos ni acceder al número por su cuenta. En ese caso se necesita que el propio agente o servicio que recibe el pedido emita un evento autorizado; no se puede prometer el 100% de alertas usando exclusivamente MacroDroid.

## Implementación técnica
- Migración: `supabase/migrations/20261115131500_mi_gusto_whatsapp_alertas_dos_locales.sql`.
- Edge Function: `mi-gusto-android-alert` (POST, clave de 64 hex cifrada mediante SHA-256 en base; función RPC v2 privada para `service_role`).
- Cada evento se identifica por sucursal, se valida clave por sucursal y se evita duplicado inmediato dentro de la misma sucursal.
- Solo se almacena número numérico opcional, sin mensajes, precios, nombres ni contenido del pedido.
- El código histórico de la Cloud API no está en uso en esta modalidad; sus datos previos se conservan sin exponer controles viejos.
- Esto es un **aviso operativo**, separado de **Avisos** de novedades manuales y de los carteles de actualización PWA.
