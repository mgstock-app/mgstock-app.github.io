# BELISA · Fotos con fondo y textura reales

**13/11/2026.** La tienda de Camila ya utiliza un fondo negro tejido real. Por eso la edición predeterminada **no** debe eliminarlo ni reemplazarlo por cartulina blanca.

## Nuevo comportamiento

1. En **Mis Productos** de Camila (BELISA), usar **Agregar foto** o **Sacar foto**.
2. GESTLOK importa la foto completa con `gestlok-cami-foto-real.js`, sin recorte ni segmentación. El procesamiento ocurre en el dispositivo.
3. Mejora moderadamente exposición, detalles visibles y contraste sin eliminar el tejido negro, sus sombras originales ni modificar el encuadre.
4. Compara **Editada · fondo real** y **Original**. Solo después de elegir **Guardar editada**, **Guardar original** o **Cancelar** se modifica el producto.
5. Si se guarda la editada, la original se conserva en `original_photo_path`. Las fotos siguen en almacenamiento privado con los controles de acceso existentes.
6. El cambio se limita al tenant de Camila y a fotos nuevas o reemplazadas. Las fotos históricas no se reprocesan automáticamente.

## Límites y garantías

- La mejora de luz usa filtros deterministas sobre píxeles de la foto, no IA generativa. No crea iluminación ficticia ni recupera detalles inexistentes en zonas quemadas o muy oscuras.
- No coloca un nuevo fondo, no inventa texto, no altera el frasco y no borra elementos del ambiente.
- Si el dispositivo no permite editar o exportar, aparece la opción de guardar la original.
- El algoritmo anterior de cartulina blanca queda en el repositorio por compatibilidad histórica, pero **ya no se usa** en este flujo.
- Pruebas: `tests/cami-foto-real.test.mjs` y `tests/cami-mis-productos.test.mjs`.
