-- GESTLOK / Empleados: invitación general por local y legajo autocompletado.
-- Solo el proyecto GESTLOK. Mantiene las invitaciones personales y los recibos tal como están.
-- El token compartido nunca se almacena en claro (solo SHA-256 en esquema privado).
alter table rm_test_private.manager_staff_invites
  add column if not exists group_shared boolean not null default false;
alter table rm_test_private.manager_staff_invites
  add constraint manager_staff_group_not_consumed
  check (not group_shared or (redeemed_by is null and redeemed_at is null and profile_id is null));

-- Crear/renovar un enlace para todo el grupo del local: dura 30 días y su regeneración
-- revoca el anterior. La autorización se hereda de la RPC de invitación existente:
-- gerente con permiso del local, dueño autorizado; nunca otro tenant.
create or replace function rm_test_private.rm_manager_staff_group_create(p_local text)
returns jsonb language plpgsql security definer set search_path='' as $group_create$
declare result jsonb; v_hash text; v_org uuid; v_local text; v_exp timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(216104);
  result := rm_test_private.rm_manager_staff_invite_create(p_local);
  v_hash := encode(sha256(convert_to(result->>'token','UTF8')),'hex');
  select organization_id,local_id into v_org,v_local
    from rm_test_private.manager_staff_invites where token_hash=v_hash for update;
  if not found then raise exception 'No se pudo crear el enlace' using errcode='42501'; end if;
  update rm_test_private.manager_staff_invites set revoked_at=clock_timestamp()
    where organization_id=v_org and local_id=v_local
      and group_shared and revoked_at is null and token_hash<>v_hash;
  update rm_test_private.manager_staff_invites
    set group_shared=true, expires_at=clock_timestamp()+interval '30 days'
    where token_hash=v_hash
    returning expires_at into v_exp;
  insert into rm_test_private.account_audit(actor,target,action,after_value)
    values(auth.uid(),auth.uid(),'manager_staff_group_link_created',
      jsonb_build_object('local_id',v_local,'organization_id',v_org));
  return jsonb_build_object('token',result->>'token','local_id',v_local,
    'local_name',result->>'local_name','expires_at',v_exp,'group_shared',true);
end $group_create$;
revoke all on function rm_test_private.rm_manager_staff_group_create(text) from public,anon,authenticated;
grant execute on function rm_test_private.rm_manager_staff_group_create(text) to authenticated;
create or replace function public.rm_app_manager_staff_group_create(p_local text)
returns jsonb language sql set search_path='' as $api$
  select rm_test_private.rm_manager_staff_group_create(p_local)
$api$;
revoke all on function public.rm_app_manager_staff_group_create(text) from public,anon,authenticated;
grant execute on function public.rm_app_manager_staff_group_create(text) to authenticated;

create or replace function rm_test_private.rm_manager_staff_group_preview(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $preview$
declare result jsonb;
begin
  if auth.uid() is null or not rm_test_private.ensure_directory()
     or coalesce(p_token,'') !~ '^[a-f0-9]{64}$'
  then raise exception 'Invitación inválida' using errcode='42501'; end if;
  select jsonb_build_object('company_name',c.name,'local_name',l.name,
    'expires_at',i.expires_at,'group_shared',true)
    into result
  from rm_test_private.manager_staff_invites i
  join public.rm_companies c on c.id=i.company_id and c.organization_id=i.organization_id
  join public.rm_app_local l on l.id=i.local_id and l.organization_id=i.organization_id
      and l.company_id=i.company_id
  where i.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
    and i.group_shared and i.revoked_at is null and i.expires_at>clock_timestamp();
  if result is null then raise exception 'El enlace general venció o fue revocado' using errcode='42501'; end if;
  return result;
end $preview$;
revoke all on function rm_test_private.rm_manager_staff_group_preview(text) from public,anon,authenticated;
grant execute on function rm_test_private.rm_manager_staff_group_preview(text) to authenticated;
create or replace function public.rm_app_manager_staff_group_preview(p_token text)
returns jsonb language sql set search_path='' as $api$
  select rm_test_private.rm_manager_staff_group_preview(p_token)
$api$;
revoke all on function public.rm_app_manager_staff_group_preview(text) from public,anon,authenticated;
grant execute on function public.rm_app_manager_staff_group_preview(text) to authenticated;

-- Cada persona usa el MISMO enlace grupal, pero obtiene su propia invitación personal
-- interna de un uso. Esto reutiliza todas las garantías de la incorporación existente:
-- Google verificado, no cambiar roles previos, misma empresa/local, legajo y hoja privada.
create or replace function rm_test_private.rm_manager_staff_group_accept(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $accept$
declare shared rm_test_private.manager_staff_invites; prior rm_test_private.manager_staff_invites;
  v_token text; result jsonb;
begin
  if auth.uid() is null or coalesce(p_token,'') !~ '^[a-f0-9]{64}$'
    or not rm_test_private.ensure_directory()
  then raise exception 'Ingresá con tu cuenta de Google confirmada' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(216103);
  select * into shared from rm_test_private.manager_staff_invites i
    where i.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
      and i.group_shared and i.revoked_at is null and i.expires_at>clock_timestamp()
    for update;
  if not found then raise exception 'El enlace general venció o fue revocado' using errcode='42501'; end if;
  select * into prior from rm_test_private.manager_staff_invites i
    where i.redeemed_by=auth.uid() for update;
  if found then
    if prior.organization_id=shared.organization_id
       and prior.local_id=shared.local_id and prior.profile_id is not null
       and exists(select 1 from public.rm_test_members m where m.user_id=auth.uid()
           and m.role='employee' and m.local_id=shared.local_id)
       and exists(select 1 from public.rm_organization_members om where om.user_id=auth.uid()
           and om.organization_id=shared.organization_id)
    then
      return jsonb_build_object('local_id',shared.local_id,'profile_id',prior.profile_id,'joined',true);
    end if;
    raise exception 'Esta cuenta ya tiene otra asignación o no está habilitada' using errcode='42501';
  end if;
  if not exists(select 1 from public.rm_app_local l where l.id=shared.local_id
        and l.organization_id=shared.organization_id and l.company_id=shared.company_id)
  then raise exception 'Este local ya no está habilitado' using errcode='42501'; end if;

  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into rm_test_private.manager_staff_invites
    (token_hash,organization_id,company_id,local_id,created_by)
  values (encode(sha256(convert_to(v_token,'UTF8')),'hex'),
    shared.organization_id,shared.company_id,shared.local_id,shared.created_by);

  result:=rm_test_private.rm_manager_staff_invite_accept(v_token);
  insert into rm_test_private.account_audit(actor,target,action,after_value)
    values(auth.uid(),auth.uid(),'manager_staff_group_link_accepted',
       jsonb_build_object('local_id',shared.local_id,'group_invite_id',shared.id));
  return result;
end $accept$;
revoke all on function rm_test_private.rm_manager_staff_group_accept(text) from public,anon,authenticated;
grant execute on function rm_test_private.rm_manager_staff_group_accept(text) to authenticated;
create or replace function public.rm_app_manager_staff_group_accept(p_token text)
returns jsonb language sql set search_path='' as $api$
  select rm_test_private.rm_manager_staff_group_accept(p_token)
$api$;
revoke all on function public.rm_app_manager_staff_group_accept(text) from public,anon,authenticated;
grant execute on function public.rm_app_manager_staff_group_accept(text) to authenticated;

-- Permitir al empleado editar ÚNICAMENTE su propio legajo vinculado a una invitación,
-- sin alterar status, empresa, local, notas, historial, fechas de refuerzo ni recibos.
-- Los permisos generales de gerente/dueño mantienen su comportamiento actual.
create or replace function rm_test_private.rm_employee_profile_touch()
returns trigger language plpgsql security definer set search_path='' as $touch$
declare v_invited_staff boolean:=false; v_self_staff boolean:=false;
begin
  if tg_op='INSERT' and new.needs_completion is true
     and auth.uid() is not null and new.created_by is distinct from auth.uid()
  then
    select exists(
      select 1 from rm_test_private.manager_staff_invites i
      where i.organization_id=new.organization_id and i.local_id=new.local_id
        and i.created_by=new.created_by and i.redeemed_by is null
        and i.revoked_at is null and i.expires_at>clock_timestamp()
    ) and exists(
      select 1 from public.rm_test_members m
      where m.user_id=auth.uid() and m.role='employee' and m.local_id=new.local_id
    ) and exists(
      select 1 from public.rm_organization_members om
      where om.user_id=auth.uid() and om.organization_id=new.organization_id
    ) into v_invited_staff;
  end if;
  if tg_op='UPDATE' and auth.uid() is not null then
    select exists(
      select 1 from rm_test_private.manager_staff_invites i
      where i.profile_id=old.id and i.redeemed_by=auth.uid()
        and i.organization_id=old.organization_id and i.local_id=old.local_id
    ) and exists(
      select 1 from public.rm_test_members m
      where m.user_id=auth.uid() and m.role='employee' and m.local_id=old.local_id
    ) and exists(
      select 1 from public.rm_organization_members om
      where om.user_id=auth.uid() and om.organization_id=old.organization_id
    ) and new.status is not distinct from old.status
      and new.notes is not distinct from old.notes
      and new.reinforcement_dates is not distinct from old.reinforcement_dates
      and new.last_worked_on is not distinct from old.last_worked_on
      and new.needs_completion=false
    into v_self_staff;
  end if;
  if auth.uid() is null
     or not (coalesce(rm_test_private.rm_employee_profile_scope(new.organization_id,new.local_id),false)
         or v_invited_staff or v_self_staff)
  then raise exception 'Sin permiso para completar el legajo de este local' using errcode='42501'; end if;
  if not exists(select 1 from public.rm_app_local l
       where l.id=new.local_id and l.organization_id=new.organization_id)
  then raise exception 'Local no pertenece a esta empresa' using errcode='23514'; end if;
  if tg_op='UPDATE' then
    if new.id<>old.id or new.organization_id<>old.organization_id
       or new.local_id<>old.local_id or new.created_by<>old.created_by
       or new.created_at<>old.created_at
    then raise exception 'No se puede mover un legajo a otro local ni cambiar su autor original'
       using errcode='42501'; end if;
  else
    if new.created_by is distinct from auth.uid() and not v_invited_staff
    then raise exception 'El alta debe corresponder al gerente o a una invitación válida'
       using errcode='42501'; end if;
  end if;
  new.first_name=btrim(new.first_name);
  new.last_name=btrim(new.last_name);
  new.phone=btrim(new.phone);
  new.payment_alias=btrim(new.payment_alias);
  new.updated_at=now();
  new.updated_by=auth.uid();
  return new;
end $touch$;
revoke all on function rm_test_private.rm_employee_profile_touch() from public,anon,authenticated;

-- GET: información propia, no listar legajos de compañeros, no emails ni valores de pago.
create or replace function public.rm_app_staff_self_profile()
returns jsonb language plpgsql security definer set search_path='' as $self_get$
declare result jsonb;
begin
  if auth.uid() is null or not rm_test_private.ensure_directory() then
    raise exception 'Sesión de colaborador requerida' using errcode='42501'; end if;
  select jsonb_build_object('id',p.id,'first_name',p.first_name,'last_name',p.last_name,
     'phone',p.phone,'payment_alias',p.payment_alias,'started_on',p.started_on,
     'needs_completion',p.needs_completion,'local_id',p.local_id)
    into result
  from rm_test_private.manager_staff_invites i
  join public.rm_employee_profiles p on p.id=i.profile_id
      and p.organization_id=i.organization_id and p.local_id=i.local_id
  join public.rm_test_members m on m.user_id=i.redeemed_by
      and m.role='employee' and m.local_id=i.local_id
  join public.rm_organization_members om on om.user_id=i.redeemed_by
      and om.organization_id=i.organization_id
  where i.redeemed_by=auth.uid();
  return result;
end $self_get$;
revoke all on function public.rm_app_staff_self_profile() from public,anon,authenticated;
grant execute on function public.rm_app_staff_self_profile() to authenticated;

create or replace function public.rm_app_staff_self_profile_save(
  p_first_name text,p_last_name text,p_phone text,p_payment_alias text,p_started_on date default null)
returns jsonb language plpgsql security definer set search_path='' as $self_save$
declare v_id uuid; v_first text; v_last text; v_phone text; v_alias text; v_date date;
begin
  if auth.uid() is null or not rm_test_private.ensure_directory() then
    raise exception 'Sesión de colaborador requerida' using errcode='42501'; end if;
  v_first:=btrim(coalesce(p_first_name,'')); v_last:=btrim(coalesce(p_last_name,''));
  v_phone:=btrim(coalesce(p_phone,'')); v_alias:=btrim(coalesce(p_payment_alias,''));
  if char_length(v_first) not between 1 and 100
     or char_length(v_last) not between 1 and 100
     or char_length(v_phone) not between 8 and 35
     or v_phone !~ '^[+0-9 ()-]+$'
     or char_length(v_alias) not between 1 and 120
  then raise exception 'Completá nombre, apellido, teléfono y alias válidos'
      using errcode='22023'; end if;
  if p_started_on is not null and (p_started_on < date '1900-01-01'
      or p_started_on > date '2200-12-31') then
    raise exception 'Fecha de ingreso inválida' using errcode='22023'; end if;
  select i.profile_id into v_id
  from rm_test_private.manager_staff_invites i
  join public.rm_test_members m on m.user_id=i.redeemed_by
     and m.role='employee' and m.local_id=i.local_id
  join public.rm_organization_members om on om.user_id=i.redeemed_by
     and om.organization_id=i.organization_id
  join public.rm_employee_profiles p on p.id=i.profile_id
     and p.organization_id=i.organization_id and p.local_id=i.local_id
  where i.redeemed_by=auth.uid()
  for update of p;
  if v_id is null then
    raise exception 'No tenés un legajo propio habilitado para editar'
      using errcode='42501'; end if;
  update public.rm_employee_profiles
  set first_name=v_first,last_name=v_last,phone=v_phone,payment_alias=v_alias,
      started_on=p_started_on,needs_completion=false
  where id=v_id;
  return public.rm_app_staff_self_profile();
end $self_save$;
revoke all on function public.rm_app_staff_self_profile_save(text,text,text,text,date)
  from public,anon,authenticated;
grant execute on function public.rm_app_staff_self_profile_save(text,text,text,text,date)
  to authenticated;

comment on column rm_test_private.manager_staff_invites.group_shared is
  'Enlace grupal por local; puede compartirse entre empleados, nunca se consume. Cada alta genera una invitación individual interna.';
