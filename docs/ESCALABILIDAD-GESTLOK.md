# GESTLOK — arquitectura de escalabilidad incremental

Estado: **fase 1 implementada en PR #134**. Este documento no certifica capacidad de producción: los umbrales siguientes son metas que requieren medición.

## Principios innegociables
- Cada solicitud y registro permanece aislado por `tenant_id`, empresa, local y permiso. La interfaz no reemplaza la autorización de Supabase (RLS).
- Los 3 roles de negocio, la administradora y los colaboradores no deben adquirir acceso por una optimización de rendimiento.
- La sesión PWA y la cola offline conservan el usuario y local; no sincronizar pendientes con otra identidad.
- Evitar cambios masivos en tablas existentes y nunca usar datos reales para simular carga.

## Estado encontrado en el repositorio
- Catálogo interno de tienda online: RPC con filtros, cursor estable y límite de **50 productos** por página; mantener ese patrón.
- Planillas clásicas (`public.docs`): las colecciones se leen completas, por páginas de 1.000 en `auth.js`. El cliente ordena algunas colecciones; el historial de períodos no tiene límite global.
- `public.docs` conserva clave primaria `(col, id)`, además de `tenant_id` y políticas RLS: una evolución de esquema hacia clave compuesta por tenant requiere migración y pruebas de compatibilidad; **no cambiar esa clave en caliente**.
- Consultas en tiempo real: mantener avisos de cambios; no recargar continuamente cada colección desde las pestañas ocultas.

## Fase 1 (PR #134)
- Desduplicar descargas simultáneas de una misma colección; invalidación cuando llegan cambios.
- Orden estable en lecturas paginadas; sondeo de recuperación cada 90 s, solo con pantalla visible y conexión.
- Índices de lectura para organizaciones, sucursales, legajos, horarios y notificaciones; no cambian RLS.
- Prueba de adaptador sintética con 10.050 filas, sin datos de producción.

## Fase 2 — imprescindible para inventarios grandes
1. Pasar `stock`, `fabrica` y hojas clásicas a un listado **paginar/filtrar en el servidor** por empresa/local, sin descargar 10.000 productos por cada entrada.
2. Añadir búsqueda por nombre/SKU, categorías, proveedor y estados con índices medidos sobre planes `EXPLAIN (ANALYZE, BUFFERS)`.
3. Renderizar únicamente filas visibles; mostrar 50 a 100 por página o ventana virtual con scroll accesible.
4. Cargar históricos de conteos, compras, sueldos y proveedores **por demanda**, no al iniciar.
5. Importar CSV/Excel por lotes acotados y recuperables con clave idempotente, validación y control de errores.
6. Revisar esquema y contrato de claves para evitar colisiones entre locales homónimos de diferentes empresas; migrar solo tras pruebas de aislamiento.

## Fase 3 — resistencia operativa
- Métricas por organización (sin datos personales): latencias p50/p95, errores de API, consultas repetidas, tamaño de sincronización, conexiones, cuota de almacenamiento.
- Cargas sintéticas: 100 empresas × 10 locales × 10.000 productos; aumentar gradualmente sin ensayar sobre producción.
- Metas a verificar en entorno de pruebas: página de productos p95 < 1 s, errores de autorización = 0, sin transferencias entre empresas, sincronización offline idempotente.
- Revisar `pg_stat_statements`, índices duplicados, cuotas de PostgreSQL y uso de ancho de banda; ajustar plan de Supabase solo con evidencias.
- Plan de respaldo, restauración probada, despliegues progresivos y reversión automática ante degradación.

## Comprobaciones de salida
- CI: lint, tests, build y Cypress, sin desactivar pruebas.
- RLS: usuario de empresa A no puede leer o editar filas de B aunque adivine un ID.
- Una invitación de colaborador no crea roles de dueño/gerente ni mezcla legajos.
- Los datos reales de Mi Gusto y los módulos actuales siguen íntegros.
- Publicación visible en `https://gestlok.com.ar` **verificada después del despliegue**.
