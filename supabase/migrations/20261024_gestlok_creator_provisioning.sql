
create schema if not exists gestlok_platform;
revoke all on schema gestlok_platform from public, anon, authenticated;
create table if not exists gestlok_platform.admins (
  user_id uuid primary key, created_at timestamptz not null default now()
);
revoke all on gestlok_platform.admins from public, anon, authenticated;
insert into gestlok_platform.admins (user_id)
select a.id from auth.users a
join public.docs d on d.col='equipo' and lower(d.data->>'email')=lower(a.email)
where d.data->>'rol'='creadora'
and d.tenant_id=(select t.id from gestlok_tenancy.tenants t order by t.created_at,t.id limit 1)
on conflict do nothing;

create table if not exists gestlok_platform.companies (
 tenant_id uuid primary key references gestlok_tenancy.tenants(id) on delete restrict,
 code text not null unique,
 name text not null,
 local_id text not null unique,
 local_name text not null,
 owner_email text not null unique,
 mode text not null check(mode in ('fisica','online','mixta')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
revoke all on gestlok_platform.companies from public,anon,authenticated;

create or replace function public.gestlok_creator_prepare_company(
 p_name text,p_owner_email text,p_mode text,p_local_name text
)
returns jsonb language plpgsql security definer set search_path=''
as $body$
declare
 v_tenant uuid:=gen_random_uuid();
 v_local text:='loc-'||substr(replace(v_tenant::text,'-',''),1,20);
 v_code text:='neg-'||substr(replace(v_tenant::text,'-',''),1,24);
 v_name text:=trim(coalesce(p_name,''));
 v_owner text:=lower(trim(coalesce(p_owner_email,'')));
 v_local_name text:=trim(coalesce(p_local_name,''));
begin
 if auth.uid() is null or not exists (select 1 from gestlok_platform.admins a where a.user_id=auth.uid()) then
   raise exception 'Acceso exclusivo de la creadora' using errcode='42501';
 end if;
 if length(v_name) not between 2 and 100 or length(v_local_name) not between 2 and 100 then
   raise exception 'Empresa y local deben tener entre 2 y 100 caracteres';
 end if;
 if length(v_owner)>254 or v_owner !~ '^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)+$' then
   raise exception 'Correo del dueño inválido';
 end if;
 if p_mode not in ('fisica','online','mixta') then
   raise exception 'Modalidad inválida';
 end if;
 if exists(select 1 from public.docs d where d.col='equipo' and lower(d.data->>'email')=v_owner)
    or exists(select 1 from gestlok_platform.admins a join auth.users u on u.id=a.user_id
              where lower(u.email)=v_owner) then
   raise exception 'El correo ya está asignado a otra empresa';
 end if;
 insert into gestlok_tenancy.tenants(id,code) values(v_tenant,v_code);
 insert into public.docs(col,id,data,tenant_id,updated_by)
 values('locales',v_local,jsonb_build_object('nombre',v_local_name,'orden',1),v_tenant,'gestlok-platform');
 insert into public.docs(col,id,data,tenant_id,updated_by)
 values('equipo',v_owner,jsonb_build_object('email',v_owner,'rol','dueno',
       'locales',jsonb_build_array(v_local),'agregado',(extract(epoch from now())*1000)::bigint),
       v_tenant,'gestlok-platform');
 insert into public.docs(col,id,data,tenant_id,updated_by)
 values('configuracion_negocio','empresa-'||v_tenant::text,
       jsonb_build_object('tipo',p_mode,'actualizado',(extract(epoch from now())*1000)::bigint),
       v_tenant,'gestlok-platform');
 if p_mode in ('online','mixta') then
   insert into public.gestlok_tiendas(tenant_id,local_id,slug,nombre,visible,permite_retiro,permite_envio)
   values(v_tenant,v_local,'interno-'||substr(replace(v_tenant::text,'-',''),1,32),
          v_local_name,false,false,false);
 end if;
 insert into gestlok_platform.companies(tenant_id,code,name,local_id,local_name,owner_email,mode,created_by)
 values(v_tenant,v_code,v_name,v_local,v_local_name,v_owner,p_mode,auth.uid());
 return jsonb_build_object('tenant_id',v_tenant,'local_id',v_local,'code',v_code,
    'empresa',v_name,'local',v_local_name,'modalidad',p_mode,'propietario',v_owner);
end
$body$;
revoke all on function public.gestlok_creator_prepare_company(text,text,text,text) from public,anon;
grant execute on function public.gestlok_creator_prepare_company(text,text,text,text) to authenticated;

create or replace function public.gestlok_creator_list_companies()
returns jsonb language plpgsql stable security definer set search_path=''
as $body$
begin
 if auth.uid() is null or not exists(select 1 from gestlok_platform.admins a where a.user_id=auth.uid()) then
  raise exception 'Acceso exclusivo de la creadora' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'tenant_id',c.tenant_id,'code',c.code,'nombre',c.name,'local',c.local_name,
  'local_id',c.local_id,'correo_dueno',c.owner_email,'modalidad',c.mode,
  'creado',c.created_at,'productos',
   (select count(*) from public.docs d where d.col=c.local_id||'/productos' and d.tenant_id=c.tenant_id))
  order by c.created_at desc) from gestlok_platform.companies c),'[]'::jsonb);
end
$body$;
revoke all on function public.gestlok_creator_list_companies() from public,anon;
grant execute on function public.gestlok_creator_list_companies() to authenticated;

create or replace function public.gestlok_creator_import_products(
 p_tenant uuid,p_local text,p_rows jsonb
)
returns jsonb language plpgsql security definer set search_path=''
as $body$
declare
 v_company gestlok_platform.companies%rowtype;
 v_store uuid;
 v_row jsonb;
 v_sku text;v_name text;v_cat text;v_provider text;v_unit text;v_loc text;v_id text;
 v_stock integer;v_min integer;v_price numeric(12,2);v_cost numeric(12,2);
 v_n integer:=0;
begin
 if auth.uid() is null or not exists(select 1 from gestlok_platform.admins a where a.user_id=auth.uid()) then
   raise exception 'Acceso exclusivo de la creadora' using errcode='42501';
 end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)<1
    or jsonb_array_length(p_rows)>150 then
   raise exception 'Lote de 1 a 150 artículos requerido';
 end if;
 select * into v_company from gestlok_platform.companies
   where tenant_id=p_tenant and local_id=p_local;
 if not found then raise exception 'Empresa no encontrada'; end if;
 perform pg_advisory_xact_lock(hashtext(p_tenant::text));
 if (select count(*) from public.docs d where d.tenant_id=p_tenant and d.col=p_local||'/productos')
     + jsonb_array_length(p_rows) > 10000 then
   raise exception 'Máximo 10.000 productos por local';
 end if;
 select id into v_store from public.gestlok_tiendas t
   where t.tenant_id=p_tenant and t.local_id=p_local;
 for v_row in select value from jsonb_array_elements(p_rows) loop
   if jsonb_typeof(v_row) is distinct from 'object' then raise exception 'Fila inválida'; end if;
   v_sku:=upper(trim(coalesce(v_row->>'sku','')));
   v_name:=trim(coalesce(v_row->>'nombre',''));
   v_cat:=trim(coalesce(nullif(v_row->>'categoria',''),'General'));
   v_provider:=trim(coalesce(v_row->>'proveedor',''));
   v_unit:=trim(coalesce(nullif(v_row->>'unidad',''),'unidad'));
   v_loc:=trim(coalesce(v_row->>'ubicacion',''));
   if length(v_sku) not between 1 and 80 or v_sku !~ '^[A-Z0-9_-]+$'
      or length(v_name) not between 2 and 140 or length(v_cat) not between 1 and 80
      or length(v_provider)>120 or length(v_unit) not between 1 and 30 or length(v_loc)>120 then
     raise exception 'Producto inválido: revisá SKU, nombre, categoría y unidad';
   end if;
   if coalesce(v_row->>'stock','') !~ '^[0-9]{1,9}$'
      or coalesce(v_row->>'minimo','') !~ '^[0-9]{1,9}$' then
     raise exception 'Stock y mínimo deben ser enteros';
   end if;
   v_stock:=(v_row->>'stock')::integer;
   v_min:=(v_row->>'minimo')::integer;
   if v_stock>100000000 or v_min>100000000 then raise exception 'Stock demasiado alto'; end if;
   if coalesce(v_row->>'precio','') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
      or (v_row->>'precio')::numeric>9999999999 then raise exception 'Precio inválido'; end if;
   if nullif(v_row->>'costo','') is not null
     and (coalesce(v_row->>'costo','') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
        or (v_row->>'costo')::numeric>9999999999) then raise exception 'Costo inválido'; end if;
   v_price:=(v_row->>'precio')::numeric(12,2);
   v_cost:=nullif(v_row->>'costo','')::numeric(12,2);
   v_id:='sku-'||substr(md5(v_sku),1,26);
   insert into public.docs(col,id,data,tenant_id,updated_by)
     values(p_local||'/productos',v_id,
       jsonb_build_object('nombre',v_name,'cat',v_cat,'stock',v_stock,'min',v_min,
         'proveedor',v_provider,'unidad',v_unit,'sku',v_sku,'precio',v_price,
         'costo',v_cost,'ubicacion',v_loc,'hoja','stock'),
       p_tenant,'gestlok-platform')
     on conflict(col,id) do update set data=excluded.data,updated_at=now(),updated_by='gestlok-platform'
     where public.docs.tenant_id=excluded.tenant_id;
   if v_store is not null then
     insert into public.gestlok_productos_tienda
       (id,tienda_id,tenant_id,nombre,categoria,sku,precio,stock,minimo,costo,
        proveedor,ubicacion,unidad,publicado,activo)
     values((md5(p_tenant::text||'/'||p_local||'/'||v_sku))::uuid,v_store,p_tenant,
        v_name,v_cat,v_sku,v_price,v_stock,v_min,v_cost,v_provider,v_loc,v_unit,false,true)
     on conflict(id) do update set nombre=excluded.nombre,categoria=excluded.categoria,
        precio=excluded.precio,stock=excluded.stock,minimo=excluded.minimo,
        costo=excluded.costo,proveedor=excluded.proveedor,ubicacion=excluded.ubicacion,
        unidad=excluded.unidad,actualizado=now()
     where public.gestlok_productos_tienda.tenant_id=excluded.tenant_id
       and public.gestlok_productos_tienda.tienda_id=excluded.tienda_id;
   end if;
   v_n:=v_n+1;
 end loop;
 return jsonb_build_object('procesados',v_n,'tenant_id',p_tenant,'local_id',p_local);
end
$body$;
revoke all on function public.gestlok_creator_import_products(uuid,text,jsonb) from public,anon;
grant execute on function public.gestlok_creator_import_products(uuid,text,jsonb) to authenticated;
