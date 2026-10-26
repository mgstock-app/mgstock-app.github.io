# Estado de la migración de «Empleados» (ReciboNet → GESTLOK)

Última verificación: 25/10/2026. Base de GESTLOK: `vgsepaaewbctjsjcpeta`. ReciboNet (`gpdrqxnqtofkkkqjsdqw`) **no se tocó ni se borró**.

## Hecho y verificado en la base de GESTLOK
- Las 32 tablas de datos (`public.rm_*` y `rm_test_private.*`, salvo las de «Pendiente») tienen **la misma cantidad de filas y la misma huella (md5 de cada fila) que ReciboNet**, comparadas el 25/10/2026. Documentos: 255/255.
- `rm_test_private.change_audit` (historial de cambios): 376 filas, ids 1–380, **huella global idéntica** a ReciboNet (cada fila comprobada una por una).
- Funciones, políticas, permisos, secuencias y los 28 triggers de ReciboNet sobre sus tablas (incluido el de auditoría de `rm_app_images`, creado hoy), salvo las 4 funciones de «Pendiente». Quedaron sin copiar a propósito 3 funciones del alta automática de ReciboNet (`register_google_account`, `assign_confirmed_member`, `register_collaborator`, atadas a un trigger sobre `auth.users`); en GESTLOK el vínculo se hace al ingresar, por correo confirmado.
- Puente de identidad: quien ingresa con un correo confirmado que figura en `rm_test_private.identity_map` (6 personas) toma su id histórico. No se crean cuentas ni se tocan contraseñas.
- Prueba de aislamiento `supabase/tests/recibonet-aislamiento.sql` (datos ficticios, con rollback): dueña A no ve ni opera el espacio B; empleada solo su hoja y sin escrituras directas; gerente limitado a su empresa y sin publicar sin permiso; cuenta sin confirmar y token con correo ajeno sin identidad; anónimo sin acceso. Resultado: pasó completa y no dejó datos.
- CI del PR #67 (commit `5bd8a67`): lint, tests, build y Cypress en verde. Una corrida anterior (`af154eb`) falló en Cypress; no se pudo leer su registro, y la siguiente, sin cambios de código, pasó.
- **Gerente de GESTLOK → Horarios** (25/10/2026, aplicado en la base): el Gerente conserva las tarjetas de su inicio y, solo dentro de Administración de empleados, ve la carpeta Horarios de SU local y puede cambiar, agregar o quitar el enlace de Google Sheets. No obtiene ningún otro permiso de Empleados (sin usuarios, recibos, reportes ni otros locales). Requiere vínculo con Empleados y módulo `recibos_personal` habilitado (si se apaga, pierde el acceso). Prueba con rollback: `supabase/tests/gerente-horarios.sql` (Munro, Torcuato, dueña, creadora, token ajeno, anónimo, módulo apagado). La pantalla nueva sale con el PR #67.

## Pendiente (no resuelto)
1. **4 funciones** (`rm_test_private.rm_app_assign`, `rm_app_assign_manager`, `rm_app_reject`, `rm_test_review_registration`): la herramienta de base de datos las cancela automáticamente. Hay que ejecutar **una vez** `supabase/pendiente-gestlok-funciones-empleados.sql` en el editor SQL de Supabase. Sin ellas no se pueden asignar empleados/gerentes, rechazar ni revisar registros.
2. `rm_app_images`: 0 de 9 imágenes de reportes copiadas (1,3 MB de texto base64). Se regeneran republicando cada reporte desde la app. Respaldo de las 9 imágenes entregado aparte.
3. Cuatro respaldos históricos de ReciboNet (`local_transfer_backups`, `admin_upgrade_backup`, `roles_upgrade_snapshot`, `read_receipts_removal_backup`): no se copiaron a GESTLOK (no los usa la app). Se entregó un archivo de respaldo comprimido con las cuatro tablas y las imágenes. Se perderían al borrar ReciboNet si ese archivo no se guarda.
4. Antes de unir el PR hay que repetir la comparación de huellas (ReciboNet sigue recibiendo cambios mientras el cliente en producción siga apuntando allí).
5. Confirmar que el registro por correo de GESTLOK exige confirmación de email (Auth). La función de identidad ya exige correo confirmado.
6. Los archivos de `supabase/referencia-migracion-empleados/` son el texto original por partes; producción recibió versiones divididas. Son referencia, no migraciones ejecutables.
7. Sin verificar: actualización de la PWA en vivo, celulares reales, primer ingreso de Martín/Julián/Gonzalo, ingreso de Gisela con correo y clave.

## Este cambio
`modules/empleados/next.config.ts` apunta el cliente a GESTLOK en lugar de ReciboNet. No unir hasta resolver 1 y 4.
