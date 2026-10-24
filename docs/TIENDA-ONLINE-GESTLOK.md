# GestLok · tienda física, online o mixta

Actualizado: 24/10/2026. Alcance: evolución optativa, sin alterar ni copiar información de Mi Gusto/Gisela.

## Reglas innegociables

1. La modalidad es **por empresa**: `fisica`, `online` o `mixta`. Solo la creadora o dueña de la empresa puede cambiarla. Valor por defecto: **fisica**; no crear modalidades en la base por cuenta propia.
2. La configuración de la vidriera se administra **por sucursal**, con `tenant_id`, `local_id` y slug público único. Los productos se agrupan por tienda y tenant. La tabla `docs`, stock, conteos, pedidos a proveedor, historial, roles y todo el sistema anterior siguen intactos.
3. Una tienda empieza `visible=false`; cada producto empieza `publicado=false`. Para aparecer públicamente se requiere modo `online` o `mixta` y activación explícita por la dueña.
4. La dueña puede publicar y configurar; gerentes autorizados de la sucursal pueden editar los productos, pero no habilitar la vidriera. Ni usuarios sin autorización ni otras empresas pueden consultar registros privados.
5. Nunca mostrar el logo privado de Mi Gusto en la tienda de un cliente. No asociar por rol ni copiar registros de Gisela.
6. La tienda pública no concede lectura de inventario privado y nunca escribe a `docs`. Productos y precios online son independientes: sin descuentos automáticos ni reservas hasta implementar y probar transacciones.
7. Para las compras por WhatsApp, el visitante revisa y envía manualmente el mensaje. No hay cobro online ni confirmación automática; el comercio confirma disponibilidad y entrega.

## Primera fase incluida en el PR

- Modalidad física/online/mixta existente y menú condicionado por empresa.
- Nueva sección **Mi tienda** para cada sucursal online/mixta.
- Configuración de nombre, descripción, enlace único, WhatsApp y dirección; retiro y envío a coordinar.
- Catálogo comercial: productos, categorías, SKU, foto por URL HTTPS, descripción, precio, precio anterior, cantidad disponible, destacado, publicado/oculto.
- Vidriera pública responsive: búsqueda, filtro por categoría, orden por precio, carrito, límite de unidades por stock del catálogo, total estimado.
- Checkout sin pago: envío voluntario por WhatsApp con detalle y dirección según método de entrega.
- RLS por tenant/sucursal y separación de políticas anónimas vs. autenticadas.
- Suite de tests y Cypress sobre datos completamente ficticios.

## Diferencia importante entre esta fase y una tienda transaccional completa

El checkout público **no crea automáticamente un pedido** en el módulo de pedidos online interno. El dueño debe registrar/confirmar manualmente las ventas recibidas por WhatsApp. La aplicación no descuenta stock físico ni comercial automáticamente, no procesa pagos y no garantiza reserva. No anunciar estas funciones como entregadas.

## Pendientes para una tienda online completa (segunda fase)

1. Pedidos públicos seguros en backend, con protección antiabuso, idempotencia, historial de estados y asignación al local.
2. Descuento y reserva de stock **transaccionales** para modalidad mixta, control de concurrencia entre ventas físicas y web y política de agotados.
3. Integración optativa de pagos mediante proveedor elegido por cada dueño (por ejemplo Mercado Pago); webhook firmado en servidor, reembolsos, comprobantes, conciliación y protección de datos. No guardar tarjetas ni secretos en la PWA.
4. Envíos: zonas, costos, opciones de reparto, retiro, seguimiento y notificaciones al cliente con consentimiento.
5. Promociones/cupones y políticas comerciales (devoluciones, costos y plazos), con validación por empresa.
6. Gestión de clientes, búsqueda e historial de órdenes con permisos y minimización de datos.
7. Panel de ventas, impuestos/comprobantes según obligaciones vigentes, reportes por canal, producto y sucursal.
8. SEO, identidad de marca de cada tienda, personalización avanzada y dominio propio opcional.
9. Imágenes con subida segura a Storage, transformación y cuotas por empresa, además de validación de tamaño/tipo.
10. Pruebas integrales de permisos cruzados reales (dos empresas), responsive Android/iOS, accesibilidad, Cypress, actualizaciones offline/PWA y respaldo de datos; fase 12 final cuando corresponda.

## Pruebas de no regresión

- Mi Gusto sigue en modo `fisica` si la dueña no lo modifica.
- No hay tiendas comerciales ni productos publicados por defecto.
- Contador de `public.docs`, productos y conteos histórico antes/después de la migración permanece igual.
- Usuario de un tenant no puede modificar o ver catálogos privados de otro.
- Anónimo ve únicamente tiendas visibles y productos publicados cuando empresa está en `online`/`mixta`.
- Ningún checkout público envía nada sin la intervención de la persona, ni cobra o afecta inventario.
