# MG Stock — auditoría técnica de privacidad, bloque 1

Fecha: 23/10/2026. Base: `47d0d20` (PR #7 integrado).
Rama: `fix/private-drafts-audit-20261023`. Seguimiento: issue #8.
Estado: preparado para revisión, sin fusión ni despliegue de este bloque.

Se revisaron las reglas de AGENTS.md/CONTINUAR-PUBLICACION.md, el estado actual,
autenticación, borradores, caché PWA, esquema SQL y políticas remotas. La misma
corrección se aplica a Munro y Torcuato. No hubo escrituras en Supabase remoto,
modificaciones de stock real, borrado de usuarios, cambios de credenciales ni gastos.

## Resultado por punto

| Punto | Estado | Evidencia y límite |
| --- | --- | --- |
| Borradores entre cuentas en un mismo celular | CORREGIDO | Clave anterior solamente por local: permitía cargar cantidades/notas de otro usuario con acceso a la misma sucursal. Nueva clave v2 por identidad Supabase y sucursal; se mantiene el identificador histórico de autor para no alterar conteos existentes. |
| Legados sin identidad | CORREGIDO | No se asignan al siguiente usuario: copia exacta bajo spm-draft-unclaimed, verificación antes de quitar la clave compartida y conservación del original si falla la copia. No se renderizan. Pruebas de cuota, colisión, idempotencia y ambas sucursales. |
| Recuperación de legados legítimos | REQUIERE VALIDACIÓN MANUAL | No contienen evidencia suficiente del titular. Soporte debe verificar autoría y permisos antes de restaurar. No se pierden los bytes, pero el borrador antiguo deja de cargarse automáticamente. |
| Cierre/cambio de cuenta | CORREGIDO | Oculta pantallas, cierra paneles, limpia borradores y datos en memoria y recarga ante cambio de identidad. Invalida verificaciones tardías; un error de cierre informa fallo y ofrece reintentar. Los borradores propios persisten bajo su cuenta. |
| Protección del perfil del navegador | REQUIERE VALIDACIÓN MANUAL | El almacenamiento local no está cifrado; cualquier persona que controle el mismo perfil/DevTools puede leerlo. Namespacing evita mezcla accidental dentro de la app; no es una barrera contra un usuario con control del dispositivo. Usar perfiles separados o definir política de no persistencia con consentimiento para borrar borradores. |
| Gerentes por sucursal | APROBADO | PostgreSQL/PGlite ejecuta el esquema real con identidades ficticias: lectura y escritura cruzadas rechazadas en ambas sucursales. |
| Solo lectura y pendientes | APROBADO | SQL directo/RPC rechaza edición, eliminación, ingreso a datos internos y autoasignación. Metadatos de usuario no conceden rol. |
| Dueña y administradora | APROBADO | Mantienen actualización autorizada de ambas sucursales en SQL aislado. No se cambiaron roles de producción. |
| Equipo por local | APROBADO | Pruebas SQL y del adaptador: gerentes no enumeran equipo de otra sucursal; dueña/administradora conservan alcance. |
| Productos, conteos, hojas y fábrica | APROBADO | RLS de lectura/insert/update/delete remoto revisado; UPDATE incluye USING y WITH CHECK. Tests SQL rechazan mover documentos a otro local y alteración de sugerido por gerente. |
| RLS remoto | APROBADO | docs tiene RLS activo y cuatro políticas para authenticated. Ninguna función pública enumerada ejecutable por anon. No equivale a probar todos los caminos con JWT reales. |
| SECURITY DEFINER | PENDIENTE | Asesor remoto informa 10 funciones ejecutables por authenticated, con search_path=public. Funciones auxiliares consultan el rol propio; retirar privilegios sin rediseño rompería RLS. Revisar en esquema privado y comprobar grants de CREATE antes de migrar. No se declara cada advertencia como explotación confirmada. |
| Auth por contraseña | PENDIENTE | Protección contra contraseñas filtradas deshabilitada. Email sí se usa en esta app; verificar opciones y costo antes de cualquier cambio. No se activaron servicios pagos. |
| Cookies/sesión | APROBADO | Cliente estático Supabase con persistSession; los tokens se guardan en almacenamiento del navegador. No corresponde prometer HttpOnly sobre localStorage ni agregar cookies técnicas de otra arquitectura. Validación OAuth real y revocación inmediata de JWT siguen pendientes. |
| Caché y seguimiento | APROBADO | Worker acotado a recursos de interfaz; no intercepta API Supabase ni rutas privadas en las pruebas existentes. No se identificó analítica publicitaria propia; falta inspección de terceros durante login real. |
| Datos personales en fuente actual | CORREGIDO | PR #7 ya quitaba correo de app/auth; se retiró también de nueve archivos de fixtures y pruebas, reemplazado por admin@example.com. El scan limitado de patrones de clave privada, sb_secret, AWS y JWT service_role no encontró coincidencias en archivos versionados actuales. No equivale a un escáner exhaustivo. |
| Historial público | REQUIERE VALIDACIÓN MANUAL | git log -G confirma el correo en commits anteriores, incluido dccca00 y cambios de retirada. No se reescribió historial. No se copiaron datos personales al informe. Revisión completa de secretos históricos pendiente. |
| Dependencias | PENDIENTE | npm audit: 9 avisos (7 altos, 2 moderados), en cadenas de tooling Tailwind 3 y eslint-config-next. La corrección sugerida implica cambios mayores; no se ejecutó audit fix --force. Preparar PR separado con regresiones de estilos/móvil. QA Cypress: 0 avisos. |
| Documentos legales publicados | APROBADO | /privacidad.html, /terminos.html y /almacenamiento.html responden HTTP 200 con título correcto sin sesión en https://mgstock-app.github.io. Aviso de borradores actualizado en rama, aún no desplegado. |
| Responsable y revisión jurídica | REQUIERE VALIDACIÓN MANUAL | Faltan identidad/razón social, domicilio, contacto formal, plazos por datos y respaldos, prestadores/transferencias y evaluación AAIP. No se inventaron datos ni se certifica cumplimiento legal. |
| Despliegue de este bloque | PENDIENTE | Revisión y CI del PR; integrar sólo cambios aprobados y validar luego Pages, nueva caché, sesión y cuentas reales. |

## Pruebas y límites

- TypeScript (`tsc --noEmit`), ESLint y build estático: aprobados.
- `npm test`: 34/34; incluye tres regresiones de sesión, siete de borradores y
  un escenario PostgreSQL con múltiples verificaciones reales de RLS/RPC.
- Las pruebas SQL usan PGlite local y claims ficticios; no son pruebas con cuentas
  reales ni con el servicio de Auth remoto. El mock de navegador sólo verifica UI.
- Cypress de stock/ingreso y privacidad: 15/15 aprobados en el build final; incluye
  recorridos de borrador entre cuentas, retorno al titular, legado preservado y menú
  visible en móvil (390 px) y escritorio (1280 px), con red de Supabase real bloqueada.
- Suite Python/Playwright: pendiente en este equipo (módulo no instalado).
- Suite de remitos PDF/OCR: pendiente. El instalador existente vendor-ocr.mjs falla
  en Windows con `spawnSync npm ENOENT`; no se confundió ese fallo de preparación
  con un fallo de lectura de documentos. CI Linux conserva su flujo de instalación.
- Un intento inicial de los casos nuevos de navegador encontró supuestos incorrectos
  del test: Guardar permite controles sin cambios, menú móvil cerrado y escritura
  durante hidratación. Se ajustaron a texto Sin cambios, navegación visible y espera
  del script de QA. No se omiten las comprobaciones de aislamiento.

## Continuación

1. Revisar/ejecutar CI, incluidas pruebas remito, antes de integrar. Mantener issue #8 abierto.
2. Preparar PR de dependencias con migración revisada de Tailwind/tooling, pruebas
   visuales en ambas sucursales y nuevo npm audit. Los 9 avisos no están corregidos.
3. Revisar todos los SECURITY DEFINER, funciones/vistas, permisos CREATE en esquemas
   y rutas de importación con pruebas negativas adicionales antes de cambiar SQL.
4. Probar cuentas propias reales por rol, JWT emitidos antes de salir, dos pestañas,
   cambio remoto de permisos, bfcache y celular físico. No usar cuentas reales en QA.
5. Recuperación de legados: conservar perfil/dispositivo; identificar titular con
   evidencia externa, respaldar bytes localmente y restaurar únicamente al namespace
   correcto después de validar acceso. No atribuir por sucursal ni por último login.
   No introducir exportaciones o asignación automática sin esa verificación.
6. Completar datos legales y procedimiento de incidentes/revisión profesional argentina.
7. Si se decide retirar información histórica pública, obtener autorización específica,
   respaldo y plan de impacto en Pages antes de reescribir Git.

Archivos: public/stock/app.js, auth.js, almacenamiento.html; regresiones auth/draft/RLS,
fixtures sintéticos, huellas actualizadas sólo para los dos runtimes revisados,
package/lock (PGlite de desarrollo), QA de privacidad y este documento.
No cambia el esquema remoto, el cálculo de stock ni los datos de ambos locales.

Referencias: documentación oficial de Supabase sobre RLS, sesiones y security advisors;
metadatos actuales del proyecto y esquema versionado. Este informe no certifica cierre
integral ni cumplimiento jurídico definitivo.
