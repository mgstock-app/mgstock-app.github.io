# Mis Productos (ZAYRO) · Fotos sobre cartulina blanca

**11/11/2026, 09:24.** Pedido de la usuaria: fotos con fondo blanco que no parezcan hechas con IA, sino sacadas sobre cartulina blanca y con la luz correcta (referencia: Vercares Yellow sobre cartulina). Antes, a las 08:34, se había retirado la edición con IA y quedaban solo agregar foto y la vista previa.

## Cómo funciona (todo en el teléfono, gratis, sin IA generativa)
1. «+ Agregar foto» (galería) o «📷 Sacar foto» (cámara).
2. `gestlok-cami-recorte.js` separa el producto con BiRefNet (`@bg0/browser` 0.1.1, desde CDN; la primera vez se descarga). De ahí solo se usa la máscara.
3. `gestlok-cami-foto-estudio.js` arma la foto final:
   - **Luz:** balance de blancos con las zonas blancas del producto (también si están teñidas de amarillo o azul), luz pareja que suaviza manchas grandes, exposición y una curva que no quema los blancos. Las letras y formas son siempre las de la foto real.
   - **Cartulina:** blanco real, no #FFFFFF. La pared queda un poco más gris, el apoyo más claro, con una curva suave, viñeta leve y grano fino de papel. El resultado es igual cada vez (azar con semilla).
   - **Sombra de apoyo:** suave, solo debajo del producto y sobre el piso. No hay sombras recortadas alrededor del contorno.
   - **Composición:** 1200×1200, producto centrado y apoyado al 82 % de la altura. La luz del fondo envuelve apenas el borde y el grano es el mismo en toda la imagen.
4. **Vista previa antes de guardar:** «Guardar editada», «Guardar original» o «Cancelar». Si el editor falla (por ejemplo, sin conexión para descargarlo), se muestra solo la original para guardarla.
5. Si se guarda la editada, la original queda en `original_photo_path`. La «Vista previa / Descargar» de la tarjeta muestra la foto guardada.

## Límites
- La luz fuerte del sol (reflejos marcados) se suaviza, pero no se borra: es luz real de la foto.
- En un vidrio transparente se ve lo que estaba detrás. Se probó reemplazarlo, pero dejaba manchas en tapas y cajas y se descartó. Para frascos de vidrio conviene un papel blanco atrás al sacar la foto.
- Si el separador de producto deja un borde de más (por ejemplo, un pedazo de mesa), sale en la foto: en ese caso, mejor «Guardar original» o sacar otra foto con el fondo más liso.

## Pruebas
`tests/cami-foto-estudio.test.mjs` (motor) y `tests/cami-mis-productos.test.mjs` (flujo).

## Restos sin uso en Supabase
La función `gestlok-cami-foto-ia` y el esquema `gestlok_cami_ai_private`, de la prueba con IA de Cloudflare, quedaron sin uso. No guardan datos y se pueden borrar desde el panel.
