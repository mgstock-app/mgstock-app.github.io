# GestLok · Proveedores: Guardar, Historial, categorías y PDF

Actualización del 24/10/2026. Se conservan los datos históricos existentes.

## Flujo por carpeta de proveedor

1. Abrir **Proveedores → carpeta del proveedor**.
2. Completar Stock local, Pedir y Sugerido, agrupados por categoría.
3. **Poner en 0** solicita confirmación y reinicia Stock local y Pedir solo en esa categoría. El valor de Sugerido permanece intacto. La operación es un borrador, sin alterar stock general.
4. Al terminar, tocar **Guardar**.
5. Se muestra la pregunta «¿Ya terminaste tu pedido y querés guardarlo en el historial?» con las opciones «Todavía no» y «Sí, guardar en historial».
6. Guardar persiste de forma atómica la lista del proveedor y un registro histórico con local, proveedor, fecha, autor y productos solicitados. Se verifica la versión para evitar pisar cambios de otro usuario.
7. **Historial de pedidos guardados** ofrece descarga PDF de los registros anteriores.
8. **Compartir PDF por WhatsApp** genera un solo PDF multipágina sin imágenes ni texto duplicado.

## En celular y escritorio

- Cuando el navegador ofrece Web Share con archivos, GestLok comparte exclusivamente un PDF; el usuario elige WhatsApp y confirma el destinatario.
- Si el navegador no permite adjuntar archivos, descarga el PDF y después lo adjunta manualmente en WhatsApp. Abrir el chat no inserta texto.
- El enlace web de WhatsApp por sí solo no puede adjuntar PDF automáticamente. Por eso no sustituimos el archivo por una foto ni por un mensaje escrito.
- El PDF se genera en el dispositivo sin enviar el pedido a un servicio de terceros.

## Seguridad y límites

- Dueño y Creadora pueden compartir PDFs, mientras que el Gerente asignado puede cargar y guardar listas.
- Historial separado por empresa y local, sujeto a RLS.
- Guardado implementado como transacción segura con control de versión; no modifica las existencias operativas de Stock, ni Conteo Diario, ni otros proveedores.
- La pantalla carga las últimas 250 entradas históricas del local y muestra las 30 más recientes de la carpeta. Las restantes permanecen almacenadas.
- Los datos actuales de Gisela/Munro/Torcuato quedan preservados.

## Validación

Pruebas unitarias de formato PDF, varias páginas, permisos y Sugerido intacto. Cypress utiliza datos falsos para probar el guardado y Web Share PDF; nunca se envían mensajes. Prueba SQL de guardado histórico con reversión completa de la transacción. Se recomienda comprobar en teléfonos Android e iPhone reales la selección de WhatsApp en el menú de compartir.
