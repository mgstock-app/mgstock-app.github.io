# GESTLOK — Plan de cierre técnico de etapas (sin monetización)
**Decisión del proyecto:** 24 de octubre de 2026  
**Repositorio:** https://github.com/mgstock-app/mgstock-app.github.io  
**Rama estable:** `main` — nunca trabajar desde una rama histórica sin comparar.  
**Aplicación:** https://mgstock-app.github.io/

## Objetivo y orden

Completar funcionalmente **las etapas 1 a 11** y la **preparación de lanzamiento de la etapa 14**. **NO implementar la etapa 13** (precios, planes, pagos, facturación, pasarelas ni alta comercial autónoma). La **etapa 12 será el último bloque de validación integral**, antes de aprobar el lanzamiento a clientes externos.

Importante: «poner en verde» significa que la función fue desarrollada y **probada con evidencias**, no cambiar una etiqueta a mano.

**Orden para ejecutar:**

1. **Bloque A: seguridad y plataforma:** etapas 1, 2, 3 y 10, en ese orden de dependencias. Garantizar aislamiento multiempresa real antes de agregar clientes externos.
2. **Bloque B: operación diaria:** etapas 4, 5, 6, 7 y 9. Revisar que Inicio, los registros y las hojas independizadas compartan la información correcta sin mezclar catálogos.
3. **Bloque C: resiliencia y móvil:** etapas 8 y 11. Offline confiable, PWA instalada y actualizaciones.
4. **Bloque D: preparación comercial sin cobros:** etapa 14: demo con empresas ficticias, tutoriales, marca, manual y proceso de soporte, más preparación de piloto. No habilitar usuarios ajenos reales todavía.
5. **Bloque E — ÚLTIMO:** etapa 12: pruebas de seguridad integral, roles, tenant isolation, sincronización, navegador, dispositivos reales, restauración de copias, rendimiento y aceptación.
6. **Activación del piloto:** solamente después de aprobar la etapa 12 y con autorización expresa. El lanzamiento público es una compuerta posterior a la auditoría, no una excusa para probar con datos de clientes.

Se ejecutan **smoke tests y regresiones en cada PR**, aunque el bloque completo de testing integral (etapa 12) queda al final.

## Aprobación («verde») para cada etapa

| Etapa | Estado al crear este plan | Definición verificable de completada |
|---|---|---|
| **1. Identidad GESTLOK** | Avanzada | Marca GestLok homogénea en web, iconos, PWA, ingreso, docs y mensajes; logos de negocios solo por perfil autorizado; responsive; documentación del dominio/OAuth futuro sin migración improvisada. |
| **2. Arquitectura multiempresa** | **Pendiente y bloqueante** | Tablas con tenant/business id inmutable; pertenencia/roles por negocio; migración preservando locales reales y respaldos; RLS de todos los recursos, chat/proveedores/docs incluidos; pruebas negativas reales con dos empresas ficticias. Ningún dueño puede leer otra empresa. |
| **3. Usuarios y permisos** | Parcial | Roles de plataforma (soporte auditado y restringido), dueño por empresa, gerente por local y lectura; alta/aprobación, revocación, login y recuperación; escalada de privilegios bloqueada en DB; cuentas multiempresa sin mezcla. |
| **4. Productos y proveedores** | Avanzada | CRUD y validación de catálogos por empresa/local, contactos de proveedor, productos vinculados, pedidos compartibles, importación/exportación y respaldos; pruebas de duplicados/unidades; sin datos de otra empresa. |
| **5. Control de stock** | Avanzada | Estado real/ideal/poco/exceso, ingresos, egresos, traslados entre sucursales autorizadas con trazabilidad, cantidades consistentes y sin dobles descuentos; auditabilidad y control de permisos. |
| **6. Conteos y diferencias** | Avanzada | Historial por fecha y hoja, fórmula sistema = inicio + ingresos − egresos, diferencia física contra sistema, precisiones fraccionarias, estado de guardado confirmado, ninguna hoja altera otra. |
| **7. Chat interno** | Implementado con mejoras pendientes | Aislamiento por empresa y local también con RLS, lectura/escritura por rol, reintentos sin duplicados, estado no leído y notificaciones funcionales; offline declara su limitación; privacidad de mensajes. |
| **8. Uso sin Internet** | **Parcial** | PWA funcional offline, acciones editables con cola durable por usuario/empresa/local, reintentos idempotentes, detección/resolución de conflictos y sincronización verificada tras reconexión, cierre/reapertura y cambio de usuario. Hasta entonces indicar que son borradores, NO sincronización automática. |
| **9. Paneles y reportes** | Parcial | Inicio muestra todas las hojas de cada local y datos realmente guardados, sin duplicar Stock+Conteo; dashboard histórico, alertas y comparaciones de locales del mismo tenant; reporte descargable y filtros por período; respuestas de backend correctas. |
| **10. Seguridad y respaldos** | Parcial | RLS/funciones privilegiadas revisadas, documentos de privacidad y términos accesibles, retención definida por responsable legal, backup cifrado y restauración probada en entorno aislado, logs/auditoría de cambios, manejo de sesión y vulnerabilidades. La revisión legal final requiere profesional. |
| **11. Aplicación móvil** | Avanzada | Instalación PWA en Android/Chrome y iOS/Safari, login, cierre/reapertura, actualización sin pérdida, formularios y navegación responsive, pruebas reales de dispositivo y accesibilidad. |
| **12. Testing integral final** | **Se ejecuta ÚLTIMO** | Matriz completa E2E real y simulada, permisos y roles, dos empresas ficticias con intentos cruzados, offline con colisiones, restauraciones, exportación, iOS/Android, accesibilidad, seguridad, rendimiento, sign-off y reporte de fallos resueltos. |
| **13. Planes comerciales** | **Pausada por decisión de la propietaria** | **NO desarrollar ni habilitar pagos, suscripciones o facturación. No impide terminar la app para demostración/piloto autorizado gratuito.** |
| **14. Preparación de lanzamiento** | Parcial | Demo y video con datos falsos, sitio informativo, manual corto para dueños y gerentes, onboarding controlado, soporte e instrucciones de recuperación y publicación. **No abrirlo a clientes externos reales hasta el OK de etapa 12.** |

## Hallazgos que no se pueden ignorar

- La base heredada MG Stock (`vgsepaaewbctjsjcpeta`) todavía **no es segura para alojar empresas ajenas**: roles globales `creadora/dueno` de la estructura actual. No agregar cafeterías u otros comercios a `locales` hasta hacer migración multiempresa y verificar RLS.
- Se deben preservar sin excepción los registros reales de los locales actuales, entre ellos Munro y Torcuato, y no modificar ReciboNet ni su base de datos.
- La app ofrece borradores y carga de recursos offline; **no se ha demostrado** una sincronización automática completa. No prometerla antes de pasar las pruebas de la etapa 8.
- La existencia de documentos de privacidad no equivale a cumplimiento legal certificado; completar identificación del responsable y revisión profesional.
- La mejora de Inicio que resume hojas independientes se integró en [PR #22](https://github.com/mgstock-app/mgstock-app.github.io/pull/22), con CI verde; verificar el despliegue de `main`.
- La guía de ubicación para Claude se integró en [PR #21](https://github.com/mgstock-app/mgstock-app.github.io/pull/21).
- El repositorio privado de respaldo técnico no es el repositorio para desarrollar la marca comercial. No copiar seeds, usuarios o material privado al código público.

## Reglas de implementación

- Cada bloque en **rama nueva desde `main`** y pull request corto, con descripción, rollback, verificación y comparación con pruebas previas.
- No realizar migraciones destructivas ni escribir datos reales durante pruebas. Para RLS utilizar backups y simulaciones reversibles aisladas; validar con dos empresas ficticias.
- No forzar publicaciones con CI rojo. Ejecutar al menos `npm ci`, `npm run lint`, `npm test`, `npm run build` y Cypress relevante. Cuando el código lo exija, sumar pruebas reales.
- No pagar, contratar infraestructura nueva, activar suscripciones ni cambiar dominios o proveedores OAuth sin aprobación.
- No dar por «verde» una etapa solamente porque existe la pantalla: debe funcionar tanto frontend como backend, permisos y pruebas.
- Trabajar en tareas pequeñas y detenerse antes de agotar límites de Codex/Claude; en cada pausa documentar SHA, rama, cambios, pruebas, errores y siguiente tarea.

## Primera tarea obligatoria

**Etapa 2: arquitectura multiempresa segura**, con diseño y auditoría SQL antes de migración. Identificar relaciones de `docs`, usuarios, locales y chat; proponer esquema tenant_id + membresías; plan no destructivo para migrar locales existentes; pruebas de aislamiento reales y plan de rollback. Sólo después se deben habilitar nuevos negocios, y toda implementación debe conservar compatibilidad con los datos actuales.

> Documento de planificación — NO constituye evidencia de que las etapas figuren completadas.
