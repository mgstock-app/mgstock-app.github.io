# Mi Gusto · WhatsApp automático → GESTLOK (Munro y Don Torcuato)

## Qué hace
Cada sucursal trabaja por separado, con su propio número privado, su conexión con Meta, su carta,
sus mensajes, sus pedidos y su numeración (MG-001…). Hoy: Munro +54 11 7144-6654 y
Don Torcuato +54 11 7661-7182 (se corrige en «Número de WhatsApp» de cada sucursal).

El cliente escribe al WhatsApp de la sucursal → recibe la bienvenida con 3 opciones →
elige productos y cantidades → ve el resumen con el total y «pago solo en efectivo» → deja su nombre
y observaciones → confirma → el pedido entra solo a **GESTLOK → Mi Gusto → (sucursal) → Pedidos WhatsApp**
con su número (MG-001, MG-002…). GESTLOK avisa aunque estén en Pagos Online. El dueño o gerente
marca **✓ OK** (solo «visto»: no cobra, no toca Caja, Stock ni Pagos Online).

- **Sin carga manual de pedidos** en ninguna sucursal (la base lo rechaza). Los pedidos históricos no se tocan.
- Mensajes editables desde GESTLOK (dueño o administradora): bienvenida, las 3 opciones,
  resumen antes de confirmar, pedido confirmado y «Hablar con el local».
- Carta y precios por sucursal; productos visibles u ocultos. El bot nunca inventa precios.
- «Hablar con el local»: el bot se calla y el local responde desde la app del teléfono. Después
  de 3 horas sin mensajes (o si el cliente escribe MENU) vuelve el menú automático.
- Pedido repetido por reintentos de Meta: no se duplica (cada mensaje se procesa una sola vez).

## Cómo se conecta con Meta (gratis, sin plataformas pagas)
Se usa la **API oficial de WhatsApp Cloud** con «coexistencia»: el número sigue funcionando en la
app WhatsApp Business del teléfono y los chats se conservan. Meta solo ofrece la coexistencia a
través del «Registro insertado» (Embedded Signup) de una app con rol de **proveedor de tecnología**
(Tech Provider). GESTLOK ya tiene el botón; falta que una persona autorizada haga lo de Meta.

Las respuestas a clientes que escriben (mensajes de servicio) no tienen costo en Meta.
Los mensajes que el local manda desde la app siguen siendo gratis.

### Pasos de la persona autorizada (administradora del portafolio de Mi Gusto en Meta)
1. **Teléfono del local**: actualizar WhatsApp Business (versión 2.24.17 o más nueva).
2. **business.facebook.com**: tener el portafolio comercial de Mi Gusto (crearlo si no existe).
3. **developers.facebook.com → Mis apps → Crear app**: caso de uso de WhatsApp, tipo Empresa,
   vinculada al portafolio de Mi Gusto.
4. En la app: **Casos de uso → WhatsApp → Personalizar → Incorporación de proveedor de tecnología**
   y completar los pasos que muestra (si pide verificar el negocio, completarlo).
5. **Configuración de la app → Básica**: copiar el **App ID** y el **App Secret** («Mostrar»).
   Cargar la política de privacidad `https://gestlok.com.ar/privacidad.html` y el dominio `gestlok.com.ar`.
6. **Inicio de sesión con Facebook para empresas → Configuración**: activar inicio de sesión OAuth
   del cliente y web, «Forzar HTTPS» y «Iniciar sesión con el SDK de JavaScript». En dominios
   permitidos y URI de redireccionamiento válidos: `https://gestlok.com.ar/`.
7. **Inicio de sesión con Facebook para empresas → Configuraciones → Crear**: variante
   «Registro insertado de WhatsApp», producto WhatsApp Cloud API, permisos
   `whatsapp_business_management` y `whatsapp_business_messaging`. Copiar el **ID de configuración**.
8. **WhatsApp → Configuración → Webhook**: pegar la URL y el token de verificación que muestra
   GESTLOK (Pedidos WhatsApp → Conexión con WhatsApp Business) → «Verificar y guardar».
   Es una sola app de Meta y un solo webhook para las dos sucursales.
   Suscribir: `messages`, `account_update`, `history`, `smb_app_state_sync`, `smb_message_echoes`.
9. Pasar la app a modo **Activo** (publicada).
10. **GESTLOK** (dueño o administradora con edición habilitada) → Munro → Pedidos WhatsApp →
    Conexión: pegar App ID, ID de configuración y App Secret → «Guardar datos de Meta»
    (se cargan una vez y sirven para las dos sucursales).
11. Desde una computadora, con el celular del local a mano: **«Conectar WhatsApp de Munro»** →
    entrar con Facebook → conectar la cuenta existente de WhatsApp Business → número del local →
    escanear el QR con la app del teléfono → compartir chats (opcional) → Terminar.
    GESTLOK guarda el permiso de Meta cifrado y muestra «✓ Conectado».
    Meta desvincula WhatsApp Web y otros dispositivos vinculados: hay que volver a vincularlos.
12. Cargar la carta real con precios en «Carta y precios para WhatsApp».
13. **«Activar respuestas automáticas»**.
14. **Prueba real**: desde otro celular escribir «hola» al +54 11 7144-6654, hacer un pedido,
    confirmarlo, verlo en GESTLOK y marcar ✓ OK.
15. **Don Torcuato**: entrar a Don Torcuato → Pedidos WhatsApp y repetir los pasos 11 a 14 con el
    celular de Torcuato («Conectar WhatsApp de Don Torcuato», su carta y sus mensajes).

Si Meta muestra error de permisos al conectar, pedir «acceso avanzado» para
`whatsapp_business_management` y `whatsapp_business_messaging` en Revisión de la app.
Si Meta pide un método de pago, se carga en WhatsApp Manager (las respuestas a clientes no se cobran).

## Seguridad
- Webhook firmado: sin la firma `X-Hub-Signature-256` correcta no se procesa nada.
- App Secret y token de Meta: en Supabase Vault (o en los secretos de la función). Nunca en el
  navegador ni en GitHub. Las funciones que los leen son solo del servidor (`service_role`).
- Cada Phone Number ID pertenece a una sola sucursal. La conexión solo acepta el número cargado
  para esa sucursal; un número no se puede conectar en las dos.
- Solo dueño o administradora configuran mensajes y conexión; gerentes ven y marcan OK.
- Bot apagado: Meta recibe 200 y el local atiende desde el teléfono (no se acumulan reintentos).

## Datos técnicos
- Edge Function: `mi-gusto-whatsapp` (`verify_jwt = false`, autentica por firma de Meta; la acción
  de conexión exige la sesión de GESTLOK). URL: `https://vgsepaaewbctjsjcpeta.supabase.co/functions/v1/mi-gusto-whatsapp`.
- Graph API `v25.0` (se cambia con el secreto opcional `MG_WA_GRAPH_VERSION`).
- Migraciones: `20261106204500_mi_gusto_pedidos_clientes_sucursales`, `20261106220000_mi_gusto_whatsapp_bot`,
  `20261107020000_mi_gusto_whatsapp_conexion_sucursales`.
- Secretos opcionales (alternativa a GESTLOK): `MG_WA_APP_SECRET`, `MG_WA_VERIFY_TOKEN`, `MG_WA_APP_ID`,
  `MG_WA_PHONE_ID_MUNRO`, `MG_WA_TOKEN_MUNRO`, `MG_WA_ENABLED`.
