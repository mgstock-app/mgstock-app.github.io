-- Invitaciones a colaboradores para todas las empresas y locales actuales y futuros.
-- La misma invitación individual y legajo pendiente sirve para Munro, Torcuato
-- y locales de cualquier organización; NO se crean autorizaciones globales.
-- Los dueños autorizados de su organización también pueden generar enlaces.
-- Roles existentes, consumo único, caducidad y aislamiento permanecen intactos.
create or replace function rm_test_private.rm_manager_staff_invite_create(p_local text)
returns jsonb language plpgsql security definer set search_path='pg_catalog,extensions'
as $manager_invite$
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
       or (p_local=any(rm_test_private.gestlok_gerente_locals())
           and rm_test_private.app_role()='')
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
$manager_invite$;
