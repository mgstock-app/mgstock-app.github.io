# Preparación de empresas GestLok (24/10/2026)

GestLok es un gestor interno. No vende productos a consumidores.

## Guía de la creadora
Entrar al panel administrativo y elegir **Preparar empresa nueva**.

1. Completar empresa, correo del dueño, nombre del primer local y modalidad: física, online o mixta.
2. Confirmar el alta independiente: se crea tenant, local, usuario Dueño habilitado y configuración, sin modificar otras empresas.
3. Descargar plantilla CSV. Exportar la planilla Excel a CSV UTF-8, con SKU, nombre, categoría, stock, mínimo, precio, costo, proveedor, unidad y ubicación.
4. Validar el archivo en la vista previa y seleccionar expresamente la empresa destino.
5. Importar en lotes de 150 artículos. Si falla un lote, se puede reintentar la carga porque los identificadores SKU son estables.
6. El cliente se registra con el correo asignado. GestLok no crea contraseñas ni envía invitaciones por su cuenta.

## Preparación completa
- Primer local y carpetas habituales de stock, conteo, pedidos, historial, proveedores, vencimientos, avisos y chat según las funciones existentes.
- Productos precargados en inventario de la sucursal para las tres modalidades.
- En online/mixta además se prepara el catálogo administrativo privado por sucursal, sin carrito ni venta al público.
- Pedidos por canales externos con varios artículos, precios, estados, fecha de entrega, transportista y seguimiento.
- Exportación CSV de pedidos y catálogo paginado para manejar cientos o miles de productos.

## Seguridad y límites
- La creadora prepara empresas desde una función privilegiada que comprueba su identidad autenticada en una tabla interna; no se inscribe como miembro de todos los tenants.
- Un correo no puede estar en dos empresas simultáneamente porque el sistema actual no cuenta con selector de empresas por sesión.
- Los SKU importados de una misma empresa se actualizan si se repiten, pero jamás se usan filas de otros negocios.
- Máximo: 10.000 productos por sucursal, archivos de 2 MB y 150 productos por lote.
- No inventa contactos de proveedores. Los nombres importados quedan asociados a productos; los contactos se completan después.
- El stock general y el catálogo online arrancan con las mismas cantidades, pero NO se sincronizan automáticamente en movimientos posteriores.
- No se crean cuentas en Auth ni se modifican contraseñas. El dueño debe registrarse usando su email habilitado.
- No se tocan los registros de Gisela, Munro o Torcuato.

## Próxima fase
Stock reservado, movimientos auditados con transacciones, devoluciones, importación periódica de plataformas externas, multi-tenant por usuario y conciliación. No se presentan como funcionalidades listas.

## Testing
Lint, pruebas, build y Cypress con mocks; después probar cuentas reales de dos empresas y roles Dueño/Gerente antes de ofrecer comercialmente el servicio. La etapa 12 integral final sigue separada.
