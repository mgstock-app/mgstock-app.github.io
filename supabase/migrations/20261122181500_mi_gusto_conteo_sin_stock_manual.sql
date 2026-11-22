-- Mi Gusto: «Sin stock» es una confirmación MANUAL del gerente.
-- No inferir faltantes a partir de cantidades no registradas o de un 0.
-- La marca se guarda por sucursal, fecha, turno y producto en data[product].sin_stock.
-- Los historiales existentes se mantienen intactos; ninguna marca retroactiva.
-- Las correcciones de turnos finalizados requieren motivo y auditoría.

-- munro: incorporar el tipo de corrección auditada.
alter table gestlok_munro_conteo_private.closed_corrections
 drop constraint if exists closed_corrections_kind_check;
alter table gestlok_munro_conteo_private.closed_corrections
 add constraint closed_corrections_kind_check
 check (kind in ('cell','decomiso','responsable','consumption','waste','sin_stock'));

-- Si alguien carga cantidades reales después de marcar «Sin stock»,
-- el indicador se elimina atómicamente en el mismo guardado.
create or replace function gestlok_munro_conteo_private.normalize_manual_sin_stock()
returns trigger language plpgsql set search_path='' as $normalize$
declare item record; rate integer;
begin
 for item in
  select key as product_id from jsonb_each(new.data)
  where jsonb_typeof(value)='object' and value->>'sin_stock'='true'
 loop
  select units_per_chapa into rate from gestlok_munro_conteo_private.products where id=item.product_id;
  if rate is null or gestlok_munro_conteo_private.product_total(new.data,new.decomiso,item.product_id,rate)>0 then
   new.data=jsonb_set(new.data,array[item.product_id],
    coalesce(new.data->item.product_id,'{}'::jsonb)-'sin_stock',true);
  end if;
 end loop;
 return new;
end $normalize$;
drop trigger if exists trg_conteo_normalize_manual_sin_stock on gestlok_munro_conteo_private.shifts;
create trigger trg_conteo_normalize_manual_sin_stock
 before update of data,decomiso on gestlok_munro_conteo_private.shifts
 for each row execute function gestlok_munro_conteo_private.normalize_manual_sin_stock();

-- El RPC pasa por la autorización del tenant, local y rol. Nadie puede
-- marcar «Sin stock» por un producto que realmente tiene unidades.
create or replace function public.gestlok_munro_conteo_sin_stock(
 p_day date, p_shift text, p_product text,
 p_sin_stock boolean, p_expected boolean default false, p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
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
end $fn$;

revoke all on function public.gestlok_munro_conteo_sin_stock(date,text,text,boolean,boolean,text) from public,anon;
grant execute on function public.gestlok_munro_conteo_sin_stock(date,text,text,boolean,boolean,text) to authenticated;

-- torcuato: incorporar el tipo de corrección auditada.
alter table gestlok_torcuato_conteo_private.closed_corrections
 drop constraint if exists closed_corrections_kind_check;
alter table gestlok_torcuato_conteo_private.closed_corrections
 add constraint closed_corrections_kind_check
 check (kind in ('cell','decomiso','responsable','consumption','waste','sin_stock'));

-- Si alguien carga cantidades reales después de marcar «Sin stock»,
-- el indicador se elimina atómicamente en el mismo guardado.
create or replace function gestlok_torcuato_conteo_private.normalize_manual_sin_stock()
returns trigger language plpgsql set search_path='' as $normalize$
declare item record; rate integer;
begin
 for item in
  select key as product_id from jsonb_each(new.data)
  where jsonb_typeof(value)='object' and value->>'sin_stock'='true'
 loop
  select units_per_chapa into rate from gestlok_torcuato_conteo_private.products where id=item.product_id;
  if rate is null or gestlok_torcuato_conteo_private.product_total(new.data,new.decomiso,item.product_id,rate)>0 then
   new.data=jsonb_set(new.data,array[item.product_id],
    coalesce(new.data->item.product_id,'{}'::jsonb)-'sin_stock',true);
  end if;
 end loop;
 return new;
end $normalize$;
drop trigger if exists trg_conteo_normalize_manual_sin_stock on gestlok_torcuato_conteo_private.shifts;
create trigger trg_conteo_normalize_manual_sin_stock
 before update of data,decomiso on gestlok_torcuato_conteo_private.shifts
 for each row execute function gestlok_torcuato_conteo_private.normalize_manual_sin_stock();

-- El RPC pasa por la autorización del tenant, local y rol. Nadie puede
-- marcar «Sin stock» por un producto que realmente tiene unidades.
create or replace function public.gestlok_torcuato_conteo_sin_stock(
 p_day date, p_shift text, p_product text,
 p_sin_stock boolean, p_expected boolean default false, p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
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
end $fn$;

revoke all on function public.gestlok_torcuato_conteo_sin_stock(date,text,text,boolean,boolean,text) from public,anon;
grant execute on function public.gestlok_torcuato_conteo_sin_stock(date,text,text,boolean,boolean,text) to authenticated;
