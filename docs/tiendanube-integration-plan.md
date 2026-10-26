# Tiendanube: solicitud y aprobación por empresa

## Flujo
1. Dueño autenticado solicita habilitar Tiendanube para su tenant.
2. Creadora revisa solicitudes en su panel; aprueba, rechaza o suspende con auditoría.
3. Aprobación habilita OAuth, no conecta por sí misma.
4. Dueño autoriza su tienda; solo entonces se habilita sincronización.

## Seguridad obligatoria
- Supabase RLS por tenant y RPC que comprueban roles reales, no metadatos del cliente.
- Creadora en modo soporte de solo lectura no puede aprobar ni vincular tiendas.
- Otras empresas y gerentes sin delegación no ven datos ni controles de conexión.
- Tokens OAuth solo en servidor, jamás en HTML, logs ni respuestas RPC.
- Estado OAuth firmado, webhooks autenticados e idempotentes, revocación y auditoría.
- Una solicitud activa por empresa; no se descuentan dos veces pedidos duplicados.

## Contrato de backend
- Tabla tiendanube_connection_requests: id, tenant_id, requested_by, status, requested_at, reviewed_by, reviewed_at, review_note.
- Tabla tiendanube_connections: tenant_id, store_id, status, connected_at, last_sync_at, last_error.
- RPC request_tiendanube_connection, creator_review_tiendanube_connection y list_tiendanube_requests.
- Endpoint OAuth y proceso de sincronización seguros antes de habilitar botones.

## Pruebas mínimas
- Dueño A solicita y B no puede leer su solicitud.
- Gerente/colaborador no pueden aprobar; soporte creadora tampoco.
- Aprobación A no habilita B.
- OAuth cancelado no conecta la tienda.
- Suspender detiene sincronización.
- Duplicados de webhooks no duplican movimientos de stock.

Estado: documento de diseño. No es una integración implementada ni publicada.
