# GESTLOK · Administrar a los empleados

Módulo de GESTLOK que reutiliza el cliente de **ReciboNet** (`kmu15lopez-boop/recibonet`, commit
`5db34b838a6122cc50aa2326c800c8c3fe8d03fd`) y lo publica dentro de la misma aplicación, en
`https://mgstock-app.github.io/empleados/`: misma dirección, misma instalación PWA y marca GESTLOK.

## Qué se reutiliza sin cambios de lógica

- Motor de planillas y liquidaciones (`features/reports/*`): turnos, horas, pagos, firmas, historial,
  copias, imagen y PDF, envío por WhatsApp.
- Horarios semanales y mensuales, permisos de gerentes y comentarios (`features/schedules`, `components/schedules`).
- Empresas, locales, invitaciones, asignaciones, usuarios, dueños compartidos y solicitudes de acceso.
- Enlaces a Google Sheets / Excel por local.

## Seguridad

- Los datos siguen en el backend de ReciboNet (proyecto Supabase «Reporte Mensual Mi gusto»).
  Sus RPC y políticas RLS vuelven a comprobar identidad, organización, local y rol en cada operación.
- En el navegador solo hay claves públicas (anon/publishable). No hay `service_role`.
- La carpeta «Administrar a los empleados» de GESTLOK aparece solo si la creadora habilitó el módulo
  para esa empresa y existe un vínculo verificado con su organización de ReciboNet
  (`gestlok_owner_area_context`, `gestlok_creator_set_module`).
- El nombre y logo de la empresa se leen de GESTLOK con la sesión ya guardada en el navegador,
  sin renovarla ni modificarla. Solo cambian lo que se ve, nunca los permisos.

## Adaptaciones a la exportación estática de GESTLOK

| Original (Next.js con servidor) | En GESTLOK |
| --- | --- |
| `proxy.ts` y guardas `requireManager` / `requireScheduleAccess` en servidor | `AccessGate` en el navegador; RPC y RLS siguen siendo la barrera real |
| `app/auth/callback/route.ts` | Página `auth/callback/` que completa el ingreso con Google (PKCE) |
| `/empresas/[companyId]` | `/empresas/empresa/?id=…` |
| Encabezados HTTP de `next.config.ts` | GitHub Pages no permite encabezados propios |
| Marca «Gestion Interna» / ReciboNet | Marca GESTLOK, barra común y regreso al inicio |

No se copiaron migraciones SQL, scripts de base de datos ni documentos internos (contienen datos
personales). Las pruebas de base de datos (`test-security`, `test-local-transfer`) siguen en el
repositorio de ReciboNet, cuyo backend no se modificó.

## Verificar

```sh
npm ci
npm run lint
npm test
npm run build   # genera out/, que el flujo de GitHub Pages copia a out/empleados
```

ReciboNet (`recibonet.vercel.app`) sigue activo. No retirarlo hasta completar la reconciliación
y la prueba de restauración descritas en `docs/integracion-58-estado-verificado.md`.
