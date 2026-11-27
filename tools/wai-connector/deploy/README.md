# Servicio dedicado WAI (solo Prueba)

Plantilla para alojar el conector Node.js en un servidor Linux estable, sin depender de la PC del comercio. No está instalada en ningún servidor; no contrata infraestructura. El portal Vercel y la base no sustituyen este proceso persistente.

- Utilizar una máquina dedicada con Node >=22, almacenamiento privado persistente y salida HTTPS/WhatsApp. Crear usuario no privilegiado `gestlok-wai`, directorio de estado `/var/lib/gestlok-wai` (0700) y código bajo `/opt/gestlok-wai` solo legible por el servicio.
- Instalar dependencias desde el lockfile (`npm ci --omit=dev`). Preparar una sola vez el servidor central desde /chat/wai/ e importar el JSON central mediante setup.mjs en el HOME del usuario, con permisos 0600. No copiar credenciales reales, claves a Git ni sesiones de otro comercio.
- Detener primero el conector de Windows. Nunca iniciar dos conectores para una misma sesión.
- Instalar el unit file, iniciar con systemd y comprobar `systemctl status gestlok-wai`. La señal de WhatsApp debe estar comprobada en cada local en WAI, no solo el proceso activo.
- Verificar reinicio ante caída del proceso, reinicio del host y pérdida de red. Si WhatsApp revoca la autorización, el gerente escanea un QR nuevo; no se intenta evadir la desvinculación.
- Los estados de sesión y alertas se visualizan en Vincular. Probar recuperación, altas y bajas automáticas, locales y clientes en paralelo sin cruzar datos. La recepción entrante de ensayo es una opción administrativa por línea; mantener sus límites; los números comerciales requieren una solución de transporte habilitada para producción.
- Para volver al conector de escritorio, detener primero la instancia del servidor. Nunca transferir ni exponer un QR o carpeta de sesión en un enlace público.

Antes de producción: monitoreo fuera del navegador, respaldo cifrado con restauración probada, capacidad de conexiones y colas, plan de soporte y autorización de transporte. No se garantiza disponibilidad 24/7 solo por instalar la plantilla.
