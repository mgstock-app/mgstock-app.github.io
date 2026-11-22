# GESTLOK Chat — entornos separados y publicación segura

**Prueba y Testing no son producción.** Solo GESTLOK Chat (cliente, gerente, dueño, menús, promociones, pedidos y avisos) está preparado en `entornos/construir.mjs`. El resto de GESTLOK se sigue validando por CI hasta añadirlo explícitamente a los entornos.

## Estado y separación

- Producción: `gestlok.com.ar`; proyecto Supabase real. Nunca cambiar aquí la configuración desde estos pasos.
- Prueba: `gestlok-prueba.vercel.app`, rama GitHub `prueba`, funciones `gestlok-chat-prueba` y `gestlok-chat-push-prueba`.
- Testing: `gestlok-testing.vercel.app`, rama GitHub `testing`, funciones `gestlok-chat-testing` y `gestlok-chat-push-testing`.
- Ambos entornos usan **solo** el proyecto Supabase `gestlok-pruebas` (`irqeitzbfyerxcrogkyh`), con empresas y sucursales de demostración. No comparten clientes, conversaciones ni pedidos con producción.
- El directorio `dist-entorno` solo contiene recursos de prueba y sus claves públicas de Supabase; nunca incluir allí tokens de administración, contraseñas ni `service_role`.
- Las notificaciones push de prueba requieren su configuración VAPID independiente; no reutilizar dispositivos ni permisos push de producción.

## Dos proyectos en Vercel (uso personal: pruebas, ideas y demos)

En [Vercel](https://vercel.com/new) importar `mgstock-app/mgstock-app.github.io` dos veces:

| Ajuste | Prueba | Testing |
| --- | --- | --- |
| Nombre del proyecto | `gestlok-prueba` | `gestlok-testing` |
| Framework Preset | Other | Other |
| Build Command | `node entornos/construir.mjs` | `node entornos/construir.mjs` |
| Output Directory | `dist-entorno` | `dist-entorno` |
| Rama de producción (Settings → Environments → Production) | `prueba` | `testing` |

El entorno se toma de la rama (`VERCEL_GIT_COMMIT_REF`): cualquier otra rama publica una página vacía, nunca GESTLOK.

## Secreto GitHub obligatorio: sin éxitos falsos

En el repositorio GitHub entrar a **Settings → Secrets and variables → Actions → New repository secret**:

- **`SUPABASE_ACCESS_TOKEN`**: token personal de Supabase con alcance limitado al proyecto `gestlok-pruebas` y permisos necesarios para consultas SQL, funciones Edge, Secrets del proyecto y configuración de Auth. Guardarlo directamente en GitHub (jamás por chat, commit o archivo).
- **`SUPABASE_PROD_READ_TOKEN`**: opcional, reservado exclusivamente para una futura importación voluntaria de la carta y limitado a lectura de la base real. Si no se configura, dejar **«Copiar carta» apagado**. El token de pruebas nunca se utiliza para leer la base real.

Los pasos de backend ahora **fallan claramente** si falta `SUPABASE_ACCESS_TOKEN`; un check verde ya no puede significar «no ejecutado por falta de permisos». La publicación a producción exige que Testing esté visible y que su función tenga CORS correcto.

## Actualización automática de GESTLOK Chat

Al incorporarse a `main` un cambio de la web de Chat, del panel, de las funciones o de las
migraciones `gestlok_chat_*`, GitHub Actions ejecuta
[`sync-gestlok-chat.yml`](../.github/workflows/sync-gestlok-chat.yml).

El proceso **copia la versión actual a las dos ramas `prueba` y `testing`**, compila cada
entorno y valida el aislamiento antes de publicar ramas. Después aplica exclusivamente en
`gestlok-pruebas` las migraciones nuevas y actualiza `gestlok-chat-prueba`,
`gestlok-chat-testing` y sus funciones de notificaciones. Nunca escribe en la base real.

El constructor específico de cada rama y el catálogo de demostración se conservan. Una
migración nueva de Chat se añade automáticamente al manifiesto de pruebas, pero un error
de permisos, SQL, despliegue o verificación del sitio deja **el trabajo en rojo**. Si el
proveedor de hosting bloquea nuevas compilaciones por límite de uso, las ramas pueden
estar sincronizadas sin que todavía se vea la última versión en los enlaces públicos.

La automatización también tiene `Run workflow` manual para recuperar cambios pendientes.
Los pasos manuales de abajo siguen disponibles cuando querés probar una versión
experimental antes de incorporarla a `main`. **Ningún entorno de pruebas publica
automáticamente cambios en producción.**

## Circuito de uso

1. Subir cambios a la rama `prueba`: Cloudflare construye el sitio y Actions aplica cambios de backend al proyecto aislado.
2. Abrir **GitHub → Actions → Entornos · prueba → testing → gestlok.com.ar → Run workflow** y elegir `enviar-a-testing` luego de revisar Prueba. La acción comprueba que Prueba existe, sincroniza el backend de Testing y actualiza su rama.
3. Revisar Testing y sus pruebas. Luego elegir `publicar-en-gestlok`; la acción comprueba sitio y backend de Testing y **solo abre un PR** hacia `main`.
4. Revisar/aprobar ese PR antes de fusionarlo: la publicación real sigue siendo un paso humano explícito. **Nunca** publicar automáticamente una migración SQL de pruebas en producción.

Si un paso falla, abrir los logs de Actions y resolver el mensaje señalado. No marcar «listo» si alguno de los sitios, permisos o funciones no existe.

## Checklist de verificación

- Prueba y Testing muestran etiquetas distintas y **no** permiten usar la base real.
- Catálogo, carrito, promociones y envío se validan con datos ficticios.
- El chat de Munro prueba no aparece en la central real; idem Torcuato.
- Se respetan el aislamiento entre sucursales, la confirmación manual del gerente y las notificaciones con consentimiento.
- Los trabajos de GitHub no muestran «completado» cuando falta un secreto.
- Producción no cambia al desplegar o probar cualquiera de los dos entornos.
