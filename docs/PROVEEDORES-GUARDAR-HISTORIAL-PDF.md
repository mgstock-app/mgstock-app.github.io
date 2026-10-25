# GestLok · Proveedores: guardar, historial y exportación PDF

## Nuevas acciones por carpeta de proveedor
- **Guardar** arriba, por categoría y debajo de la lista: pregunta «¿Terminaste el pedido?» con tres opciones:
  1. **Sí, terminé. Guardar en historial**: guarda la lista actual y agrega una copia permanente en el historial del local, proveedor, fecha, autor y cantidades.
  2. **Guardar lista sin finalizar**: confirma en la nube el stock local, cantidades a pedir, sugeridos y productos manuales, sin agregar un pedido histórico.
  3. **Cancelar**: vuelve al formulario sin modificar registros.
- Los pedidos históricos viven en la colección privada por sucursal \`<local>/proveedores_historial\`, separada de la carpeta editable. No se pisan entradas anteriores.
- El historial aparece al final de la carpeta y permite consultar y exportar el PDF de cualquier registro guardado.
- Las confirmaciones del historial son explícitas; no se crean entradas cada vez que alguien edita una cantidad.

## Acciones por categoría
Cada bloque de categoría tiene:
- **Poner en 0**: con confirmación, pone a cero *Stock local* y *Pedir* únicamente en esa categoría. **Sugerido no cambia**. Esto afecta solo la hoja de pedidos de ese proveedor, no el inventario general.
- **Guardar**: abre la confirmación de guardado de la carpeta completa para mantener consistencia entre categorías.

Los productos manuales también aceptan categoría (por defecto «General»).

## Exportación por WhatsApp: exclusivamente PDF
- El flujo antiguo generaba PNG, texto y enlaces WhatsApp con un mensaje prearmado; fue retirado de **Compartir**.
- Se genera un PDF válido, multipágina, con proveedor, local, fecha, producto y cantidad.
- **Enviar PDF por WhatsApp** se habilita solo después de guardar una lista con cantidades a pedir. Solo la Dueña o Creadora puede compartir.
- En móviles compatibles, se invoca el menú de compartir con **solo el archivo PDF**, sin texto ni imagen. El usuario debe elegir WhatsApp y confirmar el envío.
- En móviles/navegadores que no admiten adjuntar PDF con Web Share, se ofrece **Descargar PDF** y **Abrir chat del proveedor (sin texto)** para que lo adjunte manualmente. Un enlace wa.me por sí solo NO permite adjuntar archivos.
- Esta función no envía mensajes automáticamente ni asegura que WhatsApp sea el destino de Web Share. El usuario confirma.

## Seguridad
Se reutiliza el aislamiento por tenant/local de \`public.docs\`: carpetas en \`<local>/proveedores\`, historias en \`<local>/proveedores_historial\`, lectura para usuarios con acceso al local, escritura solo para quienes tengan permiso. La finalización utiliza la función SQL `gestlok_proveedor_guardar_historial` ya instalada en Supabase; su definición reproducible está en `supabase/migrations/20261024_gestlok_proveedores_catalogo_auto.sql`. No se trasladan ni eliminan datos anteriores.

## Verificación
- Test unitario del archivo PDF real, que cubre varias páginas y confirma que no hay imágenes embebidas ni mensaje adicional.
- Prueba simulada de guardado atómico (lista e historial juntos), detección de versiones desactualizadas y rechazo de escritura de un gerente fuera de su local.
- Cypress con Supabase ficticio para completar pedido, poner en 0, guardar historial y abrir la preparación de PDF.
- Pruebas en Android/iPhone para confirmar la compatibilidad real del menú de compartir.
