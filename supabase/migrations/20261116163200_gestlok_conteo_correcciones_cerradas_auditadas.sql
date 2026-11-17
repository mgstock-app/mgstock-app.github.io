-- GESTLOK · correcciones auditadas de turnos finalizados (Mi Gusto Munro y Don Torcuato).
-- Los estados y finished_at permanecen inalterados. No borra ni reabre registros.
-- Los nombres de funciones son locales, y cada una escribe SOLO en su esquema privado.

create table if not exists gestlok_munro_conteo_private.closed_corrections(
 id bigint generated always as identity primary key,
 day date not null,
 shift text not null check(shift in ('manana_entrada','manana_salida','noche_salida')),
 kind text not null check(kind in ('cell','decomiso','responsable','consumption','waste')),
 product_id text,
 expiry_index integer check(expiry_index is null or expiry_index between 0 and 4),
 before_value jsonb not null,
 after_value jsonb not null,
 reason text not null check(length(trim(reason)) between 8 and 300),
 actor_id uuid not null,
 actor_email text,
 corrected_at timestamptz not null default now(),
 foreign key(day,shift) references gestlok_munro_conteo_private.shifts(day,shift)
);
alter table gestlok_munro_conteo_private.closed_corrections enable row level security;
revoke all on gestlok_munro_conteo_private.closed_corrections from public, anon, authenticated;

create or replace function public.gestlok_munro_conteo_correct_closed(
 p_day date,p_shift text,p_kind text,p_product text,p_index integer,
 p_value jsonb,p_expected jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
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
  select units_per_chapa into per from gestlok_munro_conteo_private.products where id=p_product;
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
end $fn$;

create or replace function public.gestlok_munro_conteo_correction_history(p_day date,p_shift text)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 perform gestlok_munro_conteo_private.require_access(false,false);
 if p_day is null or p_shift not in ('manana_entrada','manana_salida','noche_salida') then
  raise exception 'Turno inválido';
 end if;
 return coalesce((
  select jsonb_agg(jsonb_build_object(
   'id',x.id,'kind',x.kind,'product_id',x.product_id,'expiry_index',x.expiry_index,
   'before_value',x.before_value,'after_value',x.after_value,'reason',x.reason,
   'actor_email',coalesce(x.actor_email,x.actor_id::text),'corrected_at',x.corrected_at
  ) order by x.id desc)
  from (select * from gestlok_munro_conteo_private.closed_corrections where day=p_day and shift=p_shift
        order by id desc limit 50) x
 ),'[]'::jsonb);
end $fn$;

revoke all on function public.gestlok_munro_conteo_correct_closed(date,text,text,text,integer,jsonb,jsonb,text)
 from public,anon,authenticated;
revoke all on function public.gestlok_munro_conteo_correction_history(date,text)
 from public,anon,authenticated;
grant execute on function public.gestlok_munro_conteo_correct_closed(date,text,text,text,integer,jsonb,jsonb,text)
 to authenticated;
grant execute on function public.gestlok_munro_conteo_correction_history(date,text)
 to authenticated;

create table if not exists gestlok_torcuato_conteo_private.closed_corrections(
 id bigint generated always as identity primary key,
 day date not null,
 shift text not null check(shift in ('manana_entrada','manana_salida','noche_salida')),
 kind text not null check(kind in ('cell','decomiso','responsable','consumption','waste')),
 product_id text,
 expiry_index integer check(expiry_index is null or expiry_index between 0 and 4),
 before_value jsonb not null,
 after_value jsonb not null,
 reason text not null check(length(trim(reason)) between 8 and 300),
 actor_id uuid not null,
 actor_email text,
 corrected_at timestamptz not null default now(),
 foreign key(day,shift) references gestlok_torcuato_conteo_private.shifts(day,shift)
);
alter table gestlok_torcuato_conteo_private.closed_corrections enable row level security;
revoke all on gestlok_torcuato_conteo_private.closed_corrections from public, anon, authenticated;

create or replace function public.gestlok_torcuato_conteo_correct_closed(
 p_day date,p_shift text,p_kind text,p_product text,p_index integer,
 p_value jsonb,p_expected jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
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
  select units_per_chapa into per from gestlok_torcuato_conteo_private.products where id=p_product;
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
end $fn$;

create or replace function public.gestlok_torcuato_conteo_correction_history(p_day date,p_shift text)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 perform gestlok_torcuato_conteo_private.require_access(false,false);
 if p_day is null or p_shift not in ('manana_entrada','manana_salida','noche_salida') then
  raise exception 'Turno inválido';
 end if;
 return coalesce((
  select jsonb_agg(jsonb_build_object(
   'id',x.id,'kind',x.kind,'product_id',x.product_id,'expiry_index',x.expiry_index,
   'before_value',x.before_value,'after_value',x.after_value,'reason',x.reason,
   'actor_email',coalesce(x.actor_email,x.actor_id::text),'corrected_at',x.corrected_at
  ) order by x.id desc)
  from (select * from gestlok_torcuato_conteo_private.closed_corrections where day=p_day and shift=p_shift
        order by id desc limit 50) x
 ),'[]'::jsonb);
end $fn$;

revoke all on function public.gestlok_torcuato_conteo_correct_closed(date,text,text,text,integer,jsonb,jsonb,text)
 from public,anon,authenticated;
revoke all on function public.gestlok_torcuato_conteo_correction_history(date,text)
 from public,anon,authenticated;
grant execute on function public.gestlok_torcuato_conteo_correct_closed(date,text,text,text,integer,jsonb,jsonb,text)
 to authenticated;
grant execute on function public.gestlok_torcuato_conteo_correction_history(date,text)
 to authenticated;
