-- Administración de categorías Conteo: Mi Gusto Munro y Don Torcuato.
-- Solo catálogos de estas dos sucursales. No altera datos ni estados de turnos finalizados.

-- Las chapas/cajas especiales dependen del PRODUCTO, no del nombre editable
-- de su categoría. Mantener exactamente las reglas de unidades 24 y 45.
alter table gestlok_munro_conteo_private.products
 drop constraint if exists products_units_per_chapa_check;
alter table gestlok_munro_conteo_private.products
 add constraint products_units_per_chapa_check
 check (units_per_chapa in (0,27,30)
   or (units_per_chapa=45 and lower(btrim(name))='caja palito')
   or (units_per_chapa=24 and (lower(name) like 'franui%' or lower(name)='pink')));

alter table gestlok_torcuato_conteo_private.products
 drop constraint if exists products_units_per_chapa_check;
alter table gestlok_torcuato_conteo_private.products
 add constraint products_units_per_chapa_check
 check (units_per_chapa in (0,27,30)
   or (units_per_chapa=45 and lower(btrim(name))='caja palito')
   or (units_per_chapa=24 and (lower(name) like 'franui%' or lower(name)='pink')));


create table if not exists gestlok_munro_conteo_private.categories (
 name text primary key check (char_length(btrim(name)) between 3 and 70 and name=btrim(name)),
 position integer not null,
 created_at timestamptz not null default now()
);
alter table gestlok_munro_conteo_private.categories enable row level security;
revoke all on gestlok_munro_conteo_private.categories from public,anon,authenticated;
create unique index if not exists munro_conteo_category_name_ci_idx
 on gestlok_munro_conteo_private.categories (lower(btrim(name)));
insert into gestlok_munro_conteo_private.categories(name,position)
 select p.section,min(p.position) from gestlok_munro_conteo_private.products p group by p.section
 on conflict (name) do nothing;

create table if not exists gestlok_munro_conteo_private.category_audit (
 id bigint generated always as identity primary key,
 action text not null check (action in ('crear','renombrar')),
 old_name text,
 new_name text not null,
 actor uuid not null,
 changed_at timestamptz not null default now(),
 affected_products integer not null default 0
);
alter table gestlok_munro_conteo_private.category_audit enable row level security;
revoke all on gestlok_munro_conteo_private.category_audit from public,anon,authenticated;

create or replace function public.gestlok_munro_conteo_save_category(
 p_name text,p_old_name text default null)
returns jsonb language plpgsql security definer set search_path='' as $func$
declare v_name text:=btrim(coalesce(p_name,''));v_old text:=btrim(coalesce(p_old_name,''));
 v_count integer:=0;v_exists boolean;
begin
 perform gestlok_munro_conteo_private.require_access(true,true);
 if char_length(v_name) not between 3 and 70 or v_name like '%/%'
    or lower(v_name) in ('_waste','consumption','waste','desperdicios','consumo de staff')
    or v_name !~ '[[:alnum:]]' then
   raise exception 'Ingresá un nombre de categoría válido (3 a 70 caracteres)' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('gestlok_munro_conteo_private.categories'));
 if v_old='' then
   if exists(select 1 from gestlok_munro_conteo_private.categories where lower(btrim(name))=lower(v_name)) then
      raise exception 'Ya existe una categoría con ese nombre' using errcode='23505';
   end if;
   insert into gestlok_munro_conteo_private.categories(name,position)
   select v_name,coalesce(max(position),0)+100 from gestlok_munro_conteo_private.categories;
   insert into gestlok_munro_conteo_private.category_audit(action,new_name,actor)
   values('crear',v_name,auth.uid());
   return jsonb_build_object('ok',true,'action','crear','name',v_name,'products_updated',0);
 end if;
 if not exists(select 1 from gestlok_munro_conteo_private.categories where name=v_old) then
   raise exception 'La categoría original ya no existe' using errcode='22023';
 end if;
 if exists(select 1 from gestlok_munro_conteo_private.categories where lower(btrim(name))=lower(v_name) and name<>v_old) then
   raise exception 'Ya existe una categoría con ese nombre' using errcode='23505';
 end if;
 if v_name=v_old then return jsonb_build_object('ok',true,'action','sin_cambios','name',v_name,'products_updated',0); end if;
 update gestlok_munro_conteo_private.categories set name=v_name where name=v_old;
 update gestlok_munro_conteo_private.products set section=v_name where section=v_old;
 get diagnostics v_count=row_count;
 -- Mantener la preferencia de secciones ocultas al cambiar el nombre.
 update gestlok_munro_conteo_private.settings set hidden_sections=array_replace(hidden_sections,v_old,v_name)
 where v_old=any(hidden_sections);
 update gestlok_munro_conteo_private.shifts set hidden_sections=array_replace(hidden_sections,v_old,v_name)
 where status='borrador' and v_old=any(hidden_sections);
 -- Los turnos finalizados no se reescriben: datos, cantidades y responsables permanecen idénticos.
 insert into gestlok_munro_conteo_private.category_audit(action,old_name,new_name,actor,affected_products)
 values('renombrar',v_old,v_name,auth.uid(),v_count);
 return jsonb_build_object('ok',true,'action','renombrar','old_name',v_old,
  'name',v_name,'products_updated',v_count);
end $func$;
revoke all on function public.gestlok_munro_conteo_save_category(text,text) from public,anon,authenticated;
grant execute on function public.gestlok_munro_conteo_save_category(text,text) to authenticated;

CREATE OR REPLACE FUNCTION public.gestlok_munro_conteo_state(p_day date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d date :=coalesce(p_day,(now() at time zone 'America/Argentina/Buenos_Aires')::date);
begin
 perform gestlok_munro_conteo_private.require_access(false,false);
 return jsonb_build_object(
  'categories',coalesce((select jsonb_agg(jsonb_build_object('name',c.name,'position',c.position) order by c.position,c.name)
                     from gestlok_munro_conteo_private.categories c),'[]'::jsonb),
  'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.position)
                       from gestlok_munro_conteo_private.products p),'[]'::jsonb),
  -- La pantalla de la dueña usa el catálogo para reconstruir el historial,
  -- pero no recibe el borrador del turno en uso.
  'counts',case when public.mi_rol()='dueno' then '[]'::jsonb
            else coalesce((select jsonb_agg(to_jsonb(s) order by s.shift)
              from gestlok_munro_conteo_private.shifts s where s.day=d),'[]'::jsonb) end,
  'history',coalesce((select jsonb_agg(to_jsonb(q) order by q.day desc,q.shift) from
            (select * from gestlok_munro_conteo_private.shifts
             where status='finalizado' order by day desc,shift limit 150) q),'[]'::jsonb),
  'settings',coalesce((select jsonb_build_object('locked',locked,'hidden_sections',hidden_sections)
                       from gestlok_munro_conteo_private.settings where id=1),'{}'::jsonb)
 );
end $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_munro_conteo_add_product(p_section text, p_name text, p_units_per_chapa integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 clean_section text:=btrim(coalesce(p_section,''));
 clean_name text:=btrim(coalesce(p_name,''));
 next_position integer;
 created_product gestlok_munro_conteo_private.products%rowtype;
begin
 perform gestlok_munro_conteo_private.require_access(true,true);
 if char_length(clean_section) < 3 or char_length(clean_section)>70
    or char_length(clean_name)<1 or char_length(clean_name)>100
    or p_units_per_chapa is null or p_units_per_chapa not in (0,27,30) then
   raise exception 'Completá un nombre válido y elegí unidades o chapas';
 end if;
 if not exists (
  select 1 from gestlok_munro_conteo_private.categories c where c.name=clean_section
 ) then
   raise exception 'La categoría no existe en Conteo Munro';
 end if;
 if exists (
  select 1 from gestlok_munro_conteo_private.products p
   where p.section=clean_section and p.active and lower(btrim(p.name))=lower(clean_name)
 ) then
   raise exception 'Ya existe un producto activo con ese nombre en esta categoría';
 end if;
 select coalesce(max(p.position)+1, (select c.position+1 from gestlok_munro_conteo_private.categories c where c.name=clean_section), 1)
  into next_position from gestlok_munro_conteo_private.products p where p.section=clean_section;
 insert into gestlok_munro_conteo_private.products
  (id,section,name,units_per_chapa,position,active)
 values
  ('nuevo-'||replace(pg_catalog.gen_random_uuid()::text,'-',''),clean_section,
   clean_name,p_units_per_chapa,next_position,true)
 returning * into created_product;
 return jsonb_build_object('ok',true,'product',to_jsonb(created_product));
exception when unique_violation then
 raise exception 'Ya existe un producto activo con ese nombre en esta categoría';
end $function$
;

create table if not exists gestlok_torcuato_conteo_private.categories (
 name text primary key check (char_length(btrim(name)) between 3 and 70 and name=btrim(name)),
 position integer not null,
 created_at timestamptz not null default now()
);
alter table gestlok_torcuato_conteo_private.categories enable row level security;
revoke all on gestlok_torcuato_conteo_private.categories from public,anon,authenticated;
create unique index if not exists torcuato_conteo_category_name_ci_idx
 on gestlok_torcuato_conteo_private.categories (lower(btrim(name)));
insert into gestlok_torcuato_conteo_private.categories(name,position)
 select p.section,min(p.position) from gestlok_torcuato_conteo_private.products p group by p.section
 on conflict (name) do nothing;

create table if not exists gestlok_torcuato_conteo_private.category_audit (
 id bigint generated always as identity primary key,
 action text not null check (action in ('crear','renombrar')),
 old_name text,
 new_name text not null,
 actor uuid not null,
 changed_at timestamptz not null default now(),
 affected_products integer not null default 0
);
alter table gestlok_torcuato_conteo_private.category_audit enable row level security;
revoke all on gestlok_torcuato_conteo_private.category_audit from public,anon,authenticated;

create or replace function public.gestlok_torcuato_conteo_save_category(
 p_name text,p_old_name text default null)
returns jsonb language plpgsql security definer set search_path='' as $func$
declare v_name text:=btrim(coalesce(p_name,''));v_old text:=btrim(coalesce(p_old_name,''));
 v_count integer:=0;v_exists boolean;
begin
 perform gestlok_torcuato_conteo_private.require_access(true,true);
 if char_length(v_name) not between 3 and 70 or v_name like '%/%'
    or lower(v_name) in ('_waste','consumption','waste','desperdicios','consumo de staff')
    or v_name !~ '[[:alnum:]]' then
   raise exception 'Ingresá un nombre de categoría válido (3 a 70 caracteres)' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('gestlok_torcuato_conteo_private.categories'));
 if v_old='' then
   if exists(select 1 from gestlok_torcuato_conteo_private.categories where lower(btrim(name))=lower(v_name)) then
      raise exception 'Ya existe una categoría con ese nombre' using errcode='23505';
   end if;
   insert into gestlok_torcuato_conteo_private.categories(name,position)
   select v_name,coalesce(max(position),0)+100 from gestlok_torcuato_conteo_private.categories;
   insert into gestlok_torcuato_conteo_private.category_audit(action,new_name,actor)
   values('crear',v_name,auth.uid());
   return jsonb_build_object('ok',true,'action','crear','name',v_name,'products_updated',0);
 end if;
 if not exists(select 1 from gestlok_torcuato_conteo_private.categories where name=v_old) then
   raise exception 'La categoría original ya no existe' using errcode='22023';
 end if;
 if exists(select 1 from gestlok_torcuato_conteo_private.categories where lower(btrim(name))=lower(v_name) and name<>v_old) then
   raise exception 'Ya existe una categoría con ese nombre' using errcode='23505';
 end if;
 if v_name=v_old then return jsonb_build_object('ok',true,'action','sin_cambios','name',v_name,'products_updated',0); end if;
 update gestlok_torcuato_conteo_private.categories set name=v_name where name=v_old;
 update gestlok_torcuato_conteo_private.products set section=v_name where section=v_old;
 get diagnostics v_count=row_count;
 -- Mantener la preferencia de secciones ocultas al cambiar el nombre.
 update gestlok_torcuato_conteo_private.settings set hidden_sections=array_replace(hidden_sections,v_old,v_name)
 where v_old=any(hidden_sections);
 update gestlok_torcuato_conteo_private.shifts set hidden_sections=array_replace(hidden_sections,v_old,v_name)
 where status='borrador' and v_old=any(hidden_sections);
 -- Los turnos finalizados no se reescriben: datos, cantidades y responsables permanecen idénticos.
 insert into gestlok_torcuato_conteo_private.category_audit(action,old_name,new_name,actor,affected_products)
 values('renombrar',v_old,v_name,auth.uid(),v_count);
 return jsonb_build_object('ok',true,'action','renombrar','old_name',v_old,
  'name',v_name,'products_updated',v_count);
end $func$;
revoke all on function public.gestlok_torcuato_conteo_save_category(text,text) from public,anon,authenticated;
grant execute on function public.gestlok_torcuato_conteo_save_category(text,text) to authenticated;

CREATE OR REPLACE FUNCTION public.gestlok_torcuato_conteo_state(p_day date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d date :=coalesce(p_day,(now() at time zone 'America/Argentina/Buenos_Aires')::date);
begin
 perform gestlok_torcuato_conteo_private.require_access(false,false);
 return jsonb_build_object(
  'categories',coalesce((select jsonb_agg(jsonb_build_object('name',c.name,'position',c.position) order by c.position,c.name)
                     from gestlok_torcuato_conteo_private.categories c),'[]'::jsonb),
  'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.position)
                       from gestlok_torcuato_conteo_private.products p),'[]'::jsonb),
  -- La pantalla de la dueña usa el catálogo para reconstruir el historial,
  -- pero no recibe el borrador del turno en uso.
  'counts',case when public.mi_rol()='dueno' then '[]'::jsonb
            else coalesce((select jsonb_agg(to_jsonb(s) order by s.shift)
              from gestlok_torcuato_conteo_private.shifts s where s.day=d),'[]'::jsonb) end,
  'history',coalesce((select jsonb_agg(to_jsonb(q) order by q.day desc,q.shift) from
            (select * from gestlok_torcuato_conteo_private.shifts
             where status='finalizado' order by day desc,shift limit 150) q),'[]'::jsonb),
  'settings',coalesce((select jsonb_build_object('locked',locked,'hidden_sections',hidden_sections)
                       from gestlok_torcuato_conteo_private.settings where id=1),'{}'::jsonb)
 );
end $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_torcuato_conteo_add_product(p_section text, p_name text, p_units_per_chapa integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 clean_section text:=btrim(coalesce(p_section,''));
 clean_name text:=btrim(coalesce(p_name,''));
 next_position integer;
 created_product gestlok_torcuato_conteo_private.products%rowtype;
begin
 perform gestlok_torcuato_conteo_private.require_access(true,true);
 if char_length(clean_section) < 3 or char_length(clean_section)>70
    or char_length(clean_name)<1 or char_length(clean_name)>100
    or p_units_per_chapa is null or p_units_per_chapa not in (0,27,30) then
   raise exception 'Completá un nombre válido y elegí unidades o chapas';
 end if;
 if not exists (
  select 1 from gestlok_torcuato_conteo_private.categories c where c.name=clean_section
 ) then
   raise exception 'La categoría no existe en Conteo Don Torcuato';
 end if;
 if exists (
  select 1 from gestlok_torcuato_conteo_private.products p
   where p.section=clean_section and p.active and lower(btrim(p.name))=lower(clean_name)
 ) then
   raise exception 'Ya existe un producto activo con ese nombre en esta categoría';
 end if;
 select coalesce(max(p.position)+1, (select c.position+1 from gestlok_torcuato_conteo_private.categories c where c.name=clean_section), 1)
  into next_position from gestlok_torcuato_conteo_private.products p where p.section=clean_section;
 insert into gestlok_torcuato_conteo_private.products
  (id,section,name,units_per_chapa,position,active)
 values
  ('nuevo-'||replace(pg_catalog.gen_random_uuid()::text,'-',''),clean_section,
   clean_name,p_units_per_chapa,next_position,true)
 returning * into created_product;
 return jsonb_build_object('ok',true,'product',to_jsonb(created_product));
exception when unique_violation then
 raise exception 'Ya existe un producto activo con ese nombre en esta categoría';
end $function$
;
