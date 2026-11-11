# Mis Productos (ZAYRO) · Edición de fotos con IA generativa gratuita

Pedido del 11/11/2026: una edición fotográfica real con IA, no un recorte con fondo blanco y filtros. Debe ser gratis y sin costo por imagen.

## Cómo funciona
1. **Separar el producto en el teléfono:** BiRefNet (`@bg0/browser`, Apache-2.0) arma una máscara suave. Esto está en `public/stock/gestlok-product-white-bg.js` → `recortarProducto`.
2. **Edición con IA generativa:** una copia de 496×496 (el producto sobre blanco) va a la función de Supabase `gestlok-cami-foto-ia`. La función llama a **Cloudflare Workers AI · `@cf/black-forest-labs/flux-2-klein-4b`** con un prompt fijo de foto de catálogo. El prompt vive en el servidor y el cliente no lo puede cambiar.
3. **Fusión con fidelidad:** `public/stock/gestlok-cami-foto-ia.js` alinea la respuesta con la foto real (correlación de contornos). Después copia **la luz y el color** de la IA sobre la foto real en alta resolución, con una ganancia local por zona. Los textos, etiquetas y formas salen siempre de la foto real. Solo donde la IA dejó lisa una zona sin letras (por ejemplo, la pared vista a través del vidrio) se limpia hacia la IA. Si la IA movió el producto, se usa solo su exposición y color globales.
4. **Terminación:** bordes limpios (estimación de color de primer plano), menos ruido en zonas lisas y nitidez solo en letras y aristas. Se compone en 1200×1200 con fondo **#FFFFFF exacto**, sin sombras.
5. **Comparación antes de guardar:** muestra el original y la versión «Editada con IA · FLUX.2», con el porcentaje de coincidencia de etiquetas y formas. Al guardar quedan las dos versiones en el producto.

Si la IA no está activa o no responde, se arma sola la «Versión básica (sin IA)». La comparación la rotula así: nunca se presenta como edición con IA, y la app no pregunta nada.

## Costo y cupo
- La cuenta gratuita de Cloudflare da 10.000 neuronas por día. FLUX.2 klein 4B gasta unas 110 por foto (salida de 1024×1024), o sea **unas 90 fotos por día**.
- En el plan Workers Free, al llegar al cupo Cloudflare responde error 3036 o 429. **No cobra.** El cupo se renueva a las 00:00 UTC (21:00 en Argentina).
- `gestlok_cami_ai_private.uso_diario` cuenta las ediciones del día. La función corta en 150 como resguardo.

## Activación (la app no pide nada)
Pedido del 11/11, 08:00: «Yo no quiero que me pida esto. Sacalo». Por eso la app **no pide** Account ID, token ni elecciones. No hay ventana de conexión, ni barra, ni ventana de alternativas.
- **IA activa:** si la función tiene credenciales, cada foto se edita con IA automáticamente.
- **IA no activa o sin respuesta** (cupo, error): GESTLOK arma sola la versión básica. La comparación la rotula «Versión básica · sin IA» y explica el motivo en una línea.
- **Cómo se activa (solo del lado del servidor):** Supabase → Edge Functions → Secrets, con `CF_ACCOUNT_ID` (32 caracteres) y `CF_API_TOKEN` (token con la plantilla «Workers AI» de una cuenta gratuita de Cloudflare). También sirve Vault, con la función SQL `gestlok_cami_foto_ia_guardar` (solo service_role).
- La acción `connect` de la función sigue existiendo para uso administrativo, pero la app ya no la usa.
- Solo pueden usar la función Camila (dueña, UID y email) o la creadora autorizada (`gestlok_cami_creator_authorized`). El token nunca vuelve al navegador.

## Archivos
- `public/stock/gestlok-cami-foto-ia.js`: motor de fusión (funciones puras) y flujo del navegador.
- `public/stock/gestlok-mis-productos.js`: flujo de foto y comparación (sin pedidos de conexión).
- `supabase/functions/gestlok-cami-foto-ia/index.ts`: acciones `status`, `connect`, `disconnect` y `edit`.
- `supabase/migrations/20261111060000_cami_foto_ia_cloudflare.sql`: esquema privado, Vault y uso diario. No tiene sentencias de borrado.
- Pruebas: `tests/cami-foto-ia.test.mjs` (motor) y `tests/cami-foto-ia-funcion.test.mjs` (función con Supabase y Cloudflare simulados).

## Límites conocidos
- La IA recibe una copia de menos de 512 px (límite de Workers AI para referencias). Por eso se usa solo para luz y color, nunca para el dibujo.
- La calidad de la máscara depende de la foto: fondos lisos y buena distancia ayudan.
- Si Cloudflare cambia el modelo o el plan gratuito, la app muestra el mensaje de error y permite la versión básica.
