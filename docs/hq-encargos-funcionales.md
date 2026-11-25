# Encargos funcionales HQ — primera etapa

- Un empleado puede solicitar apoyo de Desarrollo, Marketing, Difusión o Testing mediante un formato limitado. El servidor convierte la solicitud de un informe real en una misión específica de Alex, con una tarea para el especialista y aprobación de la administradora antes de iniciar. No hay cadenas automáticas ni acciones externas.
- La Dirección puede trabajar con una sola especialidad sin esperar siete sectores. La misión QA #611 usa esa regla.
- Las entregas se descargan desde la bandeja de Alex. Marketing puede producir una pieza gráfica SVG real a partir de título, subtítulo y CTA; es una plantilla, no un generador fotográfico. Desarrollo prepara una tarea de GitHub precompletada, que la administradora decide enviar. No se modifica código ni se despliega automáticamente.
- El motor sigue usando Groq gratuito y conserva cuotas. No recibe nuevas credenciales, permisos de escritura ni acceso a datos personales.
- Pendiente siguiente etapa: ejecutor aislado de cambios de código en una rama de prueba con aprobación humana, pruebas reales y control de publicación; generador de imagen más avanzado si se encuentra una opción gratuita verificable.
