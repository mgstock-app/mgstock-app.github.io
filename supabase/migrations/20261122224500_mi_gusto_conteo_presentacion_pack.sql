-- Conteo Mi Gusto, presentación configurable por unidades o caja/pack para gerentes, dueños y creadora.
-- Totales históricos no se recalculan al cambiar la equivalencia de unidades.

alter table gestlok_munro_conteo_private.products drop constraint if exists products_units_per_chapa_check;
alter table gestlok_munro_conteo_private.products add constraint products_units_per_chapa_check check (units_per_chapa between 0 and 1000);
alter table gestlok_munro_conteo_private.products add column if not exists pack_kind text not null default 'caja';
alter table gestlok_munro_conteo_private.products drop constraint if exists products_pack_kind_check;
alter table gestlok_munro_conteo_private.products add constraint products_pack_kind_check check (pack_kind in ('caja','chapa'));
update gestlok_munro_conteo_private.products set pack_kind='chapa' where units_per_chapa>0 and section='EMPANADAS' and pack_kind<>'chapa';

create table if not exists gestlok_munro_conteo_private.pack_rate_snapshots (
 day date not null,shift text not null,product_id text not null,units_per_pack integer not null check(units_per_pack between 0 and 1000),
 primary key(day,shift,product_id)
);
alter table gestlok_munro_conteo_private.pack_rate_snapshots enable row level security;
revoke all on gestlok_munro_conteo_private.pack_rate_snapshots from public,anon,authenticated;
create table if not exists gestlok_munro_conteo_private.product_config_audit (
 id bigint generated always as identity primary key,product_id text not null,actor uuid not null,action text not null,
 before_value jsonb,after_value jsonb not null,created_at timestamptz not null default now()
);
alter table gestlok_munro_conteo_private.product_config_audit enable row level security;
revoke all on gestlok_munro_conteo_private.product_config_audit from public,anon,authenticated;
create or replace function public.gestlok_munro_conteo_save_product_config(
 p_id text,p_section text,p_name text,p_units_per_pack integer,p_pack_kind text default 'caja')
returns jsonb language plpgsql security definer set search_path='' as $body$
declare v_old gestlok_munro_conteo_private.products%rowtype;
 v_name text:=btrim(coalesce(p_name,''));v_section text:=btrim(coalesce(p_section,''));
 v_rate integer:=p_units_per_pack;v_kind text:=coalesce(p_pack_kind,'caja');
 v_id text;v_position integer;v_after jsonb;v_before jsonb;
begin
 perform gestlok_munro_conteo_private.require_access(true,false);
 if public.mi_rol() not in ('creadora','dueno','gerente') then
   raise exception 'Rol no habilitado para configurar productos' using errcode='42501';
 end if;
 if v_rate is null or v_rate not between 0 and 1000 or v_kind not in ('caja','chapa')
   or char_length(v_name) not between 1 and 100 or char_length(v_section) not between 3 and 70 then
    raise exception 'Producto o presentación inválidos' using errcode='22023';
 end if;
 if not exists(select 1 from gestlok_munro_conteo_private.categories where name=v_section) then
    raise exception 'La categoría no existe en este local' using errcode='22023';
 end if;
 if p_id is null or btrim(p_id)='' then
    if exists(select 1 from gestlok_munro_conteo_private.products
      where section=v_section and active and lower(btrim(name))=lower(v_name)) then
      raise exception 'Ya hay un producto activo con ese nombre en la categoría' using errcode='23505';
    end if;
    select coalesce(max(position)+1,(select c.position+1 from gestlok_munro_conteo_private.categories c where c.name=v_section),1)
      into v_position from gestlok_munro_conteo_private.products where section=v_section;
    v_id:='pack-'||replace(gen_random_uuid()::text,'-','');
    insert into gestlok_munro_conteo_private.products(id,section,name,units_per_chapa,pack_kind,position,active)
       values(v_id,v_section,v_name,v_rate,v_kind,v_position,true);
    v_after:=jsonb_build_object('id',v_id,'section',v_section,'name',v_name,'units_per_chapa',v_rate,'pack_kind',v_kind);
    insert into gestlok_munro_conteo_private.product_config_audit(product_id,actor,action,after_value)
      values(v_id,auth.uid(),'crear',v_after);
    return jsonb_build_object('ok',true,'product',v_after,'action','crear');
 end if;
 select * into v_old from gestlok_munro_conteo_private.products where id=p_id for update;
 if not found or not v_old.active then
    raise exception 'Producto inexistente o inactivo' using errcode='22023';
 end if;
 if v_old.section<>v_section or v_old.name<>v_name then
    raise exception 'Solo se puede editar la presentación; el nombre y la categoría deben mantenerse' using errcode='22023';
 end if;
 if v_old.units_per_chapa=v_rate and v_old.pack_kind=v_kind then
    return jsonb_build_object('ok',true,'product',to_jsonb(v_old),'action','sin_cambios');
 end if;
 if v_old.units_per_chapa<>v_rate then
    if exists(select 1 from gestlok_munro_conteo_private.shifts sh
      where sh.status='borrador'
        and (coalesce(sh.data,'{}'::jsonb) ? p_id or coalesce(sh.decomiso,'{}'::jsonb) ? p_id)) then
      raise exception 'Este producto tiene datos en un turno abierto. Cerrá el turno antes de cambiar las unidades del pack' using errcode='22023';
    end if;
    insert into gestlok_munro_conteo_private.pack_rate_snapshots(day,shift,product_id,units_per_pack)
      select sh.day,sh.shift,p_id,v_old.units_per_chapa from gestlok_munro_conteo_private.shifts sh
       where sh.data ? p_id or sh.decomiso ? p_id
      on conflict(day,shift,product_id) do nothing;
 end if;
 v_before:=jsonb_build_object('units_per_chapa',v_old.units_per_chapa,'pack_kind',v_old.pack_kind);
 update gestlok_munro_conteo_private.products set units_per_chapa=v_rate,pack_kind=v_kind where id=p_id;
 v_after:=jsonb_build_object('id',p_id,'section',v_section,'name',v_name,'units_per_chapa',v_rate,'pack_kind',v_kind);
 insert into gestlok_munro_conteo_private.product_config_audit(product_id,actor,action,before_value,after_value)
    values(p_id,auth.uid(),'editar_presentacion',v_before,v_after);
 return jsonb_build_object('ok',true,'product',v_after,'action','editar');
exception when unique_violation then
 raise exception 'Ya existe un producto con ese nombre en esta categoría' using errcode='23505';
end $body$;
revoke all on function public.gestlok_munro_conteo_save_product_config(text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.gestlok_munro_conteo_save_product_config(text,text,text,integer,text) to authenticated;

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
  'history',coalesce((select jsonb_agg(to_jsonb(q)||jsonb_build_object('pack_rates',coalesce((select jsonb_object_agg(ps.product_id,ps.units_per_pack) from gestlok_munro_conteo_private.pack_rate_snapshots ps where ps.day=q.day and ps.shift=q.shift),'{}'::jsonb)) order by q.day desc,q.shift) from
            (select * from gestlok_munro_conteo_private.shifts
             where status='finalizado' order by day desc,shift limit 150) q),'[]'::jsonb),
  'settings',coalesce((select jsonb_build_object('locked',locked,'hidden_sections',hidden_sections)
                       from gestlok_munro_conteo_private.settings where id=1),'{}'::jsonb)
 );
end $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_munro_conteo_history(p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform gestlok_munro_conteo_private.require_access(false,false);
 if p_month is null
   or p_month < date '2025-01-01'
   or p_month <> date_trunc('month',p_month::timestamp)::date
   or p_month > date_trunc('month',(now() at time zone 'America/Argentina/Buenos_Aires'))::date
 then raise exception 'Mes del historial no válido'; end if;
 return coalesce(
    (select jsonb_agg(to_jsonb(s)||jsonb_build_object('pack_rates',coalesce((select jsonb_object_agg(ps.product_id,ps.units_per_pack) from gestlok_munro_conteo_private.pack_rate_snapshots ps where ps.day=s.day and ps.shift=s.shift),'{}'::jsonb)) order by s.day desc,
        case s.shift when 'manana_entrada' then 1 when 'manana_salida' then 2 else 3 end)
     from gestlok_munro_conteo_private.shifts s
     where s.day>=p_month and s.day<(p_month+interval '1 month')::date
       and (public.mi_rol()<>'dueno' or s.status='finalizado'
            or (s.day=date '2026-11-14' and s.shift='manana_entrada'))),
    '[]'::jsonb);
end $function$
;
CREATE OR REPLACE FUNCTION gestlok_munro_conteo_private.comparison_rows(p_day date)
 RETURNS TABLE(product_id text, section text, product_name text, product_position integer, night_total bigint, morning_total bigint, night_updated_at timestamp with time zone, acknowledged boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select p.id,p.section,p.name,p.position,
  gestlok_munro_conteo_private.product_total(b.data,b.decomiso,p.id,coalesce((select r.units_per_pack from gestlok_munro_conteo_private.pack_rate_snapshots r where r.day=b.day and r.shift=b.shift and r.product_id=p.id),p.units_per_chapa)) night_total,
  gestlok_munro_conteo_private.product_total(m.data,m.decomiso,p.id,coalesce((select r.units_per_pack from gestlok_munro_conteo_private.pack_rate_snapshots r where r.day=m.day and r.shift=m.shift and r.product_id=p.id),p.units_per_chapa)) morning_total,
  b.updated_at,
  coalesce(a.night_total=gestlok_munro_conteo_private.product_total(b.data,b.decomiso,p.id,coalesce((select r.units_per_pack from gestlok_munro_conteo_private.pack_rate_snapshots r where r.day=b.day and r.shift=b.shift and r.product_id=p.id),p.units_per_chapa))
   and a.morning_total=gestlok_munro_conteo_private.product_total(m.data,m.decomiso,p.id,coalesce((select r.units_per_pack from gestlok_munro_conteo_private.pack_rate_snapshots r where r.day=m.day and r.shift=m.shift and r.product_id=p.id),p.units_per_chapa))
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
  select coalesce((select r.units_per_pack from gestlok_munro_conteo_private.pack_rate_snapshots r where r.day=p_day and r.shift=p_shift and r.product_id=p_product),p.units_per_chapa) into per from gestlok_munro_conteo_private.products p where p.id=p_product;
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
 select coalesce((select r.units_per_pack from gestlok_munro_conteo_private.pack_rate_snapshots r where r.day=p_day and r.shift=p_shift and r.product_id=p_product),p.units_per_chapa) into rate from gestlok_munro_conteo_private.products p where p.id=p_product;
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
  select coalesce((select r.units_per_pack from gestlok_munro_conteo_private.pack_rate_snapshots r where r.day=new.day and r.shift=new.shift and r.product_id=item.product_id),p.units_per_chapa) into rate from gestlok_munro_conteo_private.products p where p.id=item.product_id;
  if rate is null or gestlok_munro_conteo_private.product_total(new.data,new.decomiso,item.product_id,rate)>0 then
   new.data=jsonb_set(new.data,array[item.product_id],
    coalesce(new.data->item.product_id,'{}'::jsonb)-'sin_stock',true);
  end if;
 end loop;
 return new;
end $function$
;

alter table gestlok_torcuato_conteo_private.products drop constraint if exists products_units_per_chapa_check;
alter table gestlok_torcuato_conteo_private.products add constraint products_units_per_chapa_check check (units_per_chapa between 0 and 1000);
alter table gestlok_torcuato_conteo_private.products add column if not exists pack_kind text not null default 'caja';
alter table gestlok_torcuato_conteo_private.products drop constraint if exists products_pack_kind_check;
alter table gestlok_torcuato_conteo_private.products add constraint products_pack_kind_check check (pack_kind in ('caja','chapa'));
update gestlok_torcuato_conteo_private.products set pack_kind='chapa' where units_per_chapa>0 and section='EMPANADAS' and pack_kind<>'chapa';

create table if not exists gestlok_torcuato_conteo_private.pack_rate_snapshots (
 day date not null,shift text not null,product_id text not null,units_per_pack integer not null check(units_per_pack between 0 and 1000),
 primary key(day,shift,product_id)
);
alter table gestlok_torcuato_conteo_private.pack_rate_snapshots enable row level security;
revoke all on gestlok_torcuato_conteo_private.pack_rate_snapshots from public,anon,authenticated;
create table if not exists gestlok_torcuato_conteo_private.product_config_audit (
 id bigint generated always as identity primary key,product_id text not null,actor uuid not null,action text not null,
 before_value jsonb,after_value jsonb not null,created_at timestamptz not null default now()
);
alter table gestlok_torcuato_conteo_private.product_config_audit enable row level security;
revoke all on gestlok_torcuato_conteo_private.product_config_audit from public,anon,authenticated;
create or replace function public.gestlok_torcuato_conteo_save_product_config(
 p_id text,p_section text,p_name text,p_units_per_pack integer,p_pack_kind text default 'caja')
returns jsonb language plpgsql security definer set search_path='' as $body$
declare v_old gestlok_torcuato_conteo_private.products%rowtype;
 v_name text:=btrim(coalesce(p_name,''));v_section text:=btrim(coalesce(p_section,''));
 v_rate integer:=p_units_per_pack;v_kind text:=coalesce(p_pack_kind,'caja');
 v_id text;v_position integer;v_after jsonb;v_before jsonb;
begin
 perform gestlok_torcuato_conteo_private.require_access(true,false);
 if public.mi_rol() not in ('creadora','dueno','gerente') then
   raise exception 'Rol no habilitado para configurar productos' using errcode='42501';
 end if;
 if v_rate is null or v_rate not between 0 and 1000 or v_kind not in ('caja','chapa')
   or char_length(v_name) not between 1 and 100 or char_length(v_section) not between 3 and 70 then
    raise exception 'Producto o presentación inválidos' using errcode='22023';
 end if;
 if not exists(select 1 from gestlok_torcuato_conteo_private.categories where name=v_section) then
    raise exception 'La categoría no existe en este local' using errcode='22023';
 end if;
 if p_id is null or btrim(p_id)='' then
    if exists(select 1 from gestlok_torcuato_conteo_private.products
      where section=v_section and active and lower(btrim(name))=lower(v_name)) then
      raise exception 'Ya hay un producto activo con ese nombre en la categoría' using errcode='23505';
    end if;
    select coalesce(max(position)+1,(select c.position+1 from gestlok_torcuato_conteo_private.categories c where c.name=v_section),1)
      into v_position from gestlok_torcuato_conteo_private.products where section=v_section;
    v_id:='pack-'||replace(gen_random_uuid()::text,'-','');
    insert into gestlok_torcuato_conteo_private.products(id,section,name,units_per_chapa,pack_kind,position,active)
       values(v_id,v_section,v_name,v_rate,v_kind,v_position,true);
    v_after:=jsonb_build_object('id',v_id,'section',v_section,'name',v_name,'units_per_chapa',v_rate,'pack_kind',v_kind);
    insert into gestlok_torcuato_conteo_private.product_config_audit(product_id,actor,action,after_value)
      values(v_id,auth.uid(),'crear',v_after);
    return jsonb_build_object('ok',true,'product',v_after,'action','crear');
 end if;
 select * into v_old from gestlok_torcuato_conteo_private.products where id=p_id for update;
 if not found or not v_old.active then
    raise exception 'Producto inexistente o inactivo' using errcode='22023';
 end if;
 if v_old.section<>v_section or v_old.name<>v_name then
    raise exception 'Solo se puede editar la presentación; el nombre y la categoría deben mantenerse' using errcode='22023';
 end if;
 if v_old.units_per_chapa=v_rate and v_old.pack_kind=v_kind then
    return jsonb_build_object('ok',true,'product',to_jsonb(v_old),'action','sin_cambios');
 end if;
 if v_old.units_per_chapa<>v_rate then
    if exists(select 1 from gestlok_torcuato_conteo_private.shifts sh
      where sh.status='borrador'
        and (coalesce(sh.data,'{}'::jsonb) ? p_id or coalesce(sh.decomiso,'{}'::jsonb) ? p_id)) then
      raise exception 'Este producto tiene datos en un turno abierto. Cerrá el turno antes de cambiar las unidades del pack' using errcode='22023';
    end if;
    insert into gestlok_torcuato_conteo_private.pack_rate_snapshots(day,shift,product_id,units_per_pack)
      select sh.day,sh.shift,p_id,v_old.units_per_chapa from gestlok_torcuato_conteo_private.shifts sh
       where sh.data ? p_id or sh.decomiso ? p_id
      on conflict(day,shift,product_id) do nothing;
 end if;
 v_before:=jsonb_build_object('units_per_chapa',v_old.units_per_chapa,'pack_kind',v_old.pack_kind);
 update gestlok_torcuato_conteo_private.products set units_per_chapa=v_rate,pack_kind=v_kind where id=p_id;
 v_after:=jsonb_build_object('id',p_id,'section',v_section,'name',v_name,'units_per_chapa',v_rate,'pack_kind',v_kind);
 insert into gestlok_torcuato_conteo_private.product_config_audit(product_id,actor,action,before_value,after_value)
    values(p_id,auth.uid(),'editar_presentacion',v_before,v_after);
 return jsonb_build_object('ok',true,'product',v_after,'action','editar');
exception when unique_violation then
 raise exception 'Ya existe un producto con ese nombre en esta categoría' using errcode='23505';
end $body$;
revoke all on function public.gestlok_torcuato_conteo_save_product_config(text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.gestlok_torcuato_conteo_save_product_config(text,text,text,integer,text) to authenticated;

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
  'history',coalesce((select jsonb_agg(to_jsonb(q)||jsonb_build_object('pack_rates',coalesce((select jsonb_object_agg(ps.product_id,ps.units_per_pack) from gestlok_torcuato_conteo_private.pack_rate_snapshots ps where ps.day=q.day and ps.shift=q.shift),'{}'::jsonb)) order by q.day desc,q.shift) from
            (select * from gestlok_torcuato_conteo_private.shifts
             where status='finalizado' order by day desc,shift limit 150) q),'[]'::jsonb),
  'settings',coalesce((select jsonb_build_object('locked',locked,'hidden_sections',hidden_sections)
                       from gestlok_torcuato_conteo_private.settings where id=1),'{}'::jsonb)
 );
end $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_torcuato_conteo_history(p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform gestlok_torcuato_conteo_private.require_access(false,false);
 if p_month is null
   or p_month < date '2025-01-01'
   or p_month <> date_trunc('month',p_month::timestamp)::date
   or p_month > date_trunc('month',(now() at time zone 'America/Argentina/Buenos_Aires'))::date
 then raise exception 'Mes del historial no válido'; end if;
 return coalesce(
    (select jsonb_agg(to_jsonb(s)||jsonb_build_object('pack_rates',coalesce((select jsonb_object_agg(ps.product_id,ps.units_per_pack) from gestlok_torcuato_conteo_private.pack_rate_snapshots ps where ps.day=s.day and ps.shift=s.shift),'{}'::jsonb)) order by s.day desc,
        case s.shift when 'manana_entrada' then 1 when 'manana_salida' then 2 else 3 end)
     from gestlok_torcuato_conteo_private.shifts s
     where s.day>=p_month and s.day<(p_month+interval '1 month')::date
       and (public.mi_rol()<>'dueno' or s.status='finalizado')),
    '[]'::jsonb);
end $function$
;
CREATE OR REPLACE FUNCTION gestlok_torcuato_conteo_private.comparison_rows(p_day date)
 RETURNS TABLE(product_id text, section text, product_name text, product_position integer, night_total bigint, morning_total bigint, night_updated_at timestamp with time zone, acknowledged boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select p.id,p.section,p.name,p.position,
  gestlok_torcuato_conteo_private.product_total(b.data,b.decomiso,p.id,coalesce((select r.units_per_pack from gestlok_torcuato_conteo_private.pack_rate_snapshots r where r.day=b.day and r.shift=b.shift and r.product_id=p.id),p.units_per_chapa)) night_total,
  gestlok_torcuato_conteo_private.product_total(m.data,m.decomiso,p.id,coalesce((select r.units_per_pack from gestlok_torcuato_conteo_private.pack_rate_snapshots r where r.day=m.day and r.shift=m.shift and r.product_id=p.id),p.units_per_chapa)) morning_total,
  b.updated_at,
  coalesce(a.night_total=gestlok_torcuato_conteo_private.product_total(b.data,b.decomiso,p.id,coalesce((select r.units_per_pack from gestlok_torcuato_conteo_private.pack_rate_snapshots r where r.day=b.day and r.shift=b.shift and r.product_id=p.id),p.units_per_chapa))
   and a.morning_total=gestlok_torcuato_conteo_private.product_total(m.data,m.decomiso,p.id,coalesce((select r.units_per_pack from gestlok_torcuato_conteo_private.pack_rate_snapshots r where r.day=m.day and r.shift=m.shift and r.product_id=p.id),p.units_per_chapa))
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
  select coalesce((select r.units_per_pack from gestlok_torcuato_conteo_private.pack_rate_snapshots r where r.day=p_day and r.shift=p_shift and r.product_id=p_product),p.units_per_chapa) into per from gestlok_torcuato_conteo_private.products p where p.id=p_product;
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
 select coalesce((select r.units_per_pack from gestlok_torcuato_conteo_private.pack_rate_snapshots r where r.day=p_day and r.shift=p_shift and r.product_id=p_product),p.units_per_chapa) into rate from gestlok_torcuato_conteo_private.products p where p.id=p_product;
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
  select coalesce((select r.units_per_pack from gestlok_torcuato_conteo_private.pack_rate_snapshots r where r.day=new.day and r.shift=new.shift and r.product_id=item.product_id),p.units_per_chapa) into rate from gestlok_torcuato_conteo_private.products p where p.id=item.product_id;
  if rate is null or gestlok_torcuato_conteo_private.product_total(new.data,new.decomiso,item.product_id,rate)>0 then
   new.data=jsonb_set(new.data,array[item.product_id],
    coalesce(new.data->item.product_id,'{}'::jsonb)-'sin_stock',true);
  end if;
 end loop;
 return new;
end $function$
;
