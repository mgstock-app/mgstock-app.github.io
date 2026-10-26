# Modo sin conexión de ambas áreas — en desarrollo

Pedido: navegación de las áreas autorizadas de cada cuenta, guardado local duradero y envío automático al recuperar conexión; también en la demo, con horarios Excel ficticios y opción de plantilla propia.

## Estado de esta rama

No publicado. La migración NO está aplicada en GESTLOK. ReciboNet no se modifica.

- Núcleo compartido IndexedDB por cuenta/empresa, caché de lecturas y cola sin tokens. Operaciones con UUID estable, reintento de la misma solicitud, conflictos conservados para revisión y permisos remotos al reenviar.
- Migración creada con CLI: `20261026110226_offline_sync_receipts.sql`. Las escrituras se ejecutan como el usuario (RLS); las funciones privadas privilegiadas solo llevan los recibos de la propia cuenta. No se modifica ninguna tabla de negocio preexistente.
- SQL de pruebas con datos ficticios y rollback: compilación, reintento idempotente, identidad/empresa, merge de campos, conflicto, lista de RPC permitidas, permisos existentes y anónimo rechazado. Ejecutado satisfactoriamente en GESTLOK con la migración en la misma transacción revertida.
- Cinco pruebas del núcleo: cambio conservado tras recarga, envío con misma identidad, respuesta perdida sin duplicación, conflicto sin sobrescritura, otra cuenta sin lectura/envío de pendientes. Aprobadas.
- Integración de clientes y pantallas en curso. Todavía falta la verificación integral y no se debe unir esta rama.

## Trabajo restante antes de publicar

- Completar/validar el transporte compartido, preparación del contenido autorizado y tratamiento de falta de almacenamiento; ampliar RPC/tablas solo con pruebas.
- Caché de páginas/recursos de ambos builds en service worker, incluida navegación RSC. Verificar arranque y navegación sin red en navegador real.
- Comprobar cierre/cambio de sesión, token vencido offline, permisos revocados, distintas empresas/locales, reintentos, concurrencia y cola retenida ante error. La sincronización automática funciona con la app abierta o al reabrirla; una PWA cerrada depende del sistema operativo.
- Completar demo de Empleados aislada, Excel ficticio semanal y controles de plantilla GESTLOK/archivo propio, sin datos reales ni consultas a negocios.
- Actualizar textos, pruebas antiguas de bloqueo offline y huellas SHA-256. Correr lint, pruebas, builds y Cypress completos.
- Aplicar migración solo tras pruebas; ejecutar advisors y regresión SQL con rollback. Unir y comprobar despliegue, archivos y caché.

El primer ingreso y la primera descarga requieren conexión. Google Sheets y WhatsApp son servicios externos: su disponibilidad sin red no la controla GESTLOK. La aplicación no amplía los permisos de ningún rol.
