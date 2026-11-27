-- Mi Gusto: carta de marca en nuevas sucursales, incluso con otro grupo de dueños.
-- La identidad se deriva de la sucursal canónica y de brand_memberships, no del nombre público.
-- No se copian pedidos, clientes, horarios, precios de envío, medios de pago, ni disponibilidad local.
create or replace function gestlok_chat_private.es_marca_mi_gusto(p_tenant uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
 select exists (
   select 1 from gestlok_chat_private.sucursales origen
   where origen.slug='mi-gusto-munro'
   and origen.tenant_id=coalesce(
     (select m.root_tenant from gestlok_platform.brand_memberships m where m.tenant_id=p_tenant),
     p_tenant
   )
 );
$$;
revoke all on function gestlok_chat_private.es_marca_mi_gusto(uuid) from public, anon, authenticated;

-- Conserva la forma anterior de la respuesta pública; añade solo un identificador de carta.
do $$
declare d text;
begin
 d := pg_get_functiondef('gestlok_chat_private.sucursal_publica(gestlok_chat_private.sucursales)'::regprocedure);
 if position('carta_visual_marca' in d)=0 then
   if position('''whatsapp_local'', s.whatsapp_local)' in d)=0 then
     raise exception 'Revisar sucursal_publica antes de añadir carta de marca';
   end if;
   execute replace(d, '''whatsapp_local'', s.whatsapp_local)',
     '''whatsapp_local'', s.whatsapp_local, ''carta_visual_marca'', case when gestlok_chat_private.es_marca_mi_gusto(s.tenant_id) then ''mi-gusto'' else null end)');
 end if;
end $$;

create or replace function gestlok_chat_private.heredar_carta_mi_gusto()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
 origen uuid; categorias jsonb; productos jsonb; p record; opciones_nuevas jsonb;
begin
 if not gestlok_chat_private.es_marca_mi_gusto(new.tenant_id) then return new; end if;
 select s.id into origen from gestlok_chat_private.sucursales s
 where s.slug='mi-gusto-munro' and s.id<>new.id;
 if origen is null then return new; end if;
 -- Nuevas sucursales: el descuento se deja apagado y el menú interactivo disponible.
 -- No activar el chat público ni copiar configuraciones operativas.
 update gestlok_chat_private.sucursales set descuento_efectivo_pct=0,
 precio_efectivo_en_carta=false, menu_interactivo=true where id=new.id and tenant_id=new.tenant_id;
 select coalesce(jsonb_object_agg(c.id::text,gen_random_uuid()::text),'{}'::jsonb) into categorias
 from gestlok_chat_private.categorias c where c.sucursal_id=origen;
 select coalesce(jsonb_object_agg(x.id::text,gen_random_uuid()::text),'{}'::jsonb) into productos
 from gestlok_chat_private.productos x where x.sucursal_id=origen;
 if categorias='{}'::jsonb or productos='{}'::jsonb then
   raise exception 'La carta de marca no está preparada';
 end if;
 insert into gestlok_chat_private.categorias(id,tenant_id,sucursal_id,nombre,orden,activa)
 select (categorias->>c.id::text)::uuid,new.tenant_id,new.id,c.nombre,c.orden,c.activa
 from gestlok_chat_private.categorias c where c.sucursal_id=origen;
 -- Primero insertar los productos sin referencias para que las opciones puedan apuntar a IDs propios.
 insert into gestlok_chat_private.productos(id,tenant_id,sucursal_id,categoria_id,nombre,descripcion,precio,activo,disponible,orden,opciones,reglas)
 select (productos->>x.id::text)::uuid,new.tenant_id,new.id,(categorias->>x.categoria_id::text)::uuid,
 x.nombre,x.descripcion,x.precio,x.activo,true,x.orden,'[]'::jsonb,x.reglas
 from gestlok_chat_private.productos x where x.sucursal_id=origen;
 for p in select x.id,x.opciones from gestlok_chat_private.productos x where x.sucursal_id=origen loop
   if exists(select 1 from jsonb_array_elements(p.opciones) g cross join lateral jsonb_array_elements(coalesce(g->'valores','[]'::jsonb)) v
      where v ? 'producto_id' and not (productos ? (v->>'producto_id'))) then
      raise exception 'Opción de carta fuera del catálogo de origen';
   end if;
   select coalesce(jsonb_agg(
     case when g.valor ? 'valores' then jsonb_set(g.valor,'{valores}',
       (select coalesce(jsonb_agg(case when v.valor ? 'producto_id' then jsonb_set(v.valor,'{producto_id}',productos->(v.valor->>'producto_id')) else v.valor end order by v.pos),'[]'::jsonb)
        from jsonb_array_elements(g.valor->'valores') with ordinality v(valor,pos)))
       else g.valor end order by g.pos),'[]'::jsonb)
   into opciones_nuevas from jsonb_array_elements(p.opciones) with ordinality g(valor,pos);
   update gestlok_chat_private.productos set opciones=opciones_nuevas
     where id=(productos->>p.id::text)::uuid and tenant_id=new.tenant_id and sucursal_id=new.id;
 end loop;
 return new;
end $$;
revoke all on function gestlok_chat_private.heredar_carta_mi_gusto() from public, anon, authenticated;
drop trigger if exists heredar_carta_mi_gusto on gestlok_chat_private.sucursales;
create trigger heredar_carta_mi_gusto after insert on gestlok_chat_private.sucursales
for each row execute function gestlok_chat_private.heredar_carta_mi_gusto();
