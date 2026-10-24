-- GestLok · Soporte global por WhatsApp, sin modificar información comercial.
-- Número inicial en formato internacional de Argentina: +54 9 11 4471 5168.
create table if not exists public.gestlok_support_settings (
  id text primary key check(id='global'),
  whatsapp text not null check(whatsapp ~ '^[1-9][0-9]{7,14}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.gestlok_support_settings(id, whatsapp)
values('global','5491144715168')
on conflict(id) do nothing;

alter table public.gestlok_support_settings enable row level security;
revoke all on public.gestlok_support_settings from public, anon, authenticated;
grant select on public.gestlok_support_settings to authenticated;

drop policy if exists gestlok_support_read on public.gestlok_support_settings;
create policy gestlok_support_read on public.gestlok_support_settings
 for select to authenticated
 using ((select auth.uid()) is not null and (select public.es_miembro()));

-- Todas las escrituras pasan por una función autenticada que comprueba la
-- identidad de la creadora en la tabla privada de plataforma.
create or replace function public.gestlok_support_set_phone(p_phone text)
returns text language plpgsql security definer set search_path=''
as $$
declare v_phone text := trim(coalesce(p_phone,''));
begin
 if (select auth.uid()) is null
    or not exists (select 1 from gestlok_platform.admins a where a.user_id=(select auth.uid())) then
   raise exception 'Solo la creadora puede modificar soporte' using errcode='42501';
 end if;
 if v_phone !~ '^[1-9][0-9]{7,14}$' then
   raise exception 'El número debe contener de 8 a 15 dígitos en formato internacional.';
 end if;
 update public.gestlok_support_settings
   set whatsapp=v_phone,updated_at=now(),updated_by=(select auth.uid())
 where id='global';
 if not found then raise exception 'Configuración global no disponible'; end if;
 return v_phone;
end;
$$;
revoke all on function public.gestlok_support_set_phone(text) from public,anon;
grant execute on function public.gestlok_support_set_phone(text) to authenticated;

-- Los nuevos negocios pueden registrar el nombre visible del Dueño de forma
-- atómica durante el alta, para completar la frase "empresa de {Dueño}".
create or replace function public.gestlok_creator_prepare_company_named(
 p_name text,p_owner_email text,p_mode text,p_local_name text,p_owner_name text
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_owner_name text:=trim(coalesce(p_owner_name,''));
 v_info jsonb;
begin
 if (select auth.uid()) is null or not exists
   (select 1 from gestlok_platform.admins a where a.user_id=(select auth.uid())) then
   raise exception 'Solo la creadora puede preparar empresas' using errcode='42501';
 end if;
 if length(v_owner_name) not between 2 and 100 then
   raise exception 'Nombre del Dueño inválido (2 a 100 caracteres)';
 end if;
 v_info:=public.gestlok_creator_prepare_company(p_name,p_owner_email,p_mode,p_local_name);
 update public.docs
 set data=jsonb_set(data,'{nombre}',to_jsonb(v_owner_name),true),
     updated_at=now()
 where col='equipo'
   and tenant_id=(v_info->>'tenant_id')::uuid
   and id=lower(trim(p_owner_email))
   and data->>'rol'='dueno';
 if not found then raise exception 'No se pudo vincular el nombre del Dueño'; end if;
 return v_info || jsonb_build_object('nombre_dueno',v_owner_name);
end;
$$;
revoke all on function public.gestlok_creator_prepare_company_named(text,text,text,text,text) from public,anon;
grant execute on function public.gestlok_creator_prepare_company_named(text,text,text,text,text) to authenticated;
