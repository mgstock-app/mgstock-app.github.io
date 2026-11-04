# Plan Scanner

El registro privado `public.gestlok_pilot_access` identifica a los clientes Scanner: `plan_code='scanner'`, `enabled=true` y `owner_uid` verificado. Las altas futuras de Scanner usan este mismo registro; su valor por defecto es `scanner`. No se infiere el plan por correo, nombre comercial ni un ID fijo.

Cada empresa habilitada recibe Inicio, Caja, Sistema de ventas, Stock y Precios. El catálogo se consulta con el tenant de la sesión y conserva RLS. No se habilitan Proveedores, Reportes, Pedidos ni módulos de otros planes. El botón Volver y el retroceso del navegador conservan la aplicación y vuelven a Mi local. Caja mantiene su habilitación independiente del servidor.

No registrar Mi Gusto ni clientes de otros planes en este acceso. Esta actualización no crea clientes ni cambia inventario, historial o membresías. La migración agrega el identificador de Scanner a sus accesos existentes y permite calcular precios para otros clientes Scanner ya autorizados, conservando el cálculo anterior.

Validación: `npm test`, `npm run lint`, `npm run build` y Cypress `qa/cypress/e2e/mi-local-unificado.cy.js` (empresa actual y segunda empresa ficticia). La suite completa de Cypress del PR verifica la regresión de los otros módulos.
