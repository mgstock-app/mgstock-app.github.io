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

**Pendiente:** el *Site URL* de Supabase Auth sigue en `https://mgstock-app.github.io/` (es el destino por defecto cuando la app no indica uno). Cambiarlo a `https://gestlok.com.ar/` desde el panel de Supabase, en Authentication → URL Configuration, si la usuaria lo aprueba.
