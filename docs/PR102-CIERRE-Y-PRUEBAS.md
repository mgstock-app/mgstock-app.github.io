# PR #102 — control de cierre y reintentos (27 octubre 2026)

## Resultado verificado
- Cypress browser-e2e: aprobado, workflow run 40546554769, job 122338601060, para commit f70bedf79546872a1c43a3932ce16f3580554b61.
- Esta prueba no demuestra que la nueva demo esté integrada, ni que el formulario guarde reseñas.
- No se ha verificado lint, npm test y build de este PR como conjunto.
- No reactivar el antiguo workflow de pruebas nativas Android/iOS #79, que se dejó pausado.

## Bloqueos que deben resolverse antes de fusionar
1. Integrar prototipo de 5 etapas al inicio real, conservando tarjetas y menú originales.
2. Implementar persistencia real de reseñas y contacto opcional con consentimiento explícito; nunca compartir tablas ni permisos con reseñas internas Mi Gusto.
3. Revisar la migración SQL y el acceso de la creadora; comprobar RLS y privacidad, anti-spam y el caso de usuarios no registrados.
4. Definir y probar beneficios de prueba y descuentos sin emitir cupones por una reseña ficticia ni condicionar valoraciones públicas positivas.
5. Ejecutar lint, npm test, build y Cypress sobre el código integrado, y probar móvil web y multiempresa.
6. Fusionar y verificar publicación HTTPS solo con todo aprobado.

**Estado: pendiente de integración. No publicar este PR como está.**
