# Estado de la migración de «Empleados» (ReciboNet → GESTLOK)

Fecha: 26/10/2026. Base de GESTLOK: `vgsepaaewbctjsjcpeta`. ReciboNet (`gpdrqxnqtofkkkqjsdqw`) **no se tocó ni se borró**.

## Hecho y verificado en la base de GESTLOK
- Tablas `public.rm_*` y tablas privadas pequeñas copiadas con comparación por huella (md5) contra ReciboNet. Documentos: 255/255 idénticos.
- Funciones, políticas, permisos, secuencias y 26 triggers creados, salvo las 4 funciones de abajo.
- Puente de identidad: quien ingresa con un correo confirmado que figura en `rm_test_private.identity_map` toma su id histórico. No se crean cuentas ni se tocan contraseñas.
- Prueba de aislamiento `supabase/tests/recibonet-aislamiento.sql` (datos ficticios, con rollback): dueña A no ve ni opera el espacio B; empleada solo su hoja y sin escrituras directas; gerente limitado a su empresa y sin publicar sin permiso; cuenta sin confirmar y token con correo ajeno sin identidad; anónimo sin acceso. Resultado: pasó completa y no dejó datos.

## Pendiente (no resuelto)
1. **4 funciones** (`rm_app_assign`, `rm_app_assign_manager`, `rm_app_reject`, `rm_test_review_registration`): la herramienta de base de datos las cancela automáticamente. Hay que ejecutar **una vez** `supabase/pendiente-gestlok-funciones-empleados.sql` en el editor SQL de Supabase. Sin ellas no se pueden asignar empleados/gerentes, rechazar ni revisar registros.
2. `rm_app_images`: 0 de 9 imágenes de reportes copiadas. Se regeneran republicando el reporte desde la app.
3. `change_audit` (376 filas) y 4 respaldos históricos (`local_transfer_backups`, `admin_upgrade_backup`, `roles_upgrade_snapshot`, `read_receipts_removal_backup`) no copiados: se perderían al borrar ReciboNet.
4. Antes de apuntar la app a GESTLOK hay que repetir la comparación de huellas (ReciboNet sigue recibiendo cambios mientras el cliente siga apuntando allí).
5. Confirmar que el registro por correo de GESTLOK exige confirmación de email (Auth).
6. Los archivos `supabase/migrations/20261026*` locales son el texto original por partes; producción recibió versiones divididas. Falta conciliarlos antes de versionarlos.

## Este cambio
`modules/empleados/next.config.ts` apunta el cliente a GESTLOK en lugar de ReciboNet. No unir hasta resolver 1 y 4.
