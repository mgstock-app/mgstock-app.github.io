-- Complemento de GESTLOK: recuperar el MISMO enlace general al volver a abrir el panel.
-- Token disponible exclusivamente a dueño/gerente autorizado del local a través de RPC.
-- Nunca en tablas públicas, recibos o cachés del navegador.
create table if not exists rm_test_private.manager_staff_group_secrets (
  organization_id uuid not null references public.rm_organizations(id),
  local_id text not null references public.rm_app_local(id),
  invite_id uuid not null references rm_test_private.manager_staff_invites(id),
  token text not null check (token ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (organization_id,local_id)
);
alter table rm_test_private.manager_staff_group_secrets enable row level security;
revoke all on rm_test_private.manager_staff_group_secrets from public,anon,authenticated;

create or replace function rm_test_private.rm_manager_staff_group_create_saved(p_local text)
returns jsonb language plpgsql security definer set search_path='' as $saved$
declare result jsonb; v_invite rm_test_private.manager_staff_invites;
begin
  result:=rm_test_private.rm_manager_staff_group_create(p_local);
  select * into v_invite from rm_test_private.manager_staff_invites i
  where i.token_hash=encode(sha256(convert_to(result->>'token','UTF8')),'hex')
    and i.group_shared and i.revoked_at is null;
  if not found then raise exception 'El enlace general no pudo guardarse' using errcode='42501'; end if;
  insert into rm_test_private.manager_staff_group_secrets(organization_id,local_id,invite_id,token)
    values(v_invite.organization_id,v_invite.local_id,v_invite.id,result->>'token')
    on conflict(organization_id,local_id) do update
      set invite_id=excluded.invite_id,token=excluded.token,updated_at=clock_timestamp();
  return result;
end $saved$;
revoke all on function rm_test_private.rm_manager_staff_group_create_saved(text) from public,anon,authenticated;
grant execute on function rm_test_private.rm_manager_staff_group_create_saved(text) to authenticated;
create or replace function public.rm_app_manager_staff_group_create(p_local text)
returns jsonb language sql set search_path='' as $api$
  select rm_test_private.rm_manager_staff_group_create_saved(p_local)
$api$;
revoke all on function public.rm_app_manager_staff_group_create(text) from public,anon,authenticated;
grant execute on function public.rm_app_manager_staff_group_create(text) to authenticated;

create or replace function rm_test_private.rm_manager_staff_group_get(p_local text)
returns jsonb language plpgsql security definer set search_path='' as $get$
declare v_local public.rm_app_local; result jsonb;
begin
  -- status() verifica propietario o gerente del tenant y sucursal correctos.
  perform rm_test_private.rm_manager_staff_invite_status(p_local);
  select * into v_local from public.rm_app_local where id=p_local;
  if not found or not coalesce(
      rm_test_private.rm_employee_profile_scope(v_local.organization_id,v_local.id),false)
  then raise exception 'Sin permiso para invitar en este local' using errcode='42501'; end if;
  -- A un gerente histórico sin permiso de edición no se le muestra el enlace.
  if rm_test_private.app_role()='manager' and not exists(
    select 1 from public.rm_manager_permissions mp
    where mp.user_id=rm_test_private.uid()
      and mp.organization_id=v_local.organization_id
      and mp.company_id=v_local.company_id
      and mp.can_edit=true
  ) then raise exception 'Sin permiso para invitar en este local' using errcode='42501'; end if;
  select jsonb_build_object('token',s.token,'local_id',v_local.id,
    'local_name',v_local.name,'expires_at',i.expires_at,'group_shared',true)
    into result
  from rm_test_private.manager_staff_group_secrets s
  join rm_test_private.manager_staff_invites i on i.id=s.invite_id
    and i.organization_id=s.organization_id and i.local_id=s.local_id
  where s.organization_id=v_local.organization_id and s.local_id=v_local.id
    and i.group_shared and i.revoked_at is null
    and i.expires_at>clock_timestamp();
  return result;
end $get$;
revoke all on function rm_test_private.rm_manager_staff_group_get(text) from public,anon,authenticated;
grant execute on function rm_test_private.rm_manager_staff_group_get(text) to authenticated;
create or replace function public.rm_app_manager_staff_group_get(p_local text)
returns jsonb language sql set search_path='' as $api$
  select rm_test_private.rm_manager_staff_group_get(p_local)
$api$;
revoke all on function public.rm_app_manager_staff_group_get(text) from public,anon,authenticated;
grant execute on function public.rm_app_manager_staff_group_get(text) to authenticated;
