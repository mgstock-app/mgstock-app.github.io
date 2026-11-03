# Sistema de venta — integración pendiente

## Estado
Desarrollo aislado en rama. **No publicado.** `pos-core.js` valida cantidades, precios y disponibilidad en memoria; no registra ventas ni actualiza Supabase.

## Hallazgo del código existente
`public/stock/gestlok-future-pricing.js` usa `gestlok_future_local_prices_stock`, con `tenant_id`, `local_id`, `sku`, `sale_price`, `stock_quantity`, `cost_price`. Este módulo es para locales futuros y su interfaz actual permite únicamente al dueño. **No asumir que corresponde a la empresa Cami**: confirmar su tenant real, local y módulo vigente antes de conectar el POS.

## Requisitos antes de publicar
1. Resolver identidad del tenant de Cami y su Stock Local real con RLS, nunca habilitar por email de la UI.
2. Crear operación SQL atómica para venta + descuento, con idempotency key, bloqueo de fila y stock >= 0; permisos de dueño/gerente comprobados en servidor.
3. Caja por turno con cierre operativo gerente y cierre contable exclusivo dueño. Proteger costos y ganancias en SQL, no solo ocultarlos en HTML.
4. Integrar escaneo por cámara y entrada manual; impresión de códigos en tamaño compatible con impresora.
5. Pruebas unitarias, Cypress, permisos multiempresa, concurrencia y despliegue comprobado.

**No tocar Mi Gusto ni otras empresas.**
