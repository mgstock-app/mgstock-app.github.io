-- El Molino Café: preparación comercial exclusiva de la creadora.
-- Alta de acceso en equipo (NO como dueña) para el selector multiempresa.
-- Sin módulo de empleados ni recibos. No altera otros tenants.
do $$
declare
  v_tenant uuid;
  v_admin uuid;
  v_doc_id text;
  v_locs jsonb;
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
  if not exists (select 1 from gestlok_platform.companies c
    where c.tenant_id=v_tenant and c.created_by=v_admin) then
    raise exception 'El Molino Café no pertenece a la creadora autorizada';
  end if;
  select jsonb_agg(l.id order by (l.data->>'orden')::integer)
    into v_locs
    from public.docs l where l.tenant_id=v_tenant and l.col='locales'
      and l.data->>'nombre' in ('Acassuso','San Isidro');
  if jsonb_array_length(coalesce(v_locs,'[]'::jsonb))<>2 or
    (select count(*) from public.docs d where d.tenant_id=v_tenant and d.col='locales')<>2 then
    raise exception 'Se esperaban únicamente Acassuso y San Isidro';
  end if;
  if exists (select 1 from public.docs e where e.tenant_id=v_tenant
              and e.col='equipo' and lower(e.data->>'email')<>'kmu15lopez@gmail.com') then
    raise exception 'El Molino Café ya tiene terceros asignados';
  end if;

  v_doc_id := 'creadora-molino-'||left(replace(v_tenant::text,'-',''),20);
  if exists(select 1 from public.docs d where d.col='equipo' and d.id=v_doc_id
            and (d.tenant_id<>v_tenant or lower(d.data->>'email')<>'kmu15lopez@gmail.com')) then
    raise exception 'El documento de acceso pertenece a otro usuario';
  end if;

  if not exists(select 1 from public.docs e where e.tenant_id=v_tenant
        and e.col='equipo' and lower(e.data->>'email')='kmu15lopez@gmail.com') then
    insert into public.docs (col,id,data,tenant_id,updated_by)
    values ('equipo',v_doc_id,
      jsonb_build_object('email','kmu15lopez@gmail.com','nombre','Administración GESTLOK',
        'rol','creadora','locales',v_locs,
        'alcance','preparacion_comercial',
        'agregado',floor(extract(epoch from now())*1000)::bigint),
      v_tenant,'gestlok-platform');

    insert into gestlok_platform.admin_audit(actor,action,tenant_id,detail)
    values (v_admin,'commercial_preparation_access_granted',v_tenant,
      jsonb_build_object('role','creadora','scope','preparacion_comercial',
          'local_count',2,'owner_status','pendiente'));
  end if;
end;
$$;
