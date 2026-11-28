# GESTLOK HQ — Activación de IA gratuita

> **ARCHIVO HISTÓRICO (28/11/2026): GESTLOK HQ fue retirado.** La oficina no está disponible, el worker está pausado y las funciones rechazan solicitudes. No seguir las instrucciones de activación ni volver a programar HQ. El historial se conserva; GESTLOK Chat, WAI y Renata QA son independientes.

La oficina privada usa una función independiente de GESTLOK Chat. Solo la creadora autenticada puede ejecutar tareas y decidir incorporaciones.

1. Crear una cuenta en https://console.groq.com/ y mantener la organización en **Free**, sin método de pago ni upgrade. Confirmar el plan y cuota en el panel de Groq.
2. Crear una clave en https://console.groq.com/keys. Guardarla directamente en Supabase (proyecto de GESTLOK) → Edge Functions → Secrets con el nombre `GESTLOK_HQ_GROQ_FREE_API_KEY`. Nunca compartir la clave en un chat, GitHub ni frontend.
3. Desplegar la función `gestlok-hq-agent` desde el código aprobado de main. No cambiar funciones comerciales, permisos ni base de datos.
4. En HQ pulsar Comprobar conexión y resultados. La presencia de la clave no confirma que responda el modelo. Ejecutar una tarea no sensible y verificar que se guarda una respuesta real del sector elegido.
5. Probar una reunión de Alex solo cuando haya un objetivo concreto. Reserva ocho de las diez consultas permitidas por HQ cada 24 horas; Groq puede imponer límites menores de tokens o solicitudes. Una respuesta parcial identifica las áreas sin respuesta.

El proveedor exclusivo es Groq, modelo GPT-OSS 20B. No hay fallback a OpenAI ni reintentos automáticos al agotarse la cuota. El código no puede comprobar el plan de facturación de una clave: mantener Free es una condición imprescindible. No enviar datos sensibles; las instrucciones y evidencia pública se procesan externamente. No hay ejecución autónoma, cambios de producción ni publicación por parte de agentes. Para detener el acceso al modelo, retirar el secreto dedicado de HQ.

Facundo (Servicio técnico) investiga evidencia disponible en modo solo lectura. El monitoreo horario externo no equivale a ejecución autónoma de IA. Toda reparación, modificación de configuración, código, datos, permisos o publicación requiere aprobación de la administradora. La nueva reunión de siete áreas y Alex reserva ocho consultas; actualizar el límite en base antes de desplegar esta versión.
