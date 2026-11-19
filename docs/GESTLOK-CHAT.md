# GESTLOK Chat · plan técnico y etapa 1

Módulo de atención virtual y pedidos por chat, **multiempresa**: cada empresa y sucursal tiene su chat, asistente,
catálogo, conversaciones, pedidos y permisos independientes. Primera empresa: **Mi Gusto** (Munro y Don Torcuato).

> Regla: GESTLOK Chat es un módulo **nuevo y separado**. No modifica Pedidos WhatsApp, Caja, Stock, Empleados,
> Reseñas ni NFC. Todo lo suyo vive en `gestlok_chat_private` y en `public/chat/`.

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
| Panel | `public/chat/panel/index.html`, `panel.js`, `panel.css` |
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

| Quién | Pedidos | Carta | Ajustes | Conversaciones |
|---|---|---|---|---|
| Dueño de la empresa | Confirmar / rechazar | Todo (precios, opciones, categorías) | Todo | Leer |
| Gerente de **esa** sucursal | Confirmar / rechazar | Solo «agotado / disponible» | Ver | Leer |
| Creadora con escritura activa | Como dueño | Como dueño | Como dueño | Leer |
| Creadora en soporte (solo lectura) | Ver | Ver | Ver | — |
| Colaborador, otra empresa, sin sesión | — | — | — | — |
| Cliente (público) | El suyo, por su token | Carta pública | — | La suya |

Siempre dentro de la empresa activa de GESTLOK (`gestlok_tenancy.current_tenant_id()`), con `public.mi_rol()` y
`public.puede_editar_local()`.

## 4. Asistente

Motor propio, sin costo y determinístico: entiende saludos, horario, envío, pagos, dirección, precios, la carta y
pedidos escritos («2 de carne y 1 de jamón y queso», «media docena», «pizza grande con aceitunas», «sin …»).
Pregunta cuando hay dudas y pide las opciones obligatorias. **Nunca** fija precios ni confirma: la base recalcula todo
al crear el pedido. Etapa 3: IA opcional con herramientas acotadas (buscar en la carta, armar carrito, pedir datos),
detrás del mismo motor; si la IA falla o no está activa, sigue el motor.

## 5. Pedido

Productos y opciones, aclaraciones, retiro o envío (dirección), nombre, teléfono, medio de pago, horario deseado.
Estados: `pendiente` → `confirmado` / `rechazado` (con motivo para el cliente) / `cancelado` (por el cliente).
Un solo pedido pendiente por conversación; topes por día por sucursal, por teléfono y por conversación.
El cliente ve el estado en el mismo chat (consulta cada 12 s mientras está pendiente).

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

## 8. Puesta en marcha (etapa 2, con aprobación de la dueña)

1. Aplicar la migración `20261119210000_gestlok_chat_base.sql` en Supabase.
2. Publicar la función `gestlok-chat` (`verify_jwt = false`) y cargar el secreto `GESTLOK_CHAT_SALT` (texto al azar).
3. Correr `supabase/operaciones/gestlok-chat-habilitar-mi-gusto.sql` (Munro y Don Torcuato quedan apagadas).
4. Opcional: `gestlok-chat-copiar-carta-munro.sql` (copia nombre y precio desde Pedidos WhatsApp, sin tocarlo).
5. El dueño revisa carta y ajustes en `gestlok.com.ar/chat/panel/` y abre el chat. Pedido real de prueba.
6. Subdominio: repositorio `mgstock-app/gestlok-chat` con GitHub Pages y `CNAME` = `chat.gestlok.com.ar`;
   en el DNS del dominio, registro `CNAME chat → mgstock-app.github.io`. El sitio copia `public/chat/` y suma
   `404.html` para las rutas `/<sucursal>`.
7. Sumar GESTLOK Chat a la política de privacidad.

## 9. Etapas siguientes

- **3:** IA opcional; avisos al celular del gerente (GESTLOK Push); acceso al panel desde el menú de GESTLOK;
  respuestas del local dentro del chat; WhatsApp con el mismo motor.
- **4:** alta de otras empresas desde el panel de la creadora; colores y logo por empresa.
