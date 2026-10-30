-- GESTLOK: ingreso INMEDIATO a su local para colaborador invitado por gerente.
-- Bug: la variable 'current_role' colisionaba con CURRENT_ROLE (palabra reservada
-- de PostgreSQL). Bajo SECURITY DEFINER devolvía el rol técnico 'postgres',
-- bloqueando TODAS las altas nuevas con "otra asignación".
-- Renombrar la variable mantiene las restricciones actuales sin abrir permisos.
-- Solamente base GESTLOK. No cambiar datos reales ni ReciboNet externo.

-- GESTLOK: ruta para crear enlaces de gerentes nativos del tenant,
-- separados de los roles históricos de ReciboNet. No incluye editores.
-- Ambos caminos confirman identidad y sucursal autorizada.
create or replace function rm_test_private.rm_manager_staff_invite_create(p_local text)
returns jsonb language plpgsql security definer set search_path='pg_catalog,extensions'
as $create_staff$
declare target_local public.rm_app_local; raw_token text; v_id uuid; v_exp timestamptz;
begin
  if not rm_test_private.ensure_directory() then
    raise exception 'Necesitás ingresar con Google' using errcode='42501';
  end if;
  select * into target_local from public.rm_app_local l where l.id=p_local;
  if not found then raise exception 'Local no encontrado' using errcode='42501'; end if;
  if not rm_test_private.rm_employee_profile_scope(target_local.organization_id,target_local.id)
     or rm_test_private.app_role() in ('admin','employee')
     or not (
       (rm_test_private.app_role()='manager' and exists(
         select 1 from public.rm_manager_permissions mp
         join public.rm_test_members m on m.user_id=mp.user_id
         where mp.user_id=rm_test_private.uid()
           and mp.organization_id=target_local.organization_id
           and mp.company_id=target_local.company_id
           and m.local_id=target_local.id and m.role='manager'
           and mp.can_edit=true
       ))
       or (rm_test_private.app_role()='owner'
           and rm_test_private.manages_organization(target_local.organization_id))
       or (rm_test_private.app_role()=''
           and p_local=any(rm_test_private.gestlok_gerente_locals())
           and exists(
             select 1 from public.docs e
             where e.col='equipo'
               and e.tenant_id=(select gestlok_tenancy.current_tenant_id())
               and lower(e.data->>'email')=lower(coalesce(auth.jwt()->>'email',''))
               and e.data->>'rol'='gerente'
               and exists (
                 select 1 from jsonb_array_elements_text(
                   coalesce(e.data->'locales','[]'::jsonb)) s(id)
                 where case s.id when 'torcuato' then 'dt' else s.id end = p_local
               )
           ))
     )
  then raise exception 'Solo el gerente autorizado puede invitar en su local' using errcode='42501'; end if;

  raw_token=encode(extensions.gen_random_bytes(32),'hex');
  insert into rm_test_private.manager_staff_invites
   (token_hash,organization_id,company_id,local_id,created_by)
  values (encode(sha256(convert_to(raw_token,'UTF8')),'hex'),
          target_local.organization_id,target_local.company_id,target_local.id,
          rm_test_private.uid())
  returning id,expires_at into v_id,v_exp;

  insert into rm_test_private.account_audit(actor,target,action,after_value)
    values (rm_test_private.uid(),rm_test_private.uid(),'manager_staff_invite_created',
      jsonb_build_object('invite_id',v_id,'local_id',target_local.id,'company_id',target_local.company_id));
  return jsonb_build_object('token',raw_token,'local_id',target_local.id,
    'local_name',target_local.name,'expires_at',v_exp);
end
$create_staff$;

create or replace function rm_test_private.rm_manager_staff_invite_accept(p_token text)
returns jsonb language plpgsql security definer set search_path=''
as $accept_staff$
declare invite rm_test_private.manager_staff_invites;
  v_uid uuid; current_org uuid; v_member_role text; current_kind text; current_status text;
  v_name text; v_first text; v_last text; v_sheet text; v_profile uuid; v_local public.rm_app_local;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$'
     or not rm_test_private.ensure_directory() then
    raise exception 'Necesitás una invitación válida y una cuenta Google confirmada'
    using errcode='42501';
  end if;
  v_uid=rm_test_private.uid();
  if v_uid is null then raise exception 'La identidad no está verificada' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(216103);
  select * into invite from rm_test_private.manager_staff_invites i
    where i.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
  if not found or invite.revoked_at is not null or invite.expires_at<=clock_timestamp() then
    raise exception 'La invitación venció o fue revocada' using errcode='42501';
  end if;
  -- Idempotencia: un callback OAuth repetido no duplica ni relocaliza a nadie.
  if invite.redeemed_by=v_uid and invite.profile_id is not null then
    return jsonb_build_object('local_id',invite.local_id,'profile_id',invite.profile_id,'joined',true);
  end if;
  if invite.redeemed_by is not null then
    raise exception 'Este enlace ya fue utilizado' using errcode='42501';
  end if;

  select * into v_local from public.rm_app_local l where l.id=invite.local_id
    and l.company_id=invite.company_id and l.organization_id=invite.organization_id;
  if not found then raise exception 'El local de la invitación ya no está habilitado' using errcode='42501'; end if;
  select role into v_member_role from public.rm_test_members where user_id=v_uid for update;
  select organization_id into current_org from public.rm_organization_members where user_id=v_uid for update;
  select account_kind,status,display_name into current_kind,current_status,v_name
    from public.rm_app_directory where user_id=v_uid for update;
  if current_status='rejected' or current_kind='owner'
     or v_member_role is not null
     or (current_org is not null and current_org<>invite.organization_id)
     or exists(select 1 from rm_test_private.manager_staff_invites where redeemed_by=v_uid)
  then raise exception 'Esta cuenta ya tiene otra asignación o no está habilitada' using errcode='42501';
  end if;
  if not exists(select 1 from auth.users u where u.id=auth.uid()
      and u.email_confirmed_at is not null
      and lower(btrim(u.email))=lower(coalesce(auth.jwt()->>'email','')))
  then raise exception 'Verificá tu correo Google' using errcode='42501'; end if;
  v_name=left(btrim(coalesce(nullif(v_name,''),'Colaborador')),200);
  v_first=left(coalesce(nullif(split_part(v_name,' ',1),''),'Colaborador'),100);
  v_last=left(coalesce(nullif(btrim(substr(v_name,length(split_part(v_name,' ',1))+2)),''),'Pendiente'),100);

  insert into public.rm_organization_members(user_id,organization_id)
    values(v_uid,invite.organization_id) on conflict(user_id) do nothing;
  v_sheet=replace(gen_random_uuid()::text,'-','');
  insert into public.rm_test_documents(path,data,organization_id)
    values('hojas/'||v_sheet,jsonb_build_object(
      'nombre',v_name,'nombreHoja',v_name,'local',invite.local_id,
      'puesto','staff','porTurno',false,'orden',extract(epoch from clock_timestamp())*1000,
      'items','{}'::jsonb,'tarifas','{}'::jsonb),invite.organization_id);

  insert into public.rm_test_members(user_id,role,sheet_id,local_id)
    values(v_uid,'employee',v_sheet,invite.local_id);
  update public.rm_app_directory set status='approved',account_kind='collaborator' where user_id=v_uid;

  insert into public.rm_employee_profiles(
     organization_id,local_id,first_name,last_name,notes,status,
     created_by,needs_completion)
    values(invite.organization_id,invite.local_id,v_first,v_last,'','activo',
           invite.created_by,true) returning id into v_profile;
  update rm_test_private.manager_staff_invites
    set redeemed_by=v_uid,redeemed_at=clock_timestamp(),profile_id=v_profile where id=invite.id;

  insert into rm_test_private.account_audit(actor,target,action,after_value)
    values(v_uid,v_uid,'manager_staff_invite_accepted',
      jsonb_build_object('invite_id',invite.id,'company_id',invite.company_id,
        'local_id',invite.local_id,'profile_id',v_profile,'role','employee'));

  return jsonb_build_object('local_id',invite.local_id,'profile_id',v_profile,'joined',true);
end
$accept_staff$;

revoke all on function rm_test_private.rm_manager_staff_invite_accept(text) from public, anon;
grant execute on function rm_test_private.rm_manager_staff_invite_accept(text) to authenticated;

do $verify_immediate$
declare f text;
begin
 f:=pg_get_functiondef('rm_test_private.rm_manager_staff_invite_accept(text)'::regprocedure);
 if position('v_member_role text' in f)=0 or position('current_role' in f)>0
    or position('status=''approved'',account_kind=''collaborator''' in f)=0
    or position('insert into public.rm_test_members(user_id,role,sheet_id,local_id)' in f)=0
    or position('and invite.expires_at<=clock_timestamp()' in f)>0
 then raise exception 'La invitación inmediata quedó incompleta';
 end if;
end $verify_immediate$;
