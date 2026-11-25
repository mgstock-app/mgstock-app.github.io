# GESTLOK HQ — Activación segura

La oficina privada utiliza la función `gestlok-hq-agent`, independiente del chat comercial. Solo la creadora autenticada puede consultar o ejecutar tareas y decidir sobre incorporaciones.

## Activación

1. Crear un proyecto de API de OpenAI dedicado a HQ y configurar su facturación y alertas de uso. La suscripción ChatGPT no sustituye la facturación API.
2. Crear una clave de ese proyecto. Guardarla directamente en Supabase > Edge Functions > Secrets con nombre `GESTLOK_HQ_OPENAI_API_KEY`. Nunca pegarla en un chat, archivo, GitHub ni frontend. No reutilizar la clave de GESTLOK Chat.
3. Desde el panel de la creadora entrar en HQ y pulsar Comprobar conexión y resultados. El indicador confirma la presencia del secreto, no una llamada exitosa al modelo.
4. Crear una tarea no sensible de prueba para un agente y ejecutar con consentimiento. Verificar informe guardado, errores, consumo y aislamiento.
5. Crear una reunión para Alex. Consume hasta siete consultas del límite de diez por 24 horas. Verificar propuestas de los sectores, informe ejecutivo y solicitudes de incorporación separadas.

## Límites

No existe ejecución automática ni publicación de cambios. El proveedor recibe instrucciones de tareas y evidencia pública de GitHub, no conversaciones ni pedidos de clientes. No incluir datos personales o secretos en las instrucciones. La autorización de una incorporación no aprovisiona un agente. La bandeja ejecutiva consulta resultados guardados sin llamar al proveedor.

Las alertas presupuestarias del proveedor no sustituyen los límites de ejecución del servidor. Para detener el acceso al modelo, retirar únicamente el secreto dedicado de HQ.
