# BORRADOR PARA DEBATIR — formulario final de la demo
**Estado: NO PUBLICADO, NO HABILITADO PARA ENVIAR CONTACTOS.**

El formulario solo aparecerá al final del recorrido de la demo pública. No debe interrumpir navegación ni exigir registro. La demo continúa siendo completamente ficticia.

## Texto propuesto
**¿Qué te pareció GestLok?**
¡Gracias por explorar nuestra demo! Tu opinión nos ayuda a mejorar.

**Calificá tu experiencia**
★ ★ ★ ★ ★ (de 1 a 5 estrellas; toque/clic).

**¿Querés dejarnos un comentario? (Opcional)**
Contanos qué te gustó o qué mejorarías. Si preferís, dejalo en blanco.

**¿Querés recibir información sobre los planes, precios y promociones de GestLok?**
- Sí, me gustaría recibir información.
- No, gracias. Solo quiero valorar la demo. (predeterminado)

**Solo si respondió Sí:**
- Tu nombre
- ¿Por dónde preferís que te contactemos? WhatsApp / Correo electrónico
- Tu número de WhatsApp **o** correo electrónico, según lo elegido
- Autorizo a GestLok a contactarme por el medio elegido con información sobre planes, precios y promociones. Puedo pedir que dejen de contactarme cuando quiera. (casilla vacía obligatoria para el contacto comercial)

**Aclaración bajo el formulario:** Tu calificación no te suscribe a mensajes comerciales. Este paso es opcional y podés salir sin completarlo.

## Reglas definitivas por discutir antes de publicar
- Puntaje: selección de 1 a 5 estrellas, sin texto obligatorio. La demo puede cerrarse sin puntuar.
- Opinión escrita: opcional, máximo 500 caracteres.
- Solicitud comercial: elección **No** predeterminada; nunca implícita por puntuar.
- Contacto: nombre + WhatsApp o email únicamente si se solicita información, con autorización explícita. Solicitar uno u otro, no ambos.
- Opciones negativas o feedback sin contacto **nunca se incorporan a una lista comercial**.
- Aún por definir: plazo de conservación, canal oficial de baja, política y responsable del tratamiento de contactos, protección contra spam automatizado, verificación mínima de contacto y botón para revocar consentimiento.
- Acceso restringido exclusivamente a la Administradora General, con medidas server-side y RLS antes de guardar un solo contacto.
- No disparar automáticamente WhatsApp, email ni campañas desde GestLok.
- Antes de activar envíos: revisar texto de consentimiento y documentación legal aplicable.

## Estado técnico
`public/stock/gestlok-demo-feedback-draft.js` contiene la vista accesible y los controles de estrellas (sin captura ni transmisión de datos). `app/globals.css` incluye los estilos; **no se carga el módulo en `components/stock-runtime.tsx`**. El botón enviar está deshabilitado. Esta rama se conserva para revisión; no fusionar a `main` hasta aprobar texto y protocolo.

## Revisión 27/10/2026
Actualizado con main. Retirar el interés elimina nombre y contacto de la memoria del borrador; cambiar de canal revoca la casilla de consentimiento. Pruebas de regresión verifican que no se carga en producción, no usa almacenamiento persistente y mantiene el envío deshabilitado. La recopilación sigue pendiente de aprobación.
