# GESTLOK Chat Premium — carrito nativo de WhatsApp (piloto aislado)

Esta implementación **no habilita envíos ni publica catálogos reales**. Reutiliza el
motor de pedidos, precios, promociones, opciones obligatorias, horario y checkout de
GESTLOK. Meta Cloud API: mensaje interactivo `product_list` y evento entrante
`messages[].type=order`. No confundir el carrito nativo con la carta web.

## Vinculación y sincronización (servidor)
- Catálogo independiente y autorizado por sucursal; nunca compartir el ID entre
  sucursales. Mantener las validaciones de ruta, exclusión y suscripción del despliegue
  comercial antes de habilitar envíos. El piloto está restringido a Pruebas y a
  remitentes preautorizados.
- `commerceCatalog` es opcional, en la ruta verificada del servidor, no en el
  JSON del cliente. Si falta o está deshabilitado, se usa la carta guiada existente.
- Ejemplo **ficticio**:

```js
{
  enabled: true,
  id: "1234567890",
  sucursalId: "sucursal-ficticia",
  images: { "producto-ficticio": "https://example.com/producto.jpg" },
  readbackAt: "2026-11-26T22:00:00.000Z",
  published: [] // respuesta comprobada del catálogo Meta, NO la propuesta local
}
```

- `planCommerceCatalog` compara la cartelera vigente con la lectura del proveedor:
  productos a dar de alta o cambiar (`upsert`), artículos propios a marcar agotados
  (`retire`), artículos que coinciden (`ready`) y artículos que necesitan revisión.
  SKU estable: `gl:<id-local>:<id-producto>`, moneda ARS, precalculado en centavos.
  La propuesta nunca cuenta como confirmación de publicación. No toca SKUs ajenos.
- Las fotos de productos requieren URLs HTTPS públicas aprobadas específicamente
  por administración. No se publican la foto/PDF original de una carta, enlaces
  privados o con tokens, ni imágenes inventadas. La importación por OCR sigue
  funcionando para nombres, categorías, precios y reglas después de la aprobación.
- El siguiente paso operativo es conectar un catálogo autorizado en Meta,
  implementar el transporte autenticado de lectura/escritura y la tarea recurrente
  de sincronización (incluidas promociones por día y cambios de disponibilidad).
  Este piloto solo calcula los cambios; no llama a Meta ni sube fotos.
  Requiere una lectura reciente verificable (10 minutos). Sin lectura, foto aprobada,
  precio vigente o disponibilidad confirmada, la categoría vuelve a selección guiada.
- WhatsApp limita cada mensaje multiproducto a 30 referencias. Para catálogos largos
  se conservan categorías y paginación guiada. El cliente puede escribir MENÚ para
  volver al flujo guiado.

## Pedido
1. Hacer pedido → listado nativo cuando el catálogo está confirmado.
2. El cliente elige artículos y cantidades dentro de WhatsApp y envía el carrito.
3. El webhook firmado verifica sesión, sucursal, SKU, moneda, cantidad (1–50 para
   cada producto), precio vigente y exclusiones; no está autorizado a enviar.
4. El cliente revisa, completa variantes de promociones y acepta cada selección.
   No se modifica el carrito del motor hasta validar todas las líneas juntas.
   Si cambian productos/precios o se cancela, no hay importación parcial.
5. El motor revisa descuentos, horarios, mínimo, modalidad de entrega y datos.
   Si el local está cerrado, puede programarse según sus reglas; el gerente
   conserva confirmación manual. El registro del ensayo es exclusivamente simulado.
6. Una nueva solicitud no reemplaza un borrador o solicitud previa sin una acción
   explícita. El mismo ID del mensaje no origina pedidos duplicados.

## Proveedores
El formato nativo y la entrada firmada se ensayan en el adaptador directo de
Meta. El puente YCloud puede reconocer el formato de evento Meta, pero el
contrato de comercio de YCloud no se verificó en su documentación pública: su
proyección mantiene la carta de texto guiada como respaldo. No habilitar el
carrito por ese proveedor hasta confirmar soporte y realizar un ensayo firmado.
Ninguno de los adaptadores publica, responde por WhatsApp, consume cuota o registra
pedidos comerciales reales. La versión comercial y el despliegue de producción
requieren autorización de conexión, sincronización y presupuesto.

## Pruebas
`node --test tests/gestlok-whatsapp-commerce.test.mjs`
`node --test tests/*.test.mjs`
