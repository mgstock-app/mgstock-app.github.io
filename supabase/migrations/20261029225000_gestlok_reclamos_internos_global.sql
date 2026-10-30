-- GESTLOK | Reclamos Internos: módulo multiempresa independiente de Reseñas.
-- Cada registro pertenece al tenant autenticado y local existente; no modifica tablas anteriores.
-- MG-000...MG-999: únicos, globales, sin reutilización. Agotamiento explícito al llegar a 1000.
create schema if not exists gestlok_reclamos_private;
revoke all on schema gestlok_reclamos_private from public, anon, authenticated;

create table if not exists gestlok_reclamos_private.coupons (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references gestlok_tenancy.tenants(id),
 local_id text not null,
 customer_name text not null check (char_length(btrim(customer_name)) between 2 and 100),
 phone text not null check (phone ~ '^[0-9]{7,18}$'),
 code text not null unique check (code ~ '^MG-[0-9]{3}$'),
 discount_percent numeric(5,2) not null check (discount_percent > 0 and discount_percent <= 100),
 manager_name text not null check (char_length(btrim(manager_name)) between 2 and 100),
 observation text not null default '' check (char_length(observation) <= 500),
 created_at timestamptz not null default now(),
 created_by uuid not null,
 updated_at timestamptz,
 updated_by uuid,
 used_at timestamptz,
 used_by uuid,
 check ((used_at is null) = (used_by is null))
);
create index if not exists gestlok_reclamos_by_local_created on gestlok_reclamos_private.coupons(tenant_id,local_id,created_at desc);
alter table gestlok_reclamos_private.coupons enable row level security;
revoke all on table gestlok_reclamos_private.coupons from public, anon, authenticated;

create table if not exists gestlok_reclamos_private.events(
 id bigint generated always as identity primary key,
 coupon_id uuid not null references gestlok_reclamos_private.coupons(id),
 action text not null check(action in ('created','updated','used')),
 actor uuid not null,
 happened_at timestamptz not null default now(),
 details jsonb not null default '{}'::jsonb
);
create unique index if not exists gestlok_reclamos_only_one_use on gestlok_reclamos_private.events(coupon_id) where action='used';
alter table gestlok_reclamos_private.events enable row level security;
revoke all on table gestlok_reclamos_private.events from public, anon, authenticated;

create or replace function gestlok_reclamos_private.authorized(p_local text,p_write boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(
  auth.uid() is not null
  and (select gestlok_tenancy.current_tenant_id()) is not null
  and nullif(btrim(p_local),'') is not null
  and (case when p_write
       then public.puede_editar_local(p_local)
        and public.mi_rol() in ('creadora','dueno','gerente','editor')
       else public.puede_ver_local(p_local)
        and public.mi_rol() in ('creadora','dueno','gerente','editor','lectura') end)
 ,false)
$$;

create or replace function gestlok_reclamos_private.phone(p_phone text)
returns text language plpgsql immutable set search_path='' as $$
declare p text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
begin
 if p !~ '^[0-9]{7,18}$' then raise exception 'Teléfono inválido: ingresar entre 7 y 18 dígitos' using errcode='22023'; end if;
 return p;
end $$;

create or replace function gestlok_reclamos_private.payload(c gestlok_reclamos_private.coupons)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'id',c.id,'tenant_id',c.tenant_id,'local_id',c.local_id,
  'customer_name',c.customer_name,'phone',c.phone,'code',c.code,
  'discount_percent',c.discount_percent,'manager_name',c.manager_name,
  'observation',c.observation,'created_at',c.created_at,
  'updated_at',c.updated_at,'used_at',c.used_at,
  'status',case when c.used_at is null then 'pending' else 'used' end)
$$;

create or replace function public.gestlok_reclamos_list(p_local text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t uuid := (select gestlok_tenancy.current_tenant_id());
begin
 if not gestlok_reclamos_private.authorized(p_local,false) then
  raise exception 'Acceso denegado a Reclamos Internos' using errcode='42501'; end if;
 return coalesce(
  (select jsonb_agg(gestlok_reclamos_private.payload(c) order by c.created_at desc,c.id)
   from gestlok_reclamos_private.coupons c where c.tenant_id=t and c.local_id=p_local),
  '[]'::jsonb);
end $$;

create or replace function public.gestlok_reclamos_create(
 p_local text,p_name text,p_phone text,p_discount numeric,p_manager text,p_observation text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c gestlok_reclamos_private.coupons; t uuid := (select gestlok_tenancy.current_tenant_id());
 p text; start_at int; i int; candidate text;
begin
 if not gestlok_reclamos_private.authorized(p_local,true) then
  raise exception 'Sin permiso para emitir reclamos en este local' using errcode='42501'; end if;
 p:=gestlok_reclamos_private.phone(p_phone);
 if char_length(btrim(coalesce(p_name,''))) not between 2 and 100 then
  raise exception 'Ingresá nombre del cliente (2 a 100 caracteres)' using errcode='22023'; end if;
 if char_length(btrim(coalesce(p_manager,''))) not between 2 and 100 then
  raise exception 'Ingresá el nombre del gerente responsable' using errcode='22023'; end if;
 if p_discount is null or p_discount<=0 or p_discount>100 or p_discount<>round(p_discount,2) then
  raise exception 'Descuento inválido (0,01 a 100 por ciento)' using errcode='22023'; end if;
 if char_length(coalesce(p_observation,''))>500 then
  raise exception 'Observación demasiado extensa (máximo 500)' using errcode='22023'; end if;
 -- Serializa todos los emisores de todos los tenants: código irrepetible para siempre.
 perform pg_catalog.pg_advisory_xact_lock(710622, 530);
 start_at:=pg_catalog.floor(pg_catalog.random()*1000)::int;
 for i in 0..999 loop
  candidate:='MG-'||pg_catalog.lpad(((start_at+i)%1000)::text,3,'0');
  exit when not exists(select 1 from gestlok_reclamos_private.coupons where code=candidate);
 end loop;
 if exists(select 1 from gestlok_reclamos_private.coupons where code=candidate) then
  raise exception 'Se agotaron los 1000 códigos MG-000 a MG-999; no se reutilizan' using errcode='P0001'; end if;
 insert into gestlok_reclamos_private.coupons
 (tenant_id,local_id,customer_name,phone,code,discount_percent,manager_name,observation,created_by)
 values(t,p_local,btrim(p_name),p,candidate,p_discount,btrim(p_manager),btrim(coalesce(p_observation,'')),auth.uid())
 returning * into c;
 insert into gestlok_reclamos_private.events(coupon_id,action,actor,details)
 values(c.id,'created',auth.uid(),jsonb_build_object('discount_percent',c.discount_percent,'manager_name',c.manager_name));
 return gestlok_reclamos_private.payload(c);
end $$;

create or replace function public.gestlok_reclamos_update(
 p_local text,p_id uuid,p_name text,p_phone text,p_discount numeric,p_manager text,p_observation text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c gestlok_reclamos_private.coupons; t uuid := (select gestlok_tenancy.current_tenant_id());
 p text; previous_discount numeric;
begin
 if not gestlok_reclamos_private.authorized(p_local,true) then
  raise exception 'Sin permiso para editar reclamos' using errcode='42501'; end if;
 p:=gestlok_reclamos_private.phone(p_phone);
 if char_length(btrim(coalesce(p_name,''))) not between 2 and 100
   or char_length(btrim(coalesce(p_manager,''))) not between 2 and 100
   or p_discount is null or p_discount<=0 or p_discount>100
   or p_discount<>round(p_discount,2)
   or char_length(coalesce(p_observation,''))>500 then
  raise exception 'Revisá nombre, gerente, porcentaje y observación' using errcode='22023'; end if;
 select discount_percent into previous_discount
 from gestlok_reclamos_private.coupons where id=p_id and tenant_id=t and local_id=p_local and used_at is null for update;
 if not found then raise exception 'Solo pueden modificarse cupones pendientes del local' using errcode='22023'; end if;
 update gestlok_reclamos_private.coupons
 set customer_name=btrim(p_name),phone=p,discount_percent=p_discount,manager_name=btrim(p_manager),
 observation=btrim(coalesce(p_observation,'')),updated_at=now(),updated_by=auth.uid()
 where id=p_id and tenant_id=t and local_id=p_local and used_at is null returning * into c;
 insert into gestlok_reclamos_private.events(coupon_id,action,actor,details)
 values(c.id,'updated',auth.uid(),jsonb_build_object('previous_discount',previous_discount,'discount_percent',c.discount_percent));
 return gestlok_reclamos_private.payload(c);
end $$;

create or replace function public.gestlok_reclamos_redeem(p_local text,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c gestlok_reclamos_private.coupons; t uuid := (select gestlok_tenancy.current_tenant_id());
begin
 if not gestlok_reclamos_private.authorized(p_local,true) then
  raise exception 'Sin permiso para usar este cupón' using errcode='42501'; end if;
 update gestlok_reclamos_private.coupons
 set used_at=now(),used_by=auth.uid()
 where id=p_id and tenant_id=t and local_id=p_local and used_at is null returning * into c;
 if not found then raise exception 'Cupón ya utilizado, de otro local o inexistente' using errcode='22023'; end if;
 insert into gestlok_reclamos_private.events(coupon_id,action,actor)
 values(c.id,'used',auth.uid());
 return gestlok_reclamos_private.payload(c);
end $$;

revoke all on all functions in schema gestlok_reclamos_private from public,anon,authenticated;
revoke all on function public.gestlok_reclamos_list(text) from public,anon;
revoke all on function public.gestlok_reclamos_create(text,text,text,numeric,text,text) from public,anon;
revoke all on function public.gestlok_reclamos_update(text,uuid,text,text,numeric,text,text) from public,anon;
revoke all on function public.gestlok_reclamos_redeem(text,uuid) from public,anon;
grant execute on function public.gestlok_reclamos_list(text),
 public.gestlok_reclamos_create(text,text,text,numeric,text,text),
 public.gestlok_reclamos_update(text,uuid,text,text,numeric,text,text),
 public.gestlok_reclamos_redeem(text,uuid) to authenticated;
