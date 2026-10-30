-- Mi Gusto · mensajes de invitación editables por sucursal.
-- No cambia cupones ni vincula descuentos con reseñas de Google.
-- Una plantilla por local: exclusividad garantizada por RPC y permisos existentes.
create table if not exists gestlok_resenas_private.message_templates (
 local text primary key check(local in ('munro','torcuato')),
 body text not null check(char_length(btrim(body)) between 30 and 2000),
 updated_at timestamptz not null default now(),
 updated_by uuid not null
);
alter table gestlok_resenas_private.message_templates enable row level security;
revoke all on gestlok_resenas_private.message_templates from public,anon,authenticated;
create or replace function public.gestlok_resenas_message_get(p_local text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r gestlok_resenas_private.message_templates;
begin
 if not gestlok_resenas_private.authorized(p_local) then
  raise exception 'Acceso denegado' using errcode='42501'; end if;
 select * into r from gestlok_resenas_private.message_templates where local=p_local;
 if not found then return null; end if;
 return jsonb_build_object('local',r.local,'body',r.body,'updated_at',r.updated_at);
end $$;
revoke all on function public.gestlok_resenas_message_get(text) from public,anon,authenticated;
grant execute on function public.gestlok_resenas_message_get(text) to authenticated;
create or replace function public.gestlok_resenas_message_save(p_local text,p_body text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r gestlok_resenas_private.message_templates; v text:=btrim(coalesce(p_body,''));
begin
 if not gestlok_resenas_private.authorized(p_local) then
  raise exception 'Acceso denegado' using errcode='42501'; end if;
 if char_length(v) not between 30 and 2000 then
  raise exception 'El mensaje debe contener entre 30 y 2000 caracteres' using errcode='22023';end if;
 insert into gestlok_resenas_private.message_templates(local,body,updated_by)
 values(p_local,v,auth.uid())
 on conflict(local) do update set body=excluded.body, updated_at=now(), updated_by=auth.uid()
 returning * into r;
 return jsonb_build_object('local',r.local,'body',r.body,'updated_at',r.updated_at);
end $$;
revoke all on function public.gestlok_resenas_message_save(text,text) from public,anon,authenticated;
grant execute on function public.gestlok_resenas_message_save(text,text) to authenticated;
comment on table gestlok_resenas_private.message_templates is
 'Texto editable de invitación a dar opinión (voluntaria). Por sucursal, sin intercambio por cupones.';
