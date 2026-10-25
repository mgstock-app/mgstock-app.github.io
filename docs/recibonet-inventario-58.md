# Integración ReciboNet · etapa 1 de #58

Fecha: 25/10/2026. Inspección del repositorio privado `kmu15lopez-boop/recibonet`, commit `5db34b838a6122cc50aa2326c800c8c3fe8d03fd`. Consultas a metadatos del backend, sin cambiar datos ni permisos. Esta etapa no incorpora aún la pantalla de recibos en GESTLOK.

## Backend confirmado

La base de ReciboNet es `gpdrqxnqtofkkkqjsdqw`, cuyo nombre visible es «Reporte Mensual Mi gusto». Se confirmó por la presencia de tablas `rm_*`, sus columnas y los RPC que utiliza el código. No confundir con la base de stock `vgsepaaewbctjsjcpeta` ni con el otro proyecto inactivo de nombre similar. No copiar credenciales ni sesiones entre proyectos: un correo coincidente no prueba igualdad de UUID ni autorización.

## Contratos existentes que se conservan

| Función | Contrato / origen | Control que debe mantenerse |
| --- | --- | --- |
| Cuenta y aprobaciones | `rm_app_me`, `types/access.ts`, `features/access/api.ts` | `status`, rol, organización, local y hoja asignados; no inferir por email |
| Empresas y locales | `rm_organizations`, `rm_companies`, `rm_app_local`; `rm_app_organizations`, `rm_app_locals` | Organización UUID es frontera de seguridad; número visible no concede acceso |
| Recibos y hojas | `rm_test_documents(path,collection,data,updated_at,organization_id)`; `features/reports/data-service.ts` | Filtrar organización y respetar RLS; colaborador solo recibe su imagen autorizada |
| Historial | Documentos bajo `hojas/<id>/historial` | Preservar payload completo, firma, importes y orden |
| Horarios | `rm_schedules`, `rm_schedule_comments`; `features/schedules/api.ts` | Empresa UUID, período, fecha inicial, versión; guardar por `rm_app_save_schedule` |
| Permisos de gerente | `rm_manager_permissions`; `rm_app_schedule_context` | Editar, publicar y comentar independientes; no conceder acceso salarial |
| Enlaces a planillas | `rm_app_branch_schedule_links(p_local,p_company)`, `rm_app_set_branch_schedule_link` | URL validada de Sheets y autorización en servidor; mantener carpeta Horarios y menú |
| Imágenes y acceso privado | `rm_app_report_image`, `rm_app_open_report`, `rm_app_access_state` | Imagen del recibo propio y vigencia comprobada en backend |
| PDF y WhatsApp | `features/reports/pdf-export.js`, `sharing-and-backups.js`, `rm_app_record_whatsapp` | Conservar ambos recorridos existentes; el envío actual de recibos también admite imagen, a diferencia del pedido de Proveedores que es solo PDF |
| Copias/restauración | `cloud-backups.js`, `rm_app_restore_organization` | Copia previa obligatoria antes de restaurar; no restaurar desde cliente de stock |

La consulta agregada de la organización indicada en #58 confirmó 17 hojas, 2 locales y 0 filas en `rm_schedules`. Esto no implica ausencia de Horarios: hay que conservar por separado sus enlaces y planillas externas. No se exportaron contenidos salariales.

## Seguridad verificada en esta etapa

- Las 17 tablas públicas `rm_*` tienen RLS habilitado. Esto es inventario, no prueba completa de todos los roles.
- Pruebas reproducibles en `scripts/recibonet-access-readonly.sql`.
- Pruebas reales con transacciones `READ ONLY` y `ROLLBACK`: visitante y sujeto autenticado ficticio sin asignación no pueden consultar datos en seis recursos: documentos, locales, horarios, comentarios, imágenes y directorio.
- Aún faltan pruebas de dueños de empresas distintas, gerente por local, colaborador por hoja y creadora. No se habilitó ningún módulo a usuarios.
- El backend existente queda intacto. Agregar solamente una política permisiva de módulos sería insuficiente: las políticas existentes y los RPC deben imponer el mismo requisito, sin romper el acceso de transición a ReciboNet.

## Código implementado para preservar información

`lib/recibonet/reconcile.mjs` compara dos respaldos nativos de reportes (`version:1`, `tipo`, `ajustes`, `hojas[].datos`, `hojas[].historial`). Rechaza copias incompletas y duplicados en vez de descartar registros. Calcula SHA-256 por documento completo, conserva campos desconocidos dentro de datos, detecta faltantes, cambios y agregados. No renombra locales: el identificador original de Torcuato es `dt`; no convertirlo automáticamente a `torcuato`. Mantiene la convención de hojas antiguas sin `local` solo para contar, sin modificar su contenido.

Uso local, sin escribir ni conectar a bases:

```sh
node scripts/reconcile-recibonet.mjs origen.json candidato.json
```

Códigos: `0` = recibos e historial coinciden, `1` = diferencias, `2` = entrada inválida/incompleta. La salida solo contiene conteos y huellas; no expone nombres, montos, teléfonos, firmas ni IDs de hojas. Los archivos reales no deben guardarse en este repositorio público.

**Límite explícito:** un respaldo de reportes no incluye toda la base. El resultado siempre indica `readyToRetireReciboNet:false`. Horarios, comentarios, imágenes, entregas privadas, miembros, autorizaciones, enlaces y copias en nube necesitan respaldo y reconciliación separados. No se ejecutó una migración ni se certificó un respaldo real.

## Siguiente etapa

1. Respaldar en almacenamiento privado y verificar restauración en entorno aislado de ambos sistemas.
2. Definir mapeo explícito organización/empresa/local/usuario; no unir por nombre o número visible.
3. Implementar habilitación de módulos por creadora en backend, con pruebas de denegación. Mantener compatibilidad de ReciboNet durante transición.
4. Resolver autenticación entre proyectos y adaptar interfaz estática sin copiar rutas `server-only`.
5. Integrar Horarios/enlaces; luego recibos, historial, PDF y WhatsApp. Reconciliar cada módulo antes de activar.
6. Validar ambos locales, aislamiento entre empresas y roles, Android instalado y reversión. Solo después evaluar retirar ReciboNet.
