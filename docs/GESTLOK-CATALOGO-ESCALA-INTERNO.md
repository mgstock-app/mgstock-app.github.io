# GestLok · Organización de tiendas online y mixtas (gestión interna)

## Alcance de esta entrega
Esta sección NO crea páginas para compradores, catálogo público, pasarela de pagos, carrito ni publicación de productos. La administración está protegida por cuenta, empresa (tenant) y sucursal, con controles de roles.

### Nuevo catálogo privado
- Buscar dentro del catálogo por nombre, SKU, código de barras, marca, variante, categoría, proveedor, ubicación o subcategoría. Búsqueda indexada en PostgreSQL (mínimo 3 caracteres).
- Filtrar por categoría exacta, proveedor exacto y estado: Activos, Todos, Para reponer y Archivados.
- Listar productos por orden estable `(nombre,id)`, mediante un cursor en el servidor. El navegador descarga **un máximo de 50 artículos por página**, sin tope artificial de 10.000.
- En el registro: nombre, SKU, código de barras, categoría/subcategoría, marca, variante (talle/color/modelo), proveedor, ubicación/estante, unidad, stock, stock mínimo, costo y precio de referencia. Cada variante con stock propio puede registrarse como SKU independiente.
- Archivar/restaurar productos sin borrarlos; conservar planillas preexistentes.
- Proteger la unicidad de SKU y código de barras no vacíos dentro de cada local/empresa.
- Resumen con cantidades calculadas desde la base, no desde una muestra del celular; categorías con resumen agrupado del servidor (200 categorías por consulta).
- Reforzar la vinculación tienda/producto en las cuatro políticas RLS, comparando el tenant de ambos y comprobando permisos del local.

## Escala y límites reales
El objetivo de diseño es atender desde 50 hasta **500.000 artículos por tienda** sin descargarlos juntos. Esa cifra NO está certificada todavía: requiere pruebas de rendimiento con 500.000 filas ficticias en entorno aislado, incluyendo conexiones de clientes simultáneos y distintos planes de infraestructura. El catálogo mejora la lectura; **no** acelera automáticamente pedidos, exportaciones ni planillas antiguas, que deben auditarse aparte. La búsqueda tiene índice `pg_trgm` y la paginación usa cursor.

## Próximos módulos propuestos
1. Importación masiva CSV/XLSX por lotes, con vista previa, validación de duplicados, procesamiento en segundo plano y reporte de errores.
2. Familias/variantes completas por tabla relacionada: color, talle, modelo y atributos configurables por rubro, evitando miles de campos fijos.
3. Múltiples depósitos y reservas de inventario con movimientos auditados, sin vender al público.
4. Etiquetas, códigos de barras, escaneo por cámara y ubicaciones físicas con pasillo/estante.
5. Transacciones y operaciones sobre catálogos grandes con operaciones por lote reversibles y registro de autor.
6. Pruebas de permisos cruzados con dos empresas ficticias, recuperación de backups, carga de 500.000 artículos y compatibilidad iOS/Android.

## Pruebas y publicación
- `npm test`, `npm run lint`, `npm run build` y Cypress en PR.
- `tests/catalogo-escala.test.mjs`: simulación de 500.000 artículos y paginación de solo 50 filas (sin insertarlas en la base).
- Aplicar la migración `supabase/migrations/20261025_gestlok_catalogo_500k_base.sql` solo tras CI y validación. **No insertar 500.000 filas en producción**.
- Una vez aplicada, probar conteos y RLS con cuentas reales de prueba y un catálogo ficticio en ambiente aislado.
- La etapa 12 de testing integral sigue pendiente antes de clientes externos.

Estado inicial al revisar: `gestlok_productos_tienda` no contiene productos ni tiendas, por lo que el nuevo módulo todavía no tiene datos reales que validar. No se afecta ReciboNet ni el control diario de Munro.
