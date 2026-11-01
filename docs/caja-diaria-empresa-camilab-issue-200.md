# Caja diaria — empresa de camilab.lopez99@gmail.com (issue #200)

Estado: **especificación técnica; NO implementado ni publicado**.

## Alcance
- Resolver el identificador real de empresa a partir de membresías autenticadas; el email identifica la solicitud, **no** constituye una autorización.
- Mantener separado el módulo existente de Mi Gusto (Munro/Torcuato).
- Registrar ventas en efectivo o transferencia, monto positivo, fecha/hora de Argentina y usuario que registró.
- Registrar nombre del responsable de caja obligatorio; preservar auditoría del usuario autenticado.
- Un único turno por empresa y día local (restricción UNIQUE en base de datos), apertura única y cierre idempotente.
- Cierre manual con botón «Cerrar día» y cierre automático 23:59 America/Argentina/Buenos_Aires desde tarea de servidor; no depender de navegador abierto.
- El cierre automático debe tolerar ejecución repetida, cortes de red y cambios de fecha.
- No pedir foto. No afectar validaciones de fotos de Mi Gusto.
- Historial inmutable de cierres con sumas por método, total y responsable.
- Nunca permitir lectura/escritura entre empresas: RLS y funciones con comprobación de membresía y rol.

## Antes de migrar
1. Identificar tenant_id real y roles autorizados para la empresa solicitada.
2. Auditar tablas y funciones de pagos existentes y el patrón de permisos del proyecto.
3. Preparar migración no destructiva, rollback y prueba de aislamiento.

## Criterios de aceptación
- [ ] Efectivo y transferencia se registran y suman correctamente.
- [ ] Responsable obligatorio.
- [ ] Un solo turno por día, incluso con dos dispositivos.
- [ ] Cierre manual idempotente.
- [ ] Cierre automático real a las 23:59 hora argentina, aun sin sesión abierta.
- [ ] Sin foto para esta empresa.
- [ ] Historial y totales diarios correctos.
- [ ] Ningún cambio visible ni funcional en Mi Gusto.
- [ ] Pruebas de RLS negativas y Cypress exitosas.
- [ ] Migración aplicada y despliegue verificado.
