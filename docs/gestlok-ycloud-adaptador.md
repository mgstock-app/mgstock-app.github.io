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

## Antes de habilitar atención automática en WhatsApp
- El 26/11 se observó un evento real firmado, con el remitente autorizado, en el receptor diagnóstico aislado. Falta validar una recepción real en el adaptador completo.
- La persistencia transaccional experimental ya está instalada solo en la BD de Pruebas, en esquema privado y con RPCs exclusivos de `service_role`; falta incorporarla al receptor firmado y probarla con eventos reales. El ensayo en memoria por sí solo no protege reinicios ni múltiples procesos. Identidad siempre desde la ruta verificada del servidor, nunca desde parámetros del visitante.
- Enlazar la creación al RPC real y al panel del gerente con validación de tenant, permisos, versionado/consentimiento, límite y retención. El ensayo devuelve solamente una acción ficticia; no se guarda por WhatsApp en GESTLOK.
- Implementar entrega humana efectiva, comprobantes y estados, sesiones nuevas/cierre, ventana de servicio y colas de salida; la simulación no envía ni reanuda un pedido cerrado.
- Política vigente: **costo adicional cero**. No habilitar envíos ni llamadas de IA externas mientras no exista un cupo gratuito comprobable y un límite efectivo que impida cargos. No cambiar el número comercial ni importar historial. La salida automatizada se mantiene apagada.
- Probar la IA real de forma autorizada; un proveedor simulado no prueba que la clave, el modelo o la API reales funcionen.

Referencias del contrato YCloud: https://ycloud.readme.io/reference/webhook-events-payloads y https://ycloud.readme.io/reference/whatsapp-inbound-message-webhook-examples.

## Código de conexión preparado (instalado únicamente en Pruebas, sin despacho)
- `index.ts` recibe exclusivamente POST YCloud y verifica firma HMAC, tamaño, ventana y lista de remitentes. Antes de todo exige el proyecto de Pruebas y los interruptores `YCLOUD_PILOT_ENABLED=true` **y** `YCLOUD_PILOT_DRY_RUN_ONLY=true`.
- `bridge.mjs` enlaza ese evento firmado con las RPC privadas `gestlok_ycloud_pilot_load` y `gestlok_ycloud_pilot_commit`. El campo `scope` es SHA-256 de empresa/sucursal/remitente, y los RPC validan sucursal, versión y duplicados en una transacción.
- `outbound.mjs` prepara el formato de texto YCloud con las opciones numeradas directamente dentro de WhatsApp y comprueba preliminarmente la ventana de atención de 24 horas. **No envía nada**: requiere validación de ventana por el proveedor, límites de coste y consentimiento antes de conectar un despacho.
- En Pruebas el pedido se envía **solamente a la RPC local** para crear un pedido con `es_prueba=true`, pendiente de aprobación manual. No sale por YCloud ninguna respuesta: el piloto real **NO está operativo todavía**.
- `YCLOUD_ROUTES_JSON` debe contener rutas verificadas por comercio, sucursal y remitente; nunca usar claves ni números reales en el repositorio. El cuerpo del evento no decide el tenant.
- La firma corresponde a la documentación oficial del proveedor. El transporte aún no tiene envío, negociación de ventana comercial ni respuestas de atención humana. No activar los interruptores por ahora.
- Pruebas SQL `tests/db/gestlok-ycloud-persistencia-prueba.sql` garantizan versión, deduplicación, creación única, aislamiento y `ROLLBACK` de datos ficticios.

## Estado comprobado
- Pruebas Node específicas del adaptador y política de costo cero: 20 aprobadas.
- Entorno remoto Pruebas: pruebas SQL de pedido y persistencia aprobadas con rollback; nada guardado al finalizar.
- Se observó un evento YCloud real autenticado en el receptor diagnóstico de Pruebas. No se envió respuesta real ni se creó pedido real.
- La operación de base se encuentra en `supabase/operaciones` y está expresamente limitada a Pruebas; no existe migración de producción.


## Modalidad sin consumo de saldo (26/11)
- Por decisión de la usuaria, se elimina la capacidad de despacho del helper experimental `one-shot.mjs`. Devuelve siempre `zero_spend_policy`, incluso cuando se le pasan credenciales, una aprobación anterior, un cupo supuesto o un transporte de prueba.
- Sin IA externa en ejecución: el motor guía la selección con carta, texto reconocido por reglas y opciones numeradas. Ante una consulta no reconocida prepara una derivación; la IA inyectable de pruebas sigue siendo exclusivamente ficticia.
- `NUEVO PEDIDO` permite iniciar un carrito independiente luego de registrar una solicitud, sin copiar sus datos personales ni borrar el historial de deduplicación. Una repetición de la confirmación anterior no crea otro pedido.
- En el ensayo en memoria, las solicitudes pendientes admiten una única confirmación o rechazo ficticios por parte del operador de su empresa y sucursal; los reclamos se almacenan en otra bandeja ficticia y `MENU` permite volver al pedido. No es un panel autenticado, no envía avisos y no sustituye las acciones reales del gerente. La función desplegada anteriormente no incorpora estas funciones nuevas hasta una actualización explícita de Pruebas.
- Las reglas se comparten entre Munro y Torcuato; el piloto real sigue restringido al remitente autorizado de Torcuato. No hay cambios en producción ni alta de servicios. Sin garantía verificable de cupo gratuito, no debe habilitarse la respuesta automática real por WhatsApp.
