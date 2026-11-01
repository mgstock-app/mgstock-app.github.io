-- GESTLOK: nómina activa sin perder liquidaciones existentes.
-- Los recibos antiguos permanecen en la base: solo se muestran aparte.
-- Seguridad: exclusivamente Dueño autorizado por organización.
create or replace function rm_test_private.staff_active_payroll_sheet_ids(p_org uuid)
returns jsonb language plpgsql security definer set search_path='' as $func$
declare v_result jsonb;
begin
  if auth.uid() is null or not rm_test_private.ensure_directory()
     or rm_test_private.app_role()<>'owner'
     or not rm_test_private.manages_organization(p_org)
  then raise exception 'No autorizado para consultar la nómina' using errcode='42501'; end if;
  select coalesce(jsonb_agg(distinct m.sheet_id),'[]'::jsonb) into v_result
  from public.rm_test_members m
  join public.rm_organization_members om on om.user_id=m.user_id
  join public.rm_app_local l on l.id=m.local_id and l.organization_id=om.organization_id
  where om.organization_id=p_org and m.role='employee' and m.sheet_id is not null;
  return v_result;
end $func$;
revoke all on function rm_test_private.staff_active_payroll_sheet_ids(uuid)
  from public,anon,authenticated;
grant execute on function rm_test_private.staff_active_payroll_sheet_ids(uuid) to authenticated;

create or replace function public.rm_app_owner_active_payroll_sheet_ids(p_organization uuid)
returns jsonb language sql set search_path='' as $func$
 select rm_test_private.staff_active_payroll_sheet_ids(p_organization)
$func$;
revoke all on function public.rm_app_owner_active_payroll_sheet_ids(uuid)
  from public,anon,authenticated;
grant execute on function public.rm_app_owner_active_payroll_sheet_ids(uuid) to authenticated;

-- Al completar el legajo la PRIMERA vez, completar sus datos en la hoja
-- provisoria personal que se creó al aceptar la invitación del local.
-- No fusionar por nombre parecido, nunca tocar importes/horas/recibos históricos.
create or replace function rm_test_private.staff_initial_legajo_to_sheet()
returns trigger language plpgsql security definer set search_path='' as $func$
declare v_sheet text; v_name text;
begin
  if old.needs_completion is distinct from true or new.needs_completion is distinct from false
     or auth.uid() is null then return new; end if;
  select m.sheet_id into v_sheet
  from rm_test_private.manager_staff_invites i
  join public.rm_test_members m on m.user_id=i.redeemed_by
    and m.role='employee' and m.local_id=i.local_id
  join public.rm_organization_members om on om.user_id=i.redeemed_by and om.organization_id=i.organization_id
  where i.profile_id=new.id and i.organization_id=new.organization_id
    and i.local_id=new.local_id and i.redeemed_by=auth.uid()
  limit 1;
  if v_sheet is null then return new; end if;
  v_name=btrim(new.first_name||' '||new.last_name);
  update public.rm_test_documents d set data =
     d.data || jsonb_build_object(
       'nombre',v_name,'nombreHoja',v_name,
       'alias',new.payment_alias,
       'contacto',coalesce(d.data->'contacto','{}'::jsonb)
         || jsonb_build_object('nombre',v_name,'tel',new.phone)
     ) || case when new.started_on is null then '{}'::jsonb
            else jsonb_build_object('fechaIngreso',to_char(new.started_on,'YYYY-MM-DD')) end
   where d.path='hojas/'||v_sheet and d.organization_id=new.organization_id
     and rm_test_private.sheet_local(d.path,d.data,d.organization_id)=new.local_id
     and d.data->'items'='{}'::jsonb
     and d.data->'tarifas'='{}'::jsonb
     and jsonb_typeof(coalesce(d.data->'contacto','{}'::jsonb))='object'
     and not exists(select 1 from public.rm_app_images im where im.sheet_id=v_sheet)
     and not exists(select 1 from public.rm_test_documents h where h.path like 'hojas/'||v_sheet||'/historial/%');
  return new;
end $func$;
revoke all on function rm_test_private.staff_initial_legajo_to_sheet() from public,anon,authenticated;
drop trigger if exists trg_staff_initial_legajo_to_sheet on public.rm_employee_profiles;
create trigger trg_staff_initial_legajo_to_sheet
 after update of first_name,last_name,phone,payment_alias,started_on,needs_completion
 on public.rm_employee_profiles
 for each row execute function rm_test_private.staff_initial_legajo_to_sheet();
