# GestLok: organización administrativa para tiendas online y mixtas

**Decisión de producto (24/10/2026).** GestLok NO es un e-commerce, no vende productos a consumidores ni ofrece carrito/checkout. Organiza la operación interna de negocios que tienen ventas presenciales, online o mixtas en otras plataformas.

## Modalidades por empresa
- **Física:** productos, stock, conteos, ingresos, proveedores, pedidos e historial de negocio presencial.
- **Online:** gestión interna de catálogo, SKUs, categorías, stock de control, mínimos, proveedor, ubicación y precios de referencia, además de pedidos recibidos por WhatsApp, Instagram, marketplace o sitio externo.
- **Mixta:** convivencia de administración presencial y seguimiento de pedidos online. El stock de control online es independiente del stock general por ahora; no prometer sincronización automática.
- Sólo la dueña o creadora de la empresa cambia la modalidad. Por defecto es física. Los permisos se controlan en Supabase, por tenant y sucursal.

## Demo exclusiva para la creadora
En **Panel administrativo → Explorar gestión de tienda online → Ver demo de gestión online**.

La demo no crea empresas, sucursales ni productos en Supabase. No tiene llamadas a la base; los registros inventados se guardan solo en memoria de la pestaña mientras la demo está abierta. Se puede cambiar stock, añadir productos ficticios, actualizar estados de pedidos, consultar categorías, proveedores y reportes simulados, reiniciar o volver al panel administrativo. Debe quedar bloqueada para gerentes, dueños de empresas y usuarios sin rol creadora.

## Gestión real para empresas con modalidad online o mixta
Menú del local → **Mi tienda** (panel interno):
- Crear **espacio de gestión privado** por sucursal, sin publicar nada.
- Registrar productos con SKU, nombre, categoría, proveedor, precio de referencia, costo, stock, unidad, ubicación, stock mínimo y notas.
- Editar, archivar y retirar productos, buscar y filtrar por alertas.
- Ver indicadores internos y faltantes.
- Gestionar pedidos que el comercio recibió **por otro canal**, en la hoja **Pedidos online**. El comercio carga y cambia los estados manualmente.
- RLS por empresa y sucursal. Gerentes autorizados editan productos; dueña/creadora habilita el espacio.
- No descuenta automáticamente ventas del inventario ni modifica Conteo diario Munro ni su histórico.

## Ventas públicas retiradas
- Rutas `public/tienda.html` y `public/stock/tienda-publica.js` retiradas.
- Políticas de lectura pública de `gestlok_tiendas` y `gestlok_productos_tienda` deshabilitadas.
- Rol anónimo sin permisos de lectura.
- Restricciones de base de datos impiden `visible=true` y `publicado=true`.
- La antigua tabla `gestlok_tiendas` pasa a usarse como espacio privado de organización, y `gestlok_productos_tienda` como catálogo privado. No se borran tablas ni registros.
- Ninguna migración sobrescribe `public.docs`, el equipo, las planillas, el chat o información histórica de Gisela.
- La cuenta de Gisela sigue con modalidad **física por defecto** mientras no se cambie expresamente.

## Pruebas de aceptación
1. La creadora abre demo y cambia cantidades o pedidos; no aparecen escrituras en Supabase ni cambia el conteo de registros reales.
2. Gerente/lectura no ve el acceso a demo.
3. La página pública de tienda deja de existir: no hay compras desde GestLok.
4. La empresa con modalidad online tiene panel de gestión y pedidos, no tienda para compradores.
5. Dos empresas y sucursales distintas no comparten documentos ni productos; prueba con sesiones reales antes de incorporar clientes.
6. La dueña Gisela conserva su empresa y todo el stock, Conteo Diario Munro, proveedores, usuarios y registros anteriores.
7. Validar lint, tests, build, Cypress aislado y comportamiento Android/iPhone; no llamar finalizada la prueba integral general solo por aprobar estos tests.

## Futuras mejoras administrativas (no implementadas)
Automatizar importación de pedidos desde plataformas externas cuando ellas lo permitan, vincular inventario real y movimientos con auditoría transaccional, gestionar devoluciones, costos y rentabilidad, y exportar informes a Excel/PDF, manteniendo el alcance **solo administrativo**.
