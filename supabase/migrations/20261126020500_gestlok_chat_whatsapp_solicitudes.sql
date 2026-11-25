-- Solicitudes de alta de canal. No representan una conexión ni habilitan mensajes.
create table if not exists gestlok_chat_private.whatsapp_solicitudes(
 sucursal_id uuid primary key references gestlok_chat_private.sucursales(id) on delete cascade,
 numero text not null check(numero ~ '^[1-9][0-9]{7,14}$'),
 solicitada_por uuid not null references auth.users(id) on delete cascade,
 solicitada_at timestamptz not null default now()
);
alter table gestlok_chat_private.whatsapp_solicitudes enable row level security;
revoke all on gestlok_chat_private.whatsapp_solicitudes from public,anon,authenticated;
create or replace function public.gestlok_chat_panel_whatsapp_solicitud(p_sucursal uuid,p_accion text default 'ver')
returns jsonb language plpgsql security definer set search_path='' as $$
declare s gestlok_chat_private.sucursales; q gestlok_chat_private.whatsapp_solicitudes;
begin
 if p_accion is null or p_accion not in ('ver','solicitar','cancelar') then raise exception 'Acción inválida' using errcode='22023'; end if;
 if p_accion='ver' then perform gestlok_chat_private.exigir(p_sucursal,'ver');
 else
  perform gestlok_chat_private.exigir(p_sucursal,'configurar');
  if coalesce(public.mi_rol(),'') not in ('dueno','creadora') then raise exception 'Solo dueño o administradora' using errcode='42501'; end if;
 end if;
 select * into s from gestlok_chat_private.sucursales where id=p_sucursal for update;
 if not found then raise exception 'Sucursal no disponible' using errcode='42501'; end if;
 if p_accion='solicitar' then
  if coalesce(s.whatsapp_local,'') !~ '^[1-9][0-9]{7,14}$' then raise exception 'Guardá un número válido' using errcode='22023';end if;
  insert into gestlok_chat_private.whatsapp_solicitudes(sucursal_id,numero,solicitada_por)
  values(s.id,s.whatsapp_local,auth.uid()) on conflict(sucursal_id) do nothing;
 elsif p_accion='cancelar' then
  delete from gestlok_chat_private.whatsapp_solicitudes where sucursal_id=s.id;
 end if;
 select * into q from gestlok_chat_private.whatsapp_solicitudes where sucursal_id=s.id;
 return jsonb_build_object('estado',case when q.sucursal_id is null then 'no_vinculado' else 'pendiente' end,
 'numero_actual',coalesce(q.numero=s.whatsapp_local,false),'solicitada_at',q.solicitada_at,
 'conectado',false,'respuestas_automaticas',false,'puede_solicitar',coalesce(public.mi_rol() in ('dueno','creadora'),false) and gestlok_chat_private.nivel(p_sucursal)='configurar');
end $$;
revoke all on function public.gestlok_chat_panel_whatsapp_solicitud(uuid,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_panel_whatsapp_solicitud(uuid,text) to authenticated;
