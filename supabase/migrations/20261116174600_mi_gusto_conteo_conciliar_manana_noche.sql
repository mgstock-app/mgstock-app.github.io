-- Mi Gusto · conciliación obligatoria Noche salida (D-1) vs Mañana entrada (D).
-- En ambos locales por separado. No modifica valores ya registrados ni reabre turnos.

create table if not exists gestlok_munro_conteo_private.morning_reconciliations(
 day date not null,
 product_id text not null,
 night_total bigint not null,
 morning_total bigint not null,
 night_updated_at timestamptz not null,
 acknowledged_by uuid not null,
 acknowledged_at timestamptz not null default now(),
 primary key(day,product_id)
);
alter table gestlok_munro_conteo_private.morning_reconciliations enable row level security;
revoke all on gestlok_munro_conteo_private.morning_reconciliations from public,anon,authenticated;

create or replace function gestlok_munro_conteo_private.product_total(
 p_data jsonb,p_decomiso jsonb,p_product text,p_rate integer)
returns bigint language sql immutable set search_path='' as $total$
 select coalesce(sum(
  case when p_rate>0 then
   coalesce((v.x->>'chapas')::bigint,0)*p_rate+coalesce((v.x->>'sueltas')::bigint,0)
  else coalesce((v.x->>'qty')::bigint,0) end),0)::bigint
 from (
  select p_data->p_product->('v'||g.i) as x from generate_series(1,4) as g(i)
  union all
  select p_decomiso->p_product
 ) v;
$total$;
revoke all on function gestlok_munro_conteo_private.product_total(jsonb,jsonb,text,integer) from public,anon,authenticated;

-- Los días se comparan por producto, incluyendo los totales de todos los vencimientos y decomiso.
-- Caso documentado: el único conteo real 14/11 de Munro se archivó bajo el ID
-- Mañana entrada pero corresponde a Noche salida; NO se cambia el registro de origen.
create or replace function gestlok_munro_conteo_private.comparison_rows(p_day date)
returns table(product_id text, section text, product_name text, product_position integer,
 night_total bigint,morning_total bigint,night_updated_at timestamptz,
 acknowledged boolean)
language sql stable set search_path='' as $rows$
 select p.id,p.section,p.name,p.position,
  gestlok_munro_conteo_private.product_total(b.data,b.decomiso,p.id,p.units_per_chapa) night_total,
  gestlok_munro_conteo_private.product_total(m.data,m.decomiso,p.id,p.units_per_chapa) morning_total,
  b.updated_at,
  coalesce(a.night_total=gestlok_munro_conteo_private.product_total(b.data,b.decomiso,p.id,p.units_per_chapa)
   and a.morning_total=gestlok_munro_conteo_private.product_total(m.data,m.decomiso,p.id,p.units_per_chapa)
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
$rows$;
revoke all on function gestlok_munro_conteo_private.comparison_rows(date) from public,anon,authenticated;

create or replace function public.gestlok_munro_conteo_compare_morning(p_day date)
returns jsonb language plpgsql stable security definer set search_path='' as $api$
declare
 has_night boolean; first_day boolean; result jsonb;
 reference_shift text:=(case when p_day=date '2026-11-15' then 'manana_entrada' else 'noche_salida' end);
begin
 perform gestlok_munro_conteo_private.require_access(false,false);
 if p_day is null or p_day<date '2025-01-01'
  or p_day>(now() at time zone 'America/Argentina/Buenos_Aires')::date+1 then
   raise exception 'Día de Conteo no válido';
 end if;
 select exists(select 1 from gestlok_munro_conteo_private.shifts
  where day=p_day-1 and shift=reference_shift and status='finalizado') into has_night;
 select not exists(select 1 from gestlok_torcuato_conteo_private.shifts
  where day<p_day and shift='noche_salida' and status='finalizado') into first_day;
 select not exists(select 1 from gestlok_munro_conteo_private.shifts
  where day<p_day and shift='noche_salida' and status='finalizado') into first_day;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',x.product_id,'section',x.section,'name',x.product_name,
  'night_total',x.night_total,'morning_total',x.morning_total,
  'difference',x.morning_total-x.night_total,'acknowledged',x.acknowledged,
  'night_updated_at',x.night_updated_at
 ) order by case when upper(x.section) like '%EMPANADA%' then 0 when upper(x.section) like '%PIZZA%' then 1 else 2 end,
 x.product_position),'[]'::jsonb)
 into result from gestlok_munro_conteo_private.comparison_rows(p_day) x;
 return jsonb_build_object('previous_day',p_day-1,
  'previous_shift',reference_shift,'baseline_ready',has_night,'first_day',first_day,'rows',result);
end $api$;

create or replace function public.gestlok_munro_conteo_ack_morning(
 p_day date,p_product text,p_confirm boolean,
 p_night_total bigint default null,p_morning_total bigint default null,
 p_night_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $api$
declare
 previous gestlok_munro_conteo_private.shifts%rowtype;
 morning gestlok_munro_conteo_private.shifts%rowtype;
 compare_row record;
 baseline_shift text:=(case when p_day=date '2026-11-15' then 'manana_entrada' else 'noche_salida' end);
begin
 perform gestlok_munro_conteo_private.require_access(true,false);
 if p_day is null or p_product is null or length(p_product)>60
  or p_confirm is null then raise exception 'Datos inválidos'; end if;
 -- Bloquear primero Noche salida y después Mañana entrada, igual que finalizar:
 -- evita interbloqueos entre confirmación OK y cierre simultáneo.
 select * into previous from gestlok_munro_conteo_private.shifts
  where day=p_day-1 and shift=baseline_shift and status='finalizado' for update;
 if not found then raise exception 'Falta el cierre de Noche salida del día anterior'; end if;
 select * into morning from gestlok_munro_conteo_private.shifts
  where day=p_day and shift='manana_entrada' for update;
 if not found or morning.status='finalizado' then
  raise exception 'Solo se puede confirmar un turno Mañana entrada abierto y guardado';
 end if;
 select * into compare_row from gestlok_munro_conteo_private.comparison_rows(p_day) c
  where c.product_id=p_product;
 if not found then raise exception 'Producto no registrado'; end if;
 if not p_confirm then
  delete from gestlok_munro_conteo_private.morning_reconciliations
   where day=p_day and product_id=p_product;
  return jsonb_build_object('ok',true,'acknowledged',false);
 end if;
 if compare_row.night_total=compare_row.morning_total then
  raise exception 'Este producto ya coincide; no requiere confirmación';
 end if;
 if compare_row.night_total is distinct from p_night_total
  or compare_row.morning_total is distinct from p_morning_total
  or compare_row.night_updated_at is distinct from p_night_updated_at then
  raise exception 'Los totales cambiaron. Revisá las cantidades antes de marcar OK.';
 end if;
 insert into gestlok_munro_conteo_private.morning_reconciliations(
  day,product_id,night_total,morning_total,night_updated_at,acknowledged_by)
 values(p_day,p_product,compare_row.night_total,compare_row.morning_total,
  compare_row.night_updated_at,auth.uid())
 on conflict(day,product_id) do update
 set night_total=excluded.night_total,morning_total=excluded.morning_total,
 night_updated_at=excluded.night_updated_at,acknowledged_by=excluded.acknowledged_by,
 acknowledged_at=now();
 return jsonb_build_object('ok',true,'acknowledged',true);
end $api$;

-- Cierre protegido en servidor, aun si se intenta llamar RPC sin pasar por la interfaz.
create or replace function public.gestlok_munro_conteo_finalize(p_day date,p_shift text)
returns jsonb language plpgsql security definer set search_path='' as $api$
declare
 r gestlok_munro_conteo_private.shifts%rowtype;
 prior gestlok_munro_conteo_private.shifts%rowtype;
 pending_count integer;
 baseline_ready boolean:=false;
 baseline_shift text:=(case when p_day=date '2026-11-15' then 'manana_entrada' else 'noche_salida' end);
begin
 perform gestlok_munro_conteo_private.require_access(true,false);
 if p_day is null or p_shift not in ('manana_entrada','manana_salida','noche_salida') then
  raise exception 'Turno no válido';
 end if;
 if p_shift='manana_entrada' then
  select * into prior from gestlok_munro_conteo_private.shifts
   where day=p_day-1 and shift=baseline_shift and status='finalizado' for update;
  baseline_ready:=found;
  if not baseline_ready and exists(select 1 from gestlok_munro_conteo_private.shifts
   where day<p_day and shift='noche_salida' and status='finalizado') then
   raise exception 'No se puede cerrar Mañana entrada: falta Noche salida finalizada del día anterior.';
  end if;
 end if;
 select * into r from gestlok_munro_conteo_private.shifts
  where day=p_day and shift=p_shift for update;
 if not found or r.status='finalizado' then
  raise exception 'No hay un borrador pendiente de finalizar';
 end if;
 if r.responsable not in ('Cami','Shuli','Tizi') or r.responsable is null then
  raise exception 'Elegí al gerente responsable antes de finalizar';
 end if;
 if p_shift='manana_entrada' and baseline_ready then
  select count(*) into pending_count
  from gestlok_munro_conteo_private.comparison_rows(p_day) x
  where x.night_total<>x.morning_total and not x.acknowledged;
  if pending_count>0 then
   raise exception 'No se puede cerrar Mañana entrada: % productos difieren de Noche salida. Volvé a controlar y corregí o marcá OK por producto.',pending_count;
  end if;
 end if;
 update gestlok_munro_conteo_private.shifts
  set status='finalizado',finished_at=now(),updated_at=now(),updated_by=auth.uid()
  where day=p_day and shift=p_shift;
 return jsonb_build_object('ok',true);
end $api$;

-- Mañana entrada NUNCA carga consumo de colaboradores. No elimina datos de fechas pasadas.
create or replace function gestlok_munro_conteo_private.reject_morning_consumption()
returns trigger language plpgsql set search_path='' as $guard$
begin
 if new.shift='manana_entrada' and
  (case when tg_op='INSERT' then coalesce(new.consumption,'[]'::jsonb)<>'[]'::jsonb
   else new.consumption is distinct from old.consumption end) then
  raise exception 'Mañana entrada no tiene consumo de colaboradores';
 end if;
 return new;
end $guard$;
drop trigger if exists gestlok_munro_conteo_no_morning_consumption on gestlok_munro_conteo_private.shifts;
create trigger gestlok_munro_conteo_no_morning_consumption
 before insert or update on gestlok_munro_conteo_private.shifts
 for each row execute function gestlok_munro_conteo_private.reject_morning_consumption();
revoke all on function gestlok_munro_conteo_private.reject_morning_consumption() from public,anon,authenticated;

revoke all on function public.gestlok_munro_conteo_compare_morning(date) from public,anon,authenticated;
revoke all on function public.gestlok_munro_conteo_ack_morning(date,text,boolean,bigint,bigint,timestamptz) from public,anon,authenticated;
revoke all on function public.gestlok_munro_conteo_finalize(date,text) from public,anon;
grant execute on function public.gestlok_munro_conteo_compare_morning(date) to authenticated;
grant execute on function public.gestlok_munro_conteo_ack_morning(date,text,boolean,bigint,bigint,timestamptz) to authenticated;
grant execute on function public.gestlok_munro_conteo_finalize(date,text) to authenticated;

create table if not exists gestlok_torcuato_conteo_private.morning_reconciliations(
 day date not null,
 product_id text not null,
 night_total bigint not null,
 morning_total bigint not null,
 night_updated_at timestamptz not null,
 acknowledged_by uuid not null,
 acknowledged_at timestamptz not null default now(),
 primary key(day,product_id)
);
alter table gestlok_torcuato_conteo_private.morning_reconciliations enable row level security;
revoke all on gestlok_torcuato_conteo_private.morning_reconciliations from public,anon,authenticated;

create or replace function gestlok_torcuato_conteo_private.product_total(
 p_data jsonb,p_decomiso jsonb,p_product text,p_rate integer)
returns bigint language sql immutable set search_path='' as $total$
 select coalesce(sum(
  case when p_rate>0 then
   coalesce((v.x->>'chapas')::bigint,0)*p_rate+coalesce((v.x->>'sueltas')::bigint,0)
  else coalesce((v.x->>'qty')::bigint,0) end),0)::bigint
 from (
  select p_data->p_product->('v'||g.i) as x from generate_series(1,4) as g(i)
  union all
  select p_decomiso->p_product
 ) v;
$total$;
revoke all on function gestlok_torcuato_conteo_private.product_total(jsonb,jsonb,text,integer) from public,anon,authenticated;

-- Los días se comparan por producto, incluyendo los totales de todos los vencimientos y decomiso.
-- Caso documentado: el único conteo real 14/11 de Munro se archivó bajo el ID
-- Mañana entrada pero corresponde a Noche salida; NO se cambia el registro de origen.
create or replace function gestlok_torcuato_conteo_private.comparison_rows(p_day date)
returns table(product_id text, section text, product_name text, product_position integer,
 night_total bigint,morning_total bigint,night_updated_at timestamptz,
 acknowledged boolean)
language sql stable set search_path='' as $rows$
 select p.id,p.section,p.name,p.position,
  gestlok_torcuato_conteo_private.product_total(b.data,b.decomiso,p.id,p.units_per_chapa) night_total,
  gestlok_torcuato_conteo_private.product_total(m.data,m.decomiso,p.id,p.units_per_chapa) morning_total,
  b.updated_at,
  coalesce(a.night_total=gestlok_torcuato_conteo_private.product_total(b.data,b.decomiso,p.id,p.units_per_chapa)
   and a.morning_total=gestlok_torcuato_conteo_private.product_total(m.data,m.decomiso,p.id,p.units_per_chapa)
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
$rows$;
revoke all on function gestlok_torcuato_conteo_private.comparison_rows(date) from public,anon,authenticated;

create or replace function public.gestlok_torcuato_conteo_compare_morning(p_day date)
returns jsonb language plpgsql stable security definer set search_path='' as $api$
declare
 has_night boolean; first_day boolean; result jsonb;
 reference_shift text:=(case when false then 'manana_entrada' else 'noche_salida' end);
begin
 perform gestlok_torcuato_conteo_private.require_access(false,false);
 if p_day is null or p_day<date '2025-01-01'
  or p_day>(now() at time zone 'America/Argentina/Buenos_Aires')::date+1 then
   raise exception 'Día de Conteo no válido';
 end if;
 select exists(select 1 from gestlok_torcuato_conteo_private.shifts
  where day=p_day-1 and shift=reference_shift and status='finalizado') into has_night;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',x.product_id,'section',x.section,'name',x.product_name,
  'night_total',x.night_total,'morning_total',x.morning_total,
  'difference',x.morning_total-x.night_total,'acknowledged',x.acknowledged,
  'night_updated_at',x.night_updated_at
 ) order by case when upper(x.section) like '%EMPANADA%' then 0 when upper(x.section) like '%PIZZA%' then 1 else 2 end,
 x.product_position),'[]'::jsonb)
 into result from gestlok_torcuato_conteo_private.comparison_rows(p_day) x;
 return jsonb_build_object('previous_day',p_day-1,
  'previous_shift',reference_shift,'baseline_ready',has_night,'first_day',first_day,'rows',result);
end $api$;

create or replace function public.gestlok_torcuato_conteo_ack_morning(
 p_day date,p_product text,p_confirm boolean,
 p_night_total bigint default null,p_morning_total bigint default null,
 p_night_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $api$
declare
 previous gestlok_torcuato_conteo_private.shifts%rowtype;
 morning gestlok_torcuato_conteo_private.shifts%rowtype;
 compare_row record;
 baseline_shift text:=(case when false then 'manana_entrada' else 'noche_salida' end);
begin
 perform gestlok_torcuato_conteo_private.require_access(true,false);
 if p_day is null or p_product is null or length(p_product)>60
  or p_confirm is null then raise exception 'Datos inválidos'; end if;
 -- Bloquear primero Noche salida y después Mañana entrada, igual que finalizar:
 -- evita interbloqueos entre confirmación OK y cierre simultáneo.
 select * into previous from gestlok_torcuato_conteo_private.shifts
  where day=p_day-1 and shift=baseline_shift and status='finalizado' for update;
 if not found then raise exception 'Falta el cierre de Noche salida del día anterior'; end if;
 select * into morning from gestlok_torcuato_conteo_private.shifts
  where day=p_day and shift='manana_entrada' for update;
 if not found or morning.status='finalizado' then
  raise exception 'Solo se puede confirmar un turno Mañana entrada abierto y guardado';
 end if;
 select * into compare_row from gestlok_torcuato_conteo_private.comparison_rows(p_day) c
  where c.product_id=p_product;
 if not found then raise exception 'Producto no registrado'; end if;
 if not p_confirm then
  delete from gestlok_torcuato_conteo_private.morning_reconciliations
   where day=p_day and product_id=p_product;
  return jsonb_build_object('ok',true,'acknowledged',false);
 end if;
 if compare_row.night_total=compare_row.morning_total then
  raise exception 'Este producto ya coincide; no requiere confirmación';
 end if;
 if compare_row.night_total is distinct from p_night_total
  or compare_row.morning_total is distinct from p_morning_total
  or compare_row.night_updated_at is distinct from p_night_updated_at then
  raise exception 'Los totales cambiaron. Revisá las cantidades antes de marcar OK.';
 end if;
 insert into gestlok_torcuato_conteo_private.morning_reconciliations(
  day,product_id,night_total,morning_total,night_updated_at,acknowledged_by)
 values(p_day,p_product,compare_row.night_total,compare_row.morning_total,
  compare_row.night_updated_at,auth.uid())
 on conflict(day,product_id) do update
 set night_total=excluded.night_total,morning_total=excluded.morning_total,
 night_updated_at=excluded.night_updated_at,acknowledged_by=excluded.acknowledged_by,
 acknowledged_at=now();
 return jsonb_build_object('ok',true,'acknowledged',true);
end $api$;

-- Cierre protegido en servidor, aun si se intenta llamar RPC sin pasar por la interfaz.
create or replace function public.gestlok_torcuato_conteo_finalize(p_day date,p_shift text)
returns jsonb language plpgsql security definer set search_path='' as $api$
declare
 r gestlok_torcuato_conteo_private.shifts%rowtype;
 prior gestlok_torcuato_conteo_private.shifts%rowtype;
 pending_count integer;
 baseline_ready boolean:=false;
 baseline_shift text:=(case when false then 'manana_entrada' else 'noche_salida' end);
begin
 perform gestlok_torcuato_conteo_private.require_access(true,false);
 if p_day is null or p_shift not in ('manana_entrada','manana_salida','noche_salida') then
  raise exception 'Turno no válido';
 end if;
 if p_shift='manana_entrada' then
  select * into prior from gestlok_torcuato_conteo_private.shifts
   where day=p_day-1 and shift=baseline_shift and status='finalizado' for update;
  baseline_ready:=found;
  if not baseline_ready and exists(select 1 from gestlok_torcuato_conteo_private.shifts
   where day<p_day and shift='noche_salida' and status='finalizado') then
   raise exception 'No se puede cerrar Mañana entrada: falta Noche salida finalizada del día anterior.';
  end if;
 end if;
 select * into r from gestlok_torcuato_conteo_private.shifts
  where day=p_day and shift=p_shift for update;
 if not found or r.status='finalizado' then
  raise exception 'No hay un borrador pendiente de finalizar';
 end if;
 if r.responsable not in ('Cami','Shuli','Tizi') or r.responsable is null then
  raise exception 'Elegí al gerente responsable antes de finalizar';
 end if;
 if p_shift='manana_entrada' and baseline_ready then
  select count(*) into pending_count
  from gestlok_torcuato_conteo_private.comparison_rows(p_day) x
  where x.night_total<>x.morning_total and not x.acknowledged;
  if pending_count>0 then
   raise exception 'No se puede cerrar Mañana entrada: % productos difieren de Noche salida. Volvé a controlar y corregí o marcá OK por producto.',pending_count;
  end if;
 end if;
 update gestlok_torcuato_conteo_private.shifts
  set status='finalizado',finished_at=now(),updated_at=now(),updated_by=auth.uid()
  where day=p_day and shift=p_shift;
 return jsonb_build_object('ok',true);
end $api$;

-- Mañana entrada NUNCA carga consumo de colaboradores. No elimina datos de fechas pasadas.
create or replace function gestlok_torcuato_conteo_private.reject_morning_consumption()
returns trigger language plpgsql set search_path='' as $guard$
begin
 if new.shift='manana_entrada' and
  (case when tg_op='INSERT' then coalesce(new.consumption,'[]'::jsonb)<>'[]'::jsonb
   else new.consumption is distinct from old.consumption end) then
  raise exception 'Mañana entrada no tiene consumo de colaboradores';
 end if;
 return new;
end $guard$;
drop trigger if exists gestlok_torcuato_conteo_no_morning_consumption on gestlok_torcuato_conteo_private.shifts;
create trigger gestlok_torcuato_conteo_no_morning_consumption
 before insert or update on gestlok_torcuato_conteo_private.shifts
 for each row execute function gestlok_torcuato_conteo_private.reject_morning_consumption();
revoke all on function gestlok_torcuato_conteo_private.reject_morning_consumption() from public,anon,authenticated;

revoke all on function public.gestlok_torcuato_conteo_compare_morning(date) from public,anon,authenticated;
revoke all on function public.gestlok_torcuato_conteo_ack_morning(date,text,boolean,bigint,bigint,timestamptz) from public,anon,authenticated;
revoke all on function public.gestlok_torcuato_conteo_finalize(date,text) from public,anon;
grant execute on function public.gestlok_torcuato_conteo_compare_morning(date) to authenticated;
grant execute on function public.gestlok_torcuato_conteo_ack_morning(date,text,boolean,bigint,bigint,timestamptz) to authenticated;
grant execute on function public.gestlok_torcuato_conteo_finalize(date,text) to authenticated;
