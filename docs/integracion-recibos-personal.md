# Integración del módulo Recibos y Personal en GESTLOK

Estado: etapa 1 implementada (inventario y reconciliación de respaldos de reportes). Ver `docs/recibonet-inventario-58.md`. No habilitar a usuarios reales hasta completar seguridad y pruebas.

## Arquitectura
- GESTLOK es el punto único de entrada y la marca visual.
- Módulos por empresa: comercial, recibos_personal. La creadora habilita módulos explícitamente.
- El menú solo muestra módulos autorizados, pero el backend y RLS deben validar cada operación.
- ReciboNet conserva su backend protegido durante la transición. GESTLOK se publica como exportación estática: no es seguro copiar directamente rutas de servidor de ReciboNet.
- No duplicar empresas, locales ni usuarios. Definir un mapeo de identificadores antes de migrar.
- No exponer credenciales, tokens o información de colaboradores en el repositorio.

## Alcance funcional
Recibos, liquidaciones, imágenes y exportación PDF por WhatsApp; horarios semanales y mensuales; enlaces Excel/Google Sheets; historial, planillas, locales, roles, aprobaciones, respaldos y botones existentes.

## Secuencia
1. Inventariar componentes, rutas, RPC y políticas RLS de ambos sistemas.
2. Crear asignación de módulos por empresa y autorización de creadora, con pruebas de denegación.
3. Integrar interfaz GESTLOK para Recibos y Personal sin exponer datos ajenos.
4. Adaptar funciones de ReciboNet al backend protegido, manteniendo exportación y enlaces.
5. Respaldar y migrar datos de forma idempotente, reconciliando Munro y Torcuato de Alessandro 2026002.
6. Ejecutar pruebas de permisos cruzados, horarios, Excel, PDF, WhatsApp, sesiones y móviles.
7. Publicar, verificar y solo después retirar el acceso a la aplicación anterior.

## Condición de salida
No apagar ReciboNet ni mover datos reales hasta contar con validación funcional, controles de acceso comprobados y procedimiento de reversión.

## Pendiente prioritario: publicación visible de actualizaciones (25/10/2026)
- La usuaria confirmó en Android que «Guardar stock» aparece, pero «Observación interna» no aparece en las tarjetas de Proveedores.
- El código de observaciones existe en `public/stock/app.js` y se fusionó un ajuste de versión del controlador en PR #57; falta verificar despliegue y funcionamiento real.
- Corregir actualización automática de la PWA instalada y web, incluyendo service worker, caché y estado de GitHub Pages; comprobar que no se pierdan datos ni sesiones.
- No marcar resuelto hasta que la usuaria vea y pueda guardar una observación por producto en la aplicación publicada.
- Prioridad de trabajo actual: integración de ReciboNet. Este pendiente no debe olvidarse ni confundirse con una tarea completada.
