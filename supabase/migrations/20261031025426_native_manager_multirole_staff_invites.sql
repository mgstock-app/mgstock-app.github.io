-- Gerentes nativos con perfil personal de colaborador: invitan solo en su local verificado.
-- No modifica membresías, recibos ni permisos de otros colaboradores.
CREATE OR REPLACE FUNCTION rm_test_private.rm_manager_staff_invite_create(p_local text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog,extensions'
AS $function$
declare target_local public.rm_app_local; raw_token text; v_id uuid; v_exp timestamptz;
begin
  if not rm_test_private.ensure_directory() then
    raise exception 'Necesitás ingresar con Google' using errcode='42501';
  end if;
  select * into target_local from public.rm_app_local l where l.id=p_local;
  if not found then raise exception 'Local no encontrado' using errcode='42501'; end if;
  if not rm_test_private.rm_employee_profile_scope(target_local.organization_id,target_local.id)
     or rm_test_private.app_role()='admin'
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
       or (p_local=any(rm_test_private.gestlok_gerente_locals())
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
$function$
;
CREATE OR REPLACE FUNCTION rm_test_private.rm_manager_staff_invite_status(p_local text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_local public.rm_app_local; v_uid uuid;
        v_owner boolean:=false; v_manager boolean:=false;
        v_pending int; v_accepted int; v_expired int; v_revoked int;
begin
 if not rm_test_private.ensure_directory() then
   raise exception 'Ingresá con una cuenta Google confirmada' using errcode='42501';
 end if;
 v_uid:=rm_test_private.uid();
 select * into v_local from public.rm_app_local where id=p_local;
 if not found then raise exception 'Local no encontrado' using errcode='42501'; end if;
 v_owner:=rm_test_private.app_role()='owner' and
   rm_test_private.manages_organization(v_local.organization_id);
 v_manager:=(
    rm_test_private.app_role()='manager' and exists(
      select 1 from public.rm_test_members m
      join public.rm_manager_permissions mp on mp.user_id=m.user_id
      where m.user_id=v_uid and m.role='manager' and m.local_id=v_local.id
        and mp.organization_id=v_local.organization_id
        and mp.company_id=v_local.company_id
    )
 ) or (
    v_local.id=any(rm_test_private.gestlok_gerente_locals())
    and exists (
      select 1 from public.docs e
      where e.col='equipo' and e.tenant_id=gestlok_tenancy.current_tenant_id()
        and lower(e.data->>'email')=gestlok_tenancy.verified_role_context_email()
        and e.data->>'rol'='gerente'
        and exists(select 1 from jsonb_array_elements_text(
          coalesce(e.data->'locales','[]'::jsonb)) s(id)
          where case s.id when 'torcuato' then 'dt' else s.id end=v_local.id)
    )
 );
 if not (v_owner or v_manager) then
   raise exception 'Sin acceso a las invitaciones de este local' using errcode='42501';
 end if;
 select count(*) filter(where i.redeemed_by is null and i.revoked_at is null
                    and i.expires_at>clock_timestamp()),
        count(*) filter(where i.redeemed_by is not null),
        count(*) filter(where i.redeemed_by is null and i.revoked_at is null
                    and i.expires_at<=clock_timestamp()),
        count(*) filter(where i.revoked_at is not null and i.redeemed_by is null)
 into v_pending,v_accepted,v_expired,v_revoked
 from rm_test_private.manager_staff_invites i
 where i.local_id=v_local.id and i.organization_id=v_local.organization_id
   and i.company_id=v_local.company_id
   and (v_owner or i.created_by=v_uid);
 return jsonb_build_object('local_id',v_local.id,'pending',v_pending,
                           'accepted',v_accepted,'expired',v_expired,'revoked',v_revoked);
end
$function$
;

