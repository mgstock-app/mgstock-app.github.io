-- El Molino Café: perfiles de trabajo permitidos = Dueño y Gerente.
-- La Administradora General es un acceso técnico de preparación, no un rol
-- asignable a clientes. Esta restricción no afecta a las demás empresas.
do $$
declare
  v_tenant uuid;
  v_admin uuid;
  v_locales integer;
begin
  select c.tenant_id into strict v_tenant
  from gestlok_platform.companies c
  where c.name='El Molino Café'
    and c.owner_email is null
    and c.mode='fisica';

  select a.user_id into strict v_admin
  from gestlok_platform.admins a
  join auth.users u on u.id=a.user_id
  where lower(u.email)='kmu15lopez@gmail.com'
    and u.email_confirmed_at is not null;

  if not exists(select 1 from gestlok_platform.companies c
     where c.tenant_id=v_tenant and c.created_by=v_admin) then
    raise exception 'La empresa no pertenece a la administradora autorizada';
  end if;

  select count(*) into v_locales from public.docs d
  where d.tenant_id=v_tenant and d.col='locales'
    and d.data->>'nombre' in ('Acassuso','San Isidro');
  if v_locales<>2 or (select count(*) from public.docs d
      where d.tenant_id=v_tenant and d.col='locales')<>2 then
    raise exception 'El Molino Café necesita sus dos sucursales originales';
  end if;

  if exists(select 1 from public.docs e
      where e.tenant_id=v_tenant and e.col='equipo'
        and not (coalesce(e.data->>'rol','') in ('dueno','gerente')
          or (e.data->>'rol'='creadora'
              and lower(coalesce(e.data->>'email',''))='kmu15lopez@gmail.com')))
  then
    raise exception 'Existen roles no permitidos en El Molino Café';
  end if;

  update public.docs d
  set data=jsonb_set(d.data,'{roles_permitidos}',
                     '["dueno","gerente"]'::jsonb,true),
      updated_at=clock_timestamp(),
      updated_by='gestlok-platform'
  where d.tenant_id=v_tenant and d.col='configuracion_negocio'
    and d.id='empresa-'||v_tenant::text;

  if not found then raise exception 'Falta configuración del negocio'; end if;

  -- Bloquear altas y cambios de rol no permitidos, incluso por escritura API
  -- directa u operaciones de un gerente/dueño. El constraint sólo afecta al
  -- tenant verificado y no altera permisos de otros negocios.
  if not exists(select 1 from pg_constraint
        where conrelid='public.docs'::regclass
          and conname='gestlok_el_molino_roles_dueno_gerente') then
    execute format($ddl$
      alter table public.docs
      add constraint gestlok_el_molino_roles_dueno_gerente
      check (
        col<>'equipo' or tenant_id<>%L::uuid or
        (
          coalesce(data->>'rol','') in ('dueno','gerente') or
          (
            data->>'rol'='creadora' and
            lower(coalesce(data->>'email',''))='kmu15lopez@gmail.com'
          )
        )
      )
    $ddl$, v_tenant::text);
  end if;

  insert into gestlok_platform.admin_audit(actor,action,tenant_id,detail)
  values (v_admin,'commercial_roles_restricted',v_tenant,
    jsonb_build_object('assignable_roles',jsonb_build_array('dueno','gerente'),
      'creator_role','preparacion_comercial',
      'staff_module_enabled',false));
end;
$$;
