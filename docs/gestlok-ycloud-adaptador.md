# GESTLOK Chat · ensayo conversacional para WhatsApp
Refs #617, #621, #622. Borrador; no fusionar ni desplegar en producción.

## Qué cubre
- Motor guiado existente y fallback de IA simulado, sin credenciales ni solicitudes de red.
- Texto y opciones numeradas paginadas, cantidad de unidades, grupos obligatorios, sabores, salsas, adicionales y reemplazo de promociones del motor existente.
- Carrito, quitar una línea, mínimo, horario, retiro o envío, nombre, teléfono del remitente, dirección, pagos configurados por entrega, descuento y cambio, revisión explícita.
- La sesión es serializable y está acotada por empresa, sucursal y remitente. La revisión se invalida ante cambios de carta, precios, disponibilidad o reglas comerciales.
- El ensayo de transporte en memoria procesa eventos sintéticos con formato YCloud, filtra WABA, número y remitente permitidos, rechaza grupos/historial y deduplica por evento y mensaje. Los pedidos del ensayo quedan pendientes, separados por empresa y sucursal.
- Los escenarios locales no llaman a YCloud ni al proveedor IA, no escriben en base ni muestran enlaces de pedido.

## Verificación de la base de Pruebas (26/11)
La RPC existente `gestlok_chat_srv_pedido` fallaba porque la columna `pedidos.es_prueba` no existía en el proyecto aislado pese a estar referenciada por los triggers de notificaciones. En producción la columna existe y no se hizo ningún cambio. En **Pruebas únicamente**, sin pedidos preexistentes, se restauró como boolean NOT NULL DEFAULT true (migración alojada `gestlok_pruebas_restaurar_marca_pedidos_ficticios`). El valor true intencional marca todo pedido de este entorno como ficticio y evita avisos de pedidos reales.
Se ensayó la RPC con un comercio, dos sucursales y un producto inventados, dentro de una única transacción revertida. Resultado: pedido pendiente, total $2.500 (2 productos de $1.000 + $500 envío), cambio $500, rechazo de duplicado y de sesión cruzada. Tras ROLLBACK se confirmó cero pedidos y cero sucursales ficticias. No hubo mensajes ni pedidos reales.
También se aplicó la persistencia privada exclusivamente en Pruebas y se validaron, dentro de otra transacción revertida: versión optimista, deduplicación por evento/mensaje/WhatsApp ID, creación única mediante la RPC real y aislamiento entre sucursales. Quedaron **0 pedidos, 0 sesiones y 0 eventos** después del ensayo. Los RPC de persistencia no son ejecutables por `anon` ni `authenticated`.

## Antes del piloto conectado
- Verificar evento real firmado desde YCloud y el número autorizado. El receptor diagnóstico de #622 aún no es un transporte conectado.
- La persistencia transaccional experimental ya está instalada solo en la BD de Pruebas, en esquema privado y con RPCs exclusivos de `service_role`; falta incorporarla al receptor firmado y probarla con eventos reales. El ensayo en memoria por sí solo no protege reinicios ni múltiples procesos. Identidad siempre desde la ruta verificada del servidor, nunca desde parámetros del visitante.
- Enlazar la creación al RPC real y al panel del gerente con validación de tenant, permisos, versionado/consentimiento, límite y retención. El ensayo devuelve solamente una acción ficticia; no se guarda por WhatsApp en GESTLOK.
- Implementar entrega humana efectiva, comprobantes y estados, sesiones nuevas/cierre, ventana de servicio y colas de salida; la simulación no envía ni reanuda un pedido cerrado.
- Confirmar costos, cupos, credenciales y autorización del titular antes de habilitar cualquier envío o llamada pagada. No cambiar el número comercial ni importar historial. El canal se mantiene apagado.
- Probar la IA real de forma autorizada; un proveedor simulado no prueba que la clave, el modelo o la API reales funcionen.

Referencias del contrato YCloud: https://ycloud.readme.io/reference/webhook-events-payloads y https://ycloud.readme.io/reference/whatsapp-inbound-message-webhook-examples.

## Código de conexión preparado (no desplegado)
- `index.ts` recibe exclusivamente POST YCloud y verifica firma HMAC, tamaño, ventana y lista de remitentes. Antes de todo exige el proyecto de Pruebas y los interruptores `YCLOUD_PILOT_ENABLED=true` **y** `YCLOUD_PILOT_DRY_RUN_ONLY=true`.
- `bridge.mjs` enlaza ese evento firmado con las RPC privadas `gestlok_ycloud_pilot_load` y `gestlok_ycloud_pilot_commit`. El campo `scope` es SHA-256 de empresa/sucursal/remitente, y los RPC validan sucursal, versión y duplicados en una transacción.
- `outbound.mjs` prepara el formato de texto YCloud con las opciones numeradas directamente dentro de WhatsApp y comprueba preliminarmente la ventana de atención de 24 horas. **No envía nada**: requiere validación de ventana por el proveedor, límites de coste y consentimiento antes de conectar un despacho.
- En Pruebas el pedido se envía **solamente a la RPC local** para crear un pedido con `es_prueba=true`, pendiente de aprobación manual. No sale por YCloud ninguna respuesta: el piloto real **NO está operativo todavía**.
- `YCLOUD_ROUTES_JSON` debe contener rutas verificadas por comercio, sucursal y remitente; nunca usar claves ni números reales en el repositorio. El cuerpo del evento no decide el tenant.
- La firma corresponde a la documentación oficial del proveedor. El transporte aún no tiene envío, negociación de ventana comercial ni respuestas de atención humana. No activar los interruptores por ahora.
- Pruebas SQL `tests/db/gestlok-ycloud-persistencia-prueba.sql` garantizan versión, deduplicación, creación única, aislamiento y `ROLLBACK` de datos ficticios.

## Estado comprobado
- Pruebas Node locales: 16 aprobadas.
- Entorno remoto Pruebas: pruebas SQL de pedido y persistencia aprobadas con rollback; nada guardado al finalizar.
- No se observó ningún evento YCloud de prueba autenticado en los registros consultados. La firma real, coexistencia con el número comercial y respuestas de salida siguen sin validar.
- La operación de base se encuentra en `supabase/operaciones` y está expresamente limitada a Pruebas; no existe migración de producción.
