-- GESTLOK · Administración de empleados: funciones, parte 8 de 11 (adaptadas de ReciboNet: identidad por correo confirmado).
set local check_function_bodies = off;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_save_schedule(p_company uuid, p_period text, p_start date, p_rows jsonb, p_notes text, p_publish boolean, p_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare org uuid; existing public.rm_schedules; saved public.rm_schedules; row_value jsonb; field text; amount numeric; names text[]:='{}'; name_value text; filled integer:=0; end_date date;
begin
 if not rm_test_private.schedule_permission(p_company,'edit') or p_publish is null or (p_publish and not rm_test_private.schedule_permission(p_company,'publish')) then raise exception 'Schedule edit not permitted' using errcode='42501'; end if;
 if p_period is null or p_period not in ('semanal','mensual') or p_start is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 100 or p_notes is null or length(p_notes)>4000 or p_version is null or p_version<0 then raise exception 'Período o planilla inválidos'; end if;
 if p_period='mensual' and p_start<>date_trunc('month',p_start)::date then raise exception 'El mes debe empezar el día 1'; end if;
 for row_value in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(row_value) is distinct from 'object' or jsonb_typeof(row_value->'name') is distinct from 'string' or row_value->>'unit' is null or row_value->>'unit' not in ('horas','turnos') then raise exception 'Fila inválida'; end if;
  name_value=btrim(row_value->>'name');
  if length(name_value)>120 or (name_value<>'' and lower(name_value)=any(names)) then raise exception 'Nombres repetidos o inválidos'; end if;
  if name_value<>'' then names=array_append(names,lower(name_value)); filled=filled+1; end if;
  foreach field in array array['worked','off','holiday','justified','unjustified'] loop
   if jsonb_typeof(row_value->field) is distinct from 'number' then raise exception 'Cargá totales numéricos'; end if;
   amount=(row_value->>field)::numeric;
   if amount<0 or amount>744 or (row_value->>'unit'='turnos' and amount<>trunc(amount)) or (name_value='' and amount<>0) then raise exception 'Totales inválidos: usá horas o turnos enteros según corresponda'; end if;
  end loop;
 end loop;
 if p_publish and filled=0 then raise exception 'Cargá al menos un colaborador antes de publicar'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||p_period||p_start::text,0));
 select * into existing from public.rm_schedules where company_id=p_company and period=p_period and starts_on=p_start for update;
 if (existing.id is null and p_version<>0) or (existing.id is not null and existing.version<>p_version) then raise exception 'La planilla cambió. Actualizá antes de guardar.'; end if;
 select organization_id into org from public.rm_companies where id=p_company;
 end_date=case when p_period='semanal' then p_start+6 else (p_start+interval '1 month - 1 day')::date end;
 insert into public.rm_schedules(company_id,organization_id,period,starts_on,ends_on,rows,notes,status,updated_by,published_at) values(p_company,org,p_period,p_start,end_date,p_rows,p_notes,case when p_publish then 'published' else 'draft' end,rm_test_private.uid(),case when p_publish then clock_timestamp() end)
 on conflict(company_id,period,starts_on) do update set rows=excluded.rows,notes=excluded.notes,status=excluded.status,version=rm_schedules.version+1,updated_by=excluded.updated_by,updated_at=clock_timestamp(),published_at=excluded.published_at returning * into saved;
 return to_jsonb(saved);
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_schedule_comment(p_schedule uuid, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare company uuid; name_value text;
begin
 select company_id into company from public.rm_schedules where id=p_schedule;
 if not rm_test_private.schedule_permission(company,'comment') then raise exception 'Comment not permitted' using errcode='42501'; end if;
 select display_name into name_value from public.rm_app_directory where user_id=rm_test_private.uid();
 insert into public.rm_schedule_comments(schedule_id,author_id,author_name,author_role,body) values(p_schedule,rm_test_private.uid(),name_value,rm_test_private.app_role(),btrim(p_body));
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_schedule_context(p_company uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not rm_test_private.schedule_permission(p_company,'view') then raise exception 'Schedule not permitted' using errcode='42501'; end if;
 return jsonb_build_object('permissions',jsonb_build_object('edit',rm_test_private.schedule_permission(p_company,'edit'),'publish',rm_test_private.schedule_permission(p_company,'publish'),'comment',rm_test_private.schedule_permission(p_company,'comment')),
 'collaborators',(select coalesce(jsonb_agg(jsonb_build_object('id',d.path,'name',coalesce(d.data->>'nombre',d.data->>'nombreHoja','Sin nombre')) order by d.path),'[]') from public.rm_test_documents d join public.rm_app_local l on l.id=d.data->>'local' where d.collection='hojas' and l.company_id=p_company and d.organization_id=l.organization_id));
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_users()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if rm_test_private.app_role() not in ('admin','owner') then raise exception 'Manager required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc),'[]') from (
 select d.*,(select i.company_id from rm_test_private.organization_invitations i where i.email=lower(d.email) and i.organization_id=om.organization_id) invited_company_id,m.role,m.local_id,l.name local_name,m.sheet_id,om.organization_id,case when m.role='owner' then o.owner_number end owner_public_id,p.company_id manager_company_id,case when m.role='manager' then jsonb_build_object('edit',p.can_edit,'publish',p.can_publish,'comment',p.can_comment) end schedule_permissions
 from public.rm_app_directory d left join public.rm_test_members m using(user_id) left join public.rm_app_local l on l.id=m.local_id left join public.rm_organization_members om on om.user_id=d.user_id left join public.rm_organizations o on o.id=om.organization_id left join public.rm_manager_permissions p on p.user_id=d.user_id
 where d.user_id=rm_test_private.uid() or rm_test_private.manages_organization(om.organization_id)) t);
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_test_access_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text;v timestamptz;a public.rm_test_report_access;state text;permitted boolean;
begin
 if rm_test_private.uid() is null or rm_test_private.app_role()<>'employee' then raise exception 'Employee required' using errcode='42501'; end if;
 s=rm_test_private.app_sheet();select updated_at into v from public.rm_test_documents where path='hojas/'||s;
 select * into a from public.rm_test_report_access where user_id=rm_test_private.uid() and sheet_id=s;
 permitted=rm_test_private.allowed('view_reports');
 state=case when not permitted then 'disabled' when v is null then 'unavailable' when a.report_version is distinct from v or a.opened_at is null then 'ready' when a.expires_at>clock_timestamp() then 'active' when a.requested_at is not null then 'requested' else 'expired' end;
 return jsonb_build_object('status',state,'server_now',clock_timestamp(),'expires_at',case when a.report_version=v then a.expires_at end,'can_request',rm_test_private.allowed('reopen_access') and state='expired');
end $function$;
