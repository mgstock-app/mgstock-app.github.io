# Plan Scanner

El registro privado `public.gestlok_pilot_access` identifica a los clientes Scanner: `plan_code='scanner'`, `enabled=true` y `owner_uid` verificado. Las altas futuras de Scanner usan este mismo registro; su valor por defecto es `scanner`. No se infiere el plan por correo, nombre comercial ni un ID fijo.

Cada empresa habilitada recibe Inicio, Caja, Sistema de ventas, Stock y Precios. El catálogo se consulta con el tenant de la sesión y conserva RLS. No se habilitan Proveedores, Reportes, Pedidos ni módulos de otros planes. El botón Volver y el retroceso del navegador conservan la aplicación y vuelven a Mi local. Caja mantiene su habilitación independiente del servidor.

No registrar Mi Gusto ni clientes de otros planes en este acceso. Esta actualización no crea clientes ni cambia inventario, historial o membresías. La migración agrega el identificador de Scanner a sus accesos existentes y permite calcular precios para otros clientes Scanner ya autorizados, conservando el cálculo anterior.

Dispositivos (por empresa y equipo): el dueño activa o desactiva el lector USB/Bluetooth tipo teclado, verifica la lectura y configura impresora térmica de 58/80 mm. Los periféricos se enlazan desde el sistema operativo; el navegador solo recibe teclas o abre el diálogo de impresión. El ticket contiene el detalle confirmado por el servidor, total, medios de pago, fecha y número de comprobante. Después de cobrar se refrescan stock, últimas ventas y resumen sin perder la opción de imprimir. La configuración del hardware se guarda en este navegador por empresa y no altera Mi Gusto ni las ventas históricas.

Para activar ventas reales, el servidor debe autorizar `pos_live_enabled`, exponer medios de pago del tenant y tener las migraciones RPC desplegadas. La lectura física y la impresión en cada modelo concreto requieren pruebas en el dispositivo real. No se debe afirmar conexión Bluetooth automática ni impresión silenciosa sin controlador.

Validación: `npm test`, `npm run lint`, `npm run build` y Cypress `qa/cypress/e2e/mi-local-unificado.cy.js` (empresa actual y segunda empresa ficticia). La suite completa de Cypress del PR verifica la regresión de los otros módulos.
