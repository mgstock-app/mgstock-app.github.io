# Modo sin conexión de ambas áreas (PR #78)

Pedido (26/10/2026): todos los usuarios (actuales, futuros y la creadora) pueden navegar, usar las planillas y ver la app
sin conexión. Si guardan sin internet, el cambio queda pendiente y se envía solo al volver la conexión, en
«Administrar mi empresa» y en «Administrar a los empleados». En la demo: Horarios con un Excel ficticio y la
opción de usar la plantilla GESTLOK o una propia.

## Cómo funciona

- `public/stock/gestlok-offline.js` envuelve el `fetch` del cliente de Supabase en las dos áreas
  (`public/stock/auth.js` y `modules/empleados/lib/supabase/browser.ts`).
  - **Lecturas:** con internet van a la red y se guarda una copia en IndexedDB, separada por cuenta y empresa
    (`actor:tenant`). Sin internet se responde desde esa copia, con los cambios pendientes aplicados encima.
  - **Escrituras:** con internet y sin pendientes, la escritura va directo como siempre. Sin internet (o si se corta
    la red al enviar) queda en una cola local **sin tokens**. Las operaciones no repetibles (ingreso de mercadería,
    historial de proveedores, comentarios, horarios con versión) pasan siempre por el recibo del servidor.
  - **Envío automático:** al volver internet, al volver a la pestaña y cada 20 s se envían en orden con
    `gestlok_sync_apply`, con la sesión vigente de la **misma** cuenta. Otra cuenta en el mismo equipo no ve ni envía
    los pendientes de la anterior. Al cerrar sesión se borra la copia de datos de esa cuenta (los pendientes se
    conservan para cuando vuelva a entrar).
  - **Descarga inicial:** al entrar con internet se descargan los datos que la cuenta ya puede ver (docs, planillas de
    empleados, enlaces de Horarios y contexto), como mucho cada 6 h.
  - **Aviso:** abajo a la derecha (arriba en el celular) se ve cuántos cambios hay en el equipo, «Ver» para revisarlos,
    reintentar, descartar o descargar una copia. En «Administrar mi empresa» el estado «Sin internet» ya se ve arriba.
- `supabase/migrations/20261026110226_offline_sync_receipts.sql`: `gestlok_sync_context()` y
  `gestlok_sync_apply()` (SECURITY INVOKER: corre con los permisos y RLS de quien guarda). Recibo por cuenta + id
  de operación para que un reintento no duplique. Lista cerrada de tablas (`docs`, `rm_test_documents`,
  `rm_app_settings`) y funciones. Columnas validadas. En una edición de planilla de empleados solo viajan los campos
  que cambiaron. No toca tablas de negocio.
- Service worker (`scripts/sw-template.js` + `scripts/sw-precache.mjs`): guarda el arranque de la app y todas las
  páginas y recursos de `/empleados/` en cada publicación. Sin conexión, una sección nunca descargada muestra un
  aviso con regreso al inicio.
- `public/stock/app.js`: con el modo sin conexión activo ya no bloquea guardar conteos, proveedores, control diario,
  chat ni ingreso de mercadería; avisa «se envía solo al volver internet». Si el modo no está disponible, sigue el
  comportamiento anterior (borrador en el equipo).

## Horarios: plantilla GESTLOK o propia

- `public/plantillas/GESTLOK-plantilla-horarios.xlsx`: plantilla predeterminada (mismo formato que la planilla de
  Munro: Cómo usar, Semana, Resumen, Equipo y Feriados, con fórmulas). `GESTLOK-demo-horarios-ficticio.xlsx`: ejemplo
  completo con datos ficticios. Se generan con `python3 scripts/plantilla-horarios.py` (datos en
  `public/plantillas/demo-horarios.json`) y se recalculan con LibreOffice.
- Empleados › Horarios (quien configura el enlace): «Plantilla GESTLOK (predeterminada)» con descarga, o «Tu propia
  planilla» (Excel o Google Sheets subido a Drive) pegando el enlace.
- Demo pública: la dueña y el gerente ficticios entran a «Administrar a los empleados» › Horarios
  (`public/stock/gestlok-demo-horarios.js`): planilla editable con los mismos cálculos que el Excel, descarga del
  ejemplo y de la plantilla, y opción de cargar un Excel propio (se lee solo en el navegador) o un enlace. Sin
  conexión, lo guardado en la demo se marca pendiente y se «envía» al volver (simulación, no hay servidor).

## Pruebas

- `node --test tests/*.test.mjs`: motor (cola, recibos, otra cuenta, conflictos, campos cambiados, Horarios),
  service worker de Empleados y totales del Excel de la demo.
- `supabase/tests/offline-sync.sql`: con la migración dentro de una transacción revertida (datos ficticios).
  Verificado en PostgreSQL local con una réplica mínima, incluido un control negativo de permisos.
- Navegador real (Chromium) con la app y un Supabase falso: guardar sin conexión, cerrar y reabrir sin internet,
  envío automático una sola vez al volver, y la demo de Horarios en computadora y celular (31 verificaciones).
- `qa/cypress/e2e/demo-horarios-offline.cy.js` en CI.

## Límites

- El primer ingreso y la primera descarga necesitan internet. Google Sheets y WhatsApp son servicios externos: sin
  conexión no abren.
- Necesitan conexión: alta y permisos de usuarios, publicar recibos, tienda online y acciones de la creadora.
- Si otra persona cambia el mismo campo, gana el último envío (igual que con internet). Si el registro ya no existe,
  o la base rechaza el cambio, queda «Necesita revisión» en el aviso, sin perderse.
- La PWA cerrada no envía en segundo plano: los pendientes salen al volver a abrir GESTLOK con conexión.
- Falta probar en celulares reales (Android e iPhone).
