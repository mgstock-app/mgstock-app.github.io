-- ZAYRO · vidriera pública exclusiva de la cuenta Camila.
-- No modificar productos, pedidos, stock ni configuración de otras empresas.
-- La tienda nace desactivada, sin productos publicados ni contacto de venta.
create table if not exists public.gestlok_zayro_publications(
  product_id uuid primary key references public.gestlok_pilot_products(id) on delete cascade,
  tenant_id uuid not null default '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid
    check(tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid),
  published boolean not null default false,
  audience text not null default 'unisex'
    check(audience in ('mujer','hombre','unisex','capilar')),
  image_url text not null default '',
  description text not null default '',
  updated_at timestamptz not null default now()
);
create table if not exists public.gestlok_zayro_settings(
  tenant_id uuid primary key check(tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid),
  enabled boolean not null default false,
  sales_whatsapp text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.gestlok_zayro_settings(tenant_id,enabled,sales_whatsapp)
values ('2a97bf8d-7d08-4aa7-b051-5d1a4dc80103',false,'')
on conflict(tenant_id) do nothing;
alter table public.gestlok_zayro_publications enable row level security;
alter table public.gestlok_zayro_settings enable row level security;
revoke all on public.gestlok_zayro_publications from public,anon,authenticated;
revoke all on public.gestlok_zayro_settings from public,anon,authenticated;

-- Dueña verificada por UID real y su selección actual de empresa.
-- No depende de metadatos editables por el cliente.
create or replace function public.gestlok_zayro_is_owner()
returns boolean language sql stable security definer set search_path=''
as $$
 select (select auth.uid())='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid
 and exists(
   select 1 from gestlok_tenancy.account_active_tenant a
   where a.user_id=(select auth.uid())
     and a.tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid
 );
$$;
revoke all on function public.gestlok_zayro_is_owner() from public,anon;
grant execute on function public.gestlok_zayro_is_owner() to authenticated;

-- Solo devuelve campos aptos para la vidriera. Nunca costo, margen, UID,
-- datos privados, proveedores ni productos no publicados / sin stock.
create or replace function public.gestlok_zayro_public_catalog()
returns jsonb language sql stable security definer set search_path=''
as $$
 with configuration as (
   select enabled,sales_whatsapp from public.gestlok_zayro_settings
   where tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid
 ),
 listing as (
   select p.id, p.name, p.category, p.sku,
     coalesce(p.manual_sale_price,p.unit_price) price,
     greatest(p.stock_quantity,0) stock,
     z.image_url,z.description,z.audience
   from public.gestlok_pilot_products p
   join public.gestlok_zayro_publications z on z.product_id=p.id
     and z.tenant_id=p.tenant_id
   where p.tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid
     and z.published is true and p.active is true and p.in_stock is true
     and coalesce(p.stock_quantity,0)>0
     and coalesce(p.manual_sale_price,p.unit_price,0)>0
   order by p.name,p.id
   limit 250
 )
 select jsonb_build_object(
   'brand','ZAYRO',
   'enabled',coalesce((select enabled from configuration),false)
     and coalesce((select sales_whatsapp from configuration),'')<>'',
   'sales_whatsapp',case when coalesce((select enabled from configuration),false)
                  then coalesce((select sales_whatsapp from configuration),'') else '' end,
   'currency','ARS',
   'products',
     case when coalesce((select enabled from configuration),false)
            and coalesce((select sales_whatsapp from configuration),'')<>''
          then coalesce((select jsonb_agg(jsonb_build_object(
            'id',id,'name',name,'category',category,'sku',sku,
            'price',price,'stock',stock,'image_url',image_url,
            'description',description,'audience',audience
          ) order by name,id) from listing),'[]'::jsonb)
          else '[]'::jsonb end
 );
$$;
revoke all on function public.gestlok_zayro_public_catalog() from public,anon,authenticated;
grant execute on function public.gestlok_zayro_public_catalog() to anon,authenticated;

-- Panel privado: sin escrituras directas sobre las tablas de configuración.
create or replace function public.gestlok_zayro_admin_catalog()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.gestlok_zayro_is_owner() then
   raise exception 'Acceso privado de ZAYRO' using errcode='42501';
 end if;
 return jsonb_build_object(
   'enabled',coalesce((select enabled from public.gestlok_zayro_settings where
     tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid),false),
   'sales_whatsapp',coalesce((select sales_whatsapp from public.gestlok_zayro_settings where
     tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid),''),
   'products',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',v.id,'name',v.name,'category',v.category,'price',v.price,'stock',v.stock,
       'active',v.active,'published',v.published,'audience',v.audience,
       'image_url',v.image_url,'description',v.description) order by v.name,v.id)
     from (
       select p.id,p.name,p.category,coalesce(p.manual_sale_price,p.unit_price) price,
          p.stock_quantity stock,p.active,coalesce(z.published,false) published,
          coalesce(z.audience,'unisex') audience,
          coalesce(z.image_url,'') image_url,coalesce(z.description,'') description
       from public.gestlok_pilot_products p
       left join public.gestlok_zayro_publications z on z.product_id=p.id
       where p.tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid
         and p.owner_uid=(select auth.uid())
       order by p.name,p.id limit 250
     ) v
   ),'[]'::jsonb)
 );
end $$;
revoke all on function public.gestlok_zayro_admin_catalog() from public,anon;
grant execute on function public.gestlok_zayro_admin_catalog() to authenticated;

create or replace function public.gestlok_zayro_admin_settings(
 p_enabled boolean,p_phone text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_phone text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
begin
 if not public.gestlok_zayro_is_owner() then
   raise exception 'Acceso privado de ZAYRO' using errcode='42501';
 end if;
 if (v_phone<>'' and length(v_phone) not between 10 and 15)
   or (coalesce(p_enabled,false) and v_phone='') then
   raise exception 'Ingresá un WhatsApp de ventas válido antes de habilitar la tienda'
     using errcode='22023';
 end if;
 insert into public.gestlok_zayro_settings(tenant_id,enabled,sales_whatsapp,updated_at)
 values('2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid,coalesce(p_enabled,false),v_phone,now())
 on conflict(tenant_id) do update set enabled=excluded.enabled,
   sales_whatsapp=excluded.sales_whatsapp,updated_at=now();
 return jsonb_build_object('enabled',coalesce(p_enabled,false),'sales_whatsapp',v_phone);
end $$;
revoke all on function public.gestlok_zayro_admin_settings(boolean,text) from public,anon;
grant execute on function public.gestlok_zayro_admin_settings(boolean,text) to authenticated;

create or replace function public.gestlok_zayro_admin_product(
 p_product uuid,p_published boolean,p_audience text,p_image text,p_description text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_desc text:=btrim(coalesce(p_description,''));
 v_image text:=btrim(coalesce(p_image,''));
 v_id uuid;
begin
 if not public.gestlok_zayro_is_owner() then
   raise exception 'Acceso privado de ZAYRO' using errcode='42501';
 end if;
 if p_audience not in ('mujer','hombre','unisex','capilar')
   or length(v_desc)>700 or length(v_image)>650
   or (v_image<>'' and v_image !~* '^https://[^ ]+$') then
   raise exception 'Revisá categoría, descripción e imagen' using errcode='22023';
 end if;
 select id into v_id from public.gestlok_pilot_products
 where id=p_product
   and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid
   and owner_uid=(select auth.uid());
 if v_id is null then
   raise exception 'Producto no pertenece a esta empresa' using errcode='42501';
 end if;
 insert into public.gestlok_zayro_publications
   (product_id,tenant_id,published,audience,image_url,description,updated_at)
 values(p_product,'2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid,
   coalesce(p_published,false),p_audience,v_image,v_desc,now())
 on conflict(product_id) do update set
   published=excluded.published,audience=excluded.audience,
   image_url=excluded.image_url,description=excluded.description,updated_at=now();
 return jsonb_build_object('product_id',p_product,'published',coalesce(p_published,false));
end $$;
revoke all on function public.gestlok_zayro_admin_product(uuid,boolean,text,text,text)
  from public,anon;
grant execute on function public.gestlok_zayro_admin_product(uuid,boolean,text,text,text)
  to authenticated;
