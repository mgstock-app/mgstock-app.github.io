-- GESTLOK Chat · encender el módulo para Mi Gusto (Munro y Don Torcuato).
-- Correr en Supabase → SQL Editor SOLO después de aplicar la migración 20261119210000_gestlok_chat_base.sql.
-- Las dos sucursales quedan APAGADAS: el dueño revisa la carta y los ajustes en el panel y recién ahí abre el chat.
-- Repetible: no duplica nada. No toca Pedidos WhatsApp ni ningún otro módulo.
begin;
insert into gestlok_chat_private.empresas(tenant_id, nombre_publico)
values ('cb0dc04a-9a13-434f-a3d0-47f1d8f39670', 'Mi Gusto')
on conflict (tenant_id) do update set habilitada = true, actualizada_at = now();

insert into gestlok_chat_private.sucursales(tenant_id, local_id, slug, nombre, prefijo, medios_pago)
select 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670', v.local_id, v.slug, v.nombre, v.prefijo, array['efectivo']
from (values ('munro', 'mi-gusto-munro', 'Munro', 'MM'), ('torcuato', 'mi-gusto-torcuato', 'Don Torcuato', 'MT')) v(local_id, slug, nombre, prefijo)
where exists (select 1 from public.docs d where d.tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670' and d.col = 'locales' and d.id = v.local_id)
on conflict (tenant_id, local_id) do nothing;

insert into gestlok_chat_private.auditoria(tenant_id, accion, detalle)
values ('cb0dc04a-9a13-434f-a3d0-47f1d8f39670', 'empresa_habilitar', '{"origen":"operacion SQL","sucursales":["munro","torcuato"]}');

select s.slug, s.nombre, s.activa from gestlok_chat_private.sucursales s
 where s.tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670' order by s.slug;
commit;
