-- GESTLOK · Administración de empleados: funciones, parte 2 de 11 (adaptadas de ReciboNet: identidad por correo confirmado).
set local check_function_bodies = off;

CREATE OR REPLACE FUNCTION rm_test_private.document_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare expected uuid;
begin
 if new.path like 'hojas/%/historial/%' then
  select organization_id into expected from public.rm_test_documents where path='hojas/'||split_part(new.path,'/',2);
 elsif new.path like 'hojas/%' then
  select organization_id into expected from public.rm_app_local where id=rm_test_private.sheet_local(new.path,new.data,new.organization_id);
 elsif new.path like 'copias/%/%' then
  select organization_id into expected from public.rm_test_documents where path='copias/'||split_part(new.path,'/',2);
 else expected=new.organization_id;
 end if;
 if expected is null or (new.organization_id is not null and new.organization_id<>expected) then raise exception 'Organización inválida' using errcode='42501'; end if;
 if tg_op='UPDATE' and (new.path<>old.path or expected<>old.organization_id) then raise exception 'No se puede mover información entre espacios' using errcode='42501'; end if;
 new.organization_id=expected;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.employee_window(p_path text, p_version timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select rm_test_private.app_role()='employee' and p_path='hojas/'||rm_test_private.app_sheet() and rm_test_private.allowed('view_reports') and exists(
 select 1 from public.rm_test_report_access where user_id=rm_test_private.uid() and sheet_id=rm_test_private.app_sheet() and report_version=p_version and opened_at is not null and expires_at>clock_timestamp())
$function$;

CREATE OR REPLACE FUNCTION rm_test_private.is_general_administrator()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select rm_test_private.uid() is not null and rm_test_private.app_role()='admin' and exists(
 select 1 from rm_test_private.general_administrator a join auth.users u on u.id=auth.uid()
 where a.user_id=rm_test_private.uid() and lower(u.email)='kmu15lopez@gmail.com' and u.email_confirmed_at is not null)
$function$;

CREATE OR REPLACE FUNCTION rm_test_private.linked_companies(p_company uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from rm_test_private.company_workspace_links l
 join public.rm_companies c on c.id=l.company_id join public.rm_companies s on s.id=l.source_company_id
 where c.id=p_company and rm_test_private.manages_organization(c.organization_id) and rm_test_private.manages_organization(s.organization_id)
$function$;

CREATE OR REPLACE FUNCTION rm_test_private.local_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if tg_op='UPDATE' and (new.organization_id<>old.organization_id or new.owner_id is distinct from old.owner_id) then raise exception 'El espacio del local es inmutable'; end if;
 if new.owner_id is distinct from (select owner_id from public.rm_organizations where id=new.organization_id) then raise exception 'Dueño y organización no coinciden'; end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.manages_local(p_local text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce((select rm_test_private.manages_organization(organization_id) from public.rm_app_local where id=p_local),false)
$function$;

CREATE OR REPLACE FUNCTION rm_test_private.manages_organization(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT rm_test_private.is_general_administrator() OR coalesce(EXISTS(
  SELECT 1 FROM public.rm_organizations o
  WHERE o.id = p_org
    AND (
      (rm_test_private.app_role() = 'owner'
       AND (
         EXISTS (SELECT 1 FROM public.rm_organization_members m
                 WHERE m.user_id = rm_test_private.uid() AND m.organization_id = o.id)
         OR EXISTS (SELECT 1 FROM rm_test_private.owner_support_access g
                    WHERE g.user_id = rm_test_private.uid() AND g.organization_id = o.id)
       )
      )
      OR
      (rm_test_private.app_role() = 'admin'
       AND EXISTS (SELECT 1 FROM public.rm_organization_admins a
                   WHERE a.organization_id = o.id AND a.user_id = rm_test_private.uid()))
    )
 ),false)
$function$;

CREATE OR REPLACE FUNCTION rm_test_private.manages_sheet(p_sheet text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.rm_test_documents d where d.path='hojas/'||p_sheet
 and rm_test_private.manages_organization(d.organization_id)
 and rm_test_private.manages_local(rm_test_private.sheet_local(d.path,d.data,d.organization_id)))
$function$;

CREATE OR REPLACE FUNCTION rm_test_private.provision_preset_owner_locals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare org public.rm_organizations; company uuid; local_name text;
begin
 if tg_op='UPDATE' and old.role='owner' then return new; end if;
 if new.role<>'owner' or not exists(select 1 from public.rm_app_directory d
   where d.user_id=new.user_id and lower(d.email)='<correo-codueno-omitido>' /* referencia: correo real omitido del repositorio público */) then return new; end if;
 select o.* into org from public.rm_organizations o join public.rm_organization_members m on m.organization_id=o.id
 where m.user_id=new.user_id and o.owner_id=new.user_id;
 if org.id is null then return new; end if;
 perform pg_advisory_xact_lock(216103);
 select c.id into company from public.rm_companies c where c.organization_id=org.id order by c.id limit 1;
 if company is null then
  insert into public.rm_companies(organization_id,name) values(org.id,org.name) returning id into company;
 end if;
 foreach local_name in array array['Munro','Torcuato'] loop
  if not exists(select 1 from public.rm_app_local l where l.company_id=company and lower(l.name)=lower(local_name)) then
   insert into public.rm_app_local(id,name,cycle,owner_id,organization_id,company_id)
   values(replace(gen_random_uuid()::text,'-',''),local_name,'mensual',new.user_id,org.id,company);
  end if;
 end loop;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.publish_private_report(p_sheet text, p_image text, p_version timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare version timestamptz;
begin
 if p_image is null or length(p_image)>8388608 or p_image !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$' then raise exception 'Invalid PNG image'; end if;
 version=rm_test_private.record_delivery(p_sheet,p_version,'Aplicación');
 insert into public.rm_app_images(sheet_id,image,report_version,published_by) values(p_sheet,p_image,version,rm_test_private.uid())
 on conflict(sheet_id) do update set image=excluded.image,report_version=excluded.report_version,published_by=excluded.published_by,published_at=clock_timestamp();
end $function$;
