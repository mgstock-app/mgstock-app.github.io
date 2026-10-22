# Ingreso de mercadería — propuesta técnica

**Estado (22/10/2026):** propuesta para revisar. No hay nada implementado, migrado ni publicado. Rama de trabajo: `ingreso-mercaderia`.

## 1. Qué hay hoy en el código

- La app es una web estática (GitHub Pages) que lee y escribe en Supabase, en una sola tabla `public.docs` (`col`, `id`, `data`).
- Cada sucursal tiene sus colecciones: `munro/productos`, `munro/fabrica`, `munro/hojas`, `munro/conteos` (y lo mismo para `torcuato/...`).
- Hojas de cada sucursal y dónde está su cantidad:

| Hoja | Dónde están sus productos | Campo que se cargaría |
|---|---|---|
| Stock Sugerido | `<local>/productos` sin campo `hoja` | `stock` |
| Stock Cajas (y otras hojas de lista) | `<local>/productos` con `hoja` = id de la hoja | `stock` |
| Conteo Fábrica (y otras hojas de fábrica) | `<local>/fabrica` | `local` o `fabrica` |
| Conteo y Pedido (quitadas del menú) | mismos productos que Stock Sugerido | no son destinos aparte |

- Roles: administradora (`creadora`), dueña (`dueno`), gerente y solo ver. Las reglas actuales dejan que un gerente cambie el stock de su sucursal. Por eso la importación necesita **su propia función en la base**, que controle el rol en el servidor y no solo en la pantalla.
- Las cantidades ya se validan en cuartos (0,25 · 0,5 · 0,75).
- La copia de seguridad usa SheetJS 0.18.5 desde un CDN, solo para **escribir** Excel. Esa versión tiene fallas conocidas al **leer** archivos armados con mala intención (CVE-2023-30533 y CVE-2024-22363), así que no conviene usarla para importar.
- Pruebas existentes: Playwright (`tests/`) y Cypress (`qa/`, corre en cada pull request), con el simulador `tests/mock_supabase.js`. La web solo se publica al subir a `main`.
- Supabase está en plan gratis, con 2 proyectos activos: Stock y Reporte Mensual. No queda lugar para un proyecto de pruebas gratis sin tocar Reporte Mensual.

## 2. Pantalla «Ingreso de mercadería»

- Va en el menú principal y solo se ve con el rol dueña (ver decisión 1 para la administradora). Si otro rol intenta entrar por la ruta interna, la app lo manda a Inicio, y la base rechaza la operación igual.
- Una sola pantalla en cuatro pasos:
  1. **Sucursal** (obligatoria y sin valor por defecto): Munro o Torcuato. Carga una sola vez los productos y hojas de esa sucursal, solo para leer.
  2. **Operación** (obligatoria y sin valor por defecto):
     - **Ingreso**: suma lo recibido al stock actual.
     - **Conteo**: reemplaza por la cantidad indicada.
     Para Conteo Fábrica también se elige la columna, **Local** o **Fábrica**. Hay un valor general y se puede cambiar por renglón.
  3. **Archivo**: uno por vez.
  4. **Vista previa** con: producto reconocido, hoja de destino, cantidad detectada, cantidad actual y cantidad resultante. Debajo van los ignorados y los errores. Se pueden corregir cantidades y destinos.
- Estados por renglón:
  - **Coincide**: va tildado.
  - **Revisar**: nombre parecido; va sin tildar y lo tilda la dueña.
  - **Elegir hoja**: el producto está en más de una hoja; no se importa hasta que se elija una.
  - **Unidad distinta**: la unidad del archivo no es la del producto.
  - **Cantidad inválida**.
  - **Ignorado**.
- «Confirmar importación» solo se habilita si hay al menos un renglón válido y no quedan decisiones pendientes en los renglones tildados.
- «Cancelar» descarta todo y no guarda nada.

## 3. Lectura de archivos

Todo se procesa en el dispositivo de la dueña y sin costo. Los archivos no se suben a ningún lado; solo se guardan el nombre, el tipo y una huella (hash) para detectar duplicados.

| Formato | Cómo | Resultado esperado |
|---|---|---|
| CSV | Lector propio | Muy bueno |
| Excel (.xlsx) | Lector propio mínimo, con la descompresión del navegador y sin librería vulnerable. Detecta columnas Producto, Cantidad y Unidad, y se pueden ajustar | Muy bueno |
| Excel viejo (.xls) | No se lee: se pide guardarlo como .xlsx o CSV | — |
| PDF digital | pdf.js (Mozilla, licencia Apache 2.0): texto con posición para rearmar renglones | Bueno |
| Foto, imagen o PDF escaneado | Tesseract.js (licencia Apache 2.0), en español, en el dispositivo | Bueno con remitos impresos y fotos derechas y nítidas. Malo con escritura a mano |

Las librerías pesan varios MB. Se descargan solo cuando la dueña abre esta pantalla, así que a los gerentes no les afecta. Se alojan en la misma web, sin depender de otro sitio, con versión fija y su licencia.

## 4. Reconocimiento de productos

- **Normalización**: minúsculas, sin acentos ni signos, y número separado de la unidad («600gr» → «600 gr»).
- **Cantidad**: número al principio o al final del renglón, con coma decimal, o fracciones (1/4, ½, ¾, 1 1/2). La unidad se detecta por palabras como u, un, unid, kg, gr, caja, cj, bulto, pack o docena.
- **Coincidencia**:
  - nombre igual después de normalizar → Coincide;
  - parecido alto → Revisar;
  - el resto → Ignorado.
  Nunca se crean productos, categorías ni hojas.
- **Producto en varias hojas**: queda sin destino hasta que la dueña elige uno. Nunca se reparte una cantidad entre hojas.
- **Renglones repetidos** del mismo producto y destino:
  - en Ingreso se suman, mostrando el detalle;
  - en Conteo, si los valores no coinciden, elige la dueña.
- **Unidades**: no se convierte nada solo (por ejemplo, «2 cajas x 12» no pasa a 24 unidades). Si la unidad no coincide, el renglón queda marcado para corregir la cantidad.
- **Cantidades**: en cuartos, como en el resto de la app. Cualquier otro decimal queda marcado para corregir.

## 5. Guardado seguro en Supabase

Función nueva en la base, `public.importar_mercaderia(p_local, p_operacion, p_items, p_archivo, p_clave, p_forzar)`. Es SQL, sin Edge Functions ni servicios pagos. Al confirmar:

1. Verifica el rol del usuario de la sesión: dueña (y administradora si se decide). A un gerente lo rechaza aunque llame a la función por fuera de la app.
2. Verifica que la sucursal exista.
3. Vuelve a buscar cada producto en esa sucursal y lo bloquea mientras guarda. Si alguno ya no existe, no guarda nada.
4. Compara el valor actual con el que mostró la vista previa. Si alguien lo cambió mientras tanto, no guarda nada y devuelve la lista de lo que cambió.
5. Calcula el resultado y lo valida: no negativo y en cuartos.
6. Aplica todo junto, en una sola transacción (todo o nada).
7. Registra el historial.

- **Duplicados**: si el mismo archivo o el mismo contenido ya se importó en esa sucursal, avisa con la fecha y quién lo cargó. Según la decisión 3, bloquea o pide confirmación explícita.
- **Fallas de internet**: cada confirmación lleva una clave única. Si se corta y se reintenta, la base reconoce la clave y no suma dos veces. Si no llegó la respuesta, la pantalla consulta si quedó guardado antes de reintentar.
- **Historial**: colección nueva `importaciones`, fuera de las colecciones de cada sucursal. Guarda usuario, fecha, sucursal, operación y archivo, y por producto: hoja, valor anterior, cantidad y resultado. También guarda los ignorados. Solo la leen la dueña y la administradora, y nadie la puede escribir directamente: solo la función. El historial de conteos existente no se toca.
- **Cambios en Supabase**: una función nueva y una línea más en la regla de lectura `docs_leer`, para que la dueña y la administradora puedan leer `importaciones`. No hace falta Storage, Edge Functions ni plan pago.

## 6. Limitaciones y riesgos

- **La lectura no es perfecta.** Por eso nada se guarda sin vista previa y confirmación, y lo dudoso queda sin tildar.
- **Borradores de los gerentes.** Si un gerente tiene cantidades cargadas sin guardar y las guarda después de un Ingreso, su conteo pisa lo importado en esos productos. Así funciona hoy el guardado. Para una etapa siguiente se propone avisarle antes de guardar si algún producto cambió mientras cargaba.
- **Nombre de la sucursal.** En la app la sucursal se llama «Torcuato»; el pedido dice «Don Torcuato». Se muestra como está guardada y no se renombra.
- **Mejora futura:** recordar equivalencias por sucursal (por ejemplo, «JAMON COC X KG» = «Jamón cocido»).
- **Opción paga futura (no incluida):** lectura con IA para fotos difíciles o escritura a mano. Necesitaría una función de servidor y una clave de API, cobra por uso y solo se activa con autorización.

## 7. Pruebas sin tocar datos reales

- Todo se hace en la rama `ingreso-mercaderia` y en un pull request. La web publicada no cambia hasta que se autorice subir a `main`.
- **En el navegador**: Playwright (`tests/`) y Cypress (`qa/cypress/e2e/ingreso.cy.js`), con el simulador y archivos ficticios: CSV, Excel, PDF digital, foto y PDF escaneado. Cubren:
  - productos de varias hojas, desconocidos, repetidos y ambiguos;
  - fracciones y unidades distintas;
  - permisos: dueña, administradora, gerente, solo ver y entrada directa por la ruta;
  - historial, cancelación y duplicados;
  - falla de internet y reintento.
- **En la base**: la función y la regla nueva se prueban en la base real dentro de transacciones que se deshacen al final, con una sucursal ficticia creada dentro de la misma transacción. No queda nada guardado; es el mismo método que ya se usó para verificar permisos.
- **Limitación de este entorno**: desde acá no se pueden descargar las librerías de PDF y OCR porque la red está bloqueada. Las pruebas locales simulan la lectura; las pruebas con lectura real corren en GitHub (Cypress en el pull request), que sí puede descargarlas al construir.

## 8. Etapas

1. Pantalla, permisos, CSV y Excel, coincidencias, vista previa editable, función segura, historial y pruebas.
2. PDF digital.
3. Fotos, imágenes y PDF escaneado (OCR).

Cada etapa se guarda en la rama con sus pruebas. Se publica solo con autorización. No se tocan ReciboNet, Reporte Mensual ni GESTLOK.

## 9. Decisiones pendientes

1. ¿La administradora también puede usar Ingreso de mercadería, o solo la dueña?
2. ¿Se puede asignar a mano un renglón ignorado a un producto que ya existe (sin crear nada)?
3. Si el archivo ya se importó en esa sucursal: ¿bloquear siempre, o avisar y dejar seguir con confirmación?
4. Autorización para empezar la etapa 1 en la rama (sin publicar).
