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

## Antes del piloto conectado
- Verificar evento real firmado desde YCloud y el número autorizado. El receptor diagnóstico de #622 aún no es un transporte conectado.
- Persistencia transaccional de eventos, estado, pedido y respuesta con idempotencia durable; el ensayo en memoria no protege múltiples procesos, reinicios ni concurrencia distribuida. Identidad desde la ruta verificada del servidor, nunca desde parámetros del visitante.
- Enlazar la creación al RPC real y al panel del gerente con validación de tenant, permisos, versionado/consentimiento, límite y retención. El ensayo devuelve solamente una acción ficticia; no se guarda por WhatsApp en GESTLOK.
- Implementar entrega humana efectiva, comprobantes y estados, sesiones nuevas/cierre, ventana de servicio y colas de salida; la simulación no envía ni reanuda un pedido cerrado.
- Confirmar costos, cupos, credenciales y autorización del titular antes de habilitar cualquier envío o llamada pagada. No cambiar el número comercial ni importar historial. El canal se mantiene apagado.
- Probar la IA real de forma autorizada; un proveedor simulado no prueba que la clave, el modelo o la API reales funcionen.

Referencias del contrato YCloud: https://ycloud.readme.io/reference/webhook-events-payloads y https://ycloud.readme.io/reference/whatsapp-inbound-message-webhook-examples.
