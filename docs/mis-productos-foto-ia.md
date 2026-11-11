# Mis Productos (ZAYRO) · Fotos: edición retirada

**11/11/2026, 08:34.** Pedido de la usuaria: «vamos a tirar los cambios de edición. Solo vamos a dejar el agregar foto con la galería o subir foto con la cámara y poder ver con la vista previa».

## Cómo funciona ahora
- En cada producto: «+ Agregar foto» (galería) o «📷 Sacar foto» (cámara).
- La foto se guarda **tal cual**. Solo se achica a 1800 px como máximo y se guarda en JPG de hasta 3 MB para que entre en el almacenamiento privado. No hay recorte, fondo blanco, IA, ChatGPT ni importación de ediciones.
- Al cambiar la foto, se borran del almacenamiento privado la anterior y su «original», si existía.
- «Vista previa / Descargar» (o tocar la foto): ver en grande, descargar o cerrar. Ya no hay formatos de exportación.

## Qué se quitó
- Del navegador: `gestlok-cami-foto-ia.js` (IA de Cloudflare más fusión), `gestlok-product-white-bg.js` y `.mjs` (fondo blanco con BiRefNet), el flujo de ChatGPT, «Importar edición de IA», «Ver original», la comparación antes de guardar y los formatos de exportación.

## Qué queda en Supabase, sin uso
- La función `gestlok-cami-foto-ia`: sin credenciales y solo para Camila o la creadora, así que no hace nada. Se puede borrar desde Supabase → Edge Functions.
- El esquema `gestlok_cami_ai_private` (vacío) y las funciones SQL `gestlok_cami_foto_ia_*`, que solo puede ejecutar service_role. Viene de la migración `20261111060000_cami_foto_ia_cloudflare.sql`.
- La columna `original_photo_path` (las fotos nuevas la dejan vacía).
