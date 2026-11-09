# ZAYRO · Tienda Online pública (fase 1)

**Alcance:** exclusivamente la cuenta verificada de Camila y su tenant de perfumería. No altera Mi Gusto, El Molino ni otras empresas.

## Qué incluye

- Ruta pública https://gestlok.com.ar/zayro/ con marca ZAYRO, diseño marfil/dorado, catálogo, búsqueda, filtros Mujer/Hombre/Unisex/Cuidado capilar, carrito y consulta por WhatsApp.
- Solo se muestran productos del Plan Scanner de Camila que estén publicados, activos, con stock y precio válido. La fuente es la tabla privada gestlok_pilot_products; el inventario no se duplica.
- Precio público: manual_sale_price si existe, de lo contrario unit_price. No se exponen costos, márgenes, proveedores, historial, email privado, ni datos de otras empresas.
- Panel privado exclusivo de la dueña para configurar teléfono de ventas, encender o apagar la tienda y elegir publicaciones, categorías, imágenes HTTPS y descripciones.
- Carrito sin pagos ni reservas de stock: el comprador envía una consulta con total estimado al WhatsApp de ventas. No se crea una venta ni se descuenta inventario hasta confirmación por el negocio.
- La tienda nace desactivada, sin publicaciones automáticas y sin productos ficticios.

## Inicio premium y dirección limpia (09/11/2026)

- La tienda siempre queda en https://gestlok.com.ar/zayro/. Si se entra con ?utm_source=chatgpt.com (u otros utm_*, fbclid, gclid, srsltid…), se quitan de la barra sin recargar (app/zayro/store-url.ts + page.tsx). Canonical y Open Graph apuntan a /zayro/.
- El menú, el logo y los botones se desplazan dentro de la página sin agregar #secciones ni parámetros.
- Diseño negro, dorado y blanco basado en la tienda aprobada: barra superior, logo ZAYRO Parfum centrado, menú, banner con frasco y flores, beneficios, tarjetas Perfumes y Cuidado capilar, Productos destacados con filtros, banners de asesoramiento y envíos, Sobre ZAYRO, pie de contacto y botón flotante de WhatsApp. Ilustraciones en SVG (app/zayro/zayro-art.tsx), sin fotos externas.
- El WhatsApp de ventas se convierte al formato de wa.me (1144715168 → 5491144715168); antes los pedidos se armaban sin el 549.
- Estilos solo bajo .zayro (prueba automática); no cambian otras pantallas ni empresas.

## Tabla de diseño en la tienda (09/11/2026)

- La tienda pública usa gestlok_design_overrides con la página 'zayro:tienda' (migración 20261109160000_zayro_store_design, aplicada).
- Diseñan solo la dueña verificada (camilab.lopez99@gmail.com) o la Administradora General, con la sesión de GESTLOK abierta en el mismo navegador: https://gestlok.com.ar/zayro/?diseno=1 (también desde «✎ Diseñar mi tienda» en su panel).
- En modo diseño: tocar un texto o sección → editar texto, ocultar, agregar bloque debajo, volver al original o restablecer todo. Los visitantes ven los cambios al instante; nunca se inserta HTML.
- RPC: gestlok_zayro_public_design (anon, solo ancla/tipo/texto), gestlok_zayro_design_can_edit, gestlok_zayro_design_save, gestlok_zayro_design_remove.

## Seguridad

- Migración supabase/migrations/20261108173000_zayro_public_shop.sql: revisar y aplicar **antes del frontend**.
- Tablas con RLS y permisos directos revocados para anon/authenticated; RPCs privadas verifican auth.uid, legajo de dueña y tenant.
- La RPC pública no acepta tenant desde el visitante y devuelve solo un conjunto de campos explícitamente públicos.
- El frontend de administración no se ofrece a cuentas ajenas y las RPC impiden accesos indebidos aunque se manipule la interfaz.

## Cómo publicar con seguridad

1. Pasar lint, build, unitarias y Cypress; revisar el aislamiento.
2. Aplicar la migración a Supabase. No aplicar junto con la publicación de otro módulo sin revisar dependencias.
3. Fusionar PR solo si está verde, verificar GitHub Pages y caché PWA.
4. La dueña entra a GESTLOK > Tienda Online · ZAYRO, configura el WhatsApp de ventas, agrega imágenes/descr., elige los productos publicados y habilita la tienda.
5. Verificar con celular y computadora antes de compartir el enlace.

## Pendientes de fase 2

- Pasarela de pagos reales y confirmación segura.
- Pedidos web persistidos, reservas y protección de doble descuento/idempotencia.
- Imágenes cargadas desde el dispositivo, logística/envíos, SEO avanzado y controles anti-spam.

Las imágenes de ejemplo anteriores eran maquetas, no precios ni inventarios auténticos.
