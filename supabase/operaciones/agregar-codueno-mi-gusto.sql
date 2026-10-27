-- Operación de datos autorizada. En transacción administradora, configurar antes:
-- set local gestlok.new_owner_email = 'correo autorizado';
-- set local gestlok.new_owner_name = 'nombre';
-- No crea cuentas Auth, no modifica permisos globales ni información previa.
create temporary table owner_rows_before(relation text, fingerprint text) on commit drop;
do $snapshot$
declare t record;
begin
 for t in select schemaname,tablename from pg_tables where
  (schemaname='public' and (tablename like 'rm\_%' escape '\' or tablename='docs'))
  or schemaname='rm_test_private' or (schemaname='gestlok_platform' and tablename='employee_owners')
 loop
  execute format('insert into owner_rows_before select %L,md5(to_jsonb(t)::text) from %I.%I t',t.schemaname||'.'||t.tablename,t.schemaname,t.tablename);
 end loop;
end $snapshot$;
do $authorize$
declare
 tenant constant uuid:='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
 org constant uuid:='10d56b45-fda2-44a9-a48a-6ad262aaf78a';
 mail text:=lower(btrim(current_setting('gestlok.new_owner_email')));
 name text:=btrim(current_setting('gestlok.new_owner_name'));
 e record; mapped uuid;
begin
 if mail !~ '^[^ @]+@[^ @]+\.[^ @]+$' or coalesce(length(name),0)=0 then raise exception 'Correo o nombre inválido';end if;
 if not exists(select 1 from gestlok_platform.recibonet_links where tenant_id=tenant and organization_id=org) then raise exception 'Vínculo inesperado';end if;
 if exists(select 1 from public.docs where col='equipo' and id=mail and (tenant_id<>tenant or data->>'rol'<>'dueno')) then raise exception 'Cuenta ya asignada: no sobrescribir';end if;
 insert into public.docs(col,id,data,tenant_id,updated_by) values('equipo',mail,
  jsonb_build_object('email',mail,'nombre',name,'rol','dueno','logoId','mi-gusto','por','creadora-autorizacion-explicita','agregado',floor(extract(epoch from clock_timestamp())*1000)),tenant,'creadora-autorizacion-explicita') on conflict do nothing;
 for e in select lower(data->>'email') as email,coalesce(nullif(data->>'nombre',''),data->>'email') as name
  from public.docs where col='equipo' and tenant_id=tenant and data->>'rol'='dueno'
 loop
  -- Conservar las identidades históricas; solo completar los dueños sin vínculo.
  select old_user_id into mapped from rm_test_private.identity_map where email=e.email;
  if mapped is null then
   insert into gestlok_platform.employee_owners(tenant_id,email) values(tenant,e.email) on conflict do nothing;
   select user_id into mapped from gestlok_platform.employee_owners where tenant_id=tenant and email=e.email;
  end if;
  insert into public.rm_app_directory(user_id,email,display_name,status,account_kind)
   values(mapped,e.email,left(e.name,120),'approved','owner') on conflict do nothing;
  insert into public.rm_organization_members(user_id,organization_id) values(mapped,org) on conflict do nothing;
  insert into public.rm_test_members(user_id,role) values(mapped,'owner') on conflict do nothing;
  if not exists(select 1 from public.rm_app_directory d join public.rm_organization_members om using(user_id)
    join public.rm_test_members m using(user_id) where d.user_id=mapped and d.email=e.email and d.status='approved' and m.role='owner' and om.organization_id=org)
   then raise exception 'Conflicto de identidad o permisos: operación revertida';end if;
 end loop;
end $authorize$;
do $unchanged$
declare t record; missing bigint;
begin
 for t in select distinct relation from owner_rows_before loop
  execute format('select count(*) from owner_rows_before b where b.relation=%L and not exists(select 1 from %s t where md5(to_jsonb(t)::text)=b.fingerprint)',t.relation,t.relation) into missing;
  if missing<>0 then raise exception 'Filas previas alteradas en %',t.relation;end if;
 end loop;
end $unchanged$;
