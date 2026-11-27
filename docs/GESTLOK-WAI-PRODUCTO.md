# GESTLOK WAI — producto general, no específico de un comercio

## Alcance y criterio de aceptación
WAI es una aplicación multiempresa y multisucursal. Mi Gusto Don Torcuato y Munro son escenarios de ensayo, no una plantilla de rubro ni una excepción de permisos. Prueba y Testing usan exclusivamente los datos de ensayo. La administradora decide habilitar cada empresa/línea; los dueños y gerentes configuran los locales autorizados. No se publica a producción ni se habilita tráfico comercial hasta aprobar la prueba funcional, validar el transporte y autorizar la publicación.

## Capacidades comunes
- Bandeja, historial persistente, alias, mensajes de teléfono, señal real, recuperación QR, lectura y acciones de mensajes.
- Ajustes existentes de identidad, horarios, catálogo/carta, precios, formas de pago, transferencia, ubicación y reseñas, independientes por sucursal.
- Atención WAI: pregunta configurable, 2–6 opciones por menú, respuesta automática escrita por el local o derivación a una persona. Bienvenida automática apagada por defecto, activación explícita. Un gerente puede enviar opciones manualmente, tomar atención, marcar atendido y volver a atención asistida.
- Seguimiento de pedidos opcional: no se exige a empresas de servicios. Las órdenes anteriores se conservan.
- Reclamos separados del estado de lectura. Seleccionar problema en la encuesta marca rojo y escala, aun si antes se seleccionó una respuesta positiva.
- La atención generativa debe consumir exclusivamente configuración y catálogo del local, no inventar datos/precios ni confirmar pedidos sin gerente. No está activada en este ensayo; el modo actual ejecuta respuestas configuradas.

## Transporte y opciones interactivas
El modelo interno de interacción (pregunta, IDs estables, opciones y acciones) queda desligado del proveedor. Las selecciones no se aceptan como mensajes globales ni se interpretan con un menú modificado: se vinculan al mensaje y a la copia de opciones enviada a ese contacto. El proveedor de ensayo usa encuestas WhatsApp de una sola selección, no botones comerciales nativos. La versión rc14 permite enviar encuestas; el conector descifra los votos autenticados que recibe, mediante la función de la biblioteca y una clave local por encuesta propia, guardada en el directorio de cada sesión. No se captura la agenda ni el historial de terceros. Los conectores antiguos no toman las interacciones nativas; conservan el aviso de satisfacción con enlace de la versión anterior.

El adaptador oficial de WhatsApp Business deberá traducir las mismas interacciones a botones de respuesta o listas según la capacidad autorizada. No se deben usar hacks de botones no soportados, ni habilitar planes/API pagos sin autorización. La prueba con teléfono real debe validar que la opción se ve y llega al chat, que el gerente puede responder cuando hay derivación y que no se duplican avisos al reconectar. La atención generativa, la capacidad concurrente, la operación 24/7 y el aislamiento de producción requieren validación adicional antes de comercializar.
