-- Conteo Mi Gusto: packs/cajas personalizables por producto y por sucursal.
-- Registra la equivalencia HISTORICA por turno; nunca reinterpreta conteos archivados.
-- Cambios exclusivos al catálogo, no a datos, responsables ni estados cerrados.

alter table gestlok_munro_conteo_private.products add column if not exists pack_label text not null default 'pack';
update gestlok_munro_conteo_private.products set pack_label=case
 when units_per_chapa=0 then 'unidad'
 when section='EMPANADAS' or id like 'c1-%' then 'chapa'
 when lower(btrim(name))='caja palito' or lower(btrim(name)) like 'franui%' or lower(btrim(name))='pink' or lower(btrim(name)) ~ '^le[[:space:]]*banana
 else 'pack' end
where pack_label='pack';
alter table gestlok_munro_conteo_private.products drop constraint if exists products_units_per_chapa_check;
alter table gestlok_munro_conteo_private.products add constraint products_units_per_chapa_check
 check (units_per_chapa between 0 and 1000);
alter table gestlok_munro_conteo_private.products drop constraint if exists products_pack_label_check;
alter table gestlok_munro_conteo_private.products add constraint products_pack_label_check
 check (pack_label in ('unidad','caja','pack','chapa') and
 ((units_per_chapa=0 and pack_label='unidad') or
 (units_per_chapa>0 and pack_label<>'unidad')));

alter table gestlok_munro_conteo_private.shifts add column if not exists pack_units jsonb not null default '{}'::jsonb
 check (jsonb_typeof(pack_units)='object');
alter table gestlok_munro_conteo_private.shifts add column if not exists pack_labels jsonb not null default '{}'::jsonb
 check (jsonb_typeof(pack_labels)='object');
-- La equivalencia anterior de cada producto queda fijada, sin tocar data/decomiso.
update gestlok_munro_conteo_private.shifts s set pack_units=coalesce((
  select jsonb_object_agg(k.id,p.units_per_chapa)
  from (
   select key as id from jsonb_object_keys(s.data) as key
   union select key as id from jsonb_object_keys(s.decomiso) as key
  ) k join gestlok_munro_conteo_private.products p on p.id=k.id
 ),'{}'::jsonb)
where s.pack_units='{}'::jsonb and (s.data<>'{}'::jsonb or s.decomiso<>'{}'::jsonb);
-- El nombre de la presentación (caja/pack/chapa) también pertenece al turno.
update gestlok_munro_conteo_private.shifts s set pack_labels=coalesce((
  select jsonb_object_agg(k.id,p.pack_label)
  from (select key as id from jsonb_object_keys(s.pack_units) as key) k
  join gestlok_munro_conteo_private.products p on p.id=k.id
 ),'{}'::jsonb)
where s.pack_labels='{}'::jsonb and s.pack_units<>'{}'::jsonb;

create or replace function gestlok_munro_conteo_private.preserve_pack_units()
returns trigger language plpgsql set search_path='' as $fn$
declare v_id text;v_per integer;v_label text;
begin
 for v_id in select key from (
  select key from jsonb_object_keys(new.data) as key
  union select key from jsonb_object_keys(new.decomiso) as key
 ) q loop
   if not new.pack_units ? v_id then
     select p.units_per_chapa into v_per from gestlok_munro_conteo_private.products p where p.id=v_id;
     if v_per is not null then
       new.pack_units:=jsonb_set(new.pack_units,array[v_id],to_jsonb(v_per),true);
     end if;
   end if;
   if not new.pack_labels ? v_id then
     select p.pack_label into v_label from gestlok_munro_conteo_private.products p where p.id=v_id;
     if v_label is not null then new.pack_labels:=jsonb_set(new.pack_labels,array[v_id],to_jsonb(v_label),true); end if;
   end if;
 end loop;
 return new;
end $fn$;
drop trigger if exists munro_conteo_keep_pack_units on gestlok_munro_conteo_private.shifts;
create trigger munro_conteo_keep_pack_units
before insert or update of data,decomiso on gestlok_munro_conteo_private.shifts
for each row execute function gestlok_munro_conteo_private.preserve_pack_units();

create table if not exists gestlok_munro_conteo_private.product_pack_audit(
 id bigint generated always as identity primary key,
 product_id text not null,old_units integer,new_units integer not null,
 old_label text,new_label text not null,actor uuid not null,
 updated_at timestamptz not null default now()
);
alter table gestlok_munro_conteo_private.product_pack_audit enable row level security;
revoke all on gestlok_munro_conteo_private.product_pack_audit from public,anon,authenticated;

create or replace function public.gestlok_munro_conteo_save_product_pack(
 p_section text,p_name text,p_units_per_pack integer,p_pack_label text,p_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_role text;v_section text:=btrim(coalesce(p_section,''));v_name text:=btrim(coalesce(p_name,''));
 v_label text:=lower(btrim(coalesce(p_pack_label,'')));v_product gestlok_munro_conteo_private.products%rowtype;
 v_before integer;v_oldlabel text;v_position integer;
begin
 -- Verificación en backend de usuario, tenant y sucursal.
 perform gestlok_munro_conteo_private.require_access(false,false);
 v_role:=public.mi_rol();
 if v_role not in ('creadora','dueno','gerente')
   or (v_role='gerente' and not public.puede_editar_local('munro')) then
   raise exception 'Sin permiso para modificar productos de Munro' using errcode='42501';
 end if;
 if char_length(v_section) not between 3 and 70 or char_length(v_name) not between 1 and 100
   or p_units_per_pack is null or p_units_per_pack not between 0 and 1000
   or v_label not in ('unidad','caja','pack','chapa')
   or (p_units_per_pack=0 and v_label<>'unidad')
   or (p_units_per_pack>0 and v_label='unidad') then
   raise exception 'Definí unidades o un pack cerrado con 1 a 1000 unidades' using errcode='22023';
 end if;
 if not exists(select 1 from gestlok_munro_conteo_private.categories where name=v_section) then
   raise exception 'Categoría no encontrada en Munro' using errcode='22023';
 end if;
 if p_id is null then
   if exists(select 1 from gestlok_munro_conteo_private.products where active and section=v_section and lower(btrim(name))=lower(v_name)) then
     raise exception 'Ya existe un producto con ese nombre en esta categoría' using errcode='23505';
   end if;
   select coalesce(max(position)+1,(select c.position+1 from gestlok_munro_conteo_private.categories c where c.name=v_section),1)
   into v_position from gestlok_munro_conteo_private.products where section=v_section;
   insert into gestlok_munro_conteo_private.products(id,section,name,units_per_chapa,pack_label,position,active)
    values('nuevo-'||replace(gen_random_uuid()::text,'-',''),v_section,v_name,p_units_per_pack,v_label,v_position,true)
    returning * into v_product;
   v_before:=null;v_oldlabel:=null;
 else
   select * into v_product from gestlok_munro_conteo_private.products where id=p_id and active for update;
   if not found then raise exception 'Producto no encontrado' using errcode='22023'; end if;
   if v_product.section<>v_section or v_product.name<>v_name then
     raise exception 'El producto cambió. Actualizá y volvé a intentar.' using errcode='40001';
   end if;
   v_before:=v_product.units_per_chapa;v_oldlabel:=v_product.pack_label;
   update gestlok_munro_conteo_private.products set units_per_chapa=p_units_per_pack,pack_label=v_label where id=p_id
    returning * into v_product;
 end if;
 if v_before is distinct from p_units_per_pack or v_oldlabel is distinct from v_label then
   insert into gestlok_munro_conteo_private.product_pack_audit(product_id,old_units,new_units,old_label,new_label,actor)
   values(v_product.id,v_before,p_units_per_pack,v_oldlabel,v_label,auth.uid());
 end if;
 return jsonb_build_object('ok',true,'product',to_jsonb(v_product),
   'old_units',v_before,'new_units',p_units_per_pack);
exception when unique_violation then
 raise exception 'Ya existe un producto activo con ese nombre en la categoría';
end $fn$;
revoke all on function public.gestlok_munro_conteo_save_product_pack(text,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_munro_conteo_save_product_pack(text,text,integer,text,text) to authenticated;
CREATE OR REPLACE FUNCTION public.gestlok_munro_conteo_set_cell(p_day date, p_shift text, p_product text, p_index integer, p_chapas integer DEFAULT 0, p_sueltas integer DEFAULT 0, p_qty integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r gestlok_munro_conteo_private.shifts%rowtype; per integer; new_cell jsonb;
begin
 perform gestlok_munro_conteo_private.require_access(true,false);
 if p_day is null or p_day < date '2025-01-01' or p_day > (now() at time zone 'America/Argentina/Buenos_Aires')::date + 1
   or p_shift not in ('manana_entrada','manana_salida','noche_salida') or p_index not between 1 and 4
   or p_chapas not between 0 and 500 or p_sueltas not between 0 and 100000 or p_qty not between 0 and 1000000 then
   raise exception 'Cantidad, fecha o turno no válido';
 end if;
 select units_per_chapa into per from gestlok_munro_conteo_private.products where id=p_product and active=true;
 if per is null then raise exception 'Producto no disponible'; end if;
 insert into gestlok_munro_conteo_private.shifts(day,shift) values(p_day,p_shift) on conflict do nothing;
 select * into r from gestlok_munro_conteo_private.shifts where day=p_day and shift=p_shift for update;
 per:=coalesce((r.pack_units->>p_product)::integer,per);
 if per>0 and p_qty<>0 then raise exception 'El pack usa cajas/chapas y unidades sueltas'; end if;
 if per=0 and (p_chapas<>0 or p_sueltas<>0) then raise exception 'Este producto usa unidades'; end if;
 if r.status='finalizado' then raise exception 'Este conteo ya fue finalizado'; end if;
 new_cell:=jsonb_build_object('chapas',p_chapas,'sueltas',p_sueltas,'qty',p_qty);
 update gestlok_munro_conteo_private.shifts set
  data=jsonb_set(r.data,array[p_product],coalesce(r.data->p_product,'{}'::jsonb)||jsonb_build_object('v'||p_index,new_cell),true),
  updated_by=auth.uid(),updated_at=now()
 where day=p_day and shift=p_shift;
 return jsonb_build_object('ok',true,'updated_at',now());
end $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_munro_conteo_set_decomiso(p_day date, p_shift text, p_product text, p_chapas integer DEFAULT 0, p_sueltas integer DEFAULT 0, p_qty integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r gestlok_munro_conteo_private.shifts%rowtype; per integer;
BEGIN
  PERFORM gestlok_munro_conteo_private.require_access(true,false);
  IF p_day IS NULL OR p_day < date '2025-01-01'
    OR p_day > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 1
    OR p_shift NOT IN ('manana_entrada','manana_salida','noche_salida')
    OR p_product IS NULL OR p_chapas NOT BETWEEN 0 AND 500
    OR p_sueltas NOT BETWEEN 0 AND 100000 OR p_qty NOT BETWEEN 0 AND 1000000
  THEN RAISE EXCEPTION 'Decomiso no válido'; END IF;
  SELECT units_per_chapa INTO per FROM gestlok_munro_conteo_private.products
    WHERE id=p_product AND active;
  IF per IS NULL THEN RAISE EXCEPTION 'Producto no disponible'; END IF;
  INSERT INTO gestlok_munro_conteo_private.shifts(day,shift) VALUES(p_day,p_shift)
    ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM gestlok_munro_conteo_private.shifts
    WHERE day=p_day AND shift=p_shift FOR UPDATE;
  per:=coalesce((r.pack_units->>p_product)::integer,per);
  IF (per>0 AND p_qty<>0) OR (per=0 AND (p_chapas<>0 OR p_sueltas<>0))
  THEN RAISE EXCEPTION 'Formato de decomiso no válido para este producto'; END IF;
  IF r.status='finalizado' THEN RAISE EXCEPTION 'El conteo está finalizado'; END IF;
  IF NOT r.decomiso_visible THEN RAISE EXCEPTION 'Primero activá Decomiso'; END IF;
  UPDATE gestlok_munro_conteo_private.shifts SET
     decomiso=jsonb_set(r.decomiso,ARRAY[p_product],
       jsonb_build_object('chapas',p_chapas,'sueltas',p_sueltas,'qty',p_qty),true),
     updated_by=auth.uid(),updated_at=now()
     WHERE day=p_day AND shift=p_shift;
  RETURN jsonb_build_object('ok',true);
END $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_munro_conteo_correct_closed(p_day date, p_shift text, p_kind text, p_product text, p_index integer, p_value jsonb, p_expected jsonb, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 r gestlok_munro_conteo_private.shifts%rowtype;
 per integer;
 chapas integer;
 sueltas integer;
 qty integer;
 old_value jsonb;
 new_value jsonb;
 item jsonb;
 changed_id bigint;
 mail text;
begin
 perform gestlok_munro_conteo_private.require_access(true,false);
 if p_day is null or p_day<date '2025-01-01'
  or p_day>(now() at time zone 'America/Argentina/Buenos_Aires')::date+1
  or p_shift not in ('manana_entrada','manana_salida','noche_salida')
  or p_reason is null or length(trim(p_reason)) not between 8 and 300 then
  raise exception 'Fecha, turno o motivo de corrección inválido';
 end if;
 select * into r from gestlok_munro_conteo_private.shifts
  where day=p_day and shift=p_shift for update;
 if not found or r.status<>'finalizado' then
  raise exception 'Solo se pueden corregir turnos finalizados existentes';
 end if;
 if p_kind in ('cell','decomiso') then
  select coalesce((r.pack_units->>p_product)::integer,units_per_chapa) into per from gestlok_munro_conteo_private.products where id=p_product;
  if per is null or jsonb_typeof(p_value)<>'object'
   or not (p_value ?& array['chapas','sueltas','qty']) then
   raise exception 'Producto o cantidad no válida';
  end if;
  if p_kind='cell' and p_index not between 1 and 4 then
   raise exception 'El vencimiento debe ser del 1 al 4';
  end if;
  if p_kind='decomiso' and p_index is distinct from 0 then
   raise exception 'El decomiso requiere índice cero';
  end if;
  chapas:=(p_value->>'chapas')::integer;
  sueltas:=(p_value->>'sueltas')::integer;
  qty:=(p_value->>'qty')::integer;
  if chapas is null or sueltas is null or qty is null
   or chapas not between 0 and 500 or sueltas not between 0 and 100000
   or qty not between 0 and 1000000
   or (per>0 and qty<>0) or (per=0 and (chapas<>0 or sueltas<>0)) then
   raise exception 'La cantidad es inválida para este producto';
  end if;
  new_value:=jsonb_build_object('chapas',chapas,'sueltas',sueltas,'qty',qty);
  if p_kind='cell' then
   old_value:=coalesce(r.data#>array[p_product,'v'||p_index],'null'::jsonb);
  else
   old_value:=coalesce(r.decomiso->p_product,'null'::jsonb);
  end if;
 elsif p_kind='responsable' then
  if jsonb_typeof(p_value)<>'string' or trim(p_value#>>'{}') not in ('Cami','Shuli','Tizi') then
   raise exception 'Responsable no autorizado';
  end if;
  new_value:=to_jsonb(trim(p_value#>>'{}'));
  old_value:=coalesce(to_jsonb(r.responsable),'null'::jsonb);
  if p_product is not null or p_index is not null then
   raise exception 'Parámetros no válidos para responsable';
  end if;
 elsif p_kind in ('consumption','waste') then
  if jsonb_typeof(p_value)<>'array' or jsonb_array_length(p_value)>(case when p_kind='consumption' then 10 else 60 end) then
   raise exception 'Listado de consumos o desperdicios inválido';
  end if;
  for item in select value from jsonb_array_elements(p_value) loop
   if jsonb_typeof(item)<>'object'
    or jsonb_typeof(item->'name')<>'string'
    or jsonb_typeof(item->'value')<>'string'
    or length(item->>'name')>90 or length(item->>'value')>90 then
    raise exception 'Fila de consumos o desperdicios inválida';
   end if;
  end loop;
  if p_product is not null or p_index is not null then
   raise exception 'Parámetros no válidos para listado';
  end if;
  new_value:=p_value;
  old_value:=case when p_kind='consumption' then r.consumption else r.waste end;
 else
  raise exception 'Tipo de corrección no permitido';
 end if;
 if old_value is distinct from coalesce(p_expected,'null'::jsonb) then
  raise exception 'Otro usuario modificó este dato. Actualizá el historial antes de corregirlo.'
   using errcode='40001';
 end if;
 if old_value=new_value then
  raise exception 'No hay cambios que guardar';
 end if;
 if p_kind='cell' then
  update gestlok_munro_conteo_private.shifts set
   data=jsonb_set(r.data,array[p_product],
    coalesce(r.data->p_product,'{}'::jsonb)||jsonb_build_object('v'||p_index,new_value),true),
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 elsif p_kind='decomiso' then
  update gestlok_munro_conteo_private.shifts set
   decomiso=jsonb_set(r.decomiso,array[p_product],new_value,true),
   decomiso_visible=(r.decomiso_visible or chapas>0 or sueltas>0 or qty>0),
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 elsif p_kind='responsable' then
  update gestlok_munro_conteo_private.shifts set responsable=trim(p_value#>>'{}'),
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 elsif p_kind='consumption' then
  update gestlok_munro_conteo_private.shifts set consumption=new_value,updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 else
  update gestlok_munro_conteo_private.shifts set waste=new_value,waste_visible=true,
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 end if;
 select email into mail from auth.users where id=auth.uid();
 insert into gestlok_munro_conteo_private.closed_corrections(
  day,shift,kind,product_id,expiry_index,before_value,after_value,reason,actor_id,actor_email)
 values(p_day,p_shift,p_kind,p_product,p_index,old_value,new_value,trim(p_reason),auth.uid(),mail)
 returning id into changed_id;
 return jsonb_build_object('ok',true,'correction_id',changed_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_munro_conteo_sin_stock(p_day date, p_shift text, p_product text, p_sin_stock boolean, p_expected boolean DEFAULT false, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 r gestlok_munro_conteo_private.shifts%rowtype;
 rate integer;
 previous boolean;
 email text;
 correction_id bigint;
begin
 perform gestlok_munro_conteo_private.require_access(true,false);
 if p_day is null or p_day < date '2025-01-01'
  or p_day > (now() at time zone 'America/Argentina/Buenos_Aires')::date+1
  or p_shift not in ('manana_entrada','manana_salida','noche_salida')
  or p_product is null or p_sin_stock is null or p_expected is null then
  raise exception 'Fecha, turno o producto de Sin stock inválido';
 end if;
 select units_per_chapa into rate from gestlok_munro_conteo_private.products
 where id=p_product;
 if rate is null then raise exception 'Producto inexistente'; end if;

 select * into r from gestlok_munro_conteo_private.shifts
 where day=p_day and shift=p_shift for update;
 if not found then
  if not p_sin_stock then raise exception 'No hay una marca Sin stock que modificar'; end if;
  insert into gestlok_munro_conteo_private.shifts (day,shift) values (p_day,p_shift)
   on conflict do nothing;
  select * into r from gestlok_munro_conteo_private.shifts
   where day=p_day and shift=p_shift for update;
 end if;
 rate:=coalesce((r.pack_units->>p_product)::integer,rate);
 previous=coalesce((r.data->p_product->>'sin_stock')::boolean,false);
 if previous is distinct from p_expected then
  raise exception 'Otro usuario modificó este producto. Actualizá el conteo.'
   using errcode='40001';
 end if;
 if previous=p_sin_stock then
  raise exception 'No hay cambios de Sin stock para guardar';
 end if;
 if p_sin_stock and gestlok_munro_conteo_private.product_total(r.data,r.decomiso,p_product,rate)>0 then
  raise exception 'No se puede marcar Sin stock: el producto tiene unidades registradas';
 end if;
 if r.status='finalizado' and
  (p_reason is null or length(trim(p_reason)) not between 8 and 300) then
  raise exception 'Los conteos cerrados requieren motivo de corrección (8 a 300 caracteres)';
 end if;

 update gestlok_munro_conteo_private.shifts
 set data=jsonb_set(r.data,array[p_product],
       coalesce(r.data->p_product,'{}'::jsonb)||
       jsonb_build_object('sin_stock',p_sin_stock),true),
     updated_by=auth.uid(),updated_at=now()
 where day=p_day and shift=p_shift;
 if r.status='finalizado' then
  select u.email into email from auth.users u where u.id=auth.uid();
  insert into gestlok_munro_conteo_private.closed_corrections
   (day,shift,kind,product_id,expiry_index,before_value,after_value,
    reason,actor_id,actor_email)
  values(p_day,p_shift,'sin_stock',p_product,null,to_jsonb(previous),to_jsonb(p_sin_stock),
   trim(p_reason),auth.uid(),email)
  returning id into correction_id;
 end if;
 return jsonb_build_object('ok',true,'sin_stock',p_sin_stock,
    'closed_correction_id',correction_id);
end $function$
;
CREATE OR REPLACE FUNCTION gestlok_munro_conteo_private.normalize_manual_sin_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare item record; rate integer;
begin
 for item in
  select key as product_id from jsonb_each(new.data)
  where jsonb_typeof(value)='object' and value->>'sin_stock'='true'
 loop
  select coalesce((new.pack_units->>item.product_id)::integer,units_per_chapa) into rate from gestlok_munro_conteo_private.products where id=item.product_id;
  if rate is null or gestlok_munro_conteo_private.product_total(new.data,new.decomiso,item.product_id,rate)>0 then
   new.data=jsonb_set(new.data,array[item.product_id],
    coalesce(new.data->item.product_id,'{}'::jsonb)-'sin_stock',true);
  end if;
 end loop;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION gestlok_munro_conteo_private.comparison_rows(p_day date)
 RETURNS TABLE(product_id text, section text, product_name text, product_position integer, night_total bigint, morning_total bigint, night_updated_at timestamp with time zone, acknowledged boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select p.id,p.section,p.name,p.position,
  gestlok_munro_conteo_private.product_total(b.data,b.decomiso,p.id,coalesce((b.pack_units->>p.id)::integer,p.units_per_chapa)) night_total,
  gestlok_munro_conteo_private.product_total(m.data,m.decomiso,p.id,coalesce((m.pack_units->>p.id)::integer,p.units_per_chapa)) morning_total,
  b.updated_at,
  coalesce(a.night_total=gestlok_munro_conteo_private.product_total(b.data,b.decomiso,p.id,coalesce((b.pack_units->>p.id)::integer,p.units_per_chapa))
   and a.morning_total=gestlok_munro_conteo_private.product_total(m.data,m.decomiso,p.id,coalesce((m.pack_units->>p.id)::integer,p.units_per_chapa))
   and a.night_updated_at=b.updated_at,false) acknowledged
 from gestlok_munro_conteo_private.products p
 left join gestlok_munro_conteo_private.shifts b
  on b.day=p_day-1
  and b.shift=(case when p_day=date '2026-11-15' then 'manana_entrada' else 'noche_salida' end)
  and b.status='finalizado'
 left join gestlok_munro_conteo_private.shifts m
  on m.day=p_day and m.shift='manana_entrada'
 left join gestlok_munro_conteo_private.morning_reconciliations a
  on a.day=p_day and a.product_id=p.id
 where p.active
  or coalesce(b.data,'{}'::jsonb) ? p.id
  or coalesce(b.decomiso,'{}'::jsonb) ? p.id
  or coalesce(m.data,'{}'::jsonb) ? p.id
  or coalesce(m.decomiso,'{}'::jsonb) ? p.id
 order by case when upper(p.section) like '%EMPANADA%' then 0
  when upper(p.section) like '%PIZZA%' then 1 else 2 end,
 p.position,p.id;
$function$
;

alter table gestlok_torcuato_conteo_private.products add column if not exists pack_label text not null default 'pack';
update gestlok_torcuato_conteo_private.products set pack_label=case
 when units_per_chapa=0 then 'unidad'
 when section='EMPANADAS' or id like 'c1-%' then 'chapa'
 when lower(btrim(name))='caja palito' or lower(btrim(name)) like 'franui%' or lower(btrim(name))='pink' then 'caja'
 else 'pack' end
where pack_label='pack';
alter table gestlok_torcuato_conteo_private.products drop constraint if exists products_units_per_chapa_check;
alter table gestlok_torcuato_conteo_private.products add constraint products_units_per_chapa_check
 check (units_per_chapa between 0 and 1000);
alter table gestlok_torcuato_conteo_private.products drop constraint if exists products_pack_label_check;
alter table gestlok_torcuato_conteo_private.products add constraint products_pack_label_check
 check (pack_label in ('unidad','caja','pack','chapa') and
 ((units_per_chapa=0 and pack_label='unidad') or
 (units_per_chapa>0 and pack_label<>'unidad')));

alter table gestlok_torcuato_conteo_private.shifts add column if not exists pack_units jsonb not null default '{}'::jsonb
 check (jsonb_typeof(pack_units)='object');
alter table gestlok_torcuato_conteo_private.shifts add column if not exists pack_labels jsonb not null default '{}'::jsonb
 check (jsonb_typeof(pack_labels)='object');
-- La equivalencia anterior de cada producto queda fijada, sin tocar data/decomiso.
update gestlok_torcuato_conteo_private.shifts s set pack_units=coalesce((
  select jsonb_object_agg(k.id,p.units_per_chapa)
  from (
   select key as id from jsonb_object_keys(s.data) as key
   union select key as id from jsonb_object_keys(s.decomiso) as key
  ) k join gestlok_torcuato_conteo_private.products p on p.id=k.id
 ),'{}'::jsonb)
where s.pack_units='{}'::jsonb and (s.data<>'{}'::jsonb or s.decomiso<>'{}'::jsonb);
-- Etiquetas históricas de cada pack.
update gestlok_torcuato_conteo_private.shifts s set pack_labels=coalesce((
  select jsonb_object_agg(k.id,p.pack_label)
  from (select key as id from jsonb_object_keys(s.pack_units) as key) k
  join gestlok_torcuato_conteo_private.products p on p.id=k.id
 ),'{}'::jsonb)
where s.pack_labels='{}'::jsonb and s.pack_units<>'{}'::jsonb;

create or replace function gestlok_torcuato_conteo_private.preserve_pack_units()
returns trigger language plpgsql set search_path='' as $fn$
declare v_id text;v_per integer;v_label text;
begin
 for v_id in select key from (
  select key from jsonb_object_keys(new.data) as key
  union select key from jsonb_object_keys(new.decomiso) as key
 ) q loop
   if not new.pack_units ? v_id then
     select p.units_per_chapa into v_per from gestlok_torcuato_conteo_private.products p where p.id=v_id;
     if v_per is not null then
       new.pack_units:=jsonb_set(new.pack_units,array[v_id],to_jsonb(v_per),true);
     end if;
   end if;
   if not new.pack_labels ? v_id then
     select p.pack_label into v_label from gestlok_torcuato_conteo_private.products p where p.id=v_id;
     if v_label is not null then new.pack_labels:=jsonb_set(new.pack_labels,array[v_id],to_jsonb(v_label),true); end if;
   end if;
 end loop;
 return new;
end $fn$;
drop trigger if exists torcuato_conteo_keep_pack_units on gestlok_torcuato_conteo_private.shifts;
create trigger torcuato_conteo_keep_pack_units
before insert or update of data,decomiso on gestlok_torcuato_conteo_private.shifts
for each row execute function gestlok_torcuato_conteo_private.preserve_pack_units();

create table if not exists gestlok_torcuato_conteo_private.product_pack_audit(
 id bigint generated always as identity primary key,
 product_id text not null,old_units integer,new_units integer not null,
 old_label text,new_label text not null,actor uuid not null,
 updated_at timestamptz not null default now()
);
alter table gestlok_torcuato_conteo_private.product_pack_audit enable row level security;
revoke all on gestlok_torcuato_conteo_private.product_pack_audit from public,anon,authenticated;

create or replace function public.gestlok_torcuato_conteo_save_product_pack(
 p_section text,p_name text,p_units_per_pack integer,p_pack_label text,p_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_role text;v_section text:=btrim(coalesce(p_section,''));v_name text:=btrim(coalesce(p_name,''));
 v_label text:=lower(btrim(coalesce(p_pack_label,'')));v_product gestlok_torcuato_conteo_private.products%rowtype;
 v_before integer;v_oldlabel text;v_position integer;
begin
 -- Verificación en backend de usuario, tenant y sucursal.
 perform gestlok_torcuato_conteo_private.require_access(false,false);
 v_role:=public.mi_rol();
 if v_role not in ('creadora','dueno','gerente')
   or (v_role='gerente' and not public.puede_editar_local('torcuato')) then
   raise exception 'Sin permiso para modificar productos de Don Torcuato' using errcode='42501';
 end if;
 if char_length(v_section) not between 3 and 70 or char_length(v_name) not between 1 and 100
   or p_units_per_pack is null or p_units_per_pack not between 0 and 1000
   or v_label not in ('unidad','caja','pack','chapa')
   or (p_units_per_pack=0 and v_label<>'unidad')
   or (p_units_per_pack>0 and v_label='unidad') then
   raise exception 'Definí unidades o un pack cerrado con 1 a 1000 unidades' using errcode='22023';
 end if;
 if not exists(select 1 from gestlok_torcuato_conteo_private.categories where name=v_section) then
   raise exception 'Categoría no encontrada en Don Torcuato' using errcode='22023';
 end if;
 if p_id is null then
   if exists(select 1 from gestlok_torcuato_conteo_private.products where active and section=v_section and lower(btrim(name))=lower(v_name)) then
     raise exception 'Ya existe un producto con ese nombre en esta categoría' using errcode='23505';
   end if;
   select coalesce(max(position)+1,(select c.position+1 from gestlok_torcuato_conteo_private.categories c where c.name=v_section),1)
   into v_position from gestlok_torcuato_conteo_private.products where section=v_section;
   insert into gestlok_torcuato_conteo_private.products(id,section,name,units_per_chapa,pack_label,position,active)
    values('nuevo-'||replace(gen_random_uuid()::text,'-',''),v_section,v_name,p_units_per_pack,v_label,v_position,true)
    returning * into v_product;
   v_before:=null;v_oldlabel:=null;
 else
   select * into v_product from gestlok_torcuato_conteo_private.products where id=p_id and active for update;
   if not found then raise exception 'Producto no encontrado' using errcode='22023'; end if;
   if v_product.section<>v_section or v_product.name<>v_name then
     raise exception 'El producto cambió. Actualizá y volvé a intentar.' using errcode='40001';
   end if;
   v_before:=v_product.units_per_chapa;v_oldlabel:=v_product.pack_label;
   update gestlok_torcuato_conteo_private.products set units_per_chapa=p_units_per_pack,pack_label=v_label where id=p_id
    returning * into v_product;
 end if;
 if v_before is distinct from p_units_per_pack or v_oldlabel is distinct from v_label then
   insert into gestlok_torcuato_conteo_private.product_pack_audit(product_id,old_units,new_units,old_label,new_label,actor)
   values(v_product.id,v_before,p_units_per_pack,v_oldlabel,v_label,auth.uid());
 end if;
 return jsonb_build_object('ok',true,'product',to_jsonb(v_product),
   'old_units',v_before,'new_units',p_units_per_pack);
exception when unique_violation then
 raise exception 'Ya existe un producto activo con ese nombre en la categoría';
end $fn$;
revoke all on function public.gestlok_torcuato_conteo_save_product_pack(text,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_torcuato_conteo_save_product_pack(text,text,integer,text,text) to authenticated;
CREATE OR REPLACE FUNCTION public.gestlok_torcuato_conteo_set_cell(p_day date, p_shift text, p_product text, p_index integer, p_chapas integer DEFAULT 0, p_sueltas integer DEFAULT 0, p_qty integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r gestlok_torcuato_conteo_private.shifts%rowtype; per integer; new_cell jsonb;
begin
 perform gestlok_torcuato_conteo_private.require_access(true,false);
 if p_day is null or p_day < date '2025-01-01' or p_day > (now() at time zone 'America/Argentina/Buenos_Aires')::date + 1
   or p_shift not in ('manana_entrada','manana_salida','noche_salida') or p_index not between 1 and 4
   or p_chapas not between 0 and 500 or p_sueltas not between 0 and 100000 or p_qty not between 0 and 1000000 then
   raise exception 'Cantidad, fecha o turno no válido';
 end if;
 select units_per_chapa into per from gestlok_torcuato_conteo_private.products where id=p_product and active=true;
 if per is null then raise exception 'Producto no disponible'; end if;
 insert into gestlok_torcuato_conteo_private.shifts(day,shift) values(p_day,p_shift) on conflict do nothing;
 select * into r from gestlok_torcuato_conteo_private.shifts where day=p_day and shift=p_shift for update;
 per:=coalesce((r.pack_units->>p_product)::integer,per);
 if per>0 and p_qty<>0 then raise exception 'El pack usa cajas/chapas y unidades sueltas'; end if;
 if per=0 and (p_chapas<>0 or p_sueltas<>0) then raise exception 'Este producto usa unidades'; end if;
 if r.status='finalizado' then raise exception 'Este conteo ya fue finalizado'; end if;
 new_cell:=jsonb_build_object('chapas',p_chapas,'sueltas',p_sueltas,'qty',p_qty);
 update gestlok_torcuato_conteo_private.shifts set
  data=jsonb_set(r.data,array[p_product],coalesce(r.data->p_product,'{}'::jsonb)||jsonb_build_object('v'||p_index,new_cell),true),
  updated_by=auth.uid(),updated_at=now()
 where day=p_day and shift=p_shift;
 return jsonb_build_object('ok',true,'updated_at',now());
end $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_torcuato_conteo_set_decomiso(p_day date, p_shift text, p_product text, p_chapas integer DEFAULT 0, p_sueltas integer DEFAULT 0, p_qty integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r gestlok_torcuato_conteo_private.shifts%rowtype; per integer;
BEGIN
  PERFORM gestlok_torcuato_conteo_private.require_access(true,false);
  IF p_day IS NULL OR p_day < date '2025-01-01'
    OR p_day > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 1
    OR p_shift NOT IN ('manana_entrada','manana_salida','noche_salida')
    OR p_product IS NULL OR p_chapas NOT BETWEEN 0 AND 500
    OR p_sueltas NOT BETWEEN 0 AND 100000 OR p_qty NOT BETWEEN 0 AND 1000000
  THEN RAISE EXCEPTION 'Decomiso no válido'; END IF;
  SELECT units_per_chapa INTO per FROM gestlok_torcuato_conteo_private.products
    WHERE id=p_product AND active;
  IF per IS NULL THEN RAISE EXCEPTION 'Producto no disponible'; END IF;
  INSERT INTO gestlok_torcuato_conteo_private.shifts(day,shift) VALUES(p_day,p_shift)
    ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM gestlok_torcuato_conteo_private.shifts
    WHERE day=p_day AND shift=p_shift FOR UPDATE;
  per:=coalesce((r.pack_units->>p_product)::integer,per);
  IF (per>0 AND p_qty<>0) OR (per=0 AND (p_chapas<>0 OR p_sueltas<>0))
  THEN RAISE EXCEPTION 'Formato de decomiso no válido para este producto'; END IF;
  IF r.status='finalizado' THEN RAISE EXCEPTION 'El conteo está finalizado'; END IF;
  IF NOT r.decomiso_visible THEN RAISE EXCEPTION 'Primero activá Decomiso'; END IF;
  UPDATE gestlok_torcuato_conteo_private.shifts SET
     decomiso=jsonb_set(r.decomiso,ARRAY[p_product],
       jsonb_build_object('chapas',p_chapas,'sueltas',p_sueltas,'qty',p_qty),true),
     updated_by=auth.uid(),updated_at=now()
     WHERE day=p_day AND shift=p_shift;
  RETURN jsonb_build_object('ok',true);
END $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_torcuato_conteo_correct_closed(p_day date, p_shift text, p_kind text, p_product text, p_index integer, p_value jsonb, p_expected jsonb, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 r gestlok_torcuato_conteo_private.shifts%rowtype;
 per integer;
 chapas integer;
 sueltas integer;
 qty integer;
 old_value jsonb;
 new_value jsonb;
 item jsonb;
 changed_id bigint;
 mail text;
begin
 perform gestlok_torcuato_conteo_private.require_access(true,false);
 if p_day is null or p_day<date '2025-01-01'
  or p_day>(now() at time zone 'America/Argentina/Buenos_Aires')::date+1
  or p_shift not in ('manana_entrada','manana_salida','noche_salida')
  or p_reason is null or length(trim(p_reason)) not between 8 and 300 then
  raise exception 'Fecha, turno o motivo de corrección inválido';
 end if;
 select * into r from gestlok_torcuato_conteo_private.shifts
  where day=p_day and shift=p_shift for update;
 if not found or r.status<>'finalizado' then
  raise exception 'Solo se pueden corregir turnos finalizados existentes';
 end if;
 if p_kind in ('cell','decomiso') then
  select coalesce((r.pack_units->>p_product)::integer,units_per_chapa) into per from gestlok_torcuato_conteo_private.products where id=p_product;
  if per is null or jsonb_typeof(p_value)<>'object'
   or not (p_value ?& array['chapas','sueltas','qty']) then
   raise exception 'Producto o cantidad no válida';
  end if;
  if p_kind='cell' and p_index not between 1 and 4 then
   raise exception 'El vencimiento debe ser del 1 al 4';
  end if;
  if p_kind='decomiso' and p_index is distinct from 0 then
   raise exception 'El decomiso requiere índice cero';
  end if;
  chapas:=(p_value->>'chapas')::integer;
  sueltas:=(p_value->>'sueltas')::integer;
  qty:=(p_value->>'qty')::integer;
  if chapas is null or sueltas is null or qty is null
   or chapas not between 0 and 500 or sueltas not between 0 and 100000
   or qty not between 0 and 1000000
   or (per>0 and qty<>0) or (per=0 and (chapas<>0 or sueltas<>0)) then
   raise exception 'La cantidad es inválida para este producto';
  end if;
  new_value:=jsonb_build_object('chapas',chapas,'sueltas',sueltas,'qty',qty);
  if p_kind='cell' then
   old_value:=coalesce(r.data#>array[p_product,'v'||p_index],'null'::jsonb);
  else
   old_value:=coalesce(r.decomiso->p_product,'null'::jsonb);
  end if;
 elsif p_kind='responsable' then
  if jsonb_typeof(p_value)<>'string' or trim(p_value#>>'{}') not in ('Cami','Caro','Gabi') then
   raise exception 'Responsable no autorizado';
  end if;
  new_value:=to_jsonb(trim(p_value#>>'{}'));
  old_value:=coalesce(to_jsonb(r.responsable),'null'::jsonb);
  if p_product is not null or p_index is not null then
   raise exception 'Parámetros no válidos para responsable';
  end if;
 elsif p_kind in ('consumption','waste') then
  if jsonb_typeof(p_value)<>'array' or jsonb_array_length(p_value)>(case when p_kind='consumption' then 10 else 60 end) then
   raise exception 'Listado de consumos o desperdicios inválido';
  end if;
  for item in select value from jsonb_array_elements(p_value) loop
   if jsonb_typeof(item)<>'object'
    or jsonb_typeof(item->'name')<>'string'
    or jsonb_typeof(item->'value')<>'string'
    or length(item->>'name')>90 or length(item->>'value')>90 then
    raise exception 'Fila de consumos o desperdicios inválida';
   end if;
  end loop;
  if p_product is not null or p_index is not null then
   raise exception 'Parámetros no válidos para listado';
  end if;
  new_value:=p_value;
  old_value:=case when p_kind='consumption' then r.consumption else r.waste end;
 else
  raise exception 'Tipo de corrección no permitido';
 end if;
 if old_value is distinct from coalesce(p_expected,'null'::jsonb) then
  raise exception 'Otro usuario modificó este dato. Actualizá el historial antes de corregirlo.'
   using errcode='40001';
 end if;
 if old_value=new_value then
  raise exception 'No hay cambios que guardar';
 end if;
 if p_kind='cell' then
  update gestlok_torcuato_conteo_private.shifts set
   data=jsonb_set(r.data,array[p_product],
    coalesce(r.data->p_product,'{}'::jsonb)||jsonb_build_object('v'||p_index,new_value),true),
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 elsif p_kind='decomiso' then
  update gestlok_torcuato_conteo_private.shifts set
   decomiso=jsonb_set(r.decomiso,array[p_product],new_value,true),
   decomiso_visible=(r.decomiso_visible or chapas>0 or sueltas>0 or qty>0),
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 elsif p_kind='responsable' then
  update gestlok_torcuato_conteo_private.shifts set responsable=trim(p_value#>>'{}'),
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 elsif p_kind='consumption' then
  update gestlok_torcuato_conteo_private.shifts set consumption=new_value,updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 else
  update gestlok_torcuato_conteo_private.shifts set waste=new_value,waste_visible=true,
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 end if;
 select email into mail from auth.users where id=auth.uid();
 insert into gestlok_torcuato_conteo_private.closed_corrections(
  day,shift,kind,product_id,expiry_index,before_value,after_value,reason,actor_id,actor_email)
 values(p_day,p_shift,p_kind,p_product,p_index,old_value,new_value,trim(p_reason),auth.uid(),mail)
 returning id into changed_id;
 return jsonb_build_object('ok',true,'correction_id',changed_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_torcuato_conteo_sin_stock(p_day date, p_shift text, p_product text, p_sin_stock boolean, p_expected boolean DEFAULT false, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 r gestlok_torcuato_conteo_private.shifts%rowtype;
 rate integer;
 previous boolean;
 email text;
 correction_id bigint;
begin
 perform gestlok_torcuato_conteo_private.require_access(true,false);
 if p_day is null or p_day < date '2025-01-01'
  or p_day > (now() at time zone 'America/Argentina/Buenos_Aires')::date+1
  or p_shift not in ('manana_entrada','manana_salida','noche_salida')
  or p_product is null or p_sin_stock is null or p_expected is null then
  raise exception 'Fecha, turno o producto de Sin stock inválido';
 end if;
 select units_per_chapa into rate from gestlok_torcuato_conteo_private.products
 where id=p_product;
 if rate is null then raise exception 'Producto inexistente'; end if;

 select * into r from gestlok_torcuato_conteo_private.shifts
 where day=p_day and shift=p_shift for update;
 if not found then
  if not p_sin_stock then raise exception 'No hay una marca Sin stock que modificar'; end if;
  insert into gestlok_torcuato_conteo_private.shifts (day,shift) values (p_day,p_shift)
   on conflict do nothing;
  select * into r from gestlok_torcuato_conteo_private.shifts
   where day=p_day and shift=p_shift for update;
 end if;
 rate:=coalesce((r.pack_units->>p_product)::integer,rate);
 previous=coalesce((r.data->p_product->>'sin_stock')::boolean,false);
 if previous is distinct from p_expected then
  raise exception 'Otro usuario modificó este producto. Actualizá el conteo.'
   using errcode='40001';
 end if;
 if previous=p_sin_stock then
  raise exception 'No hay cambios de Sin stock para guardar';
 end if;
 if p_sin_stock and gestlok_torcuato_conteo_private.product_total(r.data,r.decomiso,p_product,rate)>0 then
  raise exception 'No se puede marcar Sin stock: el producto tiene unidades registradas';
 end if;
 if r.status='finalizado' and
  (p_reason is null or length(trim(p_reason)) not between 8 and 300) then
  raise exception 'Los conteos cerrados requieren motivo de corrección (8 a 300 caracteres)';
 end if;

 update gestlok_torcuato_conteo_private.shifts
 set data=jsonb_set(r.data,array[p_product],
       coalesce(r.data->p_product,'{}'::jsonb)||
       jsonb_build_object('sin_stock',p_sin_stock),true),
     updated_by=auth.uid(),updated_at=now()
 where day=p_day and shift=p_shift;
 if r.status='finalizado' then
  select u.email into email from auth.users u where u.id=auth.uid();
  insert into gestlok_torcuato_conteo_private.closed_corrections
   (day,shift,kind,product_id,expiry_index,before_value,after_value,
    reason,actor_id,actor_email)
  values(p_day,p_shift,'sin_stock',p_product,null,to_jsonb(previous),to_jsonb(p_sin_stock),
   trim(p_reason),auth.uid(),email)
  returning id into correction_id;
 end if;
 return jsonb_build_object('ok',true,'sin_stock',p_sin_stock,
    'closed_correction_id',correction_id);
end $function$
;
CREATE OR REPLACE FUNCTION gestlok_torcuato_conteo_private.normalize_manual_sin_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare item record; rate integer;
begin
 for item in
  select key as product_id from jsonb_each(new.data)
  where jsonb_typeof(value)='object' and value->>'sin_stock'='true'
 loop
  select coalesce((new.pack_units->>item.product_id)::integer,units_per_chapa) into rate from gestlok_torcuato_conteo_private.products where id=item.product_id;
  if rate is null or gestlok_torcuato_conteo_private.product_total(new.data,new.decomiso,item.product_id,rate)>0 then
   new.data=jsonb_set(new.data,array[item.product_id],
    coalesce(new.data->item.product_id,'{}'::jsonb)-'sin_stock',true);
  end if;
 end loop;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION gestlok_torcuato_conteo_private.comparison_rows(p_day date)
 RETURNS TABLE(product_id text, section text, product_name text, product_position integer, night_total bigint, morning_total bigint, night_updated_at timestamp with time zone, acknowledged boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select p.id,p.section,p.name,p.position,
  gestlok_torcuato_conteo_private.product_total(b.data,b.decomiso,p.id,coalesce((b.pack_units->>p.id)::integer,p.units_per_chapa)) night_total,
  gestlok_torcuato_conteo_private.product_total(m.data,m.decomiso,p.id,coalesce((m.pack_units->>p.id)::integer,p.units_per_chapa)) morning_total,
  b.updated_at,
  coalesce(a.night_total=gestlok_torcuato_conteo_private.product_total(b.data,b.decomiso,p.id,coalesce((b.pack_units->>p.id)::integer,p.units_per_chapa))
   and a.morning_total=gestlok_torcuato_conteo_private.product_total(m.data,m.decomiso,p.id,coalesce((m.pack_units->>p.id)::integer,p.units_per_chapa))
   and a.night_updated_at=b.updated_at,false) acknowledged
 from gestlok_torcuato_conteo_private.products p
 left join gestlok_torcuato_conteo_private.shifts b
  on b.day=p_day-1
  and b.shift=(case when false then 'manana_entrada' else 'noche_salida' end)
  and b.status='finalizado'
 left join gestlok_torcuato_conteo_private.shifts m
  on m.day=p_day and m.shift='manana_entrada'
 left join gestlok_torcuato_conteo_private.morning_reconciliations a
  on a.day=p_day and a.product_id=p.id
 where p.active
  or coalesce(b.data,'{}'::jsonb) ? p.id
  or coalesce(b.decomiso,'{}'::jsonb) ? p.id
  or coalesce(m.data,'{}'::jsonb) ? p.id
  or coalesce(m.decomiso,'{}'::jsonb) ? p.id
 order by case when upper(p.section) like '%EMPANADA%' then 0
  when upper(p.section) like '%PIZZA%' then 1 else 2 end,
 p.position,p.id;
$function$
;
 then 'caja'
 else 'pack' end
where pack_label='pack';
alter table gestlok_munro_conteo_private.products drop constraint if exists products_units_per_chapa_check;
alter table gestlok_munro_conteo_private.products add constraint products_units_per_chapa_check
 check (units_per_chapa between 0 and 1000);
alter table gestlok_munro_conteo_private.products drop constraint if exists products_pack_label_check;
alter table gestlok_munro_conteo_private.products add constraint products_pack_label_check
 check (pack_label in ('unidad','caja','pack','chapa') and
 ((units_per_chapa=0 and pack_label='unidad') or
 (units_per_chapa>0 and pack_label<>'unidad')));

alter table gestlok_munro_conteo_private.shifts add column if not exists pack_units jsonb not null default '{}'::jsonb
 check (jsonb_typeof(pack_units)='object');
alter table gestlok_munro_conteo_private.shifts add column if not exists pack_labels jsonb not null default '{}'::jsonb
 check (jsonb_typeof(pack_labels)='object');
-- La equivalencia anterior de cada producto queda fijada, sin tocar data/decomiso.
update gestlok_munro_conteo_private.shifts s set pack_units=coalesce((
  select jsonb_object_agg(k.id,p.units_per_chapa)
  from (
   select key as id from jsonb_object_keys(s.data) as key
   union select key as id from jsonb_object_keys(s.decomiso) as key
  ) k join gestlok_munro_conteo_private.products p on p.id=k.id
 ),'{}'::jsonb)
where s.pack_units='{}'::jsonb and (s.data<>'{}'::jsonb or s.decomiso<>'{}'::jsonb);
-- El nombre de la presentación (caja/pack/chapa) también pertenece al turno.
update gestlok_munro_conteo_private.shifts s set pack_labels=coalesce((
  select jsonb_object_agg(k.id,p.pack_label)
  from (select key as id from jsonb_object_keys(s.pack_units) as key) k
  join gestlok_munro_conteo_private.products p on p.id=k.id
 ),'{}'::jsonb)
where s.pack_labels='{}'::jsonb and s.pack_units<>'{}'::jsonb;

create or replace function gestlok_munro_conteo_private.preserve_pack_units()
returns trigger language plpgsql set search_path='' as $fn$
declare v_id text;v_per integer;v_label text;
begin
 for v_id in select key from (
  select key from jsonb_object_keys(new.data) as key
  union select key from jsonb_object_keys(new.decomiso) as key
 ) q loop
   if not new.pack_units ? v_id then
     select p.units_per_chapa into v_per from gestlok_munro_conteo_private.products p where p.id=v_id;
     if v_per is not null then
       new.pack_units:=jsonb_set(new.pack_units,array[v_id],to_jsonb(v_per),true);
     end if;
   end if;
   if not new.pack_labels ? v_id then
     select p.pack_label into v_label from gestlok_munro_conteo_private.products p where p.id=v_id;
     if v_label is not null then new.pack_labels:=jsonb_set(new.pack_labels,array[v_id],to_jsonb(v_label),true); end if;
   end if;
 end loop;
 return new;
end $fn$;
drop trigger if exists munro_conteo_keep_pack_units on gestlok_munro_conteo_private.shifts;
create trigger munro_conteo_keep_pack_units
before insert or update of data,decomiso on gestlok_munro_conteo_private.shifts
for each row execute function gestlok_munro_conteo_private.preserve_pack_units();

create table if not exists gestlok_munro_conteo_private.product_pack_audit(
 id bigint generated always as identity primary key,
 product_id text not null,old_units integer,new_units integer not null,
 old_label text,new_label text not null,actor uuid not null,
 updated_at timestamptz not null default now()
);
alter table gestlok_munro_conteo_private.product_pack_audit enable row level security;
revoke all on gestlok_munro_conteo_private.product_pack_audit from public,anon,authenticated;

create or replace function public.gestlok_munro_conteo_save_product_pack(
 p_section text,p_name text,p_units_per_pack integer,p_pack_label text,p_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_role text;v_section text:=btrim(coalesce(p_section,''));v_name text:=btrim(coalesce(p_name,''));
 v_label text:=lower(btrim(coalesce(p_pack_label,'')));v_product gestlok_munro_conteo_private.products%rowtype;
 v_before integer;v_oldlabel text;v_position integer;
begin
 -- Verificación en backend de usuario, tenant y sucursal.
 perform gestlok_munro_conteo_private.require_access(false,false);
 v_role:=public.mi_rol();
 if v_role not in ('creadora','dueno','gerente')
   or (v_role='gerente' and not public.puede_editar_local('munro')) then
   raise exception 'Sin permiso para modificar productos de Munro' using errcode='42501';
 end if;
 if char_length(v_section) not between 3 and 70 or char_length(v_name) not between 1 and 100
   or p_units_per_pack is null or p_units_per_pack not between 0 and 1000
   or v_label not in ('unidad','caja','pack','chapa')
   or (p_units_per_pack=0 and v_label<>'unidad')
   or (p_units_per_pack>0 and v_label='unidad') then
   raise exception 'Definí unidades o un pack cerrado con 1 a 1000 unidades' using errcode='22023';
 end if;
 if not exists(select 1 from gestlok_munro_conteo_private.categories where name=v_section) then
   raise exception 'Categoría no encontrada en Munro' using errcode='22023';
 end if;
 if p_id is null then
   if exists(select 1 from gestlok_munro_conteo_private.products where active and section=v_section and lower(btrim(name))=lower(v_name)) then
     raise exception 'Ya existe un producto con ese nombre en esta categoría' using errcode='23505';
   end if;
   select coalesce(max(position)+1,(select c.position+1 from gestlok_munro_conteo_private.categories c where c.name=v_section),1)
   into v_position from gestlok_munro_conteo_private.products where section=v_section;
   insert into gestlok_munro_conteo_private.products(id,section,name,units_per_chapa,pack_label,position,active)
    values('nuevo-'||replace(gen_random_uuid()::text,'-',''),v_section,v_name,p_units_per_pack,v_label,v_position,true)
    returning * into v_product;
   v_before:=null;v_oldlabel:=null;
 else
   select * into v_product from gestlok_munro_conteo_private.products where id=p_id and active for update;
   if not found then raise exception 'Producto no encontrado' using errcode='22023'; end if;
   if v_product.section<>v_section or v_product.name<>v_name then
     raise exception 'El producto cambió. Actualizá y volvé a intentar.' using errcode='40001';
   end if;
   v_before:=v_product.units_per_chapa;v_oldlabel:=v_product.pack_label;
   update gestlok_munro_conteo_private.products set units_per_chapa=p_units_per_pack,pack_label=v_label where id=p_id
    returning * into v_product;
 end if;
 if v_before is distinct from p_units_per_pack or v_oldlabel is distinct from v_label then
   insert into gestlok_munro_conteo_private.product_pack_audit(product_id,old_units,new_units,old_label,new_label,actor)
   values(v_product.id,v_before,p_units_per_pack,v_oldlabel,v_label,auth.uid());
 end if;
 return jsonb_build_object('ok',true,'product',to_jsonb(v_product),
   'old_units',v_before,'new_units',p_units_per_pack);
exception when unique_violation then
 raise exception 'Ya existe un producto activo con ese nombre en la categoría';
end $fn$;
revoke all on function public.gestlok_munro_conteo_save_product_pack(text,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_munro_conteo_save_product_pack(text,text,integer,text,text) to authenticated;
CREATE OR REPLACE FUNCTION public.gestlok_munro_conteo_set_cell(p_day date, p_shift text, p_product text, p_index integer, p_chapas integer DEFAULT 0, p_sueltas integer DEFAULT 0, p_qty integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r gestlok_munro_conteo_private.shifts%rowtype; per integer; new_cell jsonb;
begin
 perform gestlok_munro_conteo_private.require_access(true,false);
 if p_day is null or p_day < date '2025-01-01' or p_day > (now() at time zone 'America/Argentina/Buenos_Aires')::date + 1
   or p_shift not in ('manana_entrada','manana_salida','noche_salida') or p_index not between 1 and 4
   or p_chapas not between 0 and 500 or p_sueltas not between 0 and 100000 or p_qty not between 0 and 1000000 then
   raise exception 'Cantidad, fecha o turno no válido';
 end if;
 select units_per_chapa into per from gestlok_munro_conteo_private.products where id=p_product and active=true;
 if per is null then raise exception 'Producto no disponible'; end if;
 insert into gestlok_munro_conteo_private.shifts(day,shift) values(p_day,p_shift) on conflict do nothing;
 select * into r from gestlok_munro_conteo_private.shifts where day=p_day and shift=p_shift for update;
 per:=coalesce((r.pack_units->>p_product)::integer,per);
 if per>0 and p_qty<>0 then raise exception 'El pack usa cajas/chapas y unidades sueltas'; end if;
 if per=0 and (p_chapas<>0 or p_sueltas<>0) then raise exception 'Este producto usa unidades'; end if;
 if r.status='finalizado' then raise exception 'Este conteo ya fue finalizado'; end if;
 new_cell:=jsonb_build_object('chapas',p_chapas,'sueltas',p_sueltas,'qty',p_qty);
 update gestlok_munro_conteo_private.shifts set
  data=jsonb_set(r.data,array[p_product],coalesce(r.data->p_product,'{}'::jsonb)||jsonb_build_object('v'||p_index,new_cell),true),
  updated_by=auth.uid(),updated_at=now()
 where day=p_day and shift=p_shift;
 return jsonb_build_object('ok',true,'updated_at',now());
end $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_munro_conteo_set_decomiso(p_day date, p_shift text, p_product text, p_chapas integer DEFAULT 0, p_sueltas integer DEFAULT 0, p_qty integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r gestlok_munro_conteo_private.shifts%rowtype; per integer;
BEGIN
  PERFORM gestlok_munro_conteo_private.require_access(true,false);
  IF p_day IS NULL OR p_day < date '2025-01-01'
    OR p_day > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 1
    OR p_shift NOT IN ('manana_entrada','manana_salida','noche_salida')
    OR p_product IS NULL OR p_chapas NOT BETWEEN 0 AND 500
    OR p_sueltas NOT BETWEEN 0 AND 100000 OR p_qty NOT BETWEEN 0 AND 1000000
  THEN RAISE EXCEPTION 'Decomiso no válido'; END IF;
  SELECT units_per_chapa INTO per FROM gestlok_munro_conteo_private.products
    WHERE id=p_product AND active;
  IF per IS NULL THEN RAISE EXCEPTION 'Producto no disponible'; END IF;
  INSERT INTO gestlok_munro_conteo_private.shifts(day,shift) VALUES(p_day,p_shift)
    ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM gestlok_munro_conteo_private.shifts
    WHERE day=p_day AND shift=p_shift FOR UPDATE;
  per:=coalesce((r.pack_units->>p_product)::integer,per);
  IF (per>0 AND p_qty<>0) OR (per=0 AND (p_chapas<>0 OR p_sueltas<>0))
  THEN RAISE EXCEPTION 'Formato de decomiso no válido para este producto'; END IF;
  IF r.status='finalizado' THEN RAISE EXCEPTION 'El conteo está finalizado'; END IF;
  IF NOT r.decomiso_visible THEN RAISE EXCEPTION 'Primero activá Decomiso'; END IF;
  UPDATE gestlok_munro_conteo_private.shifts SET
     decomiso=jsonb_set(r.decomiso,ARRAY[p_product],
       jsonb_build_object('chapas',p_chapas,'sueltas',p_sueltas,'qty',p_qty),true),
     updated_by=auth.uid(),updated_at=now()
     WHERE day=p_day AND shift=p_shift;
  RETURN jsonb_build_object('ok',true);
END $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_munro_conteo_correct_closed(p_day date, p_shift text, p_kind text, p_product text, p_index integer, p_value jsonb, p_expected jsonb, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 r gestlok_munro_conteo_private.shifts%rowtype;
 per integer;
 chapas integer;
 sueltas integer;
 qty integer;
 old_value jsonb;
 new_value jsonb;
 item jsonb;
 changed_id bigint;
 mail text;
begin
 perform gestlok_munro_conteo_private.require_access(true,false);
 if p_day is null or p_day<date '2025-01-01'
  or p_day>(now() at time zone 'America/Argentina/Buenos_Aires')::date+1
  or p_shift not in ('manana_entrada','manana_salida','noche_salida')
  or p_reason is null or length(trim(p_reason)) not between 8 and 300 then
  raise exception 'Fecha, turno o motivo de corrección inválido';
 end if;
 select * into r from gestlok_munro_conteo_private.shifts
  where day=p_day and shift=p_shift for update;
 if not found or r.status<>'finalizado' then
  raise exception 'Solo se pueden corregir turnos finalizados existentes';
 end if;
 if p_kind in ('cell','decomiso') then
  select coalesce((r.pack_units->>p_product)::integer,units_per_chapa) into per from gestlok_munro_conteo_private.products where id=p_product;
  if per is null or jsonb_typeof(p_value)<>'object'
   or not (p_value ?& array['chapas','sueltas','qty']) then
   raise exception 'Producto o cantidad no válida';
  end if;
  if p_kind='cell' and p_index not between 1 and 4 then
   raise exception 'El vencimiento debe ser del 1 al 4';
  end if;
  if p_kind='decomiso' and p_index is distinct from 0 then
   raise exception 'El decomiso requiere índice cero';
  end if;
  chapas:=(p_value->>'chapas')::integer;
  sueltas:=(p_value->>'sueltas')::integer;
  qty:=(p_value->>'qty')::integer;
  if chapas is null or sueltas is null or qty is null
   or chapas not between 0 and 500 or sueltas not between 0 and 100000
   or qty not between 0 and 1000000
   or (per>0 and qty<>0) or (per=0 and (chapas<>0 or sueltas<>0)) then
   raise exception 'La cantidad es inválida para este producto';
  end if;
  new_value:=jsonb_build_object('chapas',chapas,'sueltas',sueltas,'qty',qty);
  if p_kind='cell' then
   old_value:=coalesce(r.data#>array[p_product,'v'||p_index],'null'::jsonb);
  else
   old_value:=coalesce(r.decomiso->p_product,'null'::jsonb);
  end if;
 elsif p_kind='responsable' then
  if jsonb_typeof(p_value)<>'string' or trim(p_value#>>'{}') not in ('Cami','Shuli','Tizi') then
   raise exception 'Responsable no autorizado';
  end if;
  new_value:=to_jsonb(trim(p_value#>>'{}'));
  old_value:=coalesce(to_jsonb(r.responsable),'null'::jsonb);
  if p_product is not null or p_index is not null then
   raise exception 'Parámetros no válidos para responsable';
  end if;
 elsif p_kind in ('consumption','waste') then
  if jsonb_typeof(p_value)<>'array' or jsonb_array_length(p_value)>(case when p_kind='consumption' then 10 else 60 end) then
   raise exception 'Listado de consumos o desperdicios inválido';
  end if;
  for item in select value from jsonb_array_elements(p_value) loop
   if jsonb_typeof(item)<>'object'
    or jsonb_typeof(item->'name')<>'string'
    or jsonb_typeof(item->'value')<>'string'
    or length(item->>'name')>90 or length(item->>'value')>90 then
    raise exception 'Fila de consumos o desperdicios inválida';
   end if;
  end loop;
  if p_product is not null or p_index is not null then
   raise exception 'Parámetros no válidos para listado';
  end if;
  new_value:=p_value;
  old_value:=case when p_kind='consumption' then r.consumption else r.waste end;
 else
  raise exception 'Tipo de corrección no permitido';
 end if;
 if old_value is distinct from coalesce(p_expected,'null'::jsonb) then
  raise exception 'Otro usuario modificó este dato. Actualizá el historial antes de corregirlo.'
   using errcode='40001';
 end if;
 if old_value=new_value then
  raise exception 'No hay cambios que guardar';
 end if;
 if p_kind='cell' then
  update gestlok_munro_conteo_private.shifts set
   data=jsonb_set(r.data,array[p_product],
    coalesce(r.data->p_product,'{}'::jsonb)||jsonb_build_object('v'||p_index,new_value),true),
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 elsif p_kind='decomiso' then
  update gestlok_munro_conteo_private.shifts set
   decomiso=jsonb_set(r.decomiso,array[p_product],new_value,true),
   decomiso_visible=(r.decomiso_visible or chapas>0 or sueltas>0 or qty>0),
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 elsif p_kind='responsable' then
  update gestlok_munro_conteo_private.shifts set responsable=trim(p_value#>>'{}'),
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 elsif p_kind='consumption' then
  update gestlok_munro_conteo_private.shifts set consumption=new_value,updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 else
  update gestlok_munro_conteo_private.shifts set waste=new_value,waste_visible=true,
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 end if;
 select email into mail from auth.users where id=auth.uid();
 insert into gestlok_munro_conteo_private.closed_corrections(
  day,shift,kind,product_id,expiry_index,before_value,after_value,reason,actor_id,actor_email)
 values(p_day,p_shift,p_kind,p_product,p_index,old_value,new_value,trim(p_reason),auth.uid(),mail)
 returning id into changed_id;
 return jsonb_build_object('ok',true,'correction_id',changed_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_munro_conteo_sin_stock(p_day date, p_shift text, p_product text, p_sin_stock boolean, p_expected boolean DEFAULT false, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 r gestlok_munro_conteo_private.shifts%rowtype;
 rate integer;
 previous boolean;
 email text;
 correction_id bigint;
begin
 perform gestlok_munro_conteo_private.require_access(true,false);
 if p_day is null or p_day < date '2025-01-01'
  or p_day > (now() at time zone 'America/Argentina/Buenos_Aires')::date+1
  or p_shift not in ('manana_entrada','manana_salida','noche_salida')
  or p_product is null or p_sin_stock is null or p_expected is null then
  raise exception 'Fecha, turno o producto de Sin stock inválido';
 end if;
 select units_per_chapa into rate from gestlok_munro_conteo_private.products
 where id=p_product;
 if rate is null then raise exception 'Producto inexistente'; end if;

 select * into r from gestlok_munro_conteo_private.shifts
 where day=p_day and shift=p_shift for update;
 if not found then
  if not p_sin_stock then raise exception 'No hay una marca Sin stock que modificar'; end if;
  insert into gestlok_munro_conteo_private.shifts (day,shift) values (p_day,p_shift)
   on conflict do nothing;
  select * into r from gestlok_munro_conteo_private.shifts
   where day=p_day and shift=p_shift for update;
 end if;
 rate:=coalesce((r.pack_units->>p_product)::integer,rate);
 previous=coalesce((r.data->p_product->>'sin_stock')::boolean,false);
 if previous is distinct from p_expected then
  raise exception 'Otro usuario modificó este producto. Actualizá el conteo.'
   using errcode='40001';
 end if;
 if previous=p_sin_stock then
  raise exception 'No hay cambios de Sin stock para guardar';
 end if;
 if p_sin_stock and gestlok_munro_conteo_private.product_total(r.data,r.decomiso,p_product,rate)>0 then
  raise exception 'No se puede marcar Sin stock: el producto tiene unidades registradas';
 end if;
 if r.status='finalizado' and
  (p_reason is null or length(trim(p_reason)) not between 8 and 300) then
  raise exception 'Los conteos cerrados requieren motivo de corrección (8 a 300 caracteres)';
 end if;

 update gestlok_munro_conteo_private.shifts
 set data=jsonb_set(r.data,array[p_product],
       coalesce(r.data->p_product,'{}'::jsonb)||
       jsonb_build_object('sin_stock',p_sin_stock),true),
     updated_by=auth.uid(),updated_at=now()
 where day=p_day and shift=p_shift;
 if r.status='finalizado' then
  select u.email into email from auth.users u where u.id=auth.uid();
  insert into gestlok_munro_conteo_private.closed_corrections
   (day,shift,kind,product_id,expiry_index,before_value,after_value,
    reason,actor_id,actor_email)
  values(p_day,p_shift,'sin_stock',p_product,null,to_jsonb(previous),to_jsonb(p_sin_stock),
   trim(p_reason),auth.uid(),email)
  returning id into correction_id;
 end if;
 return jsonb_build_object('ok',true,'sin_stock',p_sin_stock,
    'closed_correction_id',correction_id);
end $function$
;
CREATE OR REPLACE FUNCTION gestlok_munro_conteo_private.normalize_manual_sin_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare item record; rate integer;
begin
 for item in
  select key as product_id from jsonb_each(new.data)
  where jsonb_typeof(value)='object' and value->>'sin_stock'='true'
 loop
  select coalesce((new.pack_units->>item.product_id)::integer,units_per_chapa) into rate from gestlok_munro_conteo_private.products where id=item.product_id;
  if rate is null or gestlok_munro_conteo_private.product_total(new.data,new.decomiso,item.product_id,rate)>0 then
   new.data=jsonb_set(new.data,array[item.product_id],
    coalesce(new.data->item.product_id,'{}'::jsonb)-'sin_stock',true);
  end if;
 end loop;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION gestlok_munro_conteo_private.comparison_rows(p_day date)
 RETURNS TABLE(product_id text, section text, product_name text, product_position integer, night_total bigint, morning_total bigint, night_updated_at timestamp with time zone, acknowledged boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select p.id,p.section,p.name,p.position,
  gestlok_munro_conteo_private.product_total(b.data,b.decomiso,p.id,coalesce((b.pack_units->>p.id)::integer,p.units_per_chapa)) night_total,
  gestlok_munro_conteo_private.product_total(m.data,m.decomiso,p.id,coalesce((m.pack_units->>p.id)::integer,p.units_per_chapa)) morning_total,
  b.updated_at,
  coalesce(a.night_total=gestlok_munro_conteo_private.product_total(b.data,b.decomiso,p.id,coalesce((b.pack_units->>p.id)::integer,p.units_per_chapa))
   and a.morning_total=gestlok_munro_conteo_private.product_total(m.data,m.decomiso,p.id,coalesce((m.pack_units->>p.id)::integer,p.units_per_chapa))
   and a.night_updated_at=b.updated_at,false) acknowledged
 from gestlok_munro_conteo_private.products p
 left join gestlok_munro_conteo_private.shifts b
  on b.day=p_day-1
  and b.shift=(case when p_day=date '2026-11-15' then 'manana_entrada' else 'noche_salida' end)
  and b.status='finalizado'
 left join gestlok_munro_conteo_private.shifts m
  on m.day=p_day and m.shift='manana_entrada'
 left join gestlok_munro_conteo_private.morning_reconciliations a
  on a.day=p_day and a.product_id=p.id
 where p.active
  or coalesce(b.data,'{}'::jsonb) ? p.id
  or coalesce(b.decomiso,'{}'::jsonb) ? p.id
  or coalesce(m.data,'{}'::jsonb) ? p.id
  or coalesce(m.decomiso,'{}'::jsonb) ? p.id
 order by case when upper(p.section) like '%EMPANADA%' then 0
  when upper(p.section) like '%PIZZA%' then 1 else 2 end,
 p.position,p.id;
$function$
;

alter table gestlok_torcuato_conteo_private.products add column if not exists pack_label text not null default 'pack';
update gestlok_torcuato_conteo_private.products set pack_label=case
 when units_per_chapa=0 then 'unidad'
 when section='EMPANADAS' or id like 'c1-%' then 'chapa'
 when lower(btrim(name))='caja palito' or lower(btrim(name)) like 'franui%' or lower(btrim(name))='pink' or lower(btrim(name)) ~ '^le[[:space:]]*banana
 else 'pack' end
where pack_label='pack';
alter table gestlok_torcuato_conteo_private.products drop constraint if exists products_units_per_chapa_check;
alter table gestlok_torcuato_conteo_private.products add constraint products_units_per_chapa_check
 check (units_per_chapa between 0 and 1000);
alter table gestlok_torcuato_conteo_private.products drop constraint if exists products_pack_label_check;
alter table gestlok_torcuato_conteo_private.products add constraint products_pack_label_check
 check (pack_label in ('unidad','caja','pack','chapa') and
 ((units_per_chapa=0 and pack_label='unidad') or
 (units_per_chapa>0 and pack_label<>'unidad')));

alter table gestlok_torcuato_conteo_private.shifts add column if not exists pack_units jsonb not null default '{}'::jsonb
 check (jsonb_typeof(pack_units)='object');
alter table gestlok_torcuato_conteo_private.shifts add column if not exists pack_labels jsonb not null default '{}'::jsonb
 check (jsonb_typeof(pack_labels)='object');
-- La equivalencia anterior de cada producto queda fijada, sin tocar data/decomiso.
update gestlok_torcuato_conteo_private.shifts s set pack_units=coalesce((
  select jsonb_object_agg(k.id,p.units_per_chapa)
  from (
   select key as id from jsonb_object_keys(s.data) as key
   union select key as id from jsonb_object_keys(s.decomiso) as key
  ) k join gestlok_torcuato_conteo_private.products p on p.id=k.id
 ),'{}'::jsonb)
where s.pack_units='{}'::jsonb and (s.data<>'{}'::jsonb or s.decomiso<>'{}'::jsonb);
-- Etiquetas históricas de cada pack.
update gestlok_torcuato_conteo_private.shifts s set pack_labels=coalesce((
  select jsonb_object_agg(k.id,p.pack_label)
  from (select key as id from jsonb_object_keys(s.pack_units) as key) k
  join gestlok_torcuato_conteo_private.products p on p.id=k.id
 ),'{}'::jsonb)
where s.pack_labels='{}'::jsonb and s.pack_units<>'{}'::jsonb;

create or replace function gestlok_torcuato_conteo_private.preserve_pack_units()
returns trigger language plpgsql set search_path='' as $fn$
declare v_id text;v_per integer;v_label text;
begin
 for v_id in select key from (
  select key from jsonb_object_keys(new.data) as key
  union select key from jsonb_object_keys(new.decomiso) as key
 ) q loop
   if not new.pack_units ? v_id then
     select p.units_per_chapa into v_per from gestlok_torcuato_conteo_private.products p where p.id=v_id;
     if v_per is not null then
       new.pack_units:=jsonb_set(new.pack_units,array[v_id],to_jsonb(v_per),true);
     end if;
   end if;
   if not new.pack_labels ? v_id then
     select p.pack_label into v_label from gestlok_torcuato_conteo_private.products p where p.id=v_id;
     if v_label is not null then new.pack_labels:=jsonb_set(new.pack_labels,array[v_id],to_jsonb(v_label),true); end if;
   end if;
 end loop;
 return new;
end $fn$;
drop trigger if exists torcuato_conteo_keep_pack_units on gestlok_torcuato_conteo_private.shifts;
create trigger torcuato_conteo_keep_pack_units
before insert or update of data,decomiso on gestlok_torcuato_conteo_private.shifts
for each row execute function gestlok_torcuato_conteo_private.preserve_pack_units();

create table if not exists gestlok_torcuato_conteo_private.product_pack_audit(
 id bigint generated always as identity primary key,
 product_id text not null,old_units integer,new_units integer not null,
 old_label text,new_label text not null,actor uuid not null,
 updated_at timestamptz not null default now()
);
alter table gestlok_torcuato_conteo_private.product_pack_audit enable row level security;
revoke all on gestlok_torcuato_conteo_private.product_pack_audit from public,anon,authenticated;

create or replace function public.gestlok_torcuato_conteo_save_product_pack(
 p_section text,p_name text,p_units_per_pack integer,p_pack_label text,p_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_role text;v_section text:=btrim(coalesce(p_section,''));v_name text:=btrim(coalesce(p_name,''));
 v_label text:=lower(btrim(coalesce(p_pack_label,'')));v_product gestlok_torcuato_conteo_private.products%rowtype;
 v_before integer;v_oldlabel text;v_position integer;
begin
 -- Verificación en backend de usuario, tenant y sucursal.
 perform gestlok_torcuato_conteo_private.require_access(false,false);
 v_role:=public.mi_rol();
 if v_role not in ('creadora','dueno','gerente')
   or (v_role='gerente' and not public.puede_editar_local('torcuato')) then
   raise exception 'Sin permiso para modificar productos de Don Torcuato' using errcode='42501';
 end if;
 if char_length(v_section) not between 3 and 70 or char_length(v_name) not between 1 and 100
   or p_units_per_pack is null or p_units_per_pack not between 0 and 1000
   or v_label not in ('unidad','caja','pack','chapa')
   or (p_units_per_pack=0 and v_label<>'unidad')
   or (p_units_per_pack>0 and v_label='unidad') then
   raise exception 'Definí unidades o un pack cerrado con 1 a 1000 unidades' using errcode='22023';
 end if;
 if not exists(select 1 from gestlok_torcuato_conteo_private.categories where name=v_section) then
   raise exception 'Categoría no encontrada en Don Torcuato' using errcode='22023';
 end if;
 if p_id is null then
   if exists(select 1 from gestlok_torcuato_conteo_private.products where active and section=v_section and lower(btrim(name))=lower(v_name)) then
     raise exception 'Ya existe un producto con ese nombre en esta categoría' using errcode='23505';
   end if;
   select coalesce(max(position)+1,(select c.position+1 from gestlok_torcuato_conteo_private.categories c where c.name=v_section),1)
   into v_position from gestlok_torcuato_conteo_private.products where section=v_section;
   insert into gestlok_torcuato_conteo_private.products(id,section,name,units_per_chapa,pack_label,position,active)
    values('nuevo-'||replace(gen_random_uuid()::text,'-',''),v_section,v_name,p_units_per_pack,v_label,v_position,true)
    returning * into v_product;
   v_before:=null;v_oldlabel:=null;
 else
   select * into v_product from gestlok_torcuato_conteo_private.products where id=p_id and active for update;
   if not found then raise exception 'Producto no encontrado' using errcode='22023'; end if;
   if v_product.section<>v_section or v_product.name<>v_name then
     raise exception 'El producto cambió. Actualizá y volvé a intentar.' using errcode='40001';
   end if;
   v_before:=v_product.units_per_chapa;v_oldlabel:=v_product.pack_label;
   update gestlok_torcuato_conteo_private.products set units_per_chapa=p_units_per_pack,pack_label=v_label where id=p_id
    returning * into v_product;
 end if;
 if v_before is distinct from p_units_per_pack or v_oldlabel is distinct from v_label then
   insert into gestlok_torcuato_conteo_private.product_pack_audit(product_id,old_units,new_units,old_label,new_label,actor)
   values(v_product.id,v_before,p_units_per_pack,v_oldlabel,v_label,auth.uid());
 end if;
 return jsonb_build_object('ok',true,'product',to_jsonb(v_product),
   'old_units',v_before,'new_units',p_units_per_pack);
exception when unique_violation then
 raise exception 'Ya existe un producto activo con ese nombre en la categoría';
end $fn$;
revoke all on function public.gestlok_torcuato_conteo_save_product_pack(text,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_torcuato_conteo_save_product_pack(text,text,integer,text,text) to authenticated;
CREATE OR REPLACE FUNCTION public.gestlok_torcuato_conteo_set_cell(p_day date, p_shift text, p_product text, p_index integer, p_chapas integer DEFAULT 0, p_sueltas integer DEFAULT 0, p_qty integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r gestlok_torcuato_conteo_private.shifts%rowtype; per integer; new_cell jsonb;
begin
 perform gestlok_torcuato_conteo_private.require_access(true,false);
 if p_day is null or p_day < date '2025-01-01' or p_day > (now() at time zone 'America/Argentina/Buenos_Aires')::date + 1
   or p_shift not in ('manana_entrada','manana_salida','noche_salida') or p_index not between 1 and 4
   or p_chapas not between 0 and 500 or p_sueltas not between 0 and 100000 or p_qty not between 0 and 1000000 then
   raise exception 'Cantidad, fecha o turno no válido';
 end if;
 select units_per_chapa into per from gestlok_torcuato_conteo_private.products where id=p_product and active=true;
 if per is null then raise exception 'Producto no disponible'; end if;
 insert into gestlok_torcuato_conteo_private.shifts(day,shift) values(p_day,p_shift) on conflict do nothing;
 select * into r from gestlok_torcuato_conteo_private.shifts where day=p_day and shift=p_shift for update;
 per:=coalesce((r.pack_units->>p_product)::integer,per);
 if per>0 and p_qty<>0 then raise exception 'El pack usa cajas/chapas y unidades sueltas'; end if;
 if per=0 and (p_chapas<>0 or p_sueltas<>0) then raise exception 'Este producto usa unidades'; end if;
 if r.status='finalizado' then raise exception 'Este conteo ya fue finalizado'; end if;
 new_cell:=jsonb_build_object('chapas',p_chapas,'sueltas',p_sueltas,'qty',p_qty);
 update gestlok_torcuato_conteo_private.shifts set
  data=jsonb_set(r.data,array[p_product],coalesce(r.data->p_product,'{}'::jsonb)||jsonb_build_object('v'||p_index,new_cell),true),
  updated_by=auth.uid(),updated_at=now()
 where day=p_day and shift=p_shift;
 return jsonb_build_object('ok',true,'updated_at',now());
end $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_torcuato_conteo_set_decomiso(p_day date, p_shift text, p_product text, p_chapas integer DEFAULT 0, p_sueltas integer DEFAULT 0, p_qty integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r gestlok_torcuato_conteo_private.shifts%rowtype; per integer;
BEGIN
  PERFORM gestlok_torcuato_conteo_private.require_access(true,false);
  IF p_day IS NULL OR p_day < date '2025-01-01'
    OR p_day > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 1
    OR p_shift NOT IN ('manana_entrada','manana_salida','noche_salida')
    OR p_product IS NULL OR p_chapas NOT BETWEEN 0 AND 500
    OR p_sueltas NOT BETWEEN 0 AND 100000 OR p_qty NOT BETWEEN 0 AND 1000000
  THEN RAISE EXCEPTION 'Decomiso no válido'; END IF;
  SELECT units_per_chapa INTO per FROM gestlok_torcuato_conteo_private.products
    WHERE id=p_product AND active;
  IF per IS NULL THEN RAISE EXCEPTION 'Producto no disponible'; END IF;
  INSERT INTO gestlok_torcuato_conteo_private.shifts(day,shift) VALUES(p_day,p_shift)
    ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM gestlok_torcuato_conteo_private.shifts
    WHERE day=p_day AND shift=p_shift FOR UPDATE;
  per:=coalesce((r.pack_units->>p_product)::integer,per);
  IF (per>0 AND p_qty<>0) OR (per=0 AND (p_chapas<>0 OR p_sueltas<>0))
  THEN RAISE EXCEPTION 'Formato de decomiso no válido para este producto'; END IF;
  IF r.status='finalizado' THEN RAISE EXCEPTION 'El conteo está finalizado'; END IF;
  IF NOT r.decomiso_visible THEN RAISE EXCEPTION 'Primero activá Decomiso'; END IF;
  UPDATE gestlok_torcuato_conteo_private.shifts SET
     decomiso=jsonb_set(r.decomiso,ARRAY[p_product],
       jsonb_build_object('chapas',p_chapas,'sueltas',p_sueltas,'qty',p_qty),true),
     updated_by=auth.uid(),updated_at=now()
     WHERE day=p_day AND shift=p_shift;
  RETURN jsonb_build_object('ok',true);
END $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_torcuato_conteo_correct_closed(p_day date, p_shift text, p_kind text, p_product text, p_index integer, p_value jsonb, p_expected jsonb, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 r gestlok_torcuato_conteo_private.shifts%rowtype;
 per integer;
 chapas integer;
 sueltas integer;
 qty integer;
 old_value jsonb;
 new_value jsonb;
 item jsonb;
 changed_id bigint;
 mail text;
begin
 perform gestlok_torcuato_conteo_private.require_access(true,false);
 if p_day is null or p_day<date '2025-01-01'
  or p_day>(now() at time zone 'America/Argentina/Buenos_Aires')::date+1
  or p_shift not in ('manana_entrada','manana_salida','noche_salida')
  or p_reason is null or length(trim(p_reason)) not between 8 and 300 then
  raise exception 'Fecha, turno o motivo de corrección inválido';
 end if;
 select * into r from gestlok_torcuato_conteo_private.shifts
  where day=p_day and shift=p_shift for update;
 if not found or r.status<>'finalizado' then
  raise exception 'Solo se pueden corregir turnos finalizados existentes';
 end if;
 if p_kind in ('cell','decomiso') then
  select coalesce((r.pack_units->>p_product)::integer,units_per_chapa) into per from gestlok_torcuato_conteo_private.products where id=p_product;
  if per is null or jsonb_typeof(p_value)<>'object'
   or not (p_value ?& array['chapas','sueltas','qty']) then
   raise exception 'Producto o cantidad no válida';
  end if;
  if p_kind='cell' and p_index not between 1 and 4 then
   raise exception 'El vencimiento debe ser del 1 al 4';
  end if;
  if p_kind='decomiso' and p_index is distinct from 0 then
   raise exception 'El decomiso requiere índice cero';
  end if;
  chapas:=(p_value->>'chapas')::integer;
  sueltas:=(p_value->>'sueltas')::integer;
  qty:=(p_value->>'qty')::integer;
  if chapas is null or sueltas is null or qty is null
   or chapas not between 0 and 500 or sueltas not between 0 and 100000
   or qty not between 0 and 1000000
   or (per>0 and qty<>0) or (per=0 and (chapas<>0 or sueltas<>0)) then
   raise exception 'La cantidad es inválida para este producto';
  end if;
  new_value:=jsonb_build_object('chapas',chapas,'sueltas',sueltas,'qty',qty);
  if p_kind='cell' then
   old_value:=coalesce(r.data#>array[p_product,'v'||p_index],'null'::jsonb);
  else
   old_value:=coalesce(r.decomiso->p_product,'null'::jsonb);
  end if;
 elsif p_kind='responsable' then
  if jsonb_typeof(p_value)<>'string' or trim(p_value#>>'{}') not in ('Cami','Caro','Gabi') then
   raise exception 'Responsable no autorizado';
  end if;
  new_value:=to_jsonb(trim(p_value#>>'{}'));
  old_value:=coalesce(to_jsonb(r.responsable),'null'::jsonb);
  if p_product is not null or p_index is not null then
   raise exception 'Parámetros no válidos para responsable';
  end if;
 elsif p_kind in ('consumption','waste') then
  if jsonb_typeof(p_value)<>'array' or jsonb_array_length(p_value)>(case when p_kind='consumption' then 10 else 60 end) then
   raise exception 'Listado de consumos o desperdicios inválido';
  end if;
  for item in select value from jsonb_array_elements(p_value) loop
   if jsonb_typeof(item)<>'object'
    or jsonb_typeof(item->'name')<>'string'
    or jsonb_typeof(item->'value')<>'string'
    or length(item->>'name')>90 or length(item->>'value')>90 then
    raise exception 'Fila de consumos o desperdicios inválida';
   end if;
  end loop;
  if p_product is not null or p_index is not null then
   raise exception 'Parámetros no válidos para listado';
  end if;
  new_value:=p_value;
  old_value:=case when p_kind='consumption' then r.consumption else r.waste end;
 else
  raise exception 'Tipo de corrección no permitido';
 end if;
 if old_value is distinct from coalesce(p_expected,'null'::jsonb) then
  raise exception 'Otro usuario modificó este dato. Actualizá el historial antes de corregirlo.'
   using errcode='40001';
 end if;
 if old_value=new_value then
  raise exception 'No hay cambios que guardar';
 end if;
 if p_kind='cell' then
  update gestlok_torcuato_conteo_private.shifts set
   data=jsonb_set(r.data,array[p_product],
    coalesce(r.data->p_product,'{}'::jsonb)||jsonb_build_object('v'||p_index,new_value),true),
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 elsif p_kind='decomiso' then
  update gestlok_torcuato_conteo_private.shifts set
   decomiso=jsonb_set(r.decomiso,array[p_product],new_value,true),
   decomiso_visible=(r.decomiso_visible or chapas>0 or sueltas>0 or qty>0),
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 elsif p_kind='responsable' then
  update gestlok_torcuato_conteo_private.shifts set responsable=trim(p_value#>>'{}'),
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 elsif p_kind='consumption' then
  update gestlok_torcuato_conteo_private.shifts set consumption=new_value,updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 else
  update gestlok_torcuato_conteo_private.shifts set waste=new_value,waste_visible=true,
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 end if;
 select email into mail from auth.users where id=auth.uid();
 insert into gestlok_torcuato_conteo_private.closed_corrections(
  day,shift,kind,product_id,expiry_index,before_value,after_value,reason,actor_id,actor_email)
 values(p_day,p_shift,p_kind,p_product,p_index,old_value,new_value,trim(p_reason),auth.uid(),mail)
 returning id into changed_id;
 return jsonb_build_object('ok',true,'correction_id',changed_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_torcuato_conteo_sin_stock(p_day date, p_shift text, p_product text, p_sin_stock boolean, p_expected boolean DEFAULT false, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 r gestlok_torcuato_conteo_private.shifts%rowtype;
 rate integer;
 previous boolean;
 email text;
 correction_id bigint;
begin
 perform gestlok_torcuato_conteo_private.require_access(true,false);
 if p_day is null or p_day < date '2025-01-01'
  or p_day > (now() at time zone 'America/Argentina/Buenos_Aires')::date+1
  or p_shift not in ('manana_entrada','manana_salida','noche_salida')
  or p_product is null or p_sin_stock is null or p_expected is null then
  raise exception 'Fecha, turno o producto de Sin stock inválido';
 end if;
 select units_per_chapa into rate from gestlok_torcuato_conteo_private.products
 where id=p_product;
 if rate is null then raise exception 'Producto inexistente'; end if;

 select * into r from gestlok_torcuato_conteo_private.shifts
 where day=p_day and shift=p_shift for update;
 if not found then
  if not p_sin_stock then raise exception 'No hay una marca Sin stock que modificar'; end if;
  insert into gestlok_torcuato_conteo_private.shifts (day,shift) values (p_day,p_shift)
   on conflict do nothing;
  select * into r from gestlok_torcuato_conteo_private.shifts
   where day=p_day and shift=p_shift for update;
 end if;
 rate:=coalesce((r.pack_units->>p_product)::integer,rate);
 previous=coalesce((r.data->p_product->>'sin_stock')::boolean,false);
 if previous is distinct from p_expected then
  raise exception 'Otro usuario modificó este producto. Actualizá el conteo.'
   using errcode='40001';
 end if;
 if previous=p_sin_stock then
  raise exception 'No hay cambios de Sin stock para guardar';
 end if;
 if p_sin_stock and gestlok_torcuato_conteo_private.product_total(r.data,r.decomiso,p_product,rate)>0 then
  raise exception 'No se puede marcar Sin stock: el producto tiene unidades registradas';
 end if;
 if r.status='finalizado' and
  (p_reason is null or length(trim(p_reason)) not between 8 and 300) then
  raise exception 'Los conteos cerrados requieren motivo de corrección (8 a 300 caracteres)';
 end if;

 update gestlok_torcuato_conteo_private.shifts
 set data=jsonb_set(r.data,array[p_product],
       coalesce(r.data->p_product,'{}'::jsonb)||
       jsonb_build_object('sin_stock',p_sin_stock),true),
     updated_by=auth.uid(),updated_at=now()
 where day=p_day and shift=p_shift;
 if r.status='finalizado' then
  select u.email into email from auth.users u where u.id=auth.uid();
  insert into gestlok_torcuato_conteo_private.closed_corrections
   (day,shift,kind,product_id,expiry_index,before_value,after_value,
    reason,actor_id,actor_email)
  values(p_day,p_shift,'sin_stock',p_product,null,to_jsonb(previous),to_jsonb(p_sin_stock),
   trim(p_reason),auth.uid(),email)
  returning id into correction_id;
 end if;
 return jsonb_build_object('ok',true,'sin_stock',p_sin_stock,
    'closed_correction_id',correction_id);
end $function$
;
CREATE OR REPLACE FUNCTION gestlok_torcuato_conteo_private.normalize_manual_sin_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare item record; rate integer;
begin
 for item in
  select key as product_id from jsonb_each(new.data)
  where jsonb_typeof(value)='object' and value->>'sin_stock'='true'
 loop
  select coalesce((new.pack_units->>item.product_id)::integer,units_per_chapa) into rate from gestlok_torcuato_conteo_private.products where id=item.product_id;
  if rate is null or gestlok_torcuato_conteo_private.product_total(new.data,new.decomiso,item.product_id,rate)>0 then
   new.data=jsonb_set(new.data,array[item.product_id],
    coalesce(new.data->item.product_id,'{}'::jsonb)-'sin_stock',true);
  end if;
 end loop;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION gestlok_torcuato_conteo_private.comparison_rows(p_day date)
 RETURNS TABLE(product_id text, section text, product_name text, product_position integer, night_total bigint, morning_total bigint, night_updated_at timestamp with time zone, acknowledged boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select p.id,p.section,p.name,p.position,
  gestlok_torcuato_conteo_private.product_total(b.data,b.decomiso,p.id,coalesce((b.pack_units->>p.id)::integer,p.units_per_chapa)) night_total,
  gestlok_torcuato_conteo_private.product_total(m.data,m.decomiso,p.id,coalesce((m.pack_units->>p.id)::integer,p.units_per_chapa)) morning_total,
  b.updated_at,
  coalesce(a.night_total=gestlok_torcuato_conteo_private.product_total(b.data,b.decomiso,p.id,coalesce((b.pack_units->>p.id)::integer,p.units_per_chapa))
   and a.morning_total=gestlok_torcuato_conteo_private.product_total(m.data,m.decomiso,p.id,coalesce((m.pack_units->>p.id)::integer,p.units_per_chapa))
   and a.night_updated_at=b.updated_at,false) acknowledged
 from gestlok_torcuato_conteo_private.products p
 left join gestlok_torcuato_conteo_private.shifts b
  on b.day=p_day-1
  and b.shift=(case when false then 'manana_entrada' else 'noche_salida' end)
  and b.status='finalizado'
 left join gestlok_torcuato_conteo_private.shifts m
  on m.day=p_day and m.shift='manana_entrada'
 left join gestlok_torcuato_conteo_private.morning_reconciliations a
  on a.day=p_day and a.product_id=p.id
 where p.active
  or coalesce(b.data,'{}'::jsonb) ? p.id
  or coalesce(b.decomiso,'{}'::jsonb) ? p.id
  or coalesce(m.data,'{}'::jsonb) ? p.id
  or coalesce(m.decomiso,'{}'::jsonb) ? p.id
 order by case when upper(p.section) like '%EMPANADA%' then 0
  when upper(p.section) like '%PIZZA%' then 1 else 2 end,
 p.position,p.id;
$function$
;
 then 'caja'
 else 'pack' end
where pack_label='pack';
alter table gestlok_torcuato_conteo_private.products drop constraint if exists products_units_per_chapa_check;
alter table gestlok_torcuato_conteo_private.products add constraint products_units_per_chapa_check
 check (units_per_chapa between 0 and 1000);
alter table gestlok_torcuato_conteo_private.products drop constraint if exists products_pack_label_check;
alter table gestlok_torcuato_conteo_private.products add constraint products_pack_label_check
 check (pack_label in ('unidad','caja','pack','chapa') and
 ((units_per_chapa=0 and pack_label='unidad') or
 (units_per_chapa>0 and pack_label<>'unidad')));

alter table gestlok_torcuato_conteo_private.shifts add column if not exists pack_units jsonb not null default '{}'::jsonb
 check (jsonb_typeof(pack_units)='object');
alter table gestlok_torcuato_conteo_private.shifts add column if not exists pack_labels jsonb not null default '{}'::jsonb
 check (jsonb_typeof(pack_labels)='object');
-- La equivalencia anterior de cada producto queda fijada, sin tocar data/decomiso.
update gestlok_torcuato_conteo_private.shifts s set pack_units=coalesce((
  select jsonb_object_agg(k.id,p.units_per_chapa)
  from (
   select key as id from jsonb_object_keys(s.data) as key
   union select key as id from jsonb_object_keys(s.decomiso) as key
  ) k join gestlok_torcuato_conteo_private.products p on p.id=k.id
 ),'{}'::jsonb)
where s.pack_units='{}'::jsonb and (s.data<>'{}'::jsonb or s.decomiso<>'{}'::jsonb);
-- Etiquetas históricas de cada pack.
update gestlok_torcuato_conteo_private.shifts s set pack_labels=coalesce((
  select jsonb_object_agg(k.id,p.pack_label)
  from (select key as id from jsonb_object_keys(s.pack_units) as key) k
  join gestlok_torcuato_conteo_private.products p on p.id=k.id
 ),'{}'::jsonb)
where s.pack_labels='{}'::jsonb and s.pack_units<>'{}'::jsonb;

create or replace function gestlok_torcuato_conteo_private.preserve_pack_units()
returns trigger language plpgsql set search_path='' as $fn$
declare v_id text;v_per integer;v_label text;
begin
 for v_id in select key from (
  select key from jsonb_object_keys(new.data) as key
  union select key from jsonb_object_keys(new.decomiso) as key
 ) q loop
   if not new.pack_units ? v_id then
     select p.units_per_chapa into v_per from gestlok_torcuato_conteo_private.products p where p.id=v_id;
     if v_per is not null then
       new.pack_units:=jsonb_set(new.pack_units,array[v_id],to_jsonb(v_per),true);
     end if;
   end if;
   if not new.pack_labels ? v_id then
     select p.pack_label into v_label from gestlok_torcuato_conteo_private.products p where p.id=v_id;
     if v_label is not null then new.pack_labels:=jsonb_set(new.pack_labels,array[v_id],to_jsonb(v_label),true); end if;
   end if;
 end loop;
 return new;
end $fn$;
drop trigger if exists torcuato_conteo_keep_pack_units on gestlok_torcuato_conteo_private.shifts;
create trigger torcuato_conteo_keep_pack_units
before insert or update of data,decomiso on gestlok_torcuato_conteo_private.shifts
for each row execute function gestlok_torcuato_conteo_private.preserve_pack_units();

create table if not exists gestlok_torcuato_conteo_private.product_pack_audit(
 id bigint generated always as identity primary key,
 product_id text not null,old_units integer,new_units integer not null,
 old_label text,new_label text not null,actor uuid not null,
 updated_at timestamptz not null default now()
);
alter table gestlok_torcuato_conteo_private.product_pack_audit enable row level security;
revoke all on gestlok_torcuato_conteo_private.product_pack_audit from public,anon,authenticated;

create or replace function public.gestlok_torcuato_conteo_save_product_pack(
 p_section text,p_name text,p_units_per_pack integer,p_pack_label text,p_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_role text;v_section text:=btrim(coalesce(p_section,''));v_name text:=btrim(coalesce(p_name,''));
 v_label text:=lower(btrim(coalesce(p_pack_label,'')));v_product gestlok_torcuato_conteo_private.products%rowtype;
 v_before integer;v_oldlabel text;v_position integer;
begin
 -- Verificación en backend de usuario, tenant y sucursal.
 perform gestlok_torcuato_conteo_private.require_access(false,false);
 v_role:=public.mi_rol();
 if v_role not in ('creadora','dueno','gerente')
   or (v_role='gerente' and not public.puede_editar_local('torcuato')) then
   raise exception 'Sin permiso para modificar productos de Don Torcuato' using errcode='42501';
 end if;
 if char_length(v_section) not between 3 and 70 or char_length(v_name) not between 1 and 100
   or p_units_per_pack is null or p_units_per_pack not between 0 and 1000
   or v_label not in ('unidad','caja','pack','chapa')
   or (p_units_per_pack=0 and v_label<>'unidad')
   or (p_units_per_pack>0 and v_label='unidad') then
   raise exception 'Definí unidades o un pack cerrado con 1 a 1000 unidades' using errcode='22023';
 end if;
 if not exists(select 1 from gestlok_torcuato_conteo_private.categories where name=v_section) then
   raise exception 'Categoría no encontrada en Don Torcuato' using errcode='22023';
 end if;
 if p_id is null then
   if exists(select 1 from gestlok_torcuato_conteo_private.products where active and section=v_section and lower(btrim(name))=lower(v_name)) then
     raise exception 'Ya existe un producto con ese nombre en esta categoría' using errcode='23505';
   end if;
   select coalesce(max(position)+1,(select c.position+1 from gestlok_torcuato_conteo_private.categories c where c.name=v_section),1)
   into v_position from gestlok_torcuato_conteo_private.products where section=v_section;
   insert into gestlok_torcuato_conteo_private.products(id,section,name,units_per_chapa,pack_label,position,active)
    values('nuevo-'||replace(gen_random_uuid()::text,'-',''),v_section,v_name,p_units_per_pack,v_label,v_position,true)
    returning * into v_product;
   v_before:=null;v_oldlabel:=null;
 else
   select * into v_product from gestlok_torcuato_conteo_private.products where id=p_id and active for update;
   if not found then raise exception 'Producto no encontrado' using errcode='22023'; end if;
   if v_product.section<>v_section or v_product.name<>v_name then
     raise exception 'El producto cambió. Actualizá y volvé a intentar.' using errcode='40001';
   end if;
   v_before:=v_product.units_per_chapa;v_oldlabel:=v_product.pack_label;
   update gestlok_torcuato_conteo_private.products set units_per_chapa=p_units_per_pack,pack_label=v_label where id=p_id
    returning * into v_product;
 end if;
 if v_before is distinct from p_units_per_pack or v_oldlabel is distinct from v_label then
   insert into gestlok_torcuato_conteo_private.product_pack_audit(product_id,old_units,new_units,old_label,new_label,actor)
   values(v_product.id,v_before,p_units_per_pack,v_oldlabel,v_label,auth.uid());
 end if;
 return jsonb_build_object('ok',true,'product',to_jsonb(v_product),
   'old_units',v_before,'new_units',p_units_per_pack);
exception when unique_violation then
 raise exception 'Ya existe un producto activo con ese nombre en la categoría';
end $fn$;
revoke all on function public.gestlok_torcuato_conteo_save_product_pack(text,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_torcuato_conteo_save_product_pack(text,text,integer,text,text) to authenticated;
CREATE OR REPLACE FUNCTION public.gestlok_torcuato_conteo_set_cell(p_day date, p_shift text, p_product text, p_index integer, p_chapas integer DEFAULT 0, p_sueltas integer DEFAULT 0, p_qty integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r gestlok_torcuato_conteo_private.shifts%rowtype; per integer; new_cell jsonb;
begin
 perform gestlok_torcuato_conteo_private.require_access(true,false);
 if p_day is null or p_day < date '2025-01-01' or p_day > (now() at time zone 'America/Argentina/Buenos_Aires')::date + 1
   or p_shift not in ('manana_entrada','manana_salida','noche_salida') or p_index not between 1 and 4
   or p_chapas not between 0 and 500 or p_sueltas not between 0 and 100000 or p_qty not between 0 and 1000000 then
   raise exception 'Cantidad, fecha o turno no válido';
 end if;
 select units_per_chapa into per from gestlok_torcuato_conteo_private.products where id=p_product and active=true;
 if per is null then raise exception 'Producto no disponible'; end if;
 insert into gestlok_torcuato_conteo_private.shifts(day,shift) values(p_day,p_shift) on conflict do nothing;
 select * into r from gestlok_torcuato_conteo_private.shifts where day=p_day and shift=p_shift for update;
 per:=coalesce((r.pack_units->>p_product)::integer,per);
 if per>0 and p_qty<>0 then raise exception 'El pack usa cajas/chapas y unidades sueltas'; end if;
 if per=0 and (p_chapas<>0 or p_sueltas<>0) then raise exception 'Este producto usa unidades'; end if;
 if r.status='finalizado' then raise exception 'Este conteo ya fue finalizado'; end if;
 new_cell:=jsonb_build_object('chapas',p_chapas,'sueltas',p_sueltas,'qty',p_qty);
 update gestlok_torcuato_conteo_private.shifts set
  data=jsonb_set(r.data,array[p_product],coalesce(r.data->p_product,'{}'::jsonb)||jsonb_build_object('v'||p_index,new_cell),true),
  updated_by=auth.uid(),updated_at=now()
 where day=p_day and shift=p_shift;
 return jsonb_build_object('ok',true,'updated_at',now());
end $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_torcuato_conteo_set_decomiso(p_day date, p_shift text, p_product text, p_chapas integer DEFAULT 0, p_sueltas integer DEFAULT 0, p_qty integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r gestlok_torcuato_conteo_private.shifts%rowtype; per integer;
BEGIN
  PERFORM gestlok_torcuato_conteo_private.require_access(true,false);
  IF p_day IS NULL OR p_day < date '2025-01-01'
    OR p_day > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 1
    OR p_shift NOT IN ('manana_entrada','manana_salida','noche_salida')
    OR p_product IS NULL OR p_chapas NOT BETWEEN 0 AND 500
    OR p_sueltas NOT BETWEEN 0 AND 100000 OR p_qty NOT BETWEEN 0 AND 1000000
  THEN RAISE EXCEPTION 'Decomiso no válido'; END IF;
  SELECT units_per_chapa INTO per FROM gestlok_torcuato_conteo_private.products
    WHERE id=p_product AND active;
  IF per IS NULL THEN RAISE EXCEPTION 'Producto no disponible'; END IF;
  INSERT INTO gestlok_torcuato_conteo_private.shifts(day,shift) VALUES(p_day,p_shift)
    ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM gestlok_torcuato_conteo_private.shifts
    WHERE day=p_day AND shift=p_shift FOR UPDATE;
  per:=coalesce((r.pack_units->>p_product)::integer,per);
  IF (per>0 AND p_qty<>0) OR (per=0 AND (p_chapas<>0 OR p_sueltas<>0))
  THEN RAISE EXCEPTION 'Formato de decomiso no válido para este producto'; END IF;
  IF r.status='finalizado' THEN RAISE EXCEPTION 'El conteo está finalizado'; END IF;
  IF NOT r.decomiso_visible THEN RAISE EXCEPTION 'Primero activá Decomiso'; END IF;
  UPDATE gestlok_torcuato_conteo_private.shifts SET
     decomiso=jsonb_set(r.decomiso,ARRAY[p_product],
       jsonb_build_object('chapas',p_chapas,'sueltas',p_sueltas,'qty',p_qty),true),
     updated_by=auth.uid(),updated_at=now()
     WHERE day=p_day AND shift=p_shift;
  RETURN jsonb_build_object('ok',true);
END $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_torcuato_conteo_correct_closed(p_day date, p_shift text, p_kind text, p_product text, p_index integer, p_value jsonb, p_expected jsonb, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 r gestlok_torcuato_conteo_private.shifts%rowtype;
 per integer;
 chapas integer;
 sueltas integer;
 qty integer;
 old_value jsonb;
 new_value jsonb;
 item jsonb;
 changed_id bigint;
 mail text;
begin
 perform gestlok_torcuato_conteo_private.require_access(true,false);
 if p_day is null or p_day<date '2025-01-01'
  or p_day>(now() at time zone 'America/Argentina/Buenos_Aires')::date+1
  or p_shift not in ('manana_entrada','manana_salida','noche_salida')
  or p_reason is null or length(trim(p_reason)) not between 8 and 300 then
  raise exception 'Fecha, turno o motivo de corrección inválido';
 end if;
 select * into r from gestlok_torcuato_conteo_private.shifts
  where day=p_day and shift=p_shift for update;
 if not found or r.status<>'finalizado' then
  raise exception 'Solo se pueden corregir turnos finalizados existentes';
 end if;
 if p_kind in ('cell','decomiso') then
  select coalesce((r.pack_units->>p_product)::integer,units_per_chapa) into per from gestlok_torcuato_conteo_private.products where id=p_product;
  if per is null or jsonb_typeof(p_value)<>'object'
   or not (p_value ?& array['chapas','sueltas','qty']) then
   raise exception 'Producto o cantidad no válida';
  end if;
  if p_kind='cell' and p_index not between 1 and 4 then
   raise exception 'El vencimiento debe ser del 1 al 4';
  end if;
  if p_kind='decomiso' and p_index is distinct from 0 then
   raise exception 'El decomiso requiere índice cero';
  end if;
  chapas:=(p_value->>'chapas')::integer;
  sueltas:=(p_value->>'sueltas')::integer;
  qty:=(p_value->>'qty')::integer;
  if chapas is null or sueltas is null or qty is null
   or chapas not between 0 and 500 or sueltas not between 0 and 100000
   or qty not between 0 and 1000000
   or (per>0 and qty<>0) or (per=0 and (chapas<>0 or sueltas<>0)) then
   raise exception 'La cantidad es inválida para este producto';
  end if;
  new_value:=jsonb_build_object('chapas',chapas,'sueltas',sueltas,'qty',qty);
  if p_kind='cell' then
   old_value:=coalesce(r.data#>array[p_product,'v'||p_index],'null'::jsonb);
  else
   old_value:=coalesce(r.decomiso->p_product,'null'::jsonb);
  end if;
 elsif p_kind='responsable' then
  if jsonb_typeof(p_value)<>'string' or trim(p_value#>>'{}') not in ('Cami','Caro','Gabi') then
   raise exception 'Responsable no autorizado';
  end if;
  new_value:=to_jsonb(trim(p_value#>>'{}'));
  old_value:=coalesce(to_jsonb(r.responsable),'null'::jsonb);
  if p_product is not null or p_index is not null then
   raise exception 'Parámetros no válidos para responsable';
  end if;
 elsif p_kind in ('consumption','waste') then
  if jsonb_typeof(p_value)<>'array' or jsonb_array_length(p_value)>(case when p_kind='consumption' then 10 else 60 end) then
   raise exception 'Listado de consumos o desperdicios inválido';
  end if;
  for item in select value from jsonb_array_elements(p_value) loop
   if jsonb_typeof(item)<>'object'
    or jsonb_typeof(item->'name')<>'string'
    or jsonb_typeof(item->'value')<>'string'
    or length(item->>'name')>90 or length(item->>'value')>90 then
    raise exception 'Fila de consumos o desperdicios inválida';
   end if;
  end loop;
  if p_product is not null or p_index is not null then
   raise exception 'Parámetros no válidos para listado';
  end if;
  new_value:=p_value;
  old_value:=case when p_kind='consumption' then r.consumption else r.waste end;
 else
  raise exception 'Tipo de corrección no permitido';
 end if;
 if old_value is distinct from coalesce(p_expected,'null'::jsonb) then
  raise exception 'Otro usuario modificó este dato. Actualizá el historial antes de corregirlo.'
   using errcode='40001';
 end if;
 if old_value=new_value then
  raise exception 'No hay cambios que guardar';
 end if;
 if p_kind='cell' then
  update gestlok_torcuato_conteo_private.shifts set
   data=jsonb_set(r.data,array[p_product],
    coalesce(r.data->p_product,'{}'::jsonb)||jsonb_build_object('v'||p_index,new_value),true),
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 elsif p_kind='decomiso' then
  update gestlok_torcuato_conteo_private.shifts set
   decomiso=jsonb_set(r.decomiso,array[p_product],new_value,true),
   decomiso_visible=(r.decomiso_visible or chapas>0 or sueltas>0 or qty>0),
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 elsif p_kind='responsable' then
  update gestlok_torcuato_conteo_private.shifts set responsable=trim(p_value#>>'{}'),
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 elsif p_kind='consumption' then
  update gestlok_torcuato_conteo_private.shifts set consumption=new_value,updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 else
  update gestlok_torcuato_conteo_private.shifts set waste=new_value,waste_visible=true,
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
 end if;
 select email into mail from auth.users where id=auth.uid();
 insert into gestlok_torcuato_conteo_private.closed_corrections(
  day,shift,kind,product_id,expiry_index,before_value,after_value,reason,actor_id,actor_email)
 values(p_day,p_shift,p_kind,p_product,p_index,old_value,new_value,trim(p_reason),auth.uid(),mail)
 returning id into changed_id;
 return jsonb_build_object('ok',true,'correction_id',changed_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_torcuato_conteo_sin_stock(p_day date, p_shift text, p_product text, p_sin_stock boolean, p_expected boolean DEFAULT false, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 r gestlok_torcuato_conteo_private.shifts%rowtype;
 rate integer;
 previous boolean;
 email text;
 correction_id bigint;
begin
 perform gestlok_torcuato_conteo_private.require_access(true,false);
 if p_day is null or p_day < date '2025-01-01'
  or p_day > (now() at time zone 'America/Argentina/Buenos_Aires')::date+1
  or p_shift not in ('manana_entrada','manana_salida','noche_salida')
  or p_product is null or p_sin_stock is null or p_expected is null then
  raise exception 'Fecha, turno o producto de Sin stock inválido';
 end if;
 select units_per_chapa into rate from gestlok_torcuato_conteo_private.products
 where id=p_product;
 if rate is null then raise exception 'Producto inexistente'; end if;

 select * into r from gestlok_torcuato_conteo_private.shifts
 where day=p_day and shift=p_shift for update;
 if not found then
  if not p_sin_stock then raise exception 'No hay una marca Sin stock que modificar'; end if;
  insert into gestlok_torcuato_conteo_private.shifts (day,shift) values (p_day,p_shift)
   on conflict do nothing;
  select * into r from gestlok_torcuato_conteo_private.shifts
   where day=p_day and shift=p_shift for update;
 end if;
 rate:=coalesce((r.pack_units->>p_product)::integer,rate);
 previous=coalesce((r.data->p_product->>'sin_stock')::boolean,false);
 if previous is distinct from p_expected then
  raise exception 'Otro usuario modificó este producto. Actualizá el conteo.'
   using errcode='40001';
 end if;
 if previous=p_sin_stock then
  raise exception 'No hay cambios de Sin stock para guardar';
 end if;
 if p_sin_stock and gestlok_torcuato_conteo_private.product_total(r.data,r.decomiso,p_product,rate)>0 then
  raise exception 'No se puede marcar Sin stock: el producto tiene unidades registradas';
 end if;
 if r.status='finalizado' and
  (p_reason is null or length(trim(p_reason)) not between 8 and 300) then
  raise exception 'Los conteos cerrados requieren motivo de corrección (8 a 300 caracteres)';
 end if;

 update gestlok_torcuato_conteo_private.shifts
 set data=jsonb_set(r.data,array[p_product],
       coalesce(r.data->p_product,'{}'::jsonb)||
       jsonb_build_object('sin_stock',p_sin_stock),true),
     updated_by=auth.uid(),updated_at=now()
 where day=p_day and shift=p_shift;
 if r.status='finalizado' then
  select u.email into email from auth.users u where u.id=auth.uid();
  insert into gestlok_torcuato_conteo_private.closed_corrections
   (day,shift,kind,product_id,expiry_index,before_value,after_value,
    reason,actor_id,actor_email)
  values(p_day,p_shift,'sin_stock',p_product,null,to_jsonb(previous),to_jsonb(p_sin_stock),
   trim(p_reason),auth.uid(),email)
  returning id into correction_id;
 end if;
 return jsonb_build_object('ok',true,'sin_stock',p_sin_stock,
    'closed_correction_id',correction_id);
end $function$
;
CREATE OR REPLACE FUNCTION gestlok_torcuato_conteo_private.normalize_manual_sin_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare item record; rate integer;
begin
 for item in
  select key as product_id from jsonb_each(new.data)
  where jsonb_typeof(value)='object' and value->>'sin_stock'='true'
 loop
  select coalesce((new.pack_units->>item.product_id)::integer,units_per_chapa) into rate from gestlok_torcuato_conteo_private.products where id=item.product_id;
  if rate is null or gestlok_torcuato_conteo_private.product_total(new.data,new.decomiso,item.product_id,rate)>0 then
   new.data=jsonb_set(new.data,array[item.product_id],
    coalesce(new.data->item.product_id,'{}'::jsonb)-'sin_stock',true);
  end if;
 end loop;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION gestlok_torcuato_conteo_private.comparison_rows(p_day date)
 RETURNS TABLE(product_id text, section text, product_name text, product_position integer, night_total bigint, morning_total bigint, night_updated_at timestamp with time zone, acknowledged boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select p.id,p.section,p.name,p.position,
  gestlok_torcuato_conteo_private.product_total(b.data,b.decomiso,p.id,coalesce((b.pack_units->>p.id)::integer,p.units_per_chapa)) night_total,
  gestlok_torcuato_conteo_private.product_total(m.data,m.decomiso,p.id,coalesce((m.pack_units->>p.id)::integer,p.units_per_chapa)) morning_total,
  b.updated_at,
  coalesce(a.night_total=gestlok_torcuato_conteo_private.product_total(b.data,b.decomiso,p.id,coalesce((b.pack_units->>p.id)::integer,p.units_per_chapa))
   and a.morning_total=gestlok_torcuato_conteo_private.product_total(m.data,m.decomiso,p.id,coalesce((m.pack_units->>p.id)::integer,p.units_per_chapa))
   and a.night_updated_at=b.updated_at,false) acknowledged
 from gestlok_torcuato_conteo_private.products p
 left join gestlok_torcuato_conteo_private.shifts b
  on b.day=p_day-1
  and b.shift=(case when false then 'manana_entrada' else 'noche_salida' end)
  and b.status='finalizado'
 left join gestlok_torcuato_conteo_private.shifts m
  on m.day=p_day and m.shift='manana_entrada'
 left join gestlok_torcuato_conteo_private.morning_reconciliations a
  on a.day=p_day and a.product_id=p.id
 where p.active
  or coalesce(b.data,'{}'::jsonb) ? p.id
  or coalesce(b.decomiso,'{}'::jsonb) ? p.id
  or coalesce(m.data,'{}'::jsonb) ? p.id
  or coalesce(m.decomiso,'{}'::jsonb) ? p.id
 order by case when upper(p.section) like '%EMPANADA%' then 0
  when upper(p.section) like '%PIZZA%' then 1 else 2 end,
 p.position,p.id;
$function$
;
