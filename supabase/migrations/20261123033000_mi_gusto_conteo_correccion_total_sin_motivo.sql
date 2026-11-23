-- Conteo Mi Gusto (Munro y Don Torcuato) · correcciones de turnos cerrados.
-- 1) Arregla «record "r" has no field "units_per_pack"»: el alias r de
--    pack_rate_snapshots (migración 20261122224500) chocaba con la variable r
--    del turno en correct_closed y sin_stock. Ahora el alias es ps.
--    Esto también destraba «Sin stock» en el conteo abierto.
-- 2) El motivo (observación) pasa a ser opcional. La auditoría sigue guardando
--    fecha, usuario, valor anterior y valor nuevo.
-- 3) Nueva corrección «total»: se corrige la cantidad total del producto en
--    unidades. Reemplaza el detalle por vencimiento de ese producto (queda en
--    v1 con la marca total_corregido) y respeta el decomiso registrado.
--    El tipo «cell» (por vencimiento) se conserva para pantallas viejas en caché.

-- ===================== MUNRO =====================
alter table gestlok_munro_conteo_private.closed_corrections alter column reason drop not null;
alter table gestlok_munro_conteo_private.closed_corrections drop constraint if exists closed_corrections_reason_check;
alter table gestlok_munro_conteo_private.closed_corrections add constraint closed_corrections_reason_check
 check (reason is null or length(trim(reason)) between 1 and 300);
alter table gestlok_munro_conteo_private.closed_corrections drop constraint if exists closed_corrections_kind_check;
alter table gestlok_munro_conteo_private.closed_corrections add constraint closed_corrections_kind_check
 check (kind in ('cell','total','decomiso','responsable','consumption','waste','sin_stock'));

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
 motivo text;
 total bigint;
 old_total bigint;
 dec_units bigint;
 rest bigint;
 old_product jsonb;
 new_product jsonb;
begin
 perform gestlok_munro_conteo_private.require_access(true,false);
 -- El motivo es opcional: la auditoría conserva fecha, usuario, antes y después.
 motivo:=nullif(trim(coalesce(p_reason,'')),'');
 if p_day is null or p_day<date '2025-01-01'
  or p_day>(now() at time zone 'America/Argentina/Buenos_Aires')::date+1
  or p_shift not in ('manana_entrada','manana_salida','noche_salida')
  or length(coalesce(motivo,''))>300 then
  raise exception 'Fecha, turno o comentario de corrección inválido';
 end if;
 select * into r from gestlok_munro_conteo_private.shifts
  where day=p_day and shift=p_shift for update;
 if not found or r.status<>'finalizado' then
  raise exception 'Solo se pueden corregir turnos finalizados existentes';
 end if;
 if p_kind in ('cell','decomiso','total') then
  -- Alias ps: «r» es la variable del turno (evita «record r has no field units_per_pack»).
  select coalesce((select ps.units_per_pack from gestlok_munro_conteo_private.pack_rate_snapshots ps
    where ps.day=p_day and ps.shift=p_shift and ps.product_id=p_product),p.units_per_chapa)
   into per from gestlok_munro_conteo_private.products p where p.id=p_product;
  if per is null then
   raise exception 'Producto no válido';
  end if;
 end if;

 -- Corrección por cantidad total del producto (sin vencimientos).
 if p_kind='total' then
  if p_index is not null or jsonb_typeof(p_value)<>'object'
   or coalesce(p_value->>'total','') !~ '^[0-9]{1,7}$' then
   raise exception 'Ingresá la cantidad total en unidades (número entero, cero o mayor)';
  end if;
  total:=(p_value->>'total')::bigint;
  if total>1000000 then
   raise exception 'La cantidad total es demasiado grande';
  end if;
  old_product:=r.data->p_product;
  if coalesce(old_product,'null'::jsonb) is distinct from coalesce(p_expected,'null'::jsonb) then
   raise exception 'Otro usuario modificó este dato. Actualizá el historial antes de corregirlo.'
    using errcode='40001';
  end if;
  old_total:=gestlok_munro_conteo_private.product_total(r.data,r.decomiso,p_product,per);
  dec_units:=gestlok_munro_conteo_private.product_total('{}'::jsonb,r.decomiso,p_product,per);
  if total=old_total then
   raise exception 'No hay cambios que guardar';
  end if;
  if total<dec_units then
   raise exception 'El total no puede ser menor que el decomiso registrado (% unidades)',dec_units;
  end if;
  rest:=total-dec_units;
  new_product:=(case when jsonb_typeof(old_product)='object' then old_product else '{}'::jsonb end)
   -'v1'-'v2'-'v3'-'v4'-'total_corregido'
   ||jsonb_build_object('v1',case when per>0
      then jsonb_build_object('chapas',rest/per,'sueltas',rest%per,'qty',0)
      else jsonb_build_object('chapas',0,'sueltas',0,'qty',rest) end,
     'total_corregido',true);
  if total>0 then
   new_product:=new_product-'sin_stock';
  end if;
  update gestlok_munro_conteo_private.shifts set
   data=jsonb_set(coalesce(r.data,'{}'::jsonb),array[p_product],new_product,true),
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
  select email into mail from auth.users where id=auth.uid();
  insert into gestlok_munro_conteo_private.closed_corrections(
   day,shift,kind,product_id,expiry_index,before_value,after_value,reason,actor_id,actor_email)
  values(p_day,p_shift,'total',p_product,null,
   jsonb_build_object('total',old_total,'detalle',coalesce(old_product,'null'::jsonb)),
   jsonb_build_object('total',total,'detalle',new_product),
   motivo,auth.uid(),mail)
  returning id into changed_id;
  return jsonb_build_object('ok',true,'correction_id',changed_id,'total',total);
 end if;

 if p_kind in ('cell','decomiso') then
  if jsonb_typeof(p_value)<>'object'
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
 values(p_day,p_shift,p_kind,p_product,p_index,old_value,new_value,motivo,auth.uid(),mail)
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
 motivo text;
begin
 perform gestlok_munro_conteo_private.require_access(true,false);
 motivo:=nullif(trim(coalesce(p_reason,'')),'');
 if p_day is null or p_day < date '2025-01-01'
  or p_day > (now() at time zone 'America/Argentina/Buenos_Aires')::date+1
  or p_shift not in ('manana_entrada','manana_salida','noche_salida')
  or p_product is null or p_sin_stock is null or p_expected is null
  or length(coalesce(motivo,''))>300 then
  raise exception 'Fecha, turno o producto de Sin stock inválido';
 end if;
 -- Alias ps: «r» es la variable del turno.
 select coalesce((select ps.units_per_pack from gestlok_munro_conteo_private.pack_rate_snapshots ps
   where ps.day=p_day and ps.shift=p_shift and ps.product_id=p_product),p.units_per_chapa)
  into rate from gestlok_munro_conteo_private.products p where p.id=p_product;
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
   motivo,auth.uid(),email)
  returning id into correction_id;
 end if;
 return jsonb_build_object('ok',true,'sin_stock',p_sin_stock,
    'closed_correction_id',correction_id);
end $function$
;

-- ===================== DON TORCUATO =====================
alter table gestlok_torcuato_conteo_private.closed_corrections alter column reason drop not null;
alter table gestlok_torcuato_conteo_private.closed_corrections drop constraint if exists closed_corrections_reason_check;
alter table gestlok_torcuato_conteo_private.closed_corrections add constraint closed_corrections_reason_check
 check (reason is null or length(trim(reason)) between 1 and 300);
alter table gestlok_torcuato_conteo_private.closed_corrections drop constraint if exists closed_corrections_kind_check;
alter table gestlok_torcuato_conteo_private.closed_corrections add constraint closed_corrections_kind_check
 check (kind in ('cell','total','decomiso','responsable','consumption','waste','sin_stock'));

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
 motivo text;
 total bigint;
 old_total bigint;
 dec_units bigint;
 rest bigint;
 old_product jsonb;
 new_product jsonb;
begin
 perform gestlok_torcuato_conteo_private.require_access(true,false);
 -- El motivo es opcional: la auditoría conserva fecha, usuario, antes y después.
 motivo:=nullif(trim(coalesce(p_reason,'')),'');
 if p_day is null or p_day<date '2025-01-01'
  or p_day>(now() at time zone 'America/Argentina/Buenos_Aires')::date+1
  or p_shift not in ('manana_entrada','manana_salida','noche_salida')
  or length(coalesce(motivo,''))>300 then
  raise exception 'Fecha, turno o comentario de corrección inválido';
 end if;
 select * into r from gestlok_torcuato_conteo_private.shifts
  where day=p_day and shift=p_shift for update;
 if not found or r.status<>'finalizado' then
  raise exception 'Solo se pueden corregir turnos finalizados existentes';
 end if;
 if p_kind in ('cell','decomiso','total') then
  -- Alias ps: «r» es la variable del turno (evita «record r has no field units_per_pack»).
  select coalesce((select ps.units_per_pack from gestlok_torcuato_conteo_private.pack_rate_snapshots ps
    where ps.day=p_day and ps.shift=p_shift and ps.product_id=p_product),p.units_per_chapa)
   into per from gestlok_torcuato_conteo_private.products p where p.id=p_product;
  if per is null then
   raise exception 'Producto no válido';
  end if;
 end if;

 -- Corrección por cantidad total del producto (sin vencimientos).
 if p_kind='total' then
  if p_index is not null or jsonb_typeof(p_value)<>'object'
   or coalesce(p_value->>'total','') !~ '^[0-9]{1,7}$' then
   raise exception 'Ingresá la cantidad total en unidades (número entero, cero o mayor)';
  end if;
  total:=(p_value->>'total')::bigint;
  if total>1000000 then
   raise exception 'La cantidad total es demasiado grande';
  end if;
  old_product:=r.data->p_product;
  if coalesce(old_product,'null'::jsonb) is distinct from coalesce(p_expected,'null'::jsonb) then
   raise exception 'Otro usuario modificó este dato. Actualizá el historial antes de corregirlo.'
    using errcode='40001';
  end if;
  old_total:=gestlok_torcuato_conteo_private.product_total(r.data,r.decomiso,p_product,per);
  dec_units:=gestlok_torcuato_conteo_private.product_total('{}'::jsonb,r.decomiso,p_product,per);
  if total=old_total then
   raise exception 'No hay cambios que guardar';
  end if;
  if total<dec_units then
   raise exception 'El total no puede ser menor que el decomiso registrado (% unidades)',dec_units;
  end if;
  rest:=total-dec_units;
  new_product:=(case when jsonb_typeof(old_product)='object' then old_product else '{}'::jsonb end)
   -'v1'-'v2'-'v3'-'v4'-'total_corregido'
   ||jsonb_build_object('v1',case when per>0
      then jsonb_build_object('chapas',rest/per,'sueltas',rest%per,'qty',0)
      else jsonb_build_object('chapas',0,'sueltas',0,'qty',rest) end,
     'total_corregido',true);
  if total>0 then
   new_product:=new_product-'sin_stock';
  end if;
  update gestlok_torcuato_conteo_private.shifts set
   data=jsonb_set(coalesce(r.data,'{}'::jsonb),array[p_product],new_product,true),
   updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift and status='finalizado';
  select email into mail from auth.users where id=auth.uid();
  insert into gestlok_torcuato_conteo_private.closed_corrections(
   day,shift,kind,product_id,expiry_index,before_value,after_value,reason,actor_id,actor_email)
  values(p_day,p_shift,'total',p_product,null,
   jsonb_build_object('total',old_total,'detalle',coalesce(old_product,'null'::jsonb)),
   jsonb_build_object('total',total,'detalle',new_product),
   motivo,auth.uid(),mail)
  returning id into changed_id;
  return jsonb_build_object('ok',true,'correction_id',changed_id,'total',total);
 end if;

 if p_kind in ('cell','decomiso') then
  if jsonb_typeof(p_value)<>'object'
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
 values(p_day,p_shift,p_kind,p_product,p_index,old_value,new_value,motivo,auth.uid(),mail)
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
 motivo text;
begin
 perform gestlok_torcuato_conteo_private.require_access(true,false);
 motivo:=nullif(trim(coalesce(p_reason,'')),'');
 if p_day is null or p_day < date '2025-01-01'
  or p_day > (now() at time zone 'America/Argentina/Buenos_Aires')::date+1
  or p_shift not in ('manana_entrada','manana_salida','noche_salida')
  or p_product is null or p_sin_stock is null or p_expected is null
  or length(coalesce(motivo,''))>300 then
  raise exception 'Fecha, turno o producto de Sin stock inválido';
 end if;
 -- Alias ps: «r» es la variable del turno.
 select coalesce((select ps.units_per_pack from gestlok_torcuato_conteo_private.pack_rate_snapshots ps
   where ps.day=p_day and ps.shift=p_shift and ps.product_id=p_product),p.units_per_chapa)
  into rate from gestlok_torcuato_conteo_private.products p where p.id=p_product;
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
   motivo,auth.uid(),email)
  returning id into correction_id;
 end if;
 return jsonb_build_object('ok',true,'sin_stock',p_sin_stock,
    'closed_correction_id',correction_id);
end $function$
;
