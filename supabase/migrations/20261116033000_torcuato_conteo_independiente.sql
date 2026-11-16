-- Mi Gusto · Don Torcuato: misma funcionalidad de Conteo que Munro, almacenamiento separado.
-- Copia SOLO el catálogo y su configuración actual, jamás turnos, conteos ni historial.
-- La migración falla antes de crear si hay tablas del destino, para no pisar datos.
-- Dependencias: migraciones de Conteo Munro hasta 20261115114500.
do $check$
declare n integer;
begin
 if exists(select 1 from pg_namespace where nspname='gestlok_torcuato_conteo_private') then
  raise exception 'Conteo Torcuato ya existe: se requiere una migración incremental, no clonar ni reemplazar';
 end if;
 select count(*) into n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
  where ns.nspname='public' and p.proname like 'gestlok_munro_conteo_%';
 if n<>11 then raise exception 'Backend de Conteo Munro inesperado: % funciones, se esperaba 11',n; end if;
 if (select count(*) from gestlok_munro_conteo_private.products)=0
   or (select count(*) from gestlok_munro_conteo_private.settings where id=1)<>1 then
  raise exception 'Catálogo y configuración reales de Munro no disponibles';
 end if;
 if not exists(select 1 from public.docs where tenant_id='cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
               and col='locales' and id='torcuato') then
  raise exception 'Don Torcuato no está registrado dentro de Mi Gusto';
 end if;
end $check$;

create schema gestlok_torcuato_conteo_private;
revoke all on schema gestlok_torcuato_conteo_private from public,anon,authenticated;

-- Misma estructura, validaciones, índices y valores por defecto que la planilla actual.
create table gestlok_torcuato_conteo_private.products
 (like gestlok_munro_conteo_private.products including all);
create table gestlok_torcuato_conteo_private.shifts
 (like gestlok_munro_conteo_private.shifts including all);
create table gestlok_torcuato_conteo_private.settings
 (like gestlok_munro_conteo_private.settings including all);

alter table gestlok_torcuato_conteo_private.products enable row level security;
alter table gestlok_torcuato_conteo_private.shifts enable row level security;
alter table gestlok_torcuato_conteo_private.settings enable row level security;
revoke all on all tables in schema gestlok_torcuato_conteo_private from public,anon,authenticated;

-- Copia los nombres, categorías, orden, unidades por chapa y productos desactivados
-- del catálogo REAL actual de Munro. Luego cada local administra su propio catálogo.
insert into gestlok_torcuato_conteo_private.products
 (id,section,name,units_per_chapa,position,active)
select id,section,name,units_per_chapa,position,active
 from gestlok_munro_conteo_private.products;

insert into gestlok_torcuato_conteo_private.settings
 (id,hidden_sections,locked)
select id,hidden_sections,locked
 from gestlok_munro_conteo_private.settings where id=1;

-- NO se copian gestlok_munro_conteo_private.shifts,
-- ni shift_correction_backup ni catalog_snapshots.

-- Reutiliza las implementaciones auditadas de los 11 RPC actuales; cambia
-- exclusivamente esquema, prefijo y comprobación obligatoria de sucursal.
-- La copia es una función distinta con aislamiento a nivel SQL y RLS habilitado.
do $functions$
declare
 f record; body text; new_signature text; n int := 0;
begin
 -- Funciones privadas primero: validación de rol/local y configuración por defecto.
 for f in
  select p.oid,ns.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
  where ns.nspname='gestlok_munro_conteo_private' and p.proname in ('require_access','set_default_sections')
  order by case when p.proname='require_access' then 0 else 1 end
 loop
  body:=pg_get_functiondef(f.oid);
  body:=replace(body,'gestlok_munro_conteo_private','gestlok_torcuato_conteo_private');
  body:=replace(body,'''munro''','''torcuato''');
  body:=replace(body,'Munro','Don Torcuato');
  if position('gestlok_munro_conteo_private' in body)>0 then raise exception 'Fuga de esquema Munro en función privada'; end if;
  execute body;
  new_signature:=format('gestlok_torcuato_conteo_private.%I(%s)',f.proname,f.args);
  execute 'revoke all on function '||new_signature||' from public,anon,authenticated';
  n:=n+1;
 end loop;
 if n<>2 then raise exception 'Funciones privadas incompletas: %',n; end if;

 -- Cada nueva fila de Torcuato hereda SUS categorías ocultas.
 create trigger_placeholder_unused: begin null; end; -- eliminado antes de desplegar

 -- Reusar las 11 funciones actuales con nombres y tablas exclusivos de Torcuato.
 n:=0;
 for f in
  select p.oid,ns.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
  where ns.nspname='public' and p.proname like 'gestlok_munro_conteo_%'
  order by p.proname
 loop
  body:=pg_get_functiondef(f.oid);
  body:=replace(body,'gestlok_munro_conteo_private','gestlok_torcuato_conteo_private');
  body:=replace(body,'gestlok_munro_conteo_','gestlok_torcuato_conteo_');
  body:=replace(body,'''munro''','''torcuato''');
  body:=replace(body,'Munro','Don Torcuato');
  if position('gestlok_munro_conteo' in body)>0
     or position('puede_ver_local(''munro'')' in body)>0
     or position('puede_editar_local(''munro'')' in body)>0 then
    raise exception 'Fuga de backend Munro en %',f.proname;
  end if;
  execute body;
  new_signature:=format('public.%I(%s)',replace(f.proname,'gestlok_munro_conteo_','gestlok_torcuato_conteo_'),f.args);
  execute 'revoke all on function '||new_signature||' from public,anon,authenticated';
  execute 'grant execute on function '||new_signature||' to authenticated';
  n:=n+1;
 end loop;
 if n<>11 then raise exception 'RPC Conteo Torcuato incompletos: %',n; end if;
end $functions$;

drop trigger if exists gestlok_torcuato_conteo_default_sections on gestlok_torcuato_conteo_private.shifts;
create trigger gestlok_torcuato_conteo_default_sections
 before insert on gestlok_torcuato_conteo_private.shifts
 for each row execute function gestlok_torcuato_conteo_private.set_default_sections();

-- Verificación estructural sin datos personales: un catálogo idéntico,
-- sin un solo registro de conteo ni historial de Munro.
do $verify$
begin
 if (select count(*) from gestlok_torcuato_conteo_private.products)
   <> (select count(*) from gestlok_munro_conteo_private.products) then
  raise exception 'La copia del catálogo no coincide con el origen';
 end if;
 if exists(select id,section,name,units_per_chapa,position,active
           from gestlok_munro_conteo_private.products
           except select id,section,name,units_per_chapa,position,active
           from gestlok_torcuato_conteo_private.products) then
  raise exception 'El catálogo de Torcuato no coincide con el de Munro';
 end if;
 if (select jsonb_build_object('hidden_sections',hidden_sections,'locked',locked) from gestlok_torcuato_conteo_private.settings where id=1)
    is distinct from
    (select jsonb_build_object('hidden_sections',hidden_sections,'locked',locked) from gestlok_munro_conteo_private.settings where id=1) then
  raise exception 'La configuración de categorías no coincide';
 end if;
 if (select count(*) from gestlok_torcuato_conteo_private.shifts)<>0 then
  raise exception 'Conteo Torcuato no está vacío';
 end if;
end $verify$;