-- GESTLOK · Mi Gusto Munro · Conteo por 3 turnos. No altera planillas ni otros locales.
create schema if not exists gestlok_munro_conteo_private;
revoke all on schema gestlok_munro_conteo_private from public, anon, authenticated;
create table if not exists gestlok_munro_conteo_private.products (
 id text primary key check(length(id) between 2 and 60),
 section text not null check(length(section) between 3 and 70),
 name text not null check(length(name) between 1 and 100),
 units_per_chapa integer not null default 0 check(units_per_chapa in (0,27,30)),
 position integer not null,
 active boolean not null default true
);
create table if not exists gestlok_munro_conteo_private.shifts (
 day date not null,
 shift text not null check(shift in ('manana_entrada','manana_salida','noche_salida')),
 data jsonb not null default '{}'::jsonb check(jsonb_typeof(data)='object'),
 consumption jsonb not null default '[]'::jsonb check(jsonb_typeof(consumption)='array'),
 waste jsonb not null default '[]'::jsonb check(jsonb_typeof(waste)='array'),
 status text not null default 'borrador' check(status in ('borrador','finalizado')),
 updated_by uuid,
 updated_at timestamptz not null default now(),
 finished_at timestamptz,
 primary key(day,shift)
);
alter table gestlok_munro_conteo_private.products enable row level security;
alter table gestlok_munro_conteo_private.shifts enable row level security;
revoke all on all tables in schema gestlok_munro_conteo_private from public, anon, authenticated;
-- La marca se fija por producto, incluso después de cambiar su nombre.
with input(section, names, rate) as (values
 ('EMPANADAS','AC,MT,BB,CP,BU,CC,CA,CS,PA,PO,PC,IQ,TA,VP,QC,RJ,CH,V,JH,4Q,MPP,MV,CZ,SGR',30),
 ('SALSAS','Ajo,Ketchup,BBQ,Cheddar,Chimi,Guacamole,C. Acida,S. Picante,Criolla',0),
 ('PIZZAS','Pizza Ind,Pizza GR,Pizza TACC',0),
 ('HELADOS','Minion,Oli King,Pistacchio,DDL mani,Patagonia,Avellana,Mini DDL,Mini Chocolat,Franui CCL,Franui CA',0),
 ('GASEOSAS 2,25 L','Coca-Cola,Coca-Cola Z,Sprite,Sprite Z,Fanta,Fanta Z,Schweppes',0),
 ('GASEOSAS 1,75 L','Coca-Cola,Coca-Cola Z,Sprite,Sprite Z,Fanta,Fanta Z,Schweppes',0),
 ('GASEOSAS 500 CC','Coca-Cola,Coca-Cola Z,Sprite,Sprite Z,Fanta,Fanta Z,Schweppes',0),
 ('GASEOSAS 354 CC','Coca-Cola,Coca-Cola Z,Sprite,Sprite Z,Fanta,Fanta Z,Schweppes',0),
 ('AGUAS SABORIZADAS 500 CC','Manzana,Pera,Pomelo',0),
 ('AGUAS SABORIZADAS 1,5 L','Manzana,Pera,Pomelo',0),
 ('AGUAS','Agua 500 cc,Agua c/g 500 cc,Agua 1,5 L,Agua c/g 1,5 L',0)
), sec as (select section,names,rate,row_number() over() as si from input),
 rows as (select sec.*,trim(x.name) as product_name,x.pos from sec cross join lateral unnest(string_to_array(sec.names,',')) with ordinality as x(name,pos))
insert into gestlok_munro_conteo_private.products(id,section,name,units_per_chapa,position)
select 'c'||si||'-'||pos, section,product_name,
 case when section='EMPANADAS' then case when product_name in ('MT','BB','SGR','MPP') then 27 else 30 end else 0 end,
 si*100+pos from rows on conflict (id) do nothing;
-- Comprueba rol y sucursal en cada llamada, no solo en la interfaz.
create or replace function gestlok_munro_conteo_private.require_access(p_write boolean default false,p_catalog boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare r text;
begin
 if auth.uid() is null or gestlok_tenancy.current_tenant_id() is distinct from 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
    or not public.puede_ver_local('munro') then
   raise exception 'Sin acceso a Conteo Munro' using errcode='42501';
 end if;
 r:=public.mi_rol();
 if r not in ('creadora','dueno','gerente') then
   raise exception 'Rol no autorizado' using errcode='42501';
 end if;
 if p_write and not public.puede_editar_local('munro') then
   raise exception 'No podés modificar Conteo' using errcode='42501';
 end if;
 if p_catalog then
   if r <> 'creadora' then raise exception 'Solo la administradora puede modificar productos' using errcode='42501'; end if;
   perform gestlok_platform.require_admin();
 end if;
end $$;
create or replace function public.gestlok_munro_conteo_state(p_day date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d date :=coalesce(p_day,(now() at time zone 'America/Argentina/Buenos_Aires')::date);
begin
 perform gestlok_munro_conteo_private.require_access(false,false);
 return jsonb_build_object(
  'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.position) from gestlok_munro_conteo_private.products p),'[]'::jsonb),
  'counts',coalesce((select jsonb_agg(to_jsonb(s) order by s.shift) from gestlok_munro_conteo_private.shifts s where s.day=d),'[]'::jsonb),
  'history',coalesce((select jsonb_agg(to_jsonb(q) order by q.day desc,q.shift) from
    (select * from gestlok_munro_conteo_private.shifts where status='finalizado' order by day desc,shift limit 150) q),'[]'::jsonb)
 );
end $$;
create or replace function public.gestlok_munro_conteo_set_cell(
 p_day date,p_shift text,p_product text,p_index integer,
 p_chapas integer default 0,p_sueltas integer default 0,p_qty integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
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
 if per>0 and p_qty<>0 then raise exception 'Las empanadas usan chapas y unidades sueltas'; end if;
 if per=0 and (p_chapas<>0 or p_sueltas<>0) then raise exception 'Este producto usa unidades'; end if;
 insert into gestlok_munro_conteo_private.shifts(day,shift) values(p_day,p_shift) on conflict do nothing;
 select * into r from gestlok_munro_conteo_private.shifts where day=p_day and shift=p_shift for update;
 if r.status='finalizado' then raise exception 'Este conteo ya fue finalizado'; end if;
 new_cell:=jsonb_build_object('chapas',p_chapas,'sueltas',p_sueltas,'qty',p_qty);
 update gestlok_munro_conteo_private.shifts set
  data=jsonb_set(r.data,array[p_product],coalesce(r.data->p_product,'{}'::jsonb)||jsonb_build_object('v'||p_index,new_cell),true),
  updated_by=auth.uid(),updated_at=now()
 where day=p_day and shift=p_shift;
 return jsonb_build_object('ok',true,'updated_at',now());
end $$;
create or replace function public.gestlok_munro_conteo_set_extra(p_day date,p_shift text,p_kind text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r gestlok_munro_conteo_private.shifts%rowtype;
begin
 perform gestlok_munro_conteo_private.require_access(true,false);
 if p_day is null or p_day < date '2025-01-01' or p_day > (now() at time zone 'America/Argentina/Buenos_Aires')::date + 1
 or p_shift not in ('manana_entrada','manana_salida','noche_salida')
 or p_kind not in ('consumption','waste') or jsonb_typeof(p_items)<>'array'
 or jsonb_array_length(p_items)>60 or length(p_items::text)>12000 then raise exception 'Datos no válidos'; end if;
 insert into gestlok_munro_conteo_private.shifts(day,shift) values(p_day,p_shift) on conflict do nothing;
 select * into r from gestlok_munro_conteo_private.shifts where day=p_day and shift=p_shift for update;
 if r.status='finalizado' then raise exception 'Este conteo ya fue finalizado'; end if;
 if p_kind='consumption' then
   update gestlok_munro_conteo_private.shifts set consumption=p_items,updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift;
 else
   update gestlok_munro_conteo_private.shifts set waste=p_items,updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift;
 end if;
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.gestlok_munro_conteo_finalize(p_day date,p_shift text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r gestlok_munro_conteo_private.shifts%rowtype;
begin
 perform gestlok_munro_conteo_private.require_access(true,false);
 if p_day is null or p_shift not in ('manana_entrada','manana_salida','noche_salida') then raise exception 'Turno no válido'; end if;
 select * into r from gestlok_munro_conteo_private.shifts where day=p_day and shift=p_shift for update;
 if not found or r.status='finalizado' then raise exception 'No hay un borrador pendiente de finalizar'; end if;
 update gestlok_munro_conteo_private.shifts
 set status='finalizado',finished_at=now(),updated_at=now(),updated_by=auth.uid()
 where day=p_day and shift=p_shift;
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.gestlok_munro_conteo_product(p_id text,p_name text,p_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform gestlok_munro_conteo_private.require_access(true,true);
 if p_id is null or p_name is null or length(trim(p_name)) not between 1 and 100 or p_active is null then
    raise exception 'Datos de producto no válidos'; end if;
 update gestlok_munro_conteo_private.products
 set name=trim(p_name),active=p_active where id=p_id;
 if not found then raise exception 'Producto no encontrado'; end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function gestlok_munro_conteo_private.require_access(boolean,boolean) from public,anon,authenticated;
revoke all on function public.gestlok_munro_conteo_state(date) from public,anon;
revoke all on function public.gestlok_munro_conteo_set_cell(date,text,text,integer,integer,integer,integer) from public,anon;
revoke all on function public.gestlok_munro_conteo_set_extra(date,text,text,jsonb) from public,anon;
revoke all on function public.gestlok_munro_conteo_finalize(date,text) from public,anon;
revoke all on function public.gestlok_munro_conteo_product(text,text,boolean) from public,anon;
grant execute on function public.gestlok_munro_conteo_state(date) to authenticated;
grant execute on function public.gestlok_munro_conteo_set_cell(date,text,text,integer,integer,integer,integer) to authenticated;
grant execute on function public.gestlok_munro_conteo_set_extra(date,text,text,jsonb) to authenticated;
grant execute on function public.gestlok_munro_conteo_finalize(date,text) to authenticated;
grant execute on function public.gestlok_munro_conteo_product(text,text,boolean) to authenticated;