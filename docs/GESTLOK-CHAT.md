# GESTLOK Chat · plan técnico y etapa 1

Módulo de atención virtual y pedidos por chat, **multiempresa**: cada empresa y sucursal tiene su chat, asistente,
catálogo, conversaciones, pedidos y permisos independientes. Primera empresa: **Mi Gusto** (Munro y Don Torcuato).

> **Micro app general para comercializar (19/11/2026).** No hay empresas ni locales fijos en el código: la
> administradora la enciende por empresa en su Inicio → **Herramientas → GESTLOK Chat** («Activar GESTLOK Chat»,
> «Pausar», «Reactivar», «Sumar locales nuevos»), con `gestlok_chat_admin_habilitar / _estado / _empresas`
> (migración `20261119233500_gestlok_chat_comercializar.sql`). Cada local recibe su chat, su enlace
> (`/chat/?s=<empresa>-<local>`) y su prefijo de pedidos automáticos, **apagado** hasta que el dueño o el gerente
> personalicen la carta, los mensajes del bot y los ajustes en su **Central de mensajes**. La Central aparece sola en
> el menú de los locales que el servidor tiene habilitados; los ejemplos del asistente salen de la carta de cada local.

> Regla: GESTLOK Chat es un módulo **nuevo y separado** (`gestlok_chat_private`, `public/chat/`). No modifica Caja,
> Stock, Empleados, Reseñas ni NFC.
>
> **19/11/2026:** en Mi Gusto reemplaza a «Pedidos WhatsApp». En el menú de Munro y Don Torcuato la sección pasa a
> llamarse **Central de mensajes** (`public/stock/gestlok-chat-central.js`). Pedidos WhatsApp se quitó de la app
> (pantalla, avisos de Android, guía y funciones) y la migración `20261119230000_mi_gusto_pedidos_whatsapp_retirar.sql`
> le corta el acceso **sin borrar sus datos**.

## 1. Arquitectura

```
Cliente (celular) ──► chat.gestlok.com.ar  (hoy: gestlok.com.ar/chat/?s=<sucursal>)
                         │  POST {slug, token, accion}
                         ▼
               Función segura «gestlok-chat» (Supabase Edge, service_role)
                 · topes, CORS, textos acotados, hash del token
                 · motor del asistente (motor.js)
                         │  solo public.gestlok_chat_srv_*
                         ▼
               Base: esquema gestlok_chat_private (RLS, sin permisos directos)
                         ▲
                         │  public.gestlok_chat_panel_* (sesión de GESTLOK)
               Panel en GESTLOK (gestlok.com.ar/chat/panel/) · dueño, gerente, creadora
```

| Pieza | Archivo |
|---|---|
| Base | `supabase/migrations/20261119210000_gestlok_chat_base.sql` |
| Función segura | `supabase/functions/gestlok-chat/index.ts` (+ `motor.js`) |
| Motor del asistente | `supabase/functions/gestlok-chat/motor.js` (copia idéntica en `public/chat/motor.js`) |
| Chat público | `public/chat/index.html`, `chat.js`, `chat.css`, `config.js` |
| Panel / Central | `public/chat/panel/panel.js` (componente: página propia o montado en GESTLOK con shadow DOM), `panel.css` |
| Central en GESTLOK | `public/stock/gestlok-chat-central.js`, `app/gestlok-chat-central.css` |
| Asistente con IA | `supabase/functions/gestlok-chat/ia.js` |
| Alta Mi Gusto | `supabase/operaciones/gestlok-chat-habilitar-mi-gusto.sql` |
| Copiar carta de Munro (opcional) | `supabase/operaciones/gestlok-chat-copiar-carta-munro.sql` |

## 2. Datos (todos con empresa y sucursal)

`empresas` (la creadora enciende el módulo) · `sucursales` (enlace público `slug`, horario, dirección, retiro/envío,
costo y zona de envío, mínimo, medios de pago, prefijo y numeración de pedidos, topes diarios) · `categorias` ·
`productos` (precio, en carta, disponible hoy, opciones validadas: «elige una» / «elige varias» con recargo) ·
`conversaciones` (token anónimo guardado como hash) · `mensajes` · `pedidos` (copia de los productos con precio
del momento, cliente, entrega, pago, estado) · `pedido_eventos` · `auditoria` · `limites`.

Claves foráneas compuestas (`tenant_id`, `sucursal_id`) impiden mezclar datos de empresas o sucursales.

## 3. Permisos

| Quién | Pedidos | Carta | Mensajes del bot | Ajustes del local | Conversaciones |
|---|---|---|---|---|---|
| Dueño de la empresa | Confirmar / terminar / rechazar | Todo (productos, precios, opciones, categorías, agotado) | Editar | Todo | Leer |
| Gerente de **esa** sucursal | Confirmar / terminar / rechazar | Todo (productos, precios, opciones, categorías, agotado) | Editar | Ver | Leer |
| Administradora (creadora) con escritura activa | Como dueño | Como dueño | Como dueño | Como dueño | Leer |
| Creadora en soporte (solo lectura) | Ver | Ver | Ver | Ver | — |
| Colaborador, otra empresa, sin sesión | — | — | — | — | — |
| Cliente (público) | El suyo, por su token | Carta pública | Los recibe | — | La suya |

Ajustes del local = abrir o pausar el chat, retiro/envío, costo y zona de envío, pedido mínimo, medios de pago, horario y dirección.

Siempre dentro de la empresa activa de GESTLOK (`gestlok_tenancy.current_tenant_id()`), con `public.mi_rol()` y
`public.puede_editar_local()`.

## 4. Asistente

**Con IA (si está activa en la sucursal y hay clave en la función):** responde el texto libre del cliente con las
herramientas `agregar_producto`, `quitar_producto`, `vaciar_pedido`, `mostrar_carta`, `finalizar_pedido`,
`estado_del_pedido` y `cancelar_pedido_enviado`. Recibe las reglas fijas, los datos del local, las **indicaciones** y la
**información / preguntas frecuentes** que carga el dueño en la pestaña **Mensajes**, la carta con códigos P1, P2… (sin
identificadores internos) y el pedido en curso. No puede crear pedidos (los crea la base con el formulario), cambiar
precios, terminar pedidos ni ver otros clientes. Proveedores: `gemini` (`gemini-flash-latest`, gratuito; elegido para Mi Gusto), `openai` (ChatGPT, `gpt-4.1-mini`), `anthropic`
(Claude, `claude-haiku-5-5`). Para Mi Gusto: secretos `GESTLOK_CHAT_IA_PROVEEDOR=gemini` y `GESTLOK_CHAT_IA_CLAVE` (clave gratis de Google AI Studio). Secretos de la función: `GESTLOK_CHAT_IA_PROVEEDOR`,
`GESTLOK_CHAT_IA_CLAVE`, opcionales `GESTLOK_CHAT_IA_MODELO` y `GESTLOK_CHAT_IA_URL`. Sin clave, con la IA apagada o
si falla (12 s, 4 rondas), responde el motor guiado.

**Qué hace la IA y qué hace el sistema.** El pedido se arma con los botones y el carrito (motor guiado, sin costo).
La IA solo: 1) escribe la **bienvenida** de cada conversación nueva (una llamada por conversación, sin herramientas,
saludo según la hora, toma como base la bienvenida del dueño; si tarda más de 6 s, falla o trae precios, números o
enlaces, queda la bienvenida guiada; con el local cerrado, el aviso de próxima apertura y sus botones los pone el
sistema debajo); 2) responde el texto libre que el guiado no entiende. Los **avisos de estado del pedido** (recibido,
confirmado, listo, rechazado, cancelado) los arma siempre el sistema con los mensajes del local: la IA no interviene.

**Motor guiado (respaldo, sin costo):** entiende saludos, horario, envío, pagos, dirección, precios, la carta y
pedidos escritos («2 de carne y 1 de jamón y queso», «media docena», «pizza grande con aceitunas», «sin …»).
Pregunta cuando hay dudas y pide las opciones obligatorias. **Nunca** fija precios ni confirma: la base recalcula todo
al crear el pedido. Etapa 3: IA opcional con herramientas acotadas (buscar en la carta, armar carrito, pedir datos),
detrás del mismo motor; si la IA falla o no está activa, sigue el motor.

## 5. Pedido

Productos y opciones, aclaraciones, retiro o envío (dirección), nombre, teléfono, medio de pago, horario deseado.
Estados: `pendiente` (requiere revisión) → `confirmado` (el gerente autoriza preparación) → **`terminado`** (el gerente toca «Pedido terminado»
y el cliente recibe «tu pedido está listo») / `rechazado` (con motivo para el cliente) / `cancelado` (por el cliente).

**Mensajes configurables** (pestaña Mensajes, por sucursal; vacío = texto sugerido): bienvenida,
«Listo para retirar» y «Pedido enviado» (el botón del gerente cambia según la entrega; los dos pasan el pedido a
`terminado`), rechazado, chat en pausa y despedida. Variables: `{nombre}` `{codigo}` `{total}` `{direccion}` `{local}` `{motivo}`.

**Al terminar el pedido: reseña y cierre.** Después del aviso de «listo» o «enviado», el cliente recibe la invitación a
reseñar con el botón «Dejar mi reseña en Google» (solo si el local cargó su **link de reseñas de Google**) y el
**mensaje de cierre** («¡Gracias por elegirnos!»). Se edita en Mensajes → «Al terminar el pedido: reseña y cierre»
(dueño, administradora o gerente del local). El link es por sucursal, solo `https://` y de Google (g.page,
maps.app.goo.gl, google.com…): la base rechaza cualquier otro. Se muestra una vez por pedido en ese teléfono, también si
el cliente vuelve a abrir el chat dentro de las 24 h; el aviso de estado arriba del chat queda con el enlace «Dejar reseña».
Mi Gusto: textos cargados con `supabase/operaciones/mi-gusto-chat-resena-cierre-20261120.sql`; link solo en Don Torcuato.
Un solo pedido pendiente por conversación; topes por día por sucursal, por teléfono y por conversación.
El cliente ve el estado en el mismo chat (consulta cada 12 s mientras está pendiente o confirmado).

## 6. Seguridad

- Público sin acceso a la base: solo la función, con `service_role`, y solo funciones `srv`.
- Token aleatorio de 32 bytes en el teléfono; la base guarda su SHA‑256. Un token no sirve en otra sucursal.
- Topes: 20 mensajes/min por conexión, 15/min por conversación, tope diario por sucursal, 30 conversaciones nuevas
  por conexión y día, 400 mensajes por conversación.
- CORS solo para `chat.gestlok.com.ar` y `gestlok.com.ar`. Textos recortados; sin `innerHTML` con datos.
- Nombre, teléfono y dirección van solo en el pedido, no en el historial del chat.
- Conversaciones sin movimiento por 60 días se borran solas (pg_cron, 04:17); los pedidos quedan.
- Cambios de carta y ajustes quedan en `auditoria` (antes y después).

## 7. Pruebas

| Prueba | Qué cubre | Dónde corre |
|---|---|---|
| `supabase/tests/gestlok-chat-permisos.sql` (76 casos) | Aislamiento, roles, pedidos, precios, topes, borrado | PostgreSQL 16 (CI «GESTLOK Chat · PostgreSQL») |
| `tests/db/gestlok-chat-funcion.test.mjs` | Función + motor + base de punta a punta | Mismo CI |
| `tests/gestlok-chat-motor.test.mjs` | Motor del asistente | `npm test` |
| `qa/cypress/e2e/gestlok-chat.cy.js` | Chat y panel en celular | Cypress |

## 8. Puesta en marcha

1. Aplicar las migraciones `20261119210000_gestlok_chat_base.sql`, `20261119233500_gestlok_chat_comercializar.sql`
   y (solo Mi Gusto) `20261119230000_mi_gusto_pedidos_whatsapp_retirar.sql`.
2. Publicar la función `gestlok-chat` (`verify_jwt = false`) y cargar el secreto `GESTLOK_CHAT_SALT` (texto al azar).
3. Encender cada empresa desde Herramientas → GESTLOK Chat (Mi Gusto se encendió el 19/11 con
   `supabase/operaciones/gestlok-chat-habilitar-mi-gusto.sql`; Munro y Don Torcuato quedan apagadas).
4. Dueño o gerente: Central de mensajes → Carta (productos, precios, categorías), Mensajes (bot) y, el dueño, Ajustes
   → «Chat abierto». Pedido real de prueba.
6. Subdominio: repositorio `mgstock-app/gestlok-chat` con GitHub Pages y `CNAME` = `chat.gestlok.com.ar`;
   en el DNS del dominio, registro `CNAME chat → mgstock-app.github.io`. El sitio copia `public/chat/` y suma
   `404.html` para las rutas `/<sucursal>`.
7. Sumar GESTLOK Chat a la política de privacidad.

## 9. Etapas siguientes

- **3:** IA opcional; avisos al celular del gerente (GESTLOK Push); acceso al panel desde el menú de GESTLOK;
  respuestas del local dentro del chat. No incluye WhatsApp, Meta, MacroDroid ni sincronización externa.
- **4:** colores y logo por empresa; cobro de la suscripción de la micro app.

## Confirmación manual (19/11/2026)

El chat público toma el pedido completo y lo deja `pendiente`. El gerente revisa los detalles y pulsa «Confirmar y pasar a preparación». La misma operación transaccional registra `confirmado`, fecha y usuario, y lo incorpora a la lista interna «En preparación» de la Central. Solo después se puede marcar `terminado`. No se crea una venta ni se modifica caja o stock. La base impide terminar sin confirmar, duplicar la confirmación o decidir pedidos de otro local/empresa. El asistente y el cliente no tienen permisos para confirmar.

Migración: `20261120000406_gestlok_chat_confirmacion_manual.sql`. El texto pendiente es fijo para que plantillas anteriores no anuncien preparación antes de la aprobación. Se conservan los pedidos históricos.
