# Cypress MG Stock

Pruebas de navegador con productos y usuarios ficticios, sin conexiones a Supabase de producción.

Se reutiliza `tests/mock_supabase.js`, un simulador en memoria que ya usan las pruebas Playwright. El workflow ejecuta lint, tests y build antes de Cypress.

## Ejecutar localmente
1. `npm ci`
2. `npm run build` con `NEXT_PUBLIC_BASE_PATH` vacío.
3. `npm --prefix qa install --no-package-lock`
4. `npm start` en otra terminal (puerto 3100).
5. `npm --prefix qa test`.

## Alcance
Cypress prueba formulario de ingreso, dueño, gerente, solo lectura, cuenta no autorizada, cambio de sucursal, navegación, carga y guardado simulado de stock. Las reglas RLS reales se cubren por otras pruebas del proyecto. Las comprobaciones con dispositivos físicos y acceso Google real siguen siendo manuales.

Para evitar afectar la app publicada, se mantiene como carpeta aislada `qa/`, sin cambios en el lockfile del proyecto principal.
