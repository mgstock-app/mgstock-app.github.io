# GestLok — licencias y suscripciones: preparación privada

Estado (24/10/2026): **no se cobra a nadie ni existe una pantalla de pagos o licencias en la aplicación**. Se creó exclusivamente la estructura privada de base de datos para habilitar suscripciones más adelante. El acceso actual por autorización sigue intacto.

## Excepción histórica: permanente hasta revocación administrativa

La cuenta verificada de la dueña original tiene un registro `complimentary_unlimited`, activo, sin vencimiento y sin restricciones de cantidad de locales. Se vinculó por identidad de Auth (UUID), y NO por el rol genérico `dueno`; las dueñas futuras no heredan esta excepción.

**Regla de interfaz obligatoria:** a esta cuenta no debe aparecerle ninguna opción, alerta ni referencia a «Suscripciones», «Pagos», «Facturación», «Plan», «Licencia gratuita», «Vencimiento», «Actualizar plan», «Método de pago» o «Contratar», ni en su perfil, ni en el menú, ni en banners, ni en emails comerciales automatizados. Tampoco pedirle que renueve ni que gestione una excepción. Su experiencia debe seguir siendo normal, sin cambios. La concesión existe únicamente en el registro privado de administración. Los miembros autorizados de su empresa deben quedar bajo la misma cobertura una vez que GestLok soporte múltiples empresas.

La revocación solo puede realizarla quien administre el servidor y el sistema privado de licencias, por una acción explícita y auditable. **No hay botón de revocación, cobro, renovación o panel público implementado.** No implementar revocación automática, ni expiración accidental de la excepción.

## Estructura incorporada

- `gestlok_billing.accounts`: cuenta comercial del dueño autenticado.
- `gestlok_billing.license_grants`: excepción de cortesía por cuenta; `ends_at = NULL`.
- `gestlok_billing.subscriptions`: reservada para la futura integración con Mercado Pago, sin registros de pagos ficticios.

Esquema privado no expuesto en la API pública de Supabase. RLS habilitada, acceso `anon` y `authenticated` revocado. Solo el servidor confiable puede leer y escribir allí. Nunca incluir `service_role` o credenciales del proveedor de pago en GitHub Pages o en el navegador.

## Integración Mercado Pago: pendiente, sin pagos reales

Mercado Pago ofrece suscripciones y API sin costo de abono mensual obligatorio por usar la herramienta; aplica comisiones por cobro acreditado. Validar tarifas actuales antes de contratar: https://www.mercadopago.com.ar/herramientas-para-vender/suscripciones y https://www.mercadopago.com.ar/developers/es/docs/subscriptions/overview.

No integrar Stripe o RevenueCat simultáneamente sin necesidad comercial. No se registraron claves de Mercado Pago ni se crearon cargos.

## Bloqueante de seguridad: aislar empresas

La actual `public.docs` funciona con permisos globales `dueno` y `creadora`, por lo que **NO es seguro dar de alta empresas clientes aún**. Antes de cobrar:
1. Respaldar los datos existentes e introducir identidad de empresa `tenant_id` en locales, equipo, stock, proveedores, movimientos y chat.
2. Restringir la base mediante políticas RLS **por empresa**, no solo esconder botones. Conservar todos los datos de los locales actuales.
3. Vincular las licencias al tenant, hacer que la excepción de la dueña cubra su empresa sin límites y permanezca completamente invisible para ella.
4. Crear integración privada con Mercado Pago: endpoint HTTPS seguro, firma de webhooks verificada, estado de pago confirmado con el proveedor, idempotencia y reconciliación.
5. Construir el panel de facturación únicamente para clientes de pago; **no mostrarlo a cuentas con licencia `complimentary_unlimited`**. Evitar acciones de bloqueo cuando la pasarela falle o esté desconectada.
6. Probar acceso cruzado con usuarios ficticios de empresas distintas y cuentas de gerente; comprobar que los clientes nunca vean ni modifiquen licencias ajenas.
7. Activar pagos reales solo después de pruebas y una autorización explícita.

## Evidencia y despliegue

Migración: `supabase/migrations/20261024_billing_foundation_private.sql`. Concesión de la excepción creada **solo en la base privada**, sin publicar correos, nombres ni UUID de usuarios. Si la migración se ejecuta en otro proyecto no se crean excepciones automáticas.

No existe vínculo entre estas tablas privadas y el frontend actual, así que no hay opciones de facturación visibles ni muro de pago.
