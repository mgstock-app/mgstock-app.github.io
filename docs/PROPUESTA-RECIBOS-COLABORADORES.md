# Propuesta · Colaboradores: ver solo sus propios recibos

**Estado:** diseño para revisión. **No implementado.** Esperar autorización expresa antes de escribir código, migraciones o cambiar permisos.
**Fecha:** 26/10/2026. Base revisada: GESTLOK `vgsepaaewbctjsjcpeta` (solo consultas de estructura y conteos, sin leer recibos ni datos personales). ReciboNet (`gpdrqxnqtofkkkqjsdqw`) no se consultó ni se modificó.

## 1. Objetivo

Que cada colaborador de una empresa pueda entrar a GESTLOK con su cuenta de Google y ver **exclusivamente sus recibos de sueldo**, sin acceso a la gestión comercial, a otros legajos ni a otras empresas.

## 2. Flujo acordado

```
Dueño/gerente autorizado            Colaborador                         Backend (Supabase)
─────────────────────────           ───────────                         ──────────────────
1. Genera código de la empresa ───► (mensaje en el grupo de WhatsApp)
   (vence, usos máx., revocable)
                                    2. Abre el enlace e ingresa con Google
                                    3. «Solicitar vinculación» ───────►  Registra solicitud PENDIENTE
                                       (ve: «Esperando aprobación»)      (no da acceso a recibos)
4. Ve solicitudes de su empresa
   y local; elige el legajo ──────────────────────────────────────────►  Vincula auth.uid() ↔ legajo
   o rechaza                                                              (comprueba empresa, local,
                                                                           permiso y legajo libre)
                                    5. «Mis recibos»: solo su legajo ◄──  RPC + RLS: solo su hoja
```

1. **Invitación grupal.** El dueño (o gerente con permiso explícito) genera desde *Administrar a los empleados* un enlace de la empresa y, opcionalmente, del local. El texto para WhatsApp contiene solo el enlace y la instrucción; nunca nombres, legajos ni importes.
2. **Ingreso con Google.** Supabase Auth del proyecto GESTLOK, correo verificado. No se usan `user_metadata` ni el correo como prueba de pertenencia.
3. **El código solo permite pedir.** Canjearlo crea una solicitud pendiente atada a la empresa del código. No lista empleados, no revela legajos y no habilita ninguna lectura de recibos. Si alguien ajeno del grupo lo usa, el dueño lo rechaza.
4. **Vinculación por una persona autorizada.** El dueño o el gerente con el permiso nuevo «vincular colaboradores» de ese local elige a qué legajo corresponde la cuenta. La vinculación guarda el **ID autenticado de Supabase** (`auth.uid()`) y el **ID interno del legajo** (`sheet_id`), con auditoría.
5. **Vista del colaborador.** Solo «Mis recibos» del legajo vinculado. Sin hojas comerciales, sin Horarios ajenos, sin otros legajos.

## 3. Qué ya existe (heredado de ReciboNet, hoy en la base de GESTLOK)

El módulo Empleados ya trae casi todo el mecanismo; la propuesta es **reutilizarlo**, no reescribirlo.

| Pieza | Objeto existente | Uso en la propuesta |
|---|---|---|
| Código grupal | `rm_test_private.join_links` (empresa, local, vencimiento, `max_uses`, `revoked_at`) y `join_redemptions` | Es el «código grupal». Hoy: 1 enlace histórico, 0 activos. |
| Canje | `rm_app_join_by_link(p_token)` | Exige cuenta Google, bloquea dueños/administración, un espacio por persona, cuenta usos y audita `join_request`. **Solo agrega membresía de organización; no asigna legajo** → cumple «pedir, no acceder». |
| Vista previa del enlace | `rm_app_join_preview(p_token)` | Mostrar «Vas a pedir acceso a *Empresa*» antes de canjear. |
| Vinculación | `rm_app_assign(p_user, p_role, p_local, p_sheet)` → `public.rm_test_members(user_id, role, sheet_id, local_id)` | Rol `employee` + legajo. Ya hay auditoría (`registration_audit`, `account_audit`). |
| Rechazo | `rm_app_reject(p_user)` | Rechazar solicitudes ajenas. |
| Ver el recibo | `rm_app_open_report()` y `rm_app_report_image()` | Solo rol `employee`/`manager`, solo `app_sheet()` propio, solo el recibo **publicado** de la versión vigente, ventana de 24 h y reapertura controlada. |
| Permisos por rol | `public.rm_test_permissions` | Hoy `employee`: `view_reports=true`, `reopen_access=true`; todo lo demás en `false`. |
| RLS | `rm_test_documents` legible solo por quien administra la organización; `rm_app_images` sin lectura directa; `rm_test_report_access` solo propio | El colaborador nunca lee las hojas crudas (con importes de todos), solo la imagen de su recibo por RPC. |

Conteos actuales (sin contenido): 22 legajos/hojas, 9 recibos publicados como imagen, **0 colaboradores vinculados**, miembros: 6 dueños, 2 gerentes, 1 administración.

## 4. Lo que falta (alcance de la implementación futura)

1. **Pantalla de canje en GESTLOK** (`/empleados/unirse?c=…`): ingreso con Google, vista previa de la empresa, botón «Solicitar vinculación», estado «Esperando aprobación». Reutiliza la sesión compartida de PR #76.
2. **Bandeja de solicitudes** para dueño/gerente: pendientes de su empresa y local, selector de legajo **solo de su empresa y local**, aprobar/rechazar, desvincular.
3. **Permiso de gerente nuevo** `can_link_collaborators` en `rm_manager_permissions` (apagado por defecto). Hoy el gerente no puede administrar colaboradores (`employee:manage_collaborators=false` se refiere al empleado; para gerente debe ser explícito por local).
4. **Unicidad legajo ↔ cuenta:** índice único parcial en `rm_test_members(sheet_id) where role='employee'` para que un legajo no quede vinculado a dos cuentas; desvincular antes de reasignar.
5. **Comprobaciones de backend en `rm_app_assign`** (revisar y, si falta, agregar): quien aprueba administra esa empresa/local; el solicitante canjeó un código **de la misma empresa**; el legajo pertenece a esa empresa y local; el módulo `recibos_personal` está habilitado para la empresa GESTLOK.
6. **Enrutamiento en GESTLOK:** una cuenta que solo es colaborador no debe ver «ingreso pendiente» del área comercial; debe ir directo a «Mis recibos». `mi_acceso` no le devuelve rol comercial, así que la app la deriva a `/empleados/`.
7. **Código del grupo:** vencimiento corto (p. ej. 7 días), `max_uses` acorde a la plantilla, rotación y revocación desde la misma pantalla.
8. **Publicación de recibos por período:** solo hay 9 imágenes publicadas. El colaborador verá «El dueño todavía no publicó el reporte» hasta que se publique el suyo.

## 5. Seguridad y privacidad

- **Autorización solo en backend:** RPC `SECURITY DEFINER` con `search_path=''` y RLS. Botones ocultos no son control de acceso.
- **Identidad:** `auth.uid()` del proyecto GESTLOK. No unir por nombre, número visible ni correo sin verificar.
- **El código no es una credencial de lectura:** solo crea una solicitud. Filtrarlo fuera del grupo no expone recibos.
- **Aislamiento:** pruebas negativas obligatorias: colaborador A no ve el legajo de B; colaborador de Munro no ve Torcuato; colaborador no ve hojas crudas, Horarios ajenos, Stock ni Proveedores; código de la empresa X no sirve para vincular en Y; gerente sin permiso no vincula; anónimo sin acceso.
- **Ambos locales:** Munro y Torcuato con el mismo comportamiento (regla fija).
- **Datos personales (Ley 25.326):** los recibos son datos personales sensibles en lo económico. Antes de habilitar: aviso de privacidad para colaboradores, retención definida y canal de baja (ver issue #8). No enviar recibos por WhatsApp desde este flujo.
- **No tocar ReciboNet** ni los datos copiados; la implementación es aditiva.

## 6. Plan por PR (cuando se autorice)

1. Migración aditiva: permiso de gerente, índice único, controles extra en `rm_app_assign`. Prueba SQL con rollback y huellas antes/después.
2. Pantalla de canje + bandeja de solicitudes + «Mis recibos» en `modules/empleados`, con Cypress de los casos negativos.
3. Enrutamiento del colaborador en el inicio de GESTLOK.
4. Prueba con una cuenta real de colaborador en cada local, con autorización.

## 7. Decisiones pendientes de la dueña

- ¿Los gerentes pueden vincular colaboradores de su local, o solo los dueños?
- Vencimiento y cantidad de usos del código del grupo.
- ¿Un colaborador que trabaja en los dos locales tiene un legajo o dos? (hoy hay hojas por local).
- ¿Se mantiene la ventana de 24 h para ver cada recibo o se deja abierto el historial propio?
