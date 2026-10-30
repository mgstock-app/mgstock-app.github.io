-- GESTLOK · Estados de invitaciones por sucursal. Solo cifras, nunca enlaces
-- privados, correos, tokens, datos personales ni información de otros tenants.
create or replace function rm_test_private.rm_manager_staff_invite_status(p_local text)
returns jsonb language plpgsql security definer set search_path=''
as $status$
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
    rm_test_private.app_role()=''
    and v_local.id=any(rm_test_private.gestlok_gerente_locals())
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
$status$;

revoke all on function rm_test_private.rm_manager_staff_invite_status(text) from public,anon;
grant execute on function rm_test_private.rm_manager_staff_invite_status(text) to authenticated;

create or replace function public.rm_app_manager_staff_invite_status(p_local text)
returns jsonb language sql set search_path=''
as $call$ select rm_test_private.rm_manager_staff_invite_status(p_local) $call$;
revoke all on function public.rm_app_manager_staff_invite_status(text) from public,anon;
grant execute on function public.rm_app_manager_staff_invite_status(text) to authenticated;
