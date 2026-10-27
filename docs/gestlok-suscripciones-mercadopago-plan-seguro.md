# GESTLOK — suscripciones y Mercado Pago (implementación por etapas)

Estado: **diseño técnico en desarrollo; no hay cobros activados ni panel publicado**.

## Panel privado de creadora
- Resumen: empresas activas, gratuitas, pendientes, pagos confirmados, vencimientos e ingresos reales conciliados.
- Listado por empresa: nombre, titular, tipo de licencia, precio ARS/mes, estado, última confirmación, próxima renovación, historial de cambios.
- Acciones auditables exclusivamente de creadora: asignar gratuita, definir precio por empresa, suspender cobro futuro, consultar historial; confirmar cada cambio.
- No exponer suscripciones ni precio a la empresa con concesión privada permanente; no permitir que un dueño gestione otra empresa.
- No inventar importes ni marcar pagos exitosos por la mera llegada de un webhook.

## Arquitectura de seguridad
- El frontend está en GitHub Pages y **no puede recibir webhooks**. Endpoint HTTPS en Supabase Edge Functions (servidor), separado del frontend.
- Guardar MP_ACCESS_TOKEN_TEST y MP_WEBHOOK_SECRET_TEST solo como secretos del servidor, nunca en GitHub, NEXT_PUBLIC ni navegador.
- Verificar firma de notificación, identificador y timestamp; consultar el recurso oficial con credenciales de servidor antes de modificar el estado; manejar duplicados, reintentos y eventos fuera de orden.
- Asociar cada suscripción a la empresa autenticada y al ID del proveedor; registrar auditoría e idempotencia. Nunca confiar en tenant_id, precio ni estado proporcionados por el cliente.
- Verificar RLS y aislamiento multiempresa de todas las tablas que consultará el panel, antes de permitir cuentas externas.
- Sin credenciales seguras ni pruebas automatizadas completas, no desplegar endpoint operativo ni activar cobros.

## Flujo de prueba
1. Configurar secretos de prueba en el panel seguro de Supabase; no copiarlos al chat.
2. Implementar endpoint de webhook y creación de suscripción, controles de permisos, migraciones y tests con datos ficticios.
3. Desplegar endpoint de prueba, verificar HTTPS y firmas, y recién entonces copiar su URL a Webhooks > Modo de prueba de Mercado Pago.
4. Probar alta, renovación, cancelación, duplicado, firma inválida y cruce de empresas.
5. Revisión y autorización explícita antes de usar credenciales productivas o cobrar.

## Estado actual
PR #26 integró estructura privada `gestlok_billing`, sin interfaz ni pagos. El panel actual todavía informa que GESTLOK es gratuito. La activación de credenciales de prueba en Mercado Pago no conecta automáticamente la app.
