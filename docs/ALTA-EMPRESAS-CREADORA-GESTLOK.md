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

## Alta comercial inicial (propuesta 08/11/2026)
- La pantalla de **Crear mi cuenta** conserva la elección Dueño/a o Colaborador/a. Solo Dueño/a ve el formulario inspirado en flujos de alta de comercios: nombre del negocio, nombre y apellido de responsable, teléfono, dirección/referencia opcional, email, contraseña y aceptación de términos.
- El nombre y la dirección se escriben manualmente. No se usa Google Maps ni se comunica la información a servicios externos.
- La solicitud no llega al panel hasta que la persona confirme su email y guarde los datos mediante una RPC autenticada. El servidor valida cada campo y toma el email de la identidad verificada, no de la petición.
- La **creadora** recibe una ficha/carpeta por negocio en **Revisar solicitudes**, con empresa, responsable, teléfono, correo, dirección y módulos solicitados. Solo la creadora puede consultar esa información.
- Esta carpeta representa una **solicitud pendiente**, no un tenant habilitado. El alta comercial en el sistema queda sujeta al procedimiento existente de **Preparar empresa nueva**; no se conceden permisos, locales ni accesos cruzados a empresas existentes.
- Los accesos existentes con Google, los registros de colaboradores, las empresas activas y el catálogo de cada local se mantienen sin cambios.
- Implementación en la rama: migración `20261108150000_gestlok_business_signup_profiles.sql`, cliente `gestlok-registration.js`, pantalla de ingreso `auth.js`, panel `app.js` y pruebas de registro.
- **Despliegue:** aplicar y verificar la migración **antes** de publicar los archivos cliente. Revalidar con cuentas nuevas de dueño, colaborador y creadora. No desplegar si hay errores en Cypress o falta confirmar el vínculo con Google mediante correo verificado.

## Catálogo de microapps y demos (08/11/2026)
- El alta de dueños permite elegir **una o varias microapps**: Plan Scanner, Stock y proveedores, Precios y márgenes, Caja y pagos online, Control de vencimientos, Personal y recibos, Pedidos y clientes.
- Cada tarjeta tiene una demo **interactiva, aislada y ficticia** con dos acciones. No toca ventas, caja, productos, WhatsApp ni bases reales. No es una promesa de que todas las integraciones estén ya activas.
- El cliente puede combinar varias microapps bajo la misma empresa y escribir qué necesita personalizar (hasta 600 caracteres). Se aclara que la elección solicita configuración, pero **no crea cargos, licencias ni permisos**.
- Los módulos amplios `comercial` y `recibos_personal` se deducen automáticamente de la combinación; no se pregunta dos veces.
- El servidor valida una lista cerrada y coherente con esos módulos mediante la función autenticada `gestlok_request_business_registration_v2`. Los nuevos campos quedan en `gestlok_platform.registration_requests` y solo la creadora los ve en la ficha de la solicitud (microapps elegidas y nota de personalización).
- Migración adicional `20261108160000_gestlok_microapp_catalog_requests.sql`: ejecutar después de `20261108150000_gestlok_business_signup_profiles.sql`, **antes del frontend**. Conserva las RPC anteriores para compatibilidad con caché.
- El ingreso de colaboradores, las empresas ya existentes y las asignaciones reales de módulos no cambian. Pruebas: `tests/registration-modules.test.mjs`, `qa/cypress/e2e/registro-modulos.cy.js`.
