# GESTLOK WAI · Centro de conexiones (piloto sin envíos)
27/11/2026. Propuesta para reemplazar la dependencia de Partner Direct Link de YCloud, **sin contratar servicios**. No modifica las instalaciones y números comerciales ya existentes.

## Qué se incluye
- Creadora: Comercios → Usuarios → GESTLOK WAI · Conexiones por usuario y local. Todos los números registrados actuales y futuros, incidencias primero, última señal y actualización cada 10 segundos mientras el panel está visible.
- Gerente/dueño autorizado: Central de mensajes → Pedidos → WAI (WhatsApp) → Recuperar conexión. Solo su propia sucursal. No necesita acceso al panel general.
- Sesiones aisladas, incluida la identidad del número vinculada a su habilitación. Separación por empresa y sucursal también cuando coinciden los nombres de locales.
- Preparar conector genera una clave aleatoria exclusiva (solo una vez, administradora); se conserva únicamente su hash en la base. Puede reemplazarse desde soporte si el dispositivo se perdió. No se comparten claves entre locales.
- Si el transporte se cae por internet o reinicio, Node.js intenta reconectar usando credenciales locales; espera incremental ante fallos. No pide escaneo si siguen válidas.
- Si el conector está en línea pero la sesión no, el panel puede solicitar reconexión o un nuevo QR. No se desconecta una sesión sana. Cada comando lleva una revisión para que una señal anterior no confirme una recuperación nueva. El QR lo emite WhatsApp a través del transporte; el panel lo dibuja localmente. QR con caducidad, sin enlace público ni claves de WhatsApp en la URL.
- Si Android, Wi-Fi o la PC no están disponibles, no es posible encenderlos remotamente desde el panel. El estado pasa a «Sin señal» tras 90 segundos. El comercio puede seguir atendiendo manualmente desde WhatsApp.
- Si WhatsApp revocó la autorización, es necesario que una persona con el teléfono autorizado vuelva a escanear el QR. No se puede aprobar a distancia en nombre del titular.

## Recuperación del ensayo anterior
Se recuperaron los ZIP del 26/11: Fase 4.1 y Actualización 4.3. Eran Node.js + Baileys 7.0.0-rc14 + Pino 9.14.0, no Python. Admitían 1–3 contactos autorizados, conversaciones separadas, catálogo ficticio y límite de respuestas; la sesión era temporal (25 min) con revocación al finalizar. La prueba anterior **no era un servicio comercial permanente**.
El conector nuevo conserva la separación de identidades y aprovecha ese transporte, pero no importa el código de mensajes, no registra mensajes entrantes y no envía nada. No usa el número oficial de las sucursales durante el piloto.

## Validación previa a cualquier uso real
1. Aplicar la migración nueva a un entorno de pruebas con las tablas y funciones precedentes y crear dos números ficticios/de ensayo autorizados, en empresas diferentes. NO aplicar primero en producción.
2. Desde el panel, preparar cada conector. Antes de vincular, verificar que se muestra «Sin señal», no verde. Instalar el código en un Android dedicado o PC; usar Node.js >=22. Copiar config.example.json como config.private.json (chmod 600), con la URL y clave anon del proyecto Gestlok Prueba (el cliente rechaza producción) y los identificadores/secretos generados para esos números. No usar service_role, no subir configuración ni archivos de autenticación a Git.
3. En tools/wai-connector ejecutar `npm ci --ignore-scripts --no-audit --no-fund` y `npm start`. No activar servicios no autorizados. QR visible en el panel del local y únicamente en el de administración. Escanear desde el teléfono de prueba. Verificar el número real. No vincular números de Mi Gusto en esta etapa.
4. Simular corte de red, reinicio de proceso, expiración de QR, revocación de sesión, deshabilitación y aislamiento. Verificar la recuperación de una sesión sin afectar a la otra, permisos reales y señal reciente del dispositivo.
5. Medir el consumo y estabilidad en Android (Termux puede ser detenido por el sistema); limitar cantidad de sesiones según pruebas. Se puede supervisar el proceso con Termux:Boot/termux-services o un servicio del sistema, después de verificar el dispositivo. No hay servidor permanente instalado por este PR.
6. Si se decide avanzar, revisar riesgo de restricciones de WhatsApp por tratarse de un transporte **no oficial**. Antes de permitir mensajes comerciales, desarrollar y probar la integración multiempresa del motor de pedidos de GESTLOK y habilitar envíos solo con consentimiento del comercio, exclusiones, suscripción, control de idempotencia, derivación humana y verificación de conexión real. No confundir una sesión abierta con respuestas automáticas 24/7.

La preparación del panel y el código no constituyen una activación comercial, una garantía de disponibilidad ni una promesa de compatibilidad. La migración es aditiva. No se modifica la conexión oficial de YCloud, sus registros o sus flags.
