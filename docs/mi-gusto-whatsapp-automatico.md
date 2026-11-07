# Mi Gusto · WhatsApp automático (Munro + Don Torcuato)

## Alcance
Un mismo código; dos números, catálogos, conversaciones, pedidos y controles independientes.
Nunca utiliza los pedidos de proveedores ni altera Caja, Pagos Online, Stock o legajos.
Pago exclusivamente en efectivo. El cliente confirma el total antes de que se guarde en
`Pedidos WhatsApp`. El equipo marca **✓ OK** dentro de GESTLOK.

## Habilitación: no se hace solo con el número
Antes de activar, cada responsable del negocio debe completar el alta autorizada en
Meta Business / WhatsApp Business Platform y revisar si el número de WhatsApp Business
actual admite **coexistencia**. **No borrar ni migrar cuentas existentes a ciegas.**
La configuración inicial no borra chats ni envía mensajes.

1. Cargar en GESTLOK, por sucursal, productos reales y su precio final en
   `Pedidos WhatsApp → Carta y precios para WhatsApp`.
   Sin productos activos, el bot deriva a atención humana. Nunca inventa precios.
2. Configurar en Meta el webhook HTTPS de la Edge Function y suscribir
   el evento `messages`. Asociar cada Phone Number ID a su número correspondiente.
3. Guardar en **Supabase Edge Function Secrets**, nunca en GitHub ni en el frontend:
   - `MG_WA_APP_SECRET`: App Secret de la aplicación Meta.
   - `MG_WA_VERIFY_TOKEN`: token de verificación elegido por la empresa.
   - `MG_WA_PHONE_ID_MUNRO`: ID del teléfono de Munro asignado por Meta, **no** número visible.
   - `MG_WA_TOKEN_MUNRO`: token API autorizado para Munro.
   - `MG_WA_PHONE_ID_TORCUATO` y `MG_WA_TOKEN_TORCUATO`: **opcionales** hasta activar Don Torcuato; nunca copiar credenciales de Munro a otra sucursal.
   - `MG_WA_GRAPH_VERSION`: opcional, versión válida de Graph API (por defecto `v27.0`).
   - `MG_WA_ENABLED=true` **solo después** de verificar la firma, la configuración oficial del número y los mensajes de prueba en la primera sucursal habilitada. Puede probarse Munro sin activar Torcuato.
4. Verificar firma `X-Hub-Signature-256`, suscripción y test con mensaje entrante
   desde un teléfono controlado. Probar confirmación repetida, otra sucursal,
   edición de precios, un catálogo vacío y cobro en efectivo.
5. Recién después habilitar servicio real. Si falta cualquier credencial o
   `MG_WA_ENABLED=true`, el webhook responde 503 sin procesar mensajes.

## Flujo de cliente
Bienvenida → Hacer pedido / Ver precios / Hablar con local → elegir producto
de lista → cantidad → agregar otro o finalizar → nombre → confirmar total y
pago efectivo → pedido nuevo en su sucursal. Sin cocina, reparto, cobros ni stock.

Los pedidos se guardan solo por mensaje entrante confirmado de Meta y no se repiten
si Meta reenvía el mismo evento. La sucursal se determina por el **Phone Number ID
verificado**, jamás por el texto del cliente ni el número del remitente.
No se envían mensajes proactivos: solo respuesta a conversaciones iniciadas por el cliente.

## Privacidad
El webhook conserva el número y el nombre necesarios para el pedido, un registro de
eventos de WhatsApp para deduplicación y una conversación activa por sucursal.
La clave de servicio Supabase y credenciales Meta no deben aparecer en ningún navegador.
La desactivación de un producto no borra pedidos históricos.

## Pendientes de Meta
- Verificar que Munro y Torcuato puedan vincularse sin perder el WhatsApp Business.
- Administrador autorizado debe completar Embedded Signup / Meta Business.
- Cargar precios reales por local y probar la experiencia con el personal.

## Etapa actual · alta de Munro sin pagar terceros

- Entrar a https://business.facebook.com/ y crear/seleccionar el portafolio comercial autorizado de Mi Gusto.
- Ir a https://developers.facebook.com/apps/ y crear una app con el caso de uso de WhatsApp Business Platform / Cloud API. Meta ofrece números de prueba gratuitos para desarrolladores.
- Si el mismo número **+54 11 7144-6654** ya utiliza WhatsApp Business, **no migrarlo ni desconectarlo**. Comprobar que el onboarding concreto ofrezca coexistencia con la aplicación móvil. No asumir que todos los flujos de alta la ofrecen.
- En WhatsApp > Configuración de Meta, el webhook de GESTLOK es `https://vgsepaaewbctjsjcpeta.supabase.co/functions/v1/mi-gusto-whatsapp`.
- Elegir un `MG_WA_VERIFY_TOKEN` aleatorio distinto del token de API y guardar el mismo valor en los secretos seguros de Supabase y la pantalla de webhook de Meta. No copiar secretos por chat ni al repositorio. **Meta puede verificar el webhook por GET sin encender el bot** (`MG_WA_ENABLED` permanece desactivado).
- La suscripción a webhooks debe incluir el campo `messages`. Guardar `MG_WA_APP_SECRET`, el ID real de Munro y un token **válido** de Meta en Supabase; sin este paso el webhook continúa deshabilitado (503).
- **No habilitar `MG_WA_ENABLED=true`** hasta completar el alta, revisar precios de Munro y hacer pruebas controladas. La sucursal Torcuato sigue desactivada si no tiene ID/token propios.
- La API directa de Meta no requiere pagar un proveedor de automatización, pero los mensajes reales pueden generar cargos según la categoría y cantidad. En noviembre de 2026 se publican 1.000 mensajes de servicio gratuitos por número y mes; revisar tarifas vigentes antes de activar envío en producción.
