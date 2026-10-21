# mgstock — estado al 21/10/2026

> Estado de publicación y pasos vigentes: [CONTINUAR-PUBLICACION.md](CONTINUAR-PUBLICACION.md).

## Completado

- Código publicado en https://github.com/mgstock-app/mgstock-app.github.io (copia limpia). El historial completo queda en un respaldo privado.
- Base Stock: `vgsepaaewbctjsjcpeta`. No se modificó ReciboNet, su base, despliegue, permisos ni OAuth.
- Exportación Next.js estática publicada en la raíz de `https://mgstock-app.github.io/`. Build, lint y 9 pruebas aprobados en GitHub Actions.
- Caché nueva en cada build, generada por `scripts/version-cache.mjs`. El worker solo elimina versiones del mismo ámbito mgstock. Dos pruebas comprueban que no interfiere con ReciboNet.
- RLS real activado, políticas por local para SELECT/INSERT/UPDATE/DELETE. UPDATE incluye USING y WITH CHECK. Visitantes anónimos sin acceso a la tabla ni a las funciones revisadas.
- Prueba SQL con rol authenticated y claims del gerente de Munro: 33 productos de Munro visibles, 0 de Torcuato; puede editar Munro, no Torcuato. Sin cambios de datos.
- Munro y Torcuato tienen 33 productos y 27 ítems de fábrica cada uno. Comparación bidireccional: cero diferencias. Cada local guarda documentos independientes; no se sincronizan sus cambios futuros.
- Seed con ON CONFLICT DO NOTHING, no ejecutado: no sobreescribe información existente.
- Línea base de rendimiento: 0,183 ms de ejecución SQL para 33 productos usando el índice (col,id); tabla con índices 98.304 bytes. No incluye red, navegador ni coste RLS de una sesión.

## Pendientes para continuar

1. (Hecho el 21/10) Publicación en GitHub Pages: `https://mgstock-app.github.io/`.
2. Si el plan no admite Pages desde repositorios privados, elegir alojamiento que mantenga privado el código o autorizar expresamente una versión pública revisada. No pagar ni volver público el repositorio automáticamente.
3. Agregar la URL final en las redirecciones Auth del proyecto Stock. Conservar las existentes; no tocar ReciboNet.
4. iPhone físico: instalar desde Safari, Google, cerrar/reabrir, pérdida de conexión y actualización de versión.
5. Android físico: instalar desde Chrome, Google, cerrar/reabrir, pérdida de conexión y actualización de versión.
6. Completar Playwright y XLSX real. No hay celulares conectados. No confundir pruebas simuladas con dispositivos reales.
7. Supabase Advisor informó 8 avisos SECURITY DEFINER para funciones disponibles a authenticated. Son funciones de acceso propio y solicitud de acceso; las revisadas no admiten anon. Pendiente endurecimiento adicional, sin romper dependencias RLS. [Referencia](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
8. Si se llega a ~1.000 productos por colección o ~5.000 conteos por local, medir carga en móvil. El adaptador descarga toda la colección antes del límite de 400 en cliente; pasar filtros, orden y paginación al servidor si crece. No hay monitoreo automático configurado.

## Comandos

```powershell
$env:NEXT_PUBLIC_BASE_PATH = ''
$env:NEXT_PUBLIC_SITE_URL = 'https://mgstock-app.github.io'
npm run build
npm start
```

`npm start` sirve la exportación en `http://localhost:3100/`. Para desarrollo, `npm run dev -- --port 3100`.

Editar `scripts/sw-template.js`, no el `public/sw.js` generado. El workflow de Pages solo corre en `mgstock-app/mgstock-app.github.io`.

La consulta del límite disponible falló; no hay porcentaje verificable. Continuar en bloques cortos.
