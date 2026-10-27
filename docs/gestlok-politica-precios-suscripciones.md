# GESTLOK — Política de precios aprobada para implementación

Decisión de producto (27 de octubre de 2026): **un precio mensual general en ARS, con excepciones gratuitas o descuentos por empresa**.

## Reglas funcionales
- La creadora define un único precio base mensual (centavos enteros ARS o monto decimal exacto, nunca float para cálculos monetarios).
- Por empresa se configura una de tres modalidades: `general`, `gratuita`, `descuento`.
- `gratuita`: precio efectivo cero, sin crear autorización de cobro ni suscripción de Mercado Pago.
- `descuento`: precio mensual efectivo explícito menor al general; mostrar base, descuento e importe final; no permitir importes negativos.
- El precio se fija al aceptar cada suscripción. Cambios futuros del precio base **no alteran automáticamente acuerdos vigentes**; requieren consentimiento y flujo de actualización de Mercado Pago verificado.
- Creadora únicamente: cambiar modalidad, precio y motivo de excepción; auditar usuario, fecha y valores anteriores/nuevos.
- Estados separados: licencia (gratuita, prueba, paga, suspendida) y cobro (pendiente, confirmado, fallido, cancelado). Nunca activar por webhook sin verificación contra API oficial.
- Mostrar renovaciones, vencimientos, último pago y excepciones en panel privado; no revelar datos entre empresas.
- No aplicar bloqueos automáticos ni modificar permisos/datos reales existentes durante pruebas.

## Seguridad y despliegue
- Implementar RLS, autorización servidor y auditoría; jamás aceptar cambios de precios desde rol dueño/gerente.
- Mercado Pago solo sandbox hasta completar pruebas de firma, duplicados, idempotencia, conciliación, cancelaciones y permisos multiempresa.
- Ningún cobro real, credencial productiva o cambio de licencia existente se activa por este documento.

## Pendiente de decisión
- **Importe mensual general aprobado: ARS $35.000 por mes** (35.000 pesos argentinos; precio inicial de referencia para nuevas suscripciones).
- Descuentos específicos y duración (si corresponde).
- Política comercial de avisos de cambio de precio y cancelación.
