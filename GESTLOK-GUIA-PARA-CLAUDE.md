# GESTLOK / GestLok — guía de ubicación y continuidad para Claude
**Fecha de verificación:** 24 de octubre de 2026 (Buenos Aires)  
**Propósito:** evitar que otro asistente abra un proyecto equivocado o una rama vieja y pierda las actualizaciones recientes.

## 1. Identidad: MG Stock es el antecedente técnico de GestLok

**GESTLOK / GestLok es la marca pública de la aplicación que anteriormente se llamaba MG Stock.**
No hay un repositorio nuevo llamado `gestlok` en la organización conectada: el código actual y la web publicados siguen usando el identificador técnico original de MG Stock.

| Elemento | Ubicación |
|---|---|
| Aplicación pública instalada / PWA | https://gestlok.com.ar/ (HTTPS forzado; `https://mgstock-app.github.io/` redirige con 301) |
| Repositorio GitHub **correcto** | https://github.com/mgstock-app/mgstock-app.github.io |
| Organización | `mgstock-app` |
| Nombre del repositorio | `mgstock-app.github.io` |
| Rama **fuente de verdad** | `main` |
| Commit de referencia de la versión verificada | `090855bef7681ce185e84f9c3ee4868bddb84764` |
| Despliegue de referencia con resultado exitoso | https://github.com/mgstock-app/mgstock-app.github.io/actions/runs/40054797802 |
| Alojamiento web | GitHub Pages (GitHub Actions desde `main`) |
| Supabase de inventario | Proyecto `vgsepaaewbctjsjcpeta` (identificador, **no** una credencial) |
| Stack | Next.js, TypeScript/React, controlador legado JavaScript y Supabase |
| Base de prueba/producto actual | Sucursales autorizadas de Mi Gusto, por ejemplo Munro y Torcuato |

**No confundir con ReciboNet:** https://github.com/kmu15lopez-boop/recibonet — producto y base de datos independientes, sin autorización para modificarlo por tareas de GestLok.

**No confundir con el respaldo privado** `kmu15lopez-boop/mgstock-respaldo`: se conserva el historial original; NO se usa para publicar ni para trabajar en nuevas funciones. No copiar desde ahí datos personales, seeds internos, contraseñas ni catálogos.

> En código y metadatos la marca figura habitualmente como **GestLok**; la propietaria también la escribe **GESTLOK**. Se trata de la misma marca y NO de otra aplicación. Conservar la grafía pública elegida en la interfaz y evitar volver a presentar el producto comercial como «MG Stock».

## 2. ¿Dónde están las actualizaciones recientes?

**Las funciones más recientes ya se integraron a la rama `main`.** Las ramas `feat-gestlok-*` y `fix-gestlok-*` documentan trabajo histórico de PR; la mayoría entraron mediante squash merge y por eso una comparación Git puede decir que la rama antigua «está adelantada». **No significa que falten esas funciones en producción.** Verificar siempre el PR y el diff, no fusionar de nuevo a ciegas.

Historial verificable en `main` (de más reciente a más antiguo):

| PR | Fecha de integración | Función | Commit de `main` |
|---|---|---|---|
| [#20](https://github.com/mgstock-app/mgstock-app.github.io/pull/20) | 24/10/2026 | Chat del local más confiable; borradores sin conexión, reintento idempotente y protección contra respuestas viejas | `090855b` |
| [#19](https://github.com/mgstock-app/mgstock-app.github.io/pull/19) | 24/10/2026 | Proveedores: carpetas, carga manual de pedidos y compartir imagen por WhatsApp | `e10d859` |
| [#18](https://github.com/mgstock-app/mgstock-app.github.io/pull/18) | 24/10/2026 | Control diario y avisos de chat | `6a2f5c4` |
| [#17](https://github.com/mgstock-app/mgstock-app.github.io/pull/17) | 24/10/2026 | Panel de inicio, fichas de proveedor y mejoras de experiencia | `a4137d5` |
| [#16](https://github.com/mgstock-app/mgstock-app.github.io/pull/16) | 24/10/2026 | Marca e iconografía públicas GestLok; identidad Mi Gusto solamente por cuenta autorizada | `4c66bcc` |
| [#15](https://github.com/mgstock-app/mgstock-app.github.io/pull/15) | 24/10/2026 | Controles + / − y presentación de planillas en tablets | `83698c2` |
| [#14](https://github.com/mgstock-app/mgstock-app.github.io/pull/14) | 24/10/2026 | Correcciones de encabezados para tablet | `da37b2e` |
| [#13](https://github.com/mgstock-app/mgstock-app.github.io/pull/13) | 23/10/2026 | Borradores separados por usuario/local, protección al trabajar offline | `553f8d3` |
| [#12](https://github.com/mgstock-app/mgstock-app.github.io/pull/12) | 23/10/2026 | Auditoría de navegación y flujos con Cypress aislado | `38a1486` |
| [#11](https://github.com/mgstock-app/mgstock-app.github.io/pull/11) | 23/10/2026 | Intro animada GestLok | `009fc07` |
| [#10](https://github.com/mgstock-app/mgstock-app.github.io/pull/10) | 23/10/2026 | Cambio inicial de marca, interfaz, chat interno y proveedores | `cab94b6` |
| [#7](https://github.com/mgstock-app/mgstock-app.github.io/pull/7) | 23/10/2026 | Política de privacidad, condiciones de uso y almacenamiento | `47d0d20` |

**PR #9 cerrado (26/10/2026):** [PR #9](https://github.com/mgstock-app/mgstock-app.github.io/pull/9), relativo a borradores privados, se cerró sin unir porque lo reemplazó #13.

## 3. Dónde está el código

- `README.md`: identificación de la marca y guía para iniciar la app.
- `modules/empleados/`: módulo «Administrar a los empleados» (cliente de ReciboNet integrado, se publica en `/empleados/`; tiene su propio `package.json`, lint, pruebas y build, que corren en los dos flujos de GitHub Actions).
- `public/stock/gestlok-owner-areas.js`: inicio de dueños con dos carpetas y tabla de módulos de la creadora. `public/stock/gestlok-creator-mode.js`: solo lectura por defecto de la creadora.
- `public/stock/app.js`: controlador principal: panel, hojas, stock, conteos, proveedores, chat y control diario.
- `public/stock/auth.js`: adaptación Supabase, autenticación y acceso.
- `lib/stock/markup.json`: HTML preservado de la aplicación.
- `app/page.tsx` y `components/stock-runtime.tsx`: contenedor React/Next.
- `app/layout.tsx`, `public/manifest.webmanifest`, `public/icons/`: nombre público GestLok y apariencia instalada.
- `app/gestlok-intro.css`: estilos de bienvenida.
- `tests/gestlok.test.mjs`: pruebas de regresión de identidad, chat, permisos y offline.
- `qa/cypress/e2e/gestlok-auditoria.cy.js`: flujos de roles, sucursales, chat, proveedores, conteos, offline y PWA con Supabase simulado.
- `tests/source-hashes.json`: huellas de integridad; actualizar junto con cambios **deliberados** en archivos auditados.
- `scripts/sw-template.js`: origen para generar el service worker; no editar a mano `public/sw.js`.
- `GESTLOK-SEGURIDAD-Y-DESPLIEGUE.md`: límites de seguridad y prerequisitos para comercios nuevos.
- `CONTINUAR-PUBLICACION.md` y `ESTADO-MGSTOCK.md`: contienen información histórica, algunas secciones no están actualizadas al 24/10. **Priorizar esta guía, el código actual y los PR recientes por encima de sus fechas antiguas.**

## 4. Funciones disponibles en la rama `main`

1. Identidad pública e iconos de GestLok, intro animada, diseño de ingreso y panel.
2. Selección de locales autorizados (Munro y Torcuato del entorno actual) y roles: creadora, dueña, gerente, lectura.
3. Stock, categorías, estados de stock sugerido, hojas independientes, observaciones, unidades fraccionarias, conteos, planillas fábrica y Local + Ingreso.
4. Ingreso de mercadería, remitos, movimientos/historial y respaldo según las herramientas implementadas.
5. **Proveedores:** carpeta por proveedor, tabla manual de pedido, ficha y exportación/compartir en imagen vía WhatsApp.
6. **Chat del local:** menú lateral → «Chat del local». Mensajes separados por sucursal. Sólo las cuentas con permisos de edición envían mensajes; los usuarios autorizados de lectura pueden ver el chat del local según RLS.
7. **Control diario:** registro por fecha, ingresos, salidas, conteo físico y diferencia; no sustituye el stock sin confirmación.
8. **Uso sin Internet (PR #78, 26/10/2026):** las dos áreas (Administrar mi empresa y Administrar a los empleados) se abren y navegan sin conexión con la copia guardada en el equipo; lo que se guarda sin internet queda en una cola local y se envía solo al volver la conexión, una vez por operación (`gestlok_sync_apply`, con RLS de quien guarda). Detalle y límites en `docs/offline-ambas-areas.md`.
9. Políticas informativas publicadas: privacidad, términos y almacenamiento.

**Precaución:** las pruebas E2E citadas usan datos simulados, no representan validación completa con múltiples cuentas reales en todos los teléfonos.

## 5. Límite crítico: GestLok NO es todavía multiempresa comercial segura

Aunque el proyecto tenga marca neutra, la base Supabase **todavía utiliza el esquema heredado de MG Stock**, con roles globales de dueña/creadora aplicados a los locales actuales.

**No agregar ni habilitar un comercio ajeno, una cafetería nueva ni un cliente externo en esa estructura.** Antes debe diseñarse un aislamiento multitenant real: `tenant_id` inmutable, miembros/roles por empresa, migración sin borrar datos, control RLS a nivel Postgres de todos los recursos (incluidos chat, empleados, proveedores, historial y archivos), pruebas negativas reales y aprobación expresa. El hecho de que haya varias sucursales NO equivale a poder ofrecerlo ya a empresas distintas.

El plan comercial futuro de GESTLOK (empresas independientes, suscripciones, administración de clientes, modo offline avanzado y otras etapas) **es una hoja de ruta, no una lista de funciones ya terminadas**.

No incluir pagos, suscripciones o servicios de costo sin autorización.

## 6. Cómo debe continuar Claude

1. Pedir acceso al repositorio exacto `mgstock-app/mgstock-app.github.io`. Si Claude no puede verlo, verificar que su integración GitHub tenga acceso a la organización `mgstock-app` y a este repositorio; **no crear otro proyecto desde cero**.
2. Abrir `README.md` y este documento en `main`.
3. Hacer `git clone https://github.com/mgstock-app/mgstock-app.github.io.git`, o usar la conexión GitHub ya autorizada, y cambiar a `main`.
4. Hacer `git pull origin main`, revisar el SHA actual (el de esta guía es sólo un punto de referencia) y contrastar cambios nuevos antes de trabajar. Nunca resetear el historial o forzar push.
5. Crear una rama nueva **a partir del último `main`** para cada bloque de tareas. NO continuar desde una rama GestLok histórica con código desactualizado sin revisar las diferencias.
6. Ejecutar `npm ci`, `npm run lint`, `npm test`, `npm run build` y Cypress/Playwright relevantes; ejecutar pruebas reales adicionales antes de declarar terminado un flujo.
7. Abrir PR hacia `main`, revisar los cambios, fusionar solo cuando las pruebas pasen. GitHub Pages se despliega desde `main`; verificar GitHub Actions.
8. Preservar todos los datos reales: no borrar ni sobreescribir Munro/Torcuato, no copiar información real a repos públicos, no tocar ReciboNet. Las mejoras que afecten a ambas sucursales deben aplicarse en las dos, salvo indicación expresa y validación.
9. Mantener el identificador técnico de la URL hasta planificar una migración segura de dominio, OAuth, sesiones PWA y caché.
10. Detener el trabajo antes de agotar límites, dejando SHA de base, rama, PR, pruebas, pendientes e instrucciones de continuación.

**Resumen para Claude:** «GESTLOK es la evolución/rebranding de MG Stock, no otro repositorio. Código `mgstock-app/mgstock-app.github.io`, rama `main`, web `https://gestlok.com.ar/`. El chat por local y el modo sin conexión con envío automático (PR #78) están implementados; multiempresa comercial NO. Preservar datos y no tocar ReciboNet».

## 7. Traspaso Codex → Claude (26/10/2026)

Base de partida: `main` `a3bfd9d` (#82). Fin de la sesión: `main` `4d48c98` (#69). Web publicada en `gestlok.com.ar` (dominio propio configurado en GitHub Pages).

**Integrados en esta sesión (CI completo en verde antes de unir):**
- #81 sesión de la PWA: un solo arranque de autenticación; cerrar sesión o recuperar contraseña invalida consultas en curso.
- #83 seguridad multiempresa: `importar_mercaderia` exige que el local sea de la empresa de la sesión. Migración aplicada en Supabase; prueba `supabase/tests/importar-mercaderia-tenant-guard.sql` con 0 fallas.
- #84 propuesta (sin implementar) de recibos para colaboradores: `docs/PROPUESTA-RECIBOS-COLABORADORES.md`.
- #69 marca Mi Gusto para dueños, gerentes y equipo autorizado; se corrigieron dos pruebas Cypress desactualizadas.

**PR abiertos y motivo:** #9 (reemplazado por #13: los borradores ya son por cuenta y local; tiene conflictos), #26 (licencias/pagos: etapa 13 en pausa), #27 (aislamiento: parte aplicada en la base, el resto superado por #83 o pendiente de decisión; Cypress en rojo), #52 (formulario de contacto de la demo: decisión de privacidad), #79 (instalación y pruebas Android/iPhone: plataformas en pausa).

**Limitaciones de las sesiones de Claude:** sin acceso al registro de npm (lint/build/Cypress solo en GitHub Actions; `node --test` sí corre local), sin descarga de logs ni artefactos de Actions, sin acceso a la API de Pages ni a `gestlok.com.ar`, y sin permiso para borrar ramas. Para ver qué prueba Cypress falla, se puede lanzar el workflow «Cypress MG Stock» por `workflow_dispatch` en una rama temporal que imprima los nombres en una anotación (quedó la rama `diag/cypress-69`, que se puede borrar).

**Pendiente de verificar fuera de esta sesión:** HTTPS de `gestlok.com.ar` (el despliegue informa `http://gestlok.com.ar/`), URLs de redirección de Supabase Auth para el dominio nuevo, y `APP_URL`/`NEXT_PUBLIC_SITE_URL`, que siguen apuntando a `mgstock-app.github.io`.

## 8. Dominio propio y limpieza (26/10/2026)

Base de partida: `main` `5c55bba` (#86). Fin: `main` con #87 y este documento.

- **HTTPS:** certificado Let's Encrypt aprobado para `gestlok.com.ar` y `www.gestlok.com.ar` (vence 24/01/2027). «Enforce HTTPS» activo en GitHub Pages; `http://` responde 301 a `https://`. DNS sin cambios.
- **Supabase Auth (proyecto `vgsepaaewbctjsjcpeta`):** se agregó `https://gestlok.com.ar/**` a las URLs de redirección; se mantienen `https://mgstock-app.github.io/` y `https://mgstock-app.github.io/**`. Probados desde `https://gestlok.com.ar`: ingreso con Google y enlace del correo de recuperación de contraseña.
- **#87:** `APP_URL` (`public/stock/app.js`) y `NEXT_PUBLIC_SITE_URL` (`.github/workflows/pages.yml`) pasan a `https://gestlok.com.ar`. CI en verde y despliegue verificado.
- **Limpieza:** rama `diag/cypress-69` borrada. #9 cerrado (reemplazado por #13). #27 cerrado sin aplicar: está aplicado en parte y su `importar_mercaderia` choca con la de #83.

**PR abiertos que esperan decisión de la usuaria:** #26, #52, #79. También esperan decisión `pedir_acceso`, la propuesta de recibos (`docs/PROPUESTA-RECIBOS-COLABORADORES.md`) y cualquier cambio del historial de Git.

**Site URL de Supabase Auth:** cambiado a `https://gestlok.com.ar/` por la usuaria desde el panel (Authentication → URL Configuration) el 26/10/2026 y verificado. Es el destino por defecto cuando la app no indica uno. Las tres URLs de redirección se mantienen.

## 9. Mi Gusto: Motos Agencia, Reseñas y correcciones generales (27/10/2026)

- **#91, #92, #93 · Motos Agencia (solo Munro de Mi Gusto):** carpeta «Administración de local» en el menú de Munro. Planilla semanal lunes a domingo (Lucas, Alex, Aye y refuerzos), «Modificar», «Guardar» y «Cancelar» en horarios y nombres, horas e importes, cierre automático cada lunes (hora de Buenos Aires) e historial. Dueños y creadora: todo; gerentes de Munro: cargan la semana en curso, sin importes ni historial. Colección `munro/agencia_motos`; migraciones `20261027000000_gestlok_munro_agencia_motos.sql` y `20261027010000_gestlok_munro_motos_nombres.sql` aplicadas; prueba `supabase/tests/munro-agencia-motos-permisos.sql` con 0 fallas.
- **#95 · Reseñas (Munro y Torcuato de Mi Gusto, cada sucursal independiente):** base de Codex (#94, cerrado) ampliada. Cupón 10% OFF de 6 caracteres sin O/0/I/1, único; un cupón por teléfono, período y sucursal; uso único y solo en la sucursal que lo emitió; se registra cualquier día y se usa del 1 al 12 (registrado después del 12 vale el mes siguiente, #98); «Modificar» corrige nombre y teléfono de un pendiente; estados Pendiente, Usado y Cupón Vencido. Dueños: ambas sucursales; gerentes: su sucursal (registran y marcan usados). Sin conexión solo consulta. Esquema privado `gestlok_resenas_private` con RPC `gestlok_resenas_list/create/redeem(p_local, …)`; migraciones `20261027015411_mi_gusto_resenas_cupones.sql` y `20261027030000_mi_gusto_resenas_registro_y_edicion.sql` aplicadas y verificadas en la base real con gerentes de Munro y Torcuato (0 fallas). RPC adicional `gestlok_resenas_update(p_local, p_id, p_name, p_phone)`. Detalle en `docs/RESENAS-MI-GUSTO.md`. No depende de publicar reseñas en Google.
- **#88:** inicio móvil de dueños y gerentes más compacto.
- **#96 · Todas las empresas:** inicio compacto (entran tarjetas y accesos en PC), botón «Regresar» siempre visible (barra superior y menú lateral) y email de la última sesión completado en el ingreso (nunca la contraseña).
- **#97 · Sesión que se cerraba sola:** `signOut()` de Supabase cerraba la cuenta en todos los equipos (los registros de Auth mostraban cada `/logout` seguido de «Refresh Token Not Found» en otros equipos, en especial en la cuenta compartida de gerentes de Munro). Ahora «Salir» usa `scope: 'local'` en la app, Empleados y el botón genérico.
- **Pruebas:** en Cypress los ingresos vacían el email antes de escribir (el email queda recordado). Si hace falta cargar datos ficticios de Reseñas en Cypress, el Supabase falso acepta `window.__resenasDia`.

**Pendientes al cierre (27/10/2026):** decisiones de la usuaria sobre #26 (licencias/pagos), #52 (contacto de la demo) y #79 (Android/iPhone, plataformas en pausa); `pedir_acceso`, la propuesta de recibos y el historial de Git. Sin verificar en celulares reales: Motos Agencia y Reseñas con cuentas de gerente y dueño. Datos que carga la usuaria: valores por hora de Motos Agencia. Ajuste del panel de Supabase sugerido por el asesor de seguridad: activar la protección de contraseñas filtradas (Authentication → Policies).

## 10. NFC y QR de la creadora (31/10/2026)

- **Qué es:** pestaña «NFC y QR» en el inicio de la creadora (solo `kmu15lopez@gmail.com` verificada). Placas reutilizables: cada una tiene un código fijo de 6 caracteres (sin O/0/I/1) y su link `https://gestlok.com.ar/r/?CODIGO` va en el QR y en el chip NFC. El destino se cambia desde la pestaña sin reimprimir ni regrabar. No pertenece a ninguna empresa ni local: no toca Mi Gusto, Munro ni Torcuato.
- **Base:** esquema privado `gestlok_nfc_private` (`placas`, `escaneos`, `ajustes`). RPC de la creadora: `gestlok_nfc_list`, `gestlok_nfc_create(p_cantidad)`, `gestlok_nfc_update(p_code, p_cliente, p_destino, p_nota, p_activa)`, `gestlok_nfc_set_fallback(p_destino)`. Pública (anon): `gestlok_nfc_resolve(p_code)`, que solo devuelve un link y suma el escaneo. Migración `20261031163500_gestlok_nfc_qr_placas.sql` aplicada; prueba `supabase/tests/nfc-qr-permisos.sql` con 0 fallas.
- **Front:** `public/stock/gestlok-nfc-qr.js` (panel), `public/r/index.html` (redirección pública, sin scripts de la app), `public/vendor/qrcode-generator.js` (MIT, QR generado en el equipo), `app/gestlok-nfc-qr.css`. «Grabar NFC» usa Web NFC (Chrome en Android); en iPhone se copia el link y se graba con NFC Tools.
- **Placas sin activar:** llevan al link de `ajustes.destino_sin_activar` (por defecto la Tiendanube de Belisa), editable desde la pestaña.

## 11. Legajos, Pagos Online, formularios y Cypress estable (01/11/2026)

- **#202 · Legajos:** dueños y gerentes crean y editan legajos (alta, estado, refuerzos, baja) en `modules/empleados/components/legajos/ManagerLegajos.tsx`. Sin cambios en la base: la RLS `rm_employee_profile_scope` ya limita cada cuenta a los locales de su empresa. Se verificó en la base real con simulaciones de solo lectura, sin escribir datos: dueña de Mi Gusto solo Munro y Torcuato; gerentes solo su local; dueña de otra empresa 0 locales ajenos; sin sesión, sin permisos.
- **#203 · Pagos Online:** el formulario queda vacío después de guardar (`clearEntryForm()`, antes de redibujar) y sin sugerencias del navegador. Prueba `qa/cypress/e2e/pagos-online-formulario.cy.js` en Munro y Torcuato. El simulador acepta `gestlok_mg_online_save_note` y `window.__mgOnlineSaveFail`.
- **#204 · Todo GESTLOK:** `public/stock/gestlok-form-draft-guard.js`, cargado en las dos áreas.
  - `autocomplete="off"` en todos los formularios, salvo email y contraseñas de ingreso.
  - En formularios de carga nueva de `#view`, lo enviado no se copia al formulario siguiente y se repone si aparece un error (`role="alert"` o aviso rojo).
  - Los formularios de edición no cambian.
- **Cypress estable:** los grupos 0 y 3 se cancelaban a los 30 min por un bucle infinito del editor del menú (`gestlok-navigation-editor.js`) cuando un local tenía otra hoja llamada «Stock». Corregido: un botón por categoría, y se cede el hilo si redibuja más de 20 veces seguidas. Se actualizaron pruebas de la creadora que nunca llegaban a correr y se estabilizó `ingreso.cy.js`.
- **Auditoría del sitio publicado:** después de cada despliegue, `scripts/audit-live-responsive.mjs` compara (sha256) los scripts que sirve gestlok.com.ar con los del commit publicado (línea `AUDIT_RELEASE`).
- **Sesiones de Claude:** los logs de Actions se pueden leer con `gh api repos/{o}/{r}/actions/jobs/{id}/logs`. Los artefactos, npm y gestlok.com.ar no son accesibles desde la sesión; verificar con la auditoría.
- **Cuentas:** la cuenta de creadora y la de dueña de otra empresa se mantienen separadas a propósito, por el aislamiento entre empresas.

## 12. Caja diaria exclusiva de Perfumes (pedido #200, 01/11/2026)

- **Qué es:** tarjeta «Caja diaria · Pagos del día» en el inicio de la dueña de la empresa Perfumes (tenant `2a97bf8d-…`, local Percam) y de gerentes de esa empresa. Efectivo y transferencia con totales y total del día, responsable obligatorio al abrir y al cerrar, «Cerrar día» idempotente, cierre automático a las 23:59 de Buenos Aires en el servidor, historial con detalle. Sin foto. Mi Gusto no la ve ni puede usarla.
- **Base:** esquema `gestlok_caja_private` (`empresas`, `turnos`, `movimientos`, `auditoria`), una caja por empresa y día (UNIQUE), RLS por empresa, triggers de inmutabilidad, RPC `gestlok_caja_acceso/estado/abrir/responsable/registrar/anular/cerrar/detalle`. pg_cron `gestlok-caja-diaria-cierre-2359-ar` (`59 * * * *`). Migración `20261101190000_gestlok_caja_diaria_empresa.sql`. Para habilitar otra empresa: una fila en `gestlok_caja_private.empresas` (solo con pedido y pruebas). Reversión sin borrar datos: `supabase/operaciones/caja-diaria-desactivar-o-retirar.sql`.
- **Front:** `public/stock/gestlok-caja-diaria.js`, `app/gestlok-caja-diaria.css`; ganchos opcionales en `gestlok-owner-areas.js` (no dibujan nada sin habilitación del servidor).
- **Pruebas:** `tests/caja-diaria-empresa.test.mjs` (PGlite), flujo «Caja diaria · PostgreSQL» (`tests/db/`, concurrencia real con sesiones simultáneas), `supabase/tests/caja-diaria-empresa.sql` (base real, se deshace), Cypress `caja-diaria-empresa.cy.js`. En la sesión de Claude hay PostgreSQL 16 local (`/usr/lib/postgresql/16/bin`) y Chrome para probar sin npm.
- **Publicado 01/11/2026:** PR #206 (`17286c2`), migración aplicada, prueba real 39/39, auditoría de gestlok.com.ar 5/5 con el script de la caja idéntico al commit. PR #201 cerrado (reemplazado). Pendiente: prueba de la dueña en su celular y ver el primer cierre automático.

## 13. GESTLOK Caja (02/11/2026)
- **Qué es:** la app de caja completa en `public/caja/` (https://gestlok.com.ar/caja/), base en el esquema `caja_app`
  (código y pruebas en `caja-app/`). Caja inicial, cobros por medio de pago, gastos, ingresos, retiros, arqueo y
  cierre; cada persona entra con su propia cuenta, **sin PIN** (pedido de la usuaria 02/11); teléfono y PC. Decisión de la usuaria: va bajo la marca y el dominio de GESTLOK (no
  nombre propio). Los módulos sueltos más económicos (Caja, Empleados, Proveedores y stock) son una idea en estudio.
- **Perfumes · Belisa Parfum** (tenant `2a97bf8d…`): se apagó la Caja diaria (#200, sin datos) y se habilitó GESTLOK
  Caja (`supabase/operaciones/gestlok-caja-app-perfumes.sql`). En su inicio de GESTLOK aparece «Abrir GESTLOK Caja»
  → `/caja/?desde=gestlok&comercio=…&local=…&yo=…` (alta precargada). **Mi Gusto no cambia** (Munro y Torcuato).
- **Base:** migración `20261102130000_gestlok_caja_app_por_empresa.sql` (tabla `gestlok_caja_private.caja_app_empresas`
  y RPC `gestlok_caja_app_acceso`, mismo control de acceso que la caja diaria). Pruebas: `tests/fixtures/caja-diaria/caja-app.sql`
  (flujo «Caja diaria · PostgreSQL»), `tests/caja-diaria-empresa.test.mjs` y Cypress `caja-diaria-empresa.cy.js`.
- **Sesión aparte:** la caja usa su propia sesión (`storageKey: caja-app-auth`), así un celular del local abierto en
  la caja no queda con GESTLOK abierto. La primera vez en cada equipo se entra con la misma cuenta.
- **Supabase:** `caja_app` aplicada en partes (p1…p7), sin `caja_app_entrar` (PIN). **Sin PIN (02/11):** migración
  `caja-app/supabase/migrations/20261102170000_caja_app_sin_pin.sql` aplicada: `caja_app_entrar_cuenta(local)` abre la
  sesión con la cuenta y `caja_app_salir` solo la vence (sin `delete`). La app no muestra PIN, «Cambiar de persona» ni
  «Personas y PIN»; el panel lo ve la cuenta dueña. Para que otra persona cargue hace falta invitar su cuenta (pendiente).

## 14. Historial horarios de Munro y pestaña Historial de Motos Agencia (02/11/2026)
- **Pedido:** solo Munro (Torcuato queda como está, lo pidió la usuaria). Visible para dueño, creadora y gerente de Munro.
- **Cómo funciona:** los horarios se siguen cargando en el Google Sheets «Horarios Munro» (plantilla GESTLOK). Un script
  de Apps Script (lo genera la dueña desde Administración de empleados → Historial horarios → «Conexión con Google
  Sheets») manda la pestaña «Resumen» con un código a `rm_horarios_recibir` en cada cambio y una vez por hora. GESTLOK
  guarda una copia por semana (`rm_test_private.horarios_semanas`) y la dueña marca Pagado/Pendiente por colaborador.
- **Base:** migración `20261102150000_empleados_historial_horarios.sql` (aplicada). Permisos probados en la base real
  con bloques que se deshacen: creadora y dueño ven y administran; gerente de Munro solo ve; gerente de Torcuato,
  Camila y visitantes no ven nada; Torcuato no está habilitado.
- **Pantalla:** `/empleados/historial-horarios` (pestañas Semanas, Pendientes de pago, Conexión). Acceso desde el menú
  de la creadora y del dueño, la carpeta Horarios y la portada del gerente (solo si la base habilita algún local).
- **Motos Agencia:** el historial ya existía al final de la página; ahora tiene pestaña propia arriba (dueños y creadora).
- **Copia exacta del Resumen (02/11, pedido de la usuaria):** cada semana se ve igual que la pestaña «Resumen» de
  «Horarios Munro» (título, «Semana dd/mm/aaaa al dd/mm/aaaa» y las 10 columnas en el mismo orden, valores tal cual).
  Los pagos van aparte, debajo. Buscador por colaborador (sin tildes), fecha o mes, filtro de mes e índice de semanas;
  al buscar un nombre se ve esa persona en todas las semanas. `rm_horarios_historial` devuelve hasta 520 semanas
  (migración `20261102180000_empleados_historial_horarios_largo.sql`, aplicada). El script lee A5:J14 (o más lugares si
  la columna K «Fila en Semana» los tiene). Primera semana (19/10 al 25/10/2026) copiada a mano desde la planilla.
- **Pagos solo para el dueño (02/11, pedido de la usuaria):** «Pago», «por pagar» y la pestaña «Pendientes de pago» los
  ven y marcan solo dueño y creadora (control interno). Los gerentes ven la copia del Resumen y el buscador, sin pagos;
  la base ya no les manda los pagos (migración `20261102190000_empleados_historial_horarios_pagos_dueno.sql`, aplicada).
- **Horarios en un solo lugar (02/11, pedido de la usuaria: «tiene muchas carpetas… mi jefe se va a marear»):**
  Administración de empleados → Horarios muestra arriba la planilla de cada local en una fila («Abrir planilla»,
  «Copiar enlace», «Cambiar enlace» que despliega la tarjeta completa) y debajo el historial de semanas (solo donde la
  base lo habilita). El gerente lo ve directo en su sección Horarios (sin la pantalla intermedia ni «Volver a los
  legajos»). Se quitaron «Historial horarios» de los menús y la planilla de la lista de colaboradores;
  `/historial-horarios` redirige a `/horarios`. Componentes: `HorariosHub`, `ScheduleSheetRow`, `ScheduleHistory embebido`.
- **Motos Agencia para gerentes (02/11/2026, pedido «los historiales deben verlo los gerentes»):** los gerentes de Munro también ven la pestaña Historial y pueden mirar semanas cerradas, en solo lectura y sin importes ni valor por hora. Migración `20261102160000_gestlok_munro_motos_historial_gerentes.sql` (solo `alter policy` de lectura; escritura sin cambios; vuelta atrás en `rollback-…sql.txt`).

## 15. Menú de GESTLOK dentro de Administración de empleados (02/11/2026)
- **Pedido:** «siento que salimos de la app… dejó de tener visible nuestro menú abajo y sus atajos» (celular y PC).
- **GESTLOK** (`public/stock/gestlok-mobile-dock.js`) guarda en `localStorage['gestlok:nav']` el menú que ve la cuenta
  (uid, local, barra de abajo y secciones de `#snav`; solo nombres). `app.js`: `GestLokNavContext` incluye `uid` (hook revisado en
  `tests/gestlok-navigation-hooks.json`). Los enlaces de vuelta `?gl_ir_local=…&gl_ir=…` los resuelve el dock tocando
  los botones reales (entrar al local y la sección de `#snav`): si no existen para esa persona, no hace nada. Las push
  (`gl_local`/`gl_view`) siguen limitadas a chat, proveedores, vencimientos y avisos. `?gl_hub=business|avisos` abre Empresa/Avisos del dueño si ese acceso existe.
- **Empleados** (`components/gestlok/GestlokNav.tsx`, `utils/gestlok-nav.ts`): `GestlokDock` = misma barra de abajo
  (Colaboradores marcado; «Más» con las secciones de empleados y del local) en gerente, dueño y creadora;
  `GestlokLocalNav` = secciones del local en el menú lateral. Gerente en el celular: pestañas arriba (Colaboradores,
  Horarios, Mi recibo). Sin datos del menú (o de otra cuenta): Inicio, Colaboradores, Más.

