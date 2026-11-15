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

## Vinculación de cada celular Android
1. Ingresar con dueño o creadora a **Mi Gusto → [sucursal] → Pedidos WhatsApp → Vincular WhatsApp Business**.
2. Generar clave de vínculo para ese local (se muestra una única vez). **No enviarla por WhatsApp ni ponerla en capturas.**
3. En **el Android de la misma sucursal**, instalar MacroDroid, conceder acceso a notificaciones y crear macro con **Notificación recibida → WhatsApp Business**.
4. Filtrar por el aviso real que produce el agente de Meta cuando deriva o termina la atención; **no usar todos los mensajes** o se producirían falsos positivos. Esto requiere inspeccionar la notificación en el dispositivo.
5. Acción MacroDroid **Solicitud HTTP POST** hacia la URL que muestra GESTLOK. Encabezados: `X-Gestlok-Bridge-Key`: clave, `Content-Type`: `application/json`.
6. Cuerpo JSON sugerido para Munro: `{"local":"munro","customer_phone":"{not_title}"}`. Para Torcuato: `{"local":"torcuato","customer_phone":"{not_title}"}`. `{not_title}` es la variable del **título de la notificación**; validar el nombre concreto de variable en la versión de MacroDroid instalada y usar el selector de variables propio de la app.
7. Realizar pedido real de prueba desde otro teléfono; verificar **notificación Android → llamada HTTP → aviso GESTLOK**. Repetir en la otra sucursal y comprobar que ninguno ve el aviso ajeno.

## Limitación principal
Meta Business Agent y WhatsApp Business pueden gestionar mensajes sin generar una notificación visible para Android. **Sin esa notificación, no se envía ningún aviso al puente.** El puente no puede detectar mensajes ocultos ni acceder al número por su cuenta. En ese caso se necesita que el propio agente o servicio que recibe el pedido emita un evento autorizado; no se puede prometer el 100% de alertas usando exclusivamente MacroDroid.

## Implementación técnica
- Migración: `supabase/migrations/20261115131500_mi_gusto_whatsapp_alertas_dos_locales.sql`.
- Edge Function: `mi-gusto-android-alert` (POST, clave de 64 hex cifrada mediante SHA-256 en base; función RPC v2 privada para `service_role`).
- Cada evento se identifica por sucursal, se valida clave por sucursal y se evita duplicado inmediato dentro de la misma sucursal.
- Solo se almacena número numérico opcional, sin mensajes, precios, nombres ni contenido del pedido.
- El código histórico de la Cloud API no está en uso en esta modalidad; sus datos previos se conservan sin exponer controles viejos.
- Esto es un **aviso operativo**, separado de **Avisos** de novedades manuales y de los carteles de actualización PWA.
