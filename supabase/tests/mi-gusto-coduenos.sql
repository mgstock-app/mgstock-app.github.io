-- Ejecutar DESPUÉS de la operación, siempre dentro de BEGIN/ROLLBACK.
-- Simula claims verificados. Las cuentas ausentes son fixtures temporales,
-- sin contraseñas ni envío de mensajes. Ninguna escritura de prueba se confirma.
create temporary table owner_checks(name text, stock_locals integer, employee_locals integer, editable_sheets integer) on commit drop;
do $test$
declare e record; account uuid; ctx jsonb; me jsonb; local text; d record; n int; sheets int; expected int;
 tenant constant uuid:='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
 org constant uuid:='10d56b45-fda2-44a9-a48a-6ad262aaf78a';
begin
 if (select count(*) from public.docs where col='equipo' and tenant_id=tenant and data->>'rol'='dueno')<>3 then raise exception 'Se esperan tres dueños';end if;
 select count(*) into expected from public.rm_test_documents where organization_id=org and path like 'hojas/%';
 if expected<17 then raise exception 'Faltan planillas previas';end if;
 for e in select data->>'email' as email,data->>'nombre' as name from public.docs where col='equipo' and tenant_id=tenant and data->>'rol'='dueno'
 loop
  select id into account from auth.users where lower(email)=lower(e.email);
  if account is null then
   account:=gen_random_uuid();
   insert into auth.users(id,email,email_confirmed_at) values(account,e.email,now());
  end if;
  perform set_config('request.jwt.claims',json_build_object('sub',account,'email',e.email,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  if public.mi_rol()<>'dueno' then raise exception 'Rol de stock incorrecto para %',e.name;end if;
  ctx:=public.gestlok_owner_area_context();
  if ctx->>'company_name'<>'Mi Gusto' or ctx->>'logo_id'<>'mi-gusto' or jsonb_array_length(ctx->'local_ids')<>2
   or (ctx->'modules'->'comercial'->>'authorized')::boolean is not true
   or (ctx->'modules'->'recibos_personal'->>'authorized')::boolean is not true then raise exception 'Tarjetas o marca incorrectas para %',e.name;end if;
  foreach local in array array['munro','torcuato'] loop
   if not public.puede_editar_local(local) then raise exception 'Sin edición de % para %',local,e.name;end if;
   select col,id into d from public.docs where col=local||'/productos' limit 1;
   if d.id is null then raise exception 'No lee productos';end if;
   n:=public.doc_update(d.col,d.id,jsonb_build_object('__owner_verification','rollback-only'));
   if n<>1 then raise exception 'No puede guardar stock';end if;
  end loop;
  if exists(select 1 from public.docs where tenant_id<>tenant) then raise exception 'Stock ajeno visible';end if;
  me:=public.rm_app_me();
  if me->>'role'<>'owner' or me->>'status'<>'approved' or (me->>'organization_id')::uuid<>org or me->>'owner_public_id'<>'2026002' then raise exception 'Empleados sin acceso dueño para %',e.name;end if;
  if jsonb_array_length(public.rm_app_locals())<>2 then raise exception 'Locales de empleados incorrectos';end if;
  if exists(select 1 from public.rm_test_documents where organization_id<>org) then raise exception 'Planillas ajenas visibles';end if;
  update public.rm_test_documents set data=data||'{"__owner_verification":"rollback-only"}'::jsonb where organization_id=org and path like 'hojas/%';
  get diagnostics sheets=row_count;
  if sheets<>expected then raise exception 'Solo edita % de % planillas para %',sheets,expected,e.name;end if;
  foreach local in array array['munro','dt'] loop
   perform public.rm_app_set_branch_schedule_link(local,'https://docs.google.com/spreadsheets/d/FICTICIO_ROLLBACK_123/edit');
  end loop;
  perform set_config('role','postgres',true);
  insert into owner_checks values(e.name,2,2,sheets);
 end loop;
end $test$;
select * from owner_checks order by name;
