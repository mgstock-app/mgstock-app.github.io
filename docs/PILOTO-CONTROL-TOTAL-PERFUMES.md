# GESTLOK · Centro de control total (piloto privado)

## Alcance
- Empresa: `Perfumes` (tenant `2a97bf8d-7d08-4aa7-b051-5d1a4dc80103`), local que figura en sistema: `Percam`.
- Dueña autorizada: se comprueba **exclusivamente en Supabase Auth y RLS**, sin correo/UID en el JavaScript público.
- No modificar el tenant Mi Gusto `cb0dc04a-9a13-434f-a3d0-47f1d8f39670`, ni Munro/Torcuato ni sus datos/roles.
- Los registros piloto se almacenan en nuevas tablas exclusivas; no se guardan en `public.docs`.

## Qué funciona en esta primera etapa
- Acceso desde una tarjeta adicional que solo ve la cuenta dueña del tenant piloto.
- 20 áreas organizadas: tablero de métricas manuales, auditoría automática de movimientos del piloto, y 18 espacios con registros editables (descripción, estado, responsable, importe opcional, fechas y observaciones).
- Agregar, editar y eliminar registros; marcar estados; consultar los últimos cambios.
- El tablero resume únicamente los importes marcados como ingresos y egresos de **Finanzas**. No se presenta como rentabilidad real ni se suma dinero externo.
- Pantalla adaptada a celulares y PC.

## Qué NO está implementado todavía
- Integraciones reales con Tiendanube, facturación, bancos, sistemas POS o Google Sheets.
- Reconciliación contable, cuentas corrientes, alertas push nuevas, inventario sincronizado, sugerencias automáticas por consumo, transferencias que descuenten stock o liquidación automática de nómina.
- Backups reales, documentos adjuntos ni importación/exportación de datos desde sistemas externos.
- Soporte de guardado offline en esta nueva área: con conexión perdida, no se debe prometer sincronización.

Los apartados de Integraciones, Resguardos y otros sirven para **seguimiento manual** y evaluación; toda automatización futura exige integración, autorización y pruebas separadas.

## Aislamiento y seguridad
- `gestlok_pilot_access`: configuración del único tenant piloto; owner autenticado solo puede consultar. No existe escritura desde la app.
- `gestlok_pilot_records`: RLS por dueño autenticado y tenant habilitado, también en `WITH CHECK` de inserción/actualización.
- `gestlok_pilot_audit`: audit trail de altas, modificaciones y eliminaciones, sin permiso de escritura desde la app.
- Nunca exponer service_role; el rol anónimo no puede leer ni escribir.
- Usuarios de Mi Gusto, gerentes, colaboradores y otros dueños no ven la tarjeta ni pueden leer los registros incluso llamando directamente a la API.

## Pruebas de despliegue
1. Ingresar con la cuenta dueña de Perfumes: ver la tarjeta Centro de control total. Crear una tarea sintética, actualizarla, comprobar historial.
2. Cerrar sesión y entrar como dueño de Mi Gusto: tarjeta ausente, stock y recibos existentes sin cambios.
3. Simular un usuario de otra empresa y comprobar 0 filas/leads en tablas piloto.
4. Ejecutar lint, unit, build y Cypress; verificar el despliegue visible en gestlok.com.ar.

## Reversión de la visualización
- Desactivar `gestlok_pilot_access.enabled` solo para el tenant de prueba desde la administración de Supabase: la tarjeta desaparecerá en una nueva sesión sin borrar los registros, y el RLS negará nuevas lecturas.
- Si es necesario retirar la UI, revertir el PR sin tocar las tablas ni registros de negocio.
- No borrar tablas ni eliminar datos reales sin autorización explícita.

## Medición y expansión
Recoger comentarios y medir uso, errores y rendimiento con registros ficticios. Habilitar un nuevo tenant únicamente tras pruebas de aislamiento y aprobación expresa. No copiar permisos de Perfumes a otras empresas.
