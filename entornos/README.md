# GESTLOK Chat — entornos separados y publicación segura

**Prueba y Testing no son producción.** Solo GESTLOK Chat (cliente, gerente, dueño, menús, promociones, pedidos y avisos) está preparado en `entornos/construir.mjs`. El resto de GESTLOK se sigue validando por CI hasta añadirlo explícitamente a los entornos.

## Estado y separación

- Producción: `gestlok.com.ar`; proyecto Supabase real. Nunca cambiar aquí la configuración desde estos pasos.
- Prueba: `gestlok-prueba.pages.dev`, rama GitHub `prueba`, funciones `gestlok-chat-prueba` y `gestlok-chat-push-prueba`.
- Testing: `gestlok-testing.pages.dev`, rama GitHub `testing`, funciones `gestlok-chat-testing` y `gestlok-chat-push-testing`.
- Ambos entornos usan **solo** el proyecto Supabase `gestlok-pruebas` (`irqeitzbfyerxcrogkyh`), con empresas y sucursales de demostración. No comparten clientes, conversaciones ni pedidos con producción.
- El directorio `dist-entorno` solo contiene recursos de prueba y sus claves públicas de Supabase; nunca incluir allí tokens de administración, contraseñas ni `service_role`.
- Las notificaciones push de prueba requieren su configuración VAPID independiente; no reutilizar dispositivos ni permisos push de producción.

## Dos proyectos Cloudflare Pages (se requiere acceso a la cuenta)

En [Cloudflare → Workers & Pages](https://dash.cloudflare.com/) crear dos proyectos **Pages / GitHub** conectados al mismo repositorio `mgstock-app/mgstock-app.github.io`.

| Campo | Proyecto Prueba | Proyecto Testing |
|---|---|---|
| Nombre | `gestlok-prueba` | `gestlok-testing` |
| Rama de producción del proyecto Cloudflare | `prueba` | `testing` |
| Framework | Ninguno / None | Ninguno / None |
| Directorio raíz | raíz del repositorio | raíz del repositorio |
| Comando de construcción | `node entornos/construir.mjs` | `node entornos/construir.mjs` |
| Carpeta de salida | `dist-entorno` | `dist-entorno` |
| Variable de entorno | `ENTORNO=prueba` | `ENTORNO=testing` |
| Versión de Node | `NODE_VERSION=24` | `NODE_VERSION=24` |

En cada proyecto Cloudflare, dejar como rama de producción **solo la rama asignada** (nunca `main`), y desactivar las implementaciones automáticas de otras ramas si no son necesarias. No conectar el dominio `gestlok.com.ar` a ninguno de los proyectos de prueba.

Una vez que Cloudflare termine sus builds, confirmar que la página principal muestra «GESTLOK · Prueba» o «GESTLOK · Testing». La prueba del banner y el parámetro `?s=` en el chat deben funcionar.

## Secreto GitHub obligatorio: sin éxitos falsos

En el repositorio GitHub entrar a **Settings → Secrets and variables → Actions → New repository secret**:

- **`SUPABASE_ACCESS_TOKEN`**: token personal de Supabase con alcance limitado al proyecto `gestlok-pruebas` y permisos necesarios para consultas SQL, funciones Edge, Secrets del proyecto y configuración de Auth. Guardarlo directamente en GitHub (jamás por chat, commit o archivo).
- **`SUPABASE_PROD_READ_TOKEN`**: opcional, reservado exclusivamente para una futura importación voluntaria de la carta y limitado a lectura de la base real. Si no se configura, dejar **«Copiar carta» apagado**. El token de pruebas nunca se utiliza para leer la base real.

Los pasos de backend ahora **fallan claramente** si falta `SUPABASE_ACCESS_TOKEN`; un check verde ya no puede significar «no ejecutado por falta de permisos». La publicación a producción exige que Testing esté visible y que su función tenga CORS correcto.

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
