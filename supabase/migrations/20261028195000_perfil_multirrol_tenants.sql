-- Perfil multiempresa: una identidad de Google/correo puede poseer varios
-- roles por empresa. Cambiar contexto NO cambia la membresía, el rol, ni los
-- permisos: todo se vuelve a verificar contra public.docs (equipo) en SQL.
-- El tenant activo se guarda por cuenta autenticada, nunca en user_metadata.
create table if not exists gestlok_tenancy.account_active_tenant (
 user_id uuid primary key references auth.users(id) on delete cascade,
 tenant_id uuid not null,
 selected_at timestamptz not null default clock_timestamp()
);
alter table gestlok_tenancy.account_active_tenant enable row level security;
revoke all on gestlok_tenancy.account_active_tenant from public, anon, authenticated;

create or replace function gestlok_tenancy.verified_role_context_email()
returns text language sql stable security definer set search_path=''
as $verified_context$
 select lower(btrim(u.email))
 from auth.users u
 where u.id=auth.uid() and u.email_confirmed_at is not null
   and lower(btrim(u.email))=lower(coalesce(auth.jwt()->>'email',''))
 limit 1
$verified_context$;
revoke all on function gestlok_tenancy.verified_role_context_email() from public, anon;
grant execute on function gestlok_tenancy.verified_role_context_email() to authenticated;

create or replace function gestlok_tenancy.role_contexts()
returns jsonb language sql stable security definer set search_path=''
as $my_contexts$
 select coalesce(jsonb_agg(jsonb_build_object(
    'tenant_id', e.tenant_id,
    'company_name', coalesce(c.name,'Mi empresa'),
    'role', case when e.data->>'rol'='editor' then 'gerente' else e.data->>'rol' end,
    'local_ids', case when e.data->>'rol' in ('dueno','creadora')
      then coalesce((select jsonb_agg(l.id order by l.id) from public.docs l
                     where l.tenant_id=e.tenant_id and l.col='locales'),'[]'::jsonb)
      else coalesce(e.data->'locales','[]'::jsonb) end,
    'local_names',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,
      'name',coalesce(l.data->>'nombre',l.id)) order by l.id)
      from public.docs l
      where l.tenant_id=e.tenant_id and l.col='locales'
        and (e.data->>'rol' in ('dueno','creadora')
         or coalesce(e.data->'locales','[]'::jsonb) ? l.id)),'[]'::jsonb),
    'active',e.tenant_id=gestlok_tenancy.current_tenant_id()
   ) order by case when e.data->>'rol'='dueno' then 0 else 1 end,
       coalesce(c.name,'Mi empresa'),e.tenant_id),'[]'::jsonb)
 from public.docs e
 left join gestlok_platform.companies c on c.tenant_id=e.tenant_id
 where e.col='equipo'
   and lower(e.data->>'email')=gestlok_tenancy.verified_role_context_email()
   and e.data->>'rol' in ('dueno','gerente','editor','lectura','colaborador','creadora')
$my_contexts$;
revoke all on function gestlok_tenancy.role_contexts() from public,anon;
grant execute on function gestlok_tenancy.role_contexts() to authenticated;

create or replace function gestlok_tenancy.current_tenant_id()
returns uuid language sql stable security definer set search_path=''
as $active_context$
 select coalesce(
   gestlok_platform.support_tenant(),
   (select a.tenant_id from gestlok_tenancy.account_active_tenant a
      join public.docs e on e.tenant_id=a.tenant_id
         and e.col='equipo'
         and lower(e.data->>'email')=gestlok_tenancy.verified_role_context_email()
         and e.data->>'rol' in ('dueno','gerente','editor','lectura','colaborador','creadora')
      where a.user_id=auth.uid() limit 1),
   (select e.tenant_id from public.docs e
     where e.col='equipo'
       and lower(e.data->>'email')=gestlok_tenancy.verified_role_context_email()
       and e.data->>'rol' in ('dueno','gerente','editor','lectura','colaborador','creadora')
     order by case when e.data->>'rol'='dueno' then 0
                   when e.data->>'rol'='creadora' then 1
                   else 2 end,
              e.updated_at asc,e.tenant_id
     limit 1)
 )
$active_context$;

create or replace function gestlok_tenancy.choose_role_context(p_tenant uuid)
returns jsonb language plpgsql security definer set search_path=''
as $choose_context$
declare v_email text; v_role text; v_name text;
begin
 v_email:=gestlok_tenancy.verified_role_context_email();
 if auth.uid() is null or v_email is null or p_tenant is null then
   raise exception 'Sesión verificada necesaria' using errcode='42501';
 end if;
 select e.data->>'rol',c.name into v_role,v_name
 from public.docs e left join gestlok_platform.companies c on c.tenant_id=e.tenant_id
 where e.col='equipo' and e.tenant_id=p_tenant
  and lower(e.data->>'email')=v_email
  and e.data->>'rol' in ('dueno','gerente','editor','lectura','colaborador','creadora')
 limit 1;
 if v_role is null then
   raise exception 'No pertenecés a esta empresa' using errcode='42501';
 end if;
 insert into gestlok_tenancy.account_active_tenant(user_id,tenant_id,selected_at)
 values(auth.uid(),p_tenant,clock_timestamp())
 on conflict(user_id) do update
 set tenant_id=excluded.tenant_id,selected_at=excluded.selected_at;
 return jsonb_build_object('tenant_id',p_tenant,'role',
     case when v_role='editor' then 'gerente' else v_role end,
     'company_name',coalesce(v_name,'Mi empresa'));
end
$choose_context$;
revoke all on function gestlok_tenancy.choose_role_context(uuid) from public,anon;
grant execute on function gestlok_tenancy.choose_role_context(uuid) to authenticated;

create or replace function public.gestlok_my_role_contexts()
returns jsonb language sql stable set search_path=''
as $contexts_api$
 select gestlok_tenancy.role_contexts()
$contexts_api$;
revoke all on function public.gestlok_my_role_contexts() from public,anon;
grant execute on function public.gestlok_my_role_contexts() to authenticated;

create or replace function public.gestlok_choose_role_context(p_tenant uuid)
returns jsonb language sql set search_path=''
as $choose_api$
 select gestlok_tenancy.choose_role_context(p_tenant)
$choose_api$;
revoke all on function public.gestlok_choose_role_context(uuid) from public,anon;
grant execute on function public.gestlok_choose_role_context(uuid) to authenticated;

comment on function public.gestlok_choose_role_context(uuid) is
 'Changes only the verified current company for the caller; does not grant roles, memberships or access across tenants.';
