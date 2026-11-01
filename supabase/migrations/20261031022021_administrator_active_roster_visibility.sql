-- Aplicar a la Administradora General la misma nómina activa por enlace y legajo.
-- No modifica documentos, recibos, perfiles ni el archivo privado.
create or replace function rm_test_private.owner_roster_state(p_organization uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare enabled_flag boolean; enabled_ids jsonb;
begin
  if auth.uid() is null or not rm_test_private.ensure_directory()
     or (rm_test_private.app_role()<>'owner' and not rm_test_private.is_general_administrator())
     or not rm_test_private.manages_organization(p_organization)
  then raise exception 'Nómina privada: acceso del dueño requerido' using errcode='42501'; end if;

  select s.enabled into enabled_flag
  from rm_test_private.owner_roster_settings s
  where s.organization_id=p_organization;
  if coalesce(enabled_flag,false) is false then
    return jsonb_build_object('enabled',false,'active_sheet_ids','[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(distinct m.sheet_id),'[]'::jsonb) into enabled_ids
  from rm_test_private.manager_staff_invites i
  join public.rm_employee_profiles p on p.id=i.profile_id
    and p.organization_id=i.organization_id and p.local_id=i.local_id
  join public.rm_test_members m on m.user_id=i.redeemed_by
    and m.role='employee' and m.local_id=i.local_id
  join public.rm_organization_members om on om.user_id=i.redeemed_by
    and om.organization_id=i.organization_id
  join public.rm_app_local l on l.id=i.local_id
    and l.organization_id=i.organization_id and l.company_id=i.company_id
  where i.organization_id=p_organization
    and p.needs_completion=false and m.sheet_id is not null
    and not exists (select 1 from rm_test_private.owner_roster_archive a
        where a.organization_id=i.organization_id and a.path='hojas/'||m.sheet_id);

  return jsonb_build_object('enabled',true,'active_sheet_ids',enabled_ids);
end $fn$;
revoke all on function rm_test_private.owner_roster_state(uuid) from public,anon,authenticated;
grant execute on function rm_test_private.owner_roster_state(uuid) to authenticated;

