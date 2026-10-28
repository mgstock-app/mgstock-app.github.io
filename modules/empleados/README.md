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

## Cierre pendiente: legajos y recibos unificados

Alcance para todas las empresas actuales y futuras, con aislamiento por organización y local:

1. **Legajos por local**: listado, búsqueda, estado activo/inactivo, alta y edición solo para roles autorizados. No crear registros ficticios en producción.
2. **Liquidación por horas o turnos**: reutilizar `features/reports/payroll.js` y `utils/duration.js`; mostrar cantidades, tarifas, importes y totales por concepto, total de horas o turnos y total de dinero. Nunca convertir turnos a horas implícitamente.
3. **Períodos**: conservar semanal en Munro y mensual en Don Torcuato, respetando la configuración real de cada local para empresas futuras.
4. **Recibos**: vista previa, PDF, historial y compartir por WhatsApp con autorización explícita; no exponer enlaces públicos ni datos de otros colaboradores.
5. **Permisos**: dueño sobre su empresa, gerente solo su local, colaborador solo sus recibos, creadora según permisos existentes. Validar también con RPC/RLS, nunca únicamente en el cliente.
6. **Seguridad y compatibilidad**: no migrar ni sobrescribir datos reales, preservar ReciboNet, firmas, planillas existentes y registros históricos.

### Criterios de aceptación antes de publicar

- Pruebas con empleados ficticios de ambas modalidades, incluyendo 145:50 hs, cero, feriados, descuentos y sumatorias; importes y PDF coincidentes.
- Navegación móvil entre legajos, planilla, recibo e historial sin perder cambios.
- Tests de aislamiento cruzado empresa/local y acceso privado del colaborador.
- Lint, typecheck, tests, build y Cypress aprobados; revisión visual de los tres diseños acordados.
- Fusionar a main solo después de validar permisos y datos reales intactos.

**Nota:** esta sección documenta los requisitos pendientes; no implica que las pantallas ya estén implementadas.
