-- Mi Gusto · GESTLOK Chat: mensajes al terminar el pedido (pedido pedido por la dueña el 20/11/2026).
-- Adaptados de los que usa hoy Don Torcuato, con el trato de usted del chat. Van a los dos locales.
-- El link de reseñas de Google es SOLO de Don Torcuato; Munro lo carga su gerente cuando lo tenga (pestaña Mensajes).
-- Requiere la migración 20261120070000_gestlok_chat_resena_cierre. Se puede volver a correr sin duplicar nada.
begin;

update gestlok_chat_private.sucursales s set
  mensajes = s.mensajes || jsonb_build_object(
    'terminado_retiro', '{nombre}, su pedido ya está listo para retirar. Al llegar, solo indique su nombre.',
    'terminado_envio',  '{nombre}, su pedido está en camino 🛵',
    'resena',           'Nos ayudaría mucho que nos deje su reseña y nos cuente su experiencia.',
    'cierre',           '¡Gracias por elegirnos! 🥰'),
  version = s.version + 1, actualizada_at = now()
from gestlok_chat_private.empresas e
where e.tenant_id = s.tenant_id and e.tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'
  and s.slug in ('mi-gusto-munro', 'mi-gusto-torcuato');

update gestlok_chat_private.sucursales s set
  mensajes = s.mensajes || jsonb_build_object('resena_url', 'https://g.page/r/CT9jkvArEGhFEBM/review'),
  version = s.version + 1, actualizada_at = now()
where s.tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670' and s.slug = 'mi-gusto-torcuato';

-- Registro en la auditoría del chat (antes/después quedan en la tabla de auditoría como el resto de los ajustes).
select gestlok_chat_private.auditar(s.id, 'config_guardar',
  jsonb_build_object('origen', 'operacion mi-gusto-chat-resena-cierre-20261120', 'mensajes', s.mensajes))
from gestlok_chat_private.sucursales s
where s.tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670' and s.slug in ('mi-gusto-munro', 'mi-gusto-torcuato');

select s.slug, s.mensajes->>'resena_url' as link_resenas, s.mensajes->>'cierre' as cierre
from gestlok_chat_private.sucursales s
where s.tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670' and s.slug in ('mi-gusto-munro', 'mi-gusto-torcuato')
order by s.slug;

commit;
