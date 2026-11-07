-- El Molino Café: alta administrativa pendiente de propietarios (dos sucursales).
-- El correo del dueño NO se inventa ni se asigna a la creadora.
-- Sin accesos de terceros ni efectos sobre Mi Gusto / Perfumes / otros tenants.
--
-- El registro completo vive en gestlok_platform.companies, pero un correo
-- pendiente se representa como NULL. Los propietarios se vincularán luego.
alter table gestlok_platform.companies
  alter column owner_email drop not null;

-- La provisión automática de RR.HH. requiere un propietario autorizado.
-- Para altas pendientes, NO inventar uno ni habilitar Empleados prematuramente.
create or replace function gestlok_platform.provision_company_employees()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.owner_email is null then
    return new;
  end if;
  perform gestlok_platform.ensure_employee_space(new.tenant_id);
  return new;
end;
$$;

do $$
declare
  v_admin uuid;
  v_tenant uuid := gen_random_uuid();
  v_code text := 'neg-' || substr(replace(v_tenant::text,'-',''),1,24);
  v_local_a text := 'loc-' || substr(replace(v_tenant::text,'-',''),1,20);
  v_local_s text := 'loc-' || substr(replace(v_tenant::text,'-',''),1,20) || '-si';
begin
  if exists (
    select 1 from gestlok_platform.companies
    where lower(btrim(name)) in ('el molino cafe','el molino café')
  ) then
    raise exception 'El Molino Café ya existe; no crear una segunda empresa';
  end if;

  select a.user_id into v_admin
  from gestlok_platform.admins a
  join auth.users u on u.id = a.user_id
  where lower(u.email) = 'kmu15lopez@gmail.com'
    and u.email_confirmed_at is not null;
  if v_admin is null then
    raise exception 'Cuenta creadora no autorizada';
  end if;

  insert into gestlok_tenancy.tenants(id,code)
  values (v_tenant,v_code);

  insert into public.docs (col,id,data,tenant_id,updated_by) values
   ('locales',v_local_a,jsonb_build_object('nombre','Acassuso','orden',1),v_tenant,'gestlok-platform'),
   ('locales',v_local_s,jsonb_build_object('nombre','San Isidro','orden',2),v_tenant,'gestlok-platform'),
   ('configuracion_negocio','empresa-' || v_tenant::text,
      jsonb_build_object('tipo','fisica','actualizado',(extract(epoch from now())*1000)::bigint),
      v_tenant,'gestlok-platform');

  insert into gestlok_platform.companies
    (tenant_id,code,name,local_id,local_name,owner_email,mode,created_by)
  values
    (v_tenant,v_code,'El Molino Café',v_local_a,'Acassuso',null,'fisica',v_admin);

  insert into gestlok_platform.admin_audit(actor,action,tenant_id,detail)
  values (v_admin,'pending_company_created',v_tenant,
    jsonb_build_object('empresa','El Molino Café',
                       'sucursales',jsonb_build_array('Acassuso','San Isidro'),
                       'owner_status','pendiente',
                       'visible_en','administracion_creadora'));
end;
$$;
