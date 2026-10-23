# GestLok — Inventario y proveedores (Next.js y Supabase)

**Versión actual publicada:** https://mgstock-app.github.io/ (el rediseño GestLok está en una rama de revisión y NO en producción).

Precauciones del relanzamiento: [GESTLOK-SEGURIDAD-Y-DESPLIEGUE.md](GESTLOK-SEGURIDAD-Y-DESPLIEGUE.md). Estado de publicación y pendientes: [CONTINUAR-PUBLICACION.md](CONTINUAR-PUBLICACION.md). Historial técnico: [ESTADO-MGSTOCK.md](ESTADO-MGSTOCK.md).

## Ejecutar

```powershell
$env:NEXT_PUBLIC_BASE_PATH = ''
$env:NEXT_PUBLIC_SITE_URL = 'https://mgstock-app.github.io'
npm run build
npm start
```

Vista local: http://localhost:3100/ . Para desarrollo: `npm run dev -- --port 3100`.

La exportación queda en `out/`. El workflow de GitHub Pages está restringido al repositorio `mgstock-app/mgstock-app.github.io`. Cada build actualiza la versión de caché automáticamente; editar `scripts/sw-template.js`, no el archivo generado `public/sw.js`.

## Arquitectura

Next.js renderiza la pantalla original desde `lib/stock/markup.json`. El controlador JavaScript conserva stock, hojas, conteos, pedidos y acceso. No es una reescritura completa en componentes React. Las pruebas comparan huellas del HTML, CSS y controlador con el original.

La base de Stock es independiente de ReciboNet. La clave de `public/stock/config.js` es anon pública. Los permisos se aplican en Supabase RLS. El SDK local es 2.118.0; el original usaba 2.45.4 desde CDN. El ingreso con Google usa un cliente OAuth propio de MGStock (proyecto de Google Cloud separado).

## Pruebas

```sh
npm test
npm run lint
python -m pip install -r tests/requirements.txt
python -m playwright install chromium
```

Con servidor iniciado:

```powershell
$env:STOCK_TEST_URL = 'http://localhost:3100/'
npm run test:e2e
```

Build, lint y 9 pruebas aprobados. Los recorridos completos de navegador y los teléfonos físicos siguen pendientes. Las suites simuladas no modifican datos reales.
