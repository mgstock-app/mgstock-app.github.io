-- Mi Gusto: LeBanana 30 unidades por caja y familia Franui 24 por caja.
-- Pink pertenece a Franui. Mantener su nombre y su identificador existentes.
-- Los registros viejos guardaron Franui/Pink en qty; conservarlos sin reescribir
-- los turnos archivados (qty representa unidades sueltas históricas).
-- Don Torcuato sigue sin registros en su Historial de Conteo.


-- MUNRO: conservar los IDs históricos de Franui / Pink.
update gestlok_munro_conteo_private.products
   set units_per_chapa=24
 where section='HELADOS' and id in ('c4-8','c4-9','c4-10')
   and name in ('Pink','Franui CCL','Franui CA')
   and units_per_chapa<>24;

-- Se valida antes de crear el producto para no pisar un SKU existente.
do $guard_munro$
begin
 if exists(select 1 from gestlok_munro_conteo_private.products where id='c4-11' and name<>'LeBanana') then
   raise exception 'ID c4-11 en uso en munro: no se modifica catálogo';
 end if;
 if (select count(*) from gestlok_munro_conteo_private.products
     where (id='c4-8' and name='Pink') or (id='c4-9' and name='Franui CCL')
        or (id='c4-10' and name='Franui CA')) <> 3 then
   raise exception 'Catálogo Franui de munro no coincide: no se aplica';
 end if;
end $guard_munro$;

insert into gestlok_munro_conteo_private.products (id,section,name,units_per_chapa,position,active)
values ('c4-11','HELADOS','LeBanana',30,411,true)
on conflict (id) do update
 set section='HELADOS',name='LeBanana',units_per_chapa=30,position=411,active=true;

-- Solo cambia el cálculo futuro de la lectura: qty sigue sumándose cuando
-- existan datos de los antiguos conteos por unidad (Franui/Pink).
-- La escritura nueva usa chapas (cajas), sueltas y qty=0.
create or replace function gestlok_munro_conteo_private.product_total(
 p_data jsonb, p_decomiso jsonb, p_product text, p_rate integer)
returns bigint language sql immutable set search_path='' as $fn$
 select coalesce(sum(
  case when p_rate>0 then
   coalesce((v.x->>'chapas')::bigint,0)*p_rate
   +coalesce((v.x->>'sueltas')::bigint,0)
   +coalesce((v.x->>'qty')::bigint,0)
  else coalesce((v.x->>'qty')::bigint,0) end),0)::bigint
 from (
  select p_data->p_product->('v'||g.i) as x
  from generate_series(1,4) as g(i)
  union all
  select p_decomiso->p_product
 ) v;
$fn$;


-- TORCUATO: conservar los IDs históricos de Franui / Pink.
update gestlok_torcuato_conteo_private.products
   set units_per_chapa=24
 where section='HELADOS' and id in ('c4-8','c4-9','c4-10')
   and name in ('Pink','Franui CCL','Franui CA')
   and units_per_chapa<>24;

-- Se valida antes de crear el producto para no pisar un SKU existente.
do $guard_torcuato$
begin
 if exists(select 1 from gestlok_torcuato_conteo_private.products where id='c4-11' and name<>'LeBanana') then
   raise exception 'ID c4-11 en uso en torcuato: no se modifica catálogo';
 end if;
 if (select count(*) from gestlok_torcuato_conteo_private.products
     where (id='c4-8' and name='Pink') or (id='c4-9' and name='Franui CCL')
        or (id='c4-10' and name='Franui CA')) <> 3 then
   raise exception 'Catálogo Franui de torcuato no coincide: no se aplica';
 end if;
end $guard_torcuato$;

insert into gestlok_torcuato_conteo_private.products (id,section,name,units_per_chapa,position,active)
values ('c4-11','HELADOS','LeBanana',30,411,true)
on conflict (id) do update
 set section='HELADOS',name='LeBanana',units_per_chapa=30,position=411,active=true;

-- Solo cambia el cálculo futuro de la lectura: qty sigue sumándose cuando
-- existan datos de los antiguos conteos por unidad (Franui/Pink).
-- La escritura nueva usa chapas (cajas), sueltas y qty=0.
create or replace function gestlok_torcuato_conteo_private.product_total(
 p_data jsonb, p_decomiso jsonb, p_product text, p_rate integer)
returns bigint language sql immutable set search_path='' as $fn$
 select coalesce(sum(
  case when p_rate>0 then
   coalesce((v.x->>'chapas')::bigint,0)*p_rate
   +coalesce((v.x->>'sueltas')::bigint,0)
   +coalesce((v.x->>'qty')::bigint,0)
  else coalesce((v.x->>'qty')::bigint,0) end),0)::bigint
 from (
  select p_data->p_product->('v'||g.i) as x
  from generate_series(1,4) as g(i)
  union all
  select p_decomiso->p_product
 ) v;
$fn$;
