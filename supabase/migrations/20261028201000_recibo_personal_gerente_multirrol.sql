-- Gerente = también colaborador, pero su propio recibo usa un vínculo
-- PRIVADO separado de los legajos/sueldos de los empleados que administra.
-- Se respeta la empresa activa, verificada por la cuenta.
create table if not exists rm_test_private.manager_personal_sheets(
 user_id uuid not null references auth.users(id) on delete cascade,
 tenant_id uuid not null,
 organization_id uuid not null references public.rm_organizations(id),
 local_id text not null references public.rm_app_local(id),
 sheet_id text not null unique,
 created_at timestamptz not null default clock_timestamp(),
 primary key(user_id,tenant_id,local_id)
);
alter table rm_test_private.manager_personal_sheets enable row level security;
revoke all on rm_test_private.manager_personal_sheets from public,anon,authenticated;

-- Distinto del rol global ReciboNet, que conserva dueño en su empresa propia.
-- Mostrar la empresa elegida (gerente) sin convertirla en la organización
-- global de su cuenta y sin sobrescribir rm_test_members.
create or replace function rm_test_private.rm_app_me()
returns jsonb language plpgsql security definer set search_path=''
as $active_staff_context$
declare v_locals text[]; v_name text; v_email text;
begin
  v_locals := rm_test_private.gestlok_gerente_locals();
  if public.mi_rol() in ('gerente','editor')
    and coalesce(array_length(v_locals,1),0)>0
  then
    select lower(btrim(u.email)),
      left(coalesce(nullif(u.raw_user_meta_data->>'full_name',''),
                    nullif(u.raw_user_meta_data->>'name',''),u.email,'Gerente'),120)
     into v_email,v_name from auth.users u
     where u.id=auth.uid() and u.email_confirmed_at is not null
       and lower(btrim(u.email))=lower(coalesce(auth.jwt()->>'email',''));
    if v_email is null then raise exception 'Cuenta sin verificar' using errcode='42501'; end if;
    return jsonb_build_object(
     'user_id',auth.uid(),'email',v_email,'display_name',v_name,
     'status','approved','role',null,'local_id',null,'local_name',null,
     'sheet_id',null,'organization_id',null,'owner_public_id',null,
     'account_kind','collaborator',
     'gestlok_gerente',jsonb_build_object('local_ids',to_jsonb(v_locals),
                                         'tenant_id',gestlok_tenancy.current_tenant_id())
    );
  end if;
  -- Para propietarios y demás cuentas, conservar el comportamiento original.
  if exists(select 1 from gestlok_platform.employee_owners e where e.user_id=rm_test_private.uid())
    and rm_test_private.app_role()='' then
    raise exception 'Módulo de empleados no habilitado' using errcode='42501';
  end if;
  perform rm_test_private.activate_preapproved_shared_owner();
  return rm_test_private.rm_app_identity()
    || jsonb_build_object('account_kind',
      (select d.account_kind from public.rm_app_directory d where d.user_id=rm_test_private.uid()));
end
$active_staff_context$;
revoke all on function rm_test_private.rm_app_me() from public,anon;
grant execute on function rm_test_private.rm_app_me() to authenticated;

-- Resuelve el local siempre a partir de la misma sesión/verificación, nunca
-- a partir de organización, hoja, email o datos de usuario enviados por el cliente.
create or replace function rm_test_private.manager_personal_sheet(p_local text)
returns text language plpgsql security definer set search_path=''
as $personal_sheet$
declare v_uid uuid; v_tenant uuid; v_org uuid; v_sheet text; v_name text;
begin
 v_uid:=auth.uid();
 v_tenant:=gestlok_tenancy.current_tenant_id();
 if v_uid is null or v_tenant is null
   or gestlok_tenancy.verified_role_context_email() is null
   or public.mi_rol() not in ('gerente','editor')
   or p_local is null
   or not (p_local=any(rm_test_private.gestlok_gerente_locals()))
 then raise exception 'Solo gerente de este local' using errcode='42501'; end if;
 select k.organization_id into v_org
 from gestlok_platform.recibonet_links k
 join gestlok_platform.company_modules m on m.tenant_id=k.tenant_id
      and m.module='recibos_personal' and m.enabled
 join public.rm_app_local l on l.id=p_local and l.organization_id=k.organization_id
 where k.tenant_id=v_tenant;
 if v_org is null then raise exception 'El módulo de empleados no está habilitado' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(216103);
 select sheet_id into v_sheet from rm_test_private.manager_personal_sheets
   where user_id=v_uid and tenant_id=v_tenant and local_id=p_local;
 if v_sheet is not null then return v_sheet; end if;
 select left(coalesce(nullif(d.display_name,''),'Gerente'),120) into v_name
  from public.rm_app_directory d where d.user_id=v_uid;
 if v_name is null then
   select left(coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email),120)
   into v_name from auth.users u where u.id=v_uid;
 end if;
 v_sheet=replace(gen_random_uuid()::text,'-','');
 insert into public.rm_test_documents(path,data,organization_id)
 values('hojas/'||v_sheet,
   jsonb_build_object('nombre',coalesce(v_name,'Gerente'),
     'nombreHoja',coalesce(v_name,'Gerente'),'local',p_local,
     'puesto','gerente','porTurno',false,'items','{}'::jsonb,'tarifas','{}'::jsonb,
     'orden',extract(epoch from clock_timestamp())*1000),v_org);
 insert into rm_test_private.manager_personal_sheets(user_id,tenant_id,organization_id,local_id,sheet_id)
 values(v_uid,v_tenant,v_org,p_local,v_sheet);
 insert into rm_test_private.account_audit(actor,target,action,after_value)
 values(v_uid,v_uid,'manager_personal_sheet_created',
        jsonb_build_object('local_id',p_local,'organization_id',v_org));
 return v_sheet;
end
$personal_sheet$;
revoke all on function rm_test_private.manager_personal_sheet(text) from public,anon;
grant execute on function rm_test_private.manager_personal_sheet(text) to authenticated;

create or replace function rm_test_private.manager_personal_receipt_status(p_local text)
returns jsonb language plpgsql security definer set search_path=''
as $personal_status$
declare v_sheet text; v_published timestamptz;
begin
 v_sheet:=rm_test_private.manager_personal_sheet(p_local);
 select i.published_at into v_published
  from public.rm_app_images i
  join public.rm_test_documents d on d.path='hojas/'||i.sheet_id
    and d.updated_at=i.report_version
  where i.sheet_id=v_sheet;
 return jsonb_build_object(
   'status',case when v_published is null then 'unavailable' else 'active' end,
   'server_now',clock_timestamp(),
   'expires_at',case when v_published is not null
      then clock_timestamp()+interval '2 minutes' else null end,
   'can_request',false
 );
end
$personal_status$;
revoke all on function rm_test_private.manager_personal_receipt_status(text) from public,anon;
grant execute on function rm_test_private.manager_personal_receipt_status(text) to authenticated;

create or replace function rm_test_private.manager_personal_receipt_detail(p_local text)
returns jsonb language plpgsql security definer set search_path=''
as $personal_detail$
declare v_sheet text; result jsonb;
begin
 v_sheet:=rm_test_private.manager_personal_sheet(p_local);
 select jsonb_build_object(
   'sheet',jsonb_build_object(
     'nombre',coalesce(d.data->>'nombre',''),
     'puesto',coalesce(d.data->>'puesto','staff'),
     'porTurno',coalesce(d.data->'porTurno','false'::jsonb),
     'extras',coalesce(d.data->'extras','false'::jsonb),
     'ferTarifaPropia',coalesce(d.data->'ferTarifaPropia','false'::jsonb),
     'ausente',coalesce(d.data->'ausente','false'::jsonb),
     'ausJust',coalesce(d.data->'ausJust','false'::jsonb),
     'vac',coalesce(d.data->'vac','false'::jsonb),
     'agu',coalesce(d.data->'agu','false'::jsonb),
     'fecha',coalesce(d.data->>'fecha',''),
     'mes',coalesce(d.data->>'mes',''),
     'anio',coalesce(d.data->>'anio',''),
     'semDesde',coalesce(d.data->>'semDesde',''),
     'semHasta',coalesce(d.data->>'semHasta',''),
     'items',jsonb_build_object(
       'trab',jsonb_build_object('c',d.data#>'{items,trab,c}','i',d.data#>'{items,trab,i}'),
       'extra',jsonb_build_object('c',d.data#>'{items,extra,c}','i',d.data#>'{items,extra,i}'),
       'off',jsonb_build_object('c',d.data#>'{items,off,c}','i',d.data#>'{items,off,i}'),
       'fer',jsonb_build_object('c',d.data#>'{items,fer,c}','i',d.data#>'{items,fer,i}'),
       'aus',jsonb_build_object('c',d.data#>'{items,aus,c}','i',d.data#>'{items,aus,i}'),
       'vac',jsonb_build_object('c',d.data#>'{items,vac,c}','i',d.data#>'{items,vac,i}'),
       'agu',jsonb_build_object('c',d.data#>'{items,agu,c}','i',d.data#>'{items,agu,i}')
     ),
     'tarifas',jsonb_build_object(
       'trab',d.data#>'{tarifas,trab}','extra',d.data#>'{tarifas,extra}',
       'off',d.data#>'{tarifas,off}','fer',d.data#>'{tarifas,fer}',
       'aus',d.data#>'{tarifas,aus}','vac',d.data#>'{tarifas,vac}'
     )
   ),
   'show_holidays',coalesce(o.show_holidays,true),
   'show_vacations',coalesce(o.show_vacations,true),
   'server_now',clock_timestamp(),
   'expires_at',clock_timestamp()+interval '2 minutes'
 ) into result
 from public.rm_app_images i
 join public.rm_test_documents d on d.path='hojas/'||i.sheet_id
  and d.updated_at=i.report_version
 join rm_test_private.manager_personal_sheets s
  on s.sheet_id=i.sheet_id and s.user_id=auth.uid()
   and s.tenant_id=gestlok_tenancy.current_tenant_id() and s.local_id=p_local
 left join public.rm_receipt_visibility_options o on o.organization_id=s.organization_id
 where i.sheet_id=v_sheet;
 if result is null then
   raise exception 'El dueño todavía no publicó tu recibo personal' using errcode='42501';
 end if;
 return result;
end
$personal_detail$;
revoke all on function rm_test_private.manager_personal_receipt_detail(text) from public,anon;
grant execute on function rm_test_private.manager_personal_receipt_detail(text) to authenticated;

create or replace function public.rm_app_manager_personal_receipt_status(p_local text)
returns jsonb language sql set search_path=''
as $manager_receipt_api$
 select rm_test_private.manager_personal_receipt_status(p_local)
$manager_receipt_api$;
revoke all on function public.rm_app_manager_personal_receipt_status(text) from public,anon;
grant execute on function public.rm_app_manager_personal_receipt_status(text) to authenticated;

create or replace function public.rm_app_manager_personal_receipt_detail(p_local text)
returns jsonb language sql set search_path=''
as $manager_personal_detail_api$
 select rm_test_private.manager_personal_receipt_detail(p_local)
$manager_personal_detail_api$;
revoke all on function public.rm_app_manager_personal_receipt_detail(text) from public,anon;
grant execute on function public.rm_app_manager_personal_receipt_detail(text) to authenticated;
