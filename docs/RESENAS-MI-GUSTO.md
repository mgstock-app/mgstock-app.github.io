# Reseñas · Mi Gusto–Munro

Implementación propuesta en `codex/munro-resenas`, sin publicación ni cambios de datos reales. Excepción expresa de alcance: esta carpeta solo se habilita en Munro, como pidió la usuaria; Torcuato y las otras organizaciones no cambian.

## Comportamiento

- Administración de local → Reseñas. Estética blanca/negra con tarjetas ámbar, verdes y rojas, buscador, tabla histórica y modal.
- Nombre y teléfono argentino normalizado (10 dígitos, sin 0 ni 15; acepta prefijos +54, +54 9 y 0054). Las variantes de formato del mismo número no permiten repetir el beneficio.
- Código aleatorio de seis caracteres hexadecimales (alfanumérico), generado exclusivamente en PostgreSQL; índice único permanente y reintento de colisiones. No se elimina ni recicla un código.
- Beneficio fijo 10%, un cupón por teléfono/mes. Identidad comercial del cliente basada en teléfono; no verifica titularidad por SMS ni puede detectar a alguien que use otro número.
- Emisión y uso del 1 al 12 inclusive, zona America/Argentina/Buenos_Aires. Desde las 00:00 del 13 todo pendiente del mes queda efectivamente vencido. Estado calculado al consultar y guardia de fecha al usar; no depende de cron, reloj del navegador ni de que alguien abra la app. Usados conservan su estado.
- Marcar utilizado es irreversible, atómico y auditado. No se permite cambiar código, reactivar, borrar o reemitir en el mismo mes; esto preserva el único uso y el historial. El modal consulta datos inmutables y permite confirmar el uso con tilde.
- Historial de todos los períodos con emisión y utilización; contadores globales y búsqueda por nombre, teléfono y código.
- Descuento independiente de publicar, calificar o demostrar una reseña en Google. No incluye vínculos ni comprobaciones de reseñas.

## Seguridad

Se reutiliza el tenant existente de Mi Gusto y los helpers `mi_rol`, `puede_editar_local` y `gestlok_tenancy.current_tenant_id`. Dueños y creadora autorizados de Mi Gusto; gerentes con edición de Munro. No se conceden roles por nombres ni correos enviados desde el cliente. Las pertenencias existentes de Gisela, Martín y Federico deben confirmarse al activar, sin ampliar permisos automáticamente.

Datos y eventos en esquema privado `gestlok_resenas_private`, RLS habilitado y sin acceso directo para anon/authenticated. Tres RPC públicos con autenticación, tenant y permiso comprobados en servidor. Nombre, teléfono, código y fechas nunca se guardan en caché offline, localStorage ni el catálogo de documentos existente. Las operaciones necesitan conexión y no se ponen en cola.

## Validación realizada

- Suite completa: 194/194 pruebas aprobadas.
- Pruebas PostgreSQL reales aisladas con PGlite y usuarios ficticios: código/formato/descuento, 51 códigos diferentes, teléfonos equivalentes, unicidad por mes, rechazo de doble uso, paso a nuevo mes, día 12/día 13, preservación de usados, acceso anónimo, rol lector, gerente de Torcuato y dueño de otra empresa. Acceso directo al esquema privado denegado; evento de utilización único.
- Frontend: permisos por rol/local/tenant, normalización, búsqueda y escape de HTML. Compatibilidad de navegación de Motos preservada.
- Lint y build aprobados. Instalación de dependencias: cero vulnerabilidades reportadas por npm audit.
- QA visual local (`node tests/preview-resenas.mjs`, localhost:3140), sin conexión a Supabase: alta, modal, tilde, confirmación de usado y vista móvil/tablet. Capturas ficticias en `docs/qa-resenas/`. La vista QA simula las respuestas; no sustituye la comprobación integrada tras aplicar la migración.
- No se ejecutó Cypress completo ni se probó una sesión real contra las nuevas RPC porque no se modificó Supabase real.

## Activación posterior, pendiente de autorización

1. Revisar/aprobar PR y confirmar pertenencias reales de los tres dueños y gerentes de Munro.
2. En entorno de prueba, aplicar solo `supabase/migrations/20261027015411_munro_resenas_cupones.sql`. No ejecutar todas las migraciones antiguas en bloque.
3. Comprobar login y flujo integrado; usar fecha del 1 al 12 para la emisión (fuera de ese plazo debe rechazarse).
4. Aplicar la migración aprobada en Supabase y luego integrar el PR/publicar frontend. El despliegue de main activa GitHub Pages: no fusionar antes de autorización.
5. Verificar que Torcuato no muestra la carpeta y que sus usuarios no pueden invocar las RPC.

Para retirar la interfaz, revertir el commit del módulo. No borrar tablas ni códigos emitidos: conservar historial. No se aplicó esta migración en producción y no se modificaron stock, planillas, enlaces Sheets ni ReciboNet.
