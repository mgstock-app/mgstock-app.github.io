# GestLok — hoja de ruta de producto y seguridad

Actualización: 24/10/2026. GestLok sigue **gratuita**, con aprobación de acceso. No habilitar nuevas empresas todavía.

## Entregada en la primera fase (cliente)
- Inicio orientado a tareas: comenzar conteo, faltantes, proveedores e historial.
- Guía corta para cargar productos cuando un local está vacío.
- Ficha de proveedor **por local**: contacto, WhatsApp con código internacional, entrega y observaciones. Se guarda en `<local>/proveedores` mediante las políticas RLS ya existentes; no se guardan datos en otro local ni se modifica el catálogo.
- Mensaje de pedido derivado de productos faltantes, para copiar o revisar en WhatsApp. El envío siempre requiere la acción de una persona.
- Presentación GestLok solo al abrir desde cero, no al regresar de otra app.
- Limpieza de la denominación pública en documentos de privacidad, términos y almacenamiento. **Revisión legal pendiente**.

## Prioridad 0 · Antes de ofrecerla a la cafetería
1. **Multiempresa en Supabase:** no crear locales nuevos de otras empresas bajo los roles globales actuales.
   - Añadir modelo separado de empresas (`businesses`) y membresías (`business_memberships`) con roles de administradora de plataforma, dueña de empresa, gerente y lectura.
   - Relacionar locales y documentos con empresa sin borrar ni recrear datos; conservar Munro/Torcuato dentro de una única empresa Mi Gusto.
   - RLS de lectura, escritura, solicitudes, proveedores, chat, importaciones, exportaciones y cambios de membresías.
   - Quitar alcance global del rol dueño: solamente la creadora de plataforma podrá acceder a las empresas que administra; el dueño sólo a su empresa.
   - Pruebas con sesiones reales de al menos dos empresas y cuatro roles, intento explícito de acceso cruzado a filas y operaciones RPC, restauración probada de respaldo.
   - Plan de migración por etapas con copias SQL y posibilidad de reversión **antes** del cambio de políticas de producción.
2. **Guardado confiable y reconexión:** guardar cada conteo con identificador idempotente, escritura transaccional entre movimientos y historial, comparaciones de versiones antes de aplicar borradores y resolución de conflictos de dos dispositivos. No afirmar que la sincronización actual es infalible al cerrar o apagar el equipo.
3. Seguridad de cuentas: revisar protección de contraseñas filtradas, MFA para creadora, sesiones compartidas, auditoría y accesos revocados.

## Prioridad 1 · Cierre diario de stock
- Registrar movimientos estructurados: stock inicial, ingreso, ventas, consumo interno, merma, ajuste y conteo físico, con usuario, fecha, local y unidades.
- Calcular `stock_esperado = stock_inicial + ingresos - ventas - consumo - merma + ajustes` y `diferencia = conteo_fisico - stock_esperado`.
- No inferir ventas desde conteos; importarlas o registrarlas de forma explícita.
- Controlar decimales/unidades y conversiones (kg, litros, unidades, paquetes).
- Registrar una versión única del cierre diario por local y fecha, con reapertura justificada, auditoría y exportación.
- Probar duplicados, cierres concurrentes, sin conexión y ajustes retroactivos.

## Prioridad 2 · Onboarding y alertas
- Asistente guiado: crear empresa y sucursal, importar catálogo, mínimos, proveedores, invitar equipo, primer conteo.
- Alertas por mínimos, pedido sin enviar, entrega pendiente y mensajes nuevos, visibles en bandeja interna.
- Notificaciones push solo con permiso explícito; evitar contenido privado de otros locales en notificaciones.
- Panel dueño con indicadores de faltantes, proveedores, actividad por sucursal y diferencias diarias.

## Calidad y lanzamiento
- Cypress de todos los perfiles + pruebas Supabase **reales** aisladas del entorno productivo.
- Revisión humana en tablets, Android e iPhone: instalación, actualización y retención de borradores.
- Validar páginas legales con responsable de datos y política concreta de conservación.
- Auditoría de usabilidad con cafetería piloto antes de habilitar operaciones reales de otra empresa.

## No incluido aún
- Arquitectura multitenant, registro de ventas/consumo, conciliación diaria persistente, notificaciones push, pedidos enviados automáticamente, sincronización transaccional y revisión legal final.
- **No presentar estos puntos como funciones terminadas.**
