# Avisos de GESTLOK: solo por solicitud expresa de la administradora

**Regla vigente:** modificar, publicar, corregir, cerrar un PR o implementar funciones **no crea avisos**.
La administradora debe pedir explícitamente «enviar notificación», «avisá a…» o equivalente.
Nunca programar automáticamente comunicaciones tras cada commit, corrección, carga de stock, conteo o vencimiento.

## Destinatarios y seguridad
- Cada publicación se identifica por **tenant_id** (empresa) y **col** `{local}/avisos`.
- El dueño de la empresa accede a los avisos de sus locales habilitados.
- El gerente accede **solo** a los avisos de los locales asignados.
- Colaboradores, invitados/lectura y otras empresas no acceden al centro de avisos.
- La creadora puede leer y publicar dentro de sus permisos. Las políticas RESTRICTIVE complementan RLS existente.
- Las comunicaciones NO envían push al dispositivo: son novedades **dentro de Avisos**.

## Publicar solo bajo una instrucción explícita
- Determinar primero la empresa y sucursal solicitadas; «ambas sucursales» = **un registro por local**, no un mensaje global.
- Una publicación nueva requiere texto breve, título claro, fecha y marca `publicacion_autorizada: true`.
- Usar un ID estable por evento y sucursal para evitar duplicaciones. Registrar `origen:'solicitud_explicita'`.
- Ejemplo de estructura, sin credenciales reales:

```json
{
  "col": "munro/avisos",
  "id": "aviso-20261113-funcion-xyz",
  "tenant_id": "TENANT_AUTORIZADO",
  "data": {
    "titulo": "Horarios · Resumen semanal",
    "detalle": "Ya está disponible el resumen semanal de colaboradores.",
    "fecha": 1794528000000,
    "publicacion_autorizada": true,
    "origen": "solicitud_explicita"
  }
}
```

**Nota:** los campos numéricos/identificadores del ejemplo son ilustrativos; en producción se calcula la hora actual y se verifica el tenant/local en la base. Usar la conexión autorizada (service_role) y comprobar antes de insertar que el ID no exista. No registrar datos sensibles de empleados.

## Avisos operativos e historial
- La migración `20261113015000_avisos_autorizados_por_solicitud.sql` desactiva el trigger que generaba automáticamente entradas como «Conteo realizado».
- El centro de avisos y su tarjeta de Inicio **solo muestran** `publicacion_autorizada === true`; las entradas antiguas quedan en la base sin borrar.
- La tarjeta operativa de Vencimientos mantiene las alertas de servicios vencidos y próximos, sin mezclarlas con comunicaciones editoriales.
- Se conserva el único aviso manual ya solicitado previamente: «Horarios · Nuevo Resumen semanal» (Mi Gusto Munro).
