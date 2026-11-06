-- WhatsApp Business Cloud API, Mi Gusto exclusivamente. Catálogos y conversaciones por sucursal.
-- No asignar precios ficticios. No mueve Caja, Stock ni Pagos Online.
-- Requiere firma Meta validada en Edge Function + secretos privados antes de recibir mensajes.

create table if not exists gestlok_mg_orders_private.menu_items (
 id uuid primary key default gen_random_uuid(),
 local text not null references gestlok_mg_orders_private.channels(local),
 name text not null check (length(btrim(name)) between 2 and 120),
 price numeric(12,2) not null check(price > 0 and price < 1000000),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(local,name)
);
create index if not exists mg_wa_menu_local on gestlok_mg_orders_private.menu_items(local,name) where active;
alter table gestlok_mg_orders_private.menu_items enable row level security;
revoke all on gestlok_mg_orders_private.menu_items from public,anon,authenticated;

create table if not exists gestlok_mg_orders_private.whatsapp_sessions (
 local text not null references gestlok_mg_orders_private.channels(local),
 sender text not null check (sender ~ '^[0-9]{8,15}$'),
 stage text not null default 'start' check(stage in ('start','catalog','quantity','cart','name','review','human')),
 selected_id uuid,
 cart jsonb not null default '[]'::jsonb check(jsonb_typeof(cart)='array'),
 customer_name text not null default '',
 page integer not null default 0 check(page between 0 and 20),
 updated_at timestamptz not null default now(),
 primary key(local,sender)
);
alter table gestlok_mg_orders_private.whatsapp_sessions enable row level security;
revoke all on gestlok_mg_orders_private.whatsapp_sessions from public,anon,authenticated;

create table if not exists gestlok_mg_orders_private.whatsapp_inbox (
 local text not null references gestlok_mg_orders_private.channels(local),
 message_id text not null check(length(message_id) between 5 and 250),
 sender text not null,
 response jsonb not null default '{}'::jsonb,
 received_at timestamptz not null default now(),
 sent_at timestamptz,
 primary key(local,message_id)
);
create index if not exists mg_wa_inbox_recent on gestlok_mg_orders_private.whatsapp_inbox(local,received_at desc);
alter table gestlok_mg_orders_private.whatsapp_inbox enable row level security;
revoke all on gestlok_mg_orders_private.whatsapp_inbox from public,anon,authenticated;

-- Dueños y administradora configuran precios; gerentes autorizados pueden consultar.
create or replace function public.gestlok_mg_orders_catalog(p_local text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not gestlok_mg_orders_private.allowed(p_local) then
   raise exception 'Acceso denegado' using errcode='42501';
 end if;
 return coalesce((
  select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'price',p.price,'active',p.active) order by p.name)
  from gestlok_mg_orders_private.menu_items p where p.local=p_local
 ),'[]'::jsonb);
end $$;

create or replace function public.gestlok_mg_orders_catalog_save(
 p_local text, p_name text, p_price numeric, p_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item gestlok_mg_orders_private.menu_items;
begin
 if not gestlok_mg_orders_private.allowed(p_local) or public.mi_rol() not in ('dueno','creadora') then
   raise exception 'No tenés permiso para editar precios' using errcode='42501';
 end if;
 if length(btrim(coalesce(p_name,''))) not between 2 and 120
    or p_price is null or p_price <= 0 or p_price >= 1000000 then
   raise exception 'Nombre o precio inválido' using errcode='22023';
 end if;
 if p_id is null then
   insert into gestlok_mg_orders_private.menu_items(local,name,price)
   values(p_local,btrim(p_name),p_price) returning * into v_item;
 else
   update gestlok_mg_orders_private.menu_items
   set name=btrim(p_name),price=p_price,active=true,updated_at=now()
   where id=p_id and local=p_local returning * into v_item;
   if not found then raise exception 'Producto ajeno o inexistente' using errcode='22023'; end if;
 end if;
 return jsonb_build_object('id',v_item.id,'name',v_item.name,'price',v_item.price);
end $$;

create or replace function public.gestlok_mg_orders_catalog_disable(p_local text,p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not gestlok_mg_orders_private.allowed(p_local) or public.mi_rol() not in ('dueno','creadora') then
   raise exception 'No tenés permiso para modificar el catálogo' using errcode='42501';
 end if;
 update gestlok_mg_orders_private.menu_items set active=false,updated_at=now()
 where local=p_local and id=p_id;
 if not found then raise exception 'Producto ajeno o inexistente' using errcode='22023'; end if;
 return true;
end $$;

-- Único punto de entrada desde Meta después de verificar firma y Phone Number ID.
-- Acceso exclusivo service_role; la operación, el pedido y la deduplicación son atómicos.
create or replace function public.gestlok_mg_whatsapp_turn(
 p_local text,p_sender text,p_message_id text,p_text text,p_profile_name text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v gestlok_mg_orders_private.whatsapp_sessions;
 v_out jsonb;
 v_existing gestlok_mg_orders_private.whatsapp_inbox;
 v_cat jsonb:='[]'::jsonb;
 v_item gestlok_mg_orders_private.menu_items;
 v_cart jsonb;
 v_total numeric(12,2);
 v_qty integer;
 v_msg text:=left(btrim(coalesce(p_text,'')),500);
 v_cmd text:=lower(v_msg);
 v_name text;
 v_order gestlok_mg_orders_private.orders;
 v_line text;
 v_lines text:='';
 v_row jsonb;
 v_id uuid;
 v_page integer;
begin
 if p_local not in ('munro','torcuato')
    or p_sender !~ '^[0-9]{8,15}$'
    or length(p_message_id) not between 5 and 250 then
   raise exception 'Evento WhatsApp inválido' using errcode='22023';
 end if;
 -- No procesar dos veces un evento ni enviar dos pedidos por el mismo click de confirmar.
 insert into gestlok_mg_orders_private.whatsapp_inbox(local,message_id,sender)
 values(p_local,p_message_id,p_sender) on conflict do nothing;
 if not found then
   select * into v_existing from gestlok_mg_orders_private.whatsapp_inbox
   where local=p_local and message_id=p_message_id;
   return v_existing.response || jsonb_build_object('duplicate',true,'sent',v_existing.sent_at is not null);
 end if;

 insert into gestlok_mg_orders_private.whatsapp_sessions(local,sender)
 values(p_local,p_sender) on conflict do nothing;
 select * into v from gestlok_mg_orders_private.whatsapp_sessions
 where local=p_local and sender=p_sender for update;

 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'price',p.price) order by p.name),'[]'::jsonb)
 into v_cat from (
   select id,name,price from gestlok_mg_orders_private.menu_items
   where local=p_local and active=true order by name limit 100
 ) p;

 if v_cmd in ('menu','inicio','hola','buenas','buen día','buen dia','cancelar','mi:cancel') then
   v.stage:='start';v.selected_id:=null;v.cart:='[]'::jsonb;v.customer_name:='';v.page:=0;
   v_out:=jsonb_build_object('type','welcome','local',p_local);
 elsif v.stage='human' then
   v_out:=jsonb_build_object('type','silent');
 elsif v_cmd in ('mi:human','3') and v.stage='start' then
   v.stage:='human';
   v_out:=jsonb_build_object('type','human');
 elsif v_cmd in ('mi:prices','2') and v.stage='start' then
   v_out:=jsonb_build_object('type','prices','catalog',v_cat,'local',p_local);
 elsif v_cmd in ('mi:order','1') and v.stage='start' then
   if jsonb_array_length(v_cat)=0 then
     v.stage:='human';
     v_out:=jsonb_build_object('type','empty','local',p_local);
   else
     v.stage:='catalog';v.page:=0;
     v_out:=jsonb_build_object('type','catalog','catalog',v_cat,'page',0,'local',p_local);
   end if;
 elsif v_cmd='mi:more' and v.stage='cart' then
   v.stage:='catalog';v.page:=0;
   v_out:=jsonb_build_object('type','catalog','catalog',v_cat,'page',0,'local',p_local);
 elsif v_cmd='mi:next' and v.stage='catalog' then
   v.page:=v.page+1;
   if v.page*9>=jsonb_array_length(v_cat) then v.page:=0; end if;
   v_out:=jsonb_build_object('type','catalog','catalog',v_cat,'page',v.page,'local',p_local);
 elsif v_cmd like 'mi:product:%' and v.stage='catalog' then
   begin
     v_id:=substring(v_msg from 12)::uuid;
   exception when invalid_text_representation then v_id:=null;
   end;
   select * into v_item from gestlok_mg_orders_private.menu_items
   where id=v_id and local=p_local and active=true;
   if not found then
     v_out:=jsonb_build_object('type','catalog','catalog',v_cat,'page',v.page,'local',p_local);
   else
     v.selected_id:=v_item.id;v.stage:='quantity';
     v_out:=jsonb_build_object('type','quantity','name',v_item.name);
   end if;
 elsif v.stage='quantity' then
   if (case when v_msg ~ '^[0-9]{1,2}
     v_out:=jsonb_build_object('type','invalid_quantity');
   else
     select * into v_item from gestlok_mg_orders_private.menu_items
       where id=v.selected_id and local=p_local and active=true;
     if not found then
       v.stage:='catalog';v_out:=jsonb_build_object('type','catalog','catalog',v_cat,'page',0,'local',p_local);
     else
       v_qty:=v_msg::integer;
       -- Limitar renglones para mantener la confirmación legible.
       if jsonb_array_length(v.cart)<8 then
         v.cart:=v.cart || jsonb_build_array(jsonb_build_object('id',v_item.id,'name',v_item.name,'price',v_item.price,'quantity',v_qty));
       end if;
       v.stage:='cart';v.selected_id:=null;
       select coalesce(sum((a->>'quantity')::numeric*(a->>'price')::numeric),0) into v_total
       from jsonb_array_elements(v.cart) a;
       v_out:=jsonb_build_object('type','cart','cart',v.cart,'total',v_total);
     end if;
   end if;
 elsif v_cmd='mi:finish' and v.stage='cart' then
   if jsonb_array_length(v.cart)>0 then
     v.stage:='name';v_out:=jsonb_build_object('type','ask_name');
   else
     v.stage:='catalog';v_out:=jsonb_build_object('type','catalog','catalog',v_cat,'page',0,'local',p_local);
   end if;
 elsif v.stage='name' then
   if length(v_msg) not between 2 and 100 then
     v_out:=jsonb_build_object('type','invalid_name');
   else
     v.customer_name:=v_msg;v.stage:='review';
     select coalesce(sum((a->>'quantity')::numeric*(a->>'price')::numeric),0) into v_total
       from jsonb_array_elements(v.cart) a;
     v_out:=jsonb_build_object('type','review','cart',v.cart,'total',v_total,'name',v.customer_name);
   end if;
 elsif v_cmd='mi:edit' and v.stage='review' then
   v.stage:='cart';
   select coalesce(sum((a->>'quantity')::numeric*(a->>'price')::numeric),0) into v_total
       from jsonb_array_elements(v.cart) a;
   v_out:=jsonb_build_object('type','cart','cart',v.cart,'total',v_total);
 elsif v_cmd='mi:confirm' and v.stage='review' then
   select coalesce(sum((a->>'quantity')::numeric*(a->>'price')::numeric),0) into v_total
     from jsonb_array_elements(v.cart) a;
   if v_total<=0 or length(v.customer_name)<2 then
     v.stage:='start';v_out:=jsonb_build_object('type','welcome','local',p_local);
   else
     for v_row in select value from jsonb_array_elements(v.cart) loop
       v_line:=(v_row->>'quantity')||' × '||(v_row->>'name')||' · $'||(v_row->>'price');
       v_lines:=v_lines||case when v_lines='' then '' else E'\n' end||v_line;
     end loop;
     -- El id del mensaje de confirmación es exclusivo, y el evento está serializado.
     insert into gestlok_mg_orders_private.orders(
        local,customer_name,customer_phone,items_detail,total,payment_method,
        source,external_message_id,notes,created_by
     ) values(
        p_local,v.customer_name,p_sender,v_lines,v_total,'efectivo',
        'whatsapp',p_message_id,'',null
     ) returning * into v_order;
     insert into gestlok_mg_orders_private.events(order_id,local,event,actor)
     values(v_order.id,p_local,'created',null);
     v_out:=jsonb_build_object('type','confirmed','order_id',v_order.id,'total',v_total,'local',p_local);
     v.stage:='start';v.cart:='[]'::jsonb;v.customer_name:='';v.selected_id:=null;v.page:=0;
   end if;
 elsif v.stage='start' then
   v_out:=jsonb_build_object('type','welcome','local',p_local);
 elsif v.stage='catalog' then
   v_out:=jsonb_build_object('type','catalog','catalog',v_cat,'page',v.page,'local',p_local);
 elsif v.stage='cart' then
   select coalesce(sum((a->>'quantity')::numeric*(a->>'price')::numeric),0) into v_total
     from jsonb_array_elements(v.cart) a;
   v_out:=jsonb_build_object('type','cart','cart',v.cart,'total',v_total);
 elsif v.stage='review' then
   select coalesce(sum((a->>'quantity')::numeric*(a->>'price')::numeric),0) into v_total
     from jsonb_array_elements(v.cart) a;
   v_out:=jsonb_build_object('type','review','cart',v.cart,'total',v_total,'name',v.customer_name);
 else
   v_out:=jsonb_build_object('type','welcome','local',p_local);
 end if;

 update gestlok_mg_orders_private.whatsapp_sessions set
  stage=v.stage,selected_id=v.selected_id,cart=v.cart,customer_name=v.customer_name,
  page=v.page,updated_at=now() where local=p_local and sender=p_sender;
 update gestlok_mg_orders_private.whatsapp_inbox set response=v_out
 where local=p_local and message_id=p_message_id;
 return v_out || jsonb_build_object('duplicate',false,'sent',false);
end $$;

create or replace function public.gestlok_mg_whatsapp_sent(p_local text,p_message_id text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update gestlok_mg_orders_private.whatsapp_inbox
 set sent_at=coalesce(sent_at,now())
 where local=p_local and message_id=p_message_id;
 return found;
end $$;

revoke all on function public.gestlok_mg_orders_catalog(text),
 public.gestlok_mg_orders_catalog_save(text,text,numeric,uuid),
 public.gestlok_mg_orders_catalog_disable(text,uuid),
 public.gestlok_mg_whatsapp_turn(text,text,text,text,text),
 public.gestlok_mg_whatsapp_sent(text,text)
 from public,anon,authenticated;
grant execute on function public.gestlok_mg_orders_catalog(text),
 public.gestlok_mg_orders_catalog_save(text,text,numeric,uuid),
 public.gestlok_mg_orders_catalog_disable(text,uuid) to authenticated;
grant execute on function public.gestlok_mg_whatsapp_turn(text,text,text,text,text),
 public.gestlok_mg_whatsapp_sent(text,text) to service_role;
 then v_msg::integer else 0 end) not between 1 and 50 then
     v_out:=jsonb_build_object('type','invalid_quantity');
   else
     select * into v_item from gestlok_mg_orders_private.menu_items
       where id=v.selected_id and local=p_local and active=true;
     if not found then
       v.stage:='catalog';v_out:=jsonb_build_object('type','catalog','catalog',v_cat,'page',0,'local',p_local);
     else
       v_qty:=v_msg::integer;
       v.cart:=v.cart || jsonb_build_array(jsonb_build_object('id',v_item.id,'name',v_item.name,'price',v_item.price,'quantity',v_qty));
       v.stage:='cart';v.selected_id:=null;
       select coalesce(sum((a->>'quantity')::numeric*(a->>'price')::numeric),0) into v_total
       from jsonb_array_elements(v.cart) a;
       v_out:=jsonb_build_object('type','cart','cart',v.cart,'total',v_total);
     end if;
   end if;
 elsif v_cmd='mi:finish' and v.stage='cart' then
   if jsonb_array_length(v.cart)>0 then
     v.stage:='name';v_out:=jsonb_build_object('type','ask_name');
   else
     v.stage:='catalog';v_out:=jsonb_build_object('type','catalog','catalog',v_cat,'page',0,'local',p_local);
   end if;
 elsif v.stage='name' then
   if length(v_msg) not between 2 and 100 then
     v_out:=jsonb_build_object('type','invalid_name');
   else
     v.customer_name:=v_msg;v.stage:='review';
     select coalesce(sum((a->>'quantity')::numeric*(a->>'price')::numeric),0) into v_total
       from jsonb_array_elements(v.cart) a;
     v_out:=jsonb_build_object('type','review','cart',v.cart,'total',v_total,'name',v.customer_name);
   end if;
 elsif v_cmd='mi:edit' and v.stage='review' then
   v.stage:='cart';
   select coalesce(sum((a->>'quantity')::numeric*(a->>'price')::numeric),0) into v_total
       from jsonb_array_elements(v.cart) a;
   v_out:=jsonb_build_object('type','cart','cart',v.cart,'total',v_total);
 elsif v_cmd='mi:confirm' and v.stage='review' then
   select coalesce(sum((a->>'quantity')::numeric*(a->>'price')::numeric),0) into v_total
     from jsonb_array_elements(v.cart) a;
   if v_total<=0 or length(v.customer_name)<2 then
     v.stage:='start';v_out:=jsonb_build_object('type','welcome','local',p_local);
   else
     for v_row in select value from jsonb_array_elements(v.cart) loop
       v_line:=(v_row->>'quantity')||' × '||(v_row->>'name')||' · $'||(v_row->>'price');
       v_lines:=v_lines||case when v_lines='' then '' else E'\n' end||v_line;
     end loop;
     -- El id del mensaje de confirmación es exclusivo, y el evento está serializado.
     insert into gestlok_mg_orders_private.orders(
        local,customer_name,customer_phone,items_detail,total,payment_method,
        source,external_message_id,notes,created_by
     ) values(
        p_local,v.customer_name,p_sender,v_lines,v_total,'efectivo',
        'whatsapp',p_message_id,'',null
     ) returning * into v_order;
     insert into gestlok_mg_orders_private.events(order_id,local,event,actor)
     values(v_order.id,p_local,'created',null);
     v_out:=jsonb_build_object('type','confirmed','order_id',v_order.id,'total',v_total,'local',p_local);
     v.stage:='start';v.cart:='[]'::jsonb;v.customer_name:='';v.selected_id:=null;v.page:=0;
   end if;
 elsif v.stage='start' then
   v_out:=jsonb_build_object('type','welcome','local',p_local);
 elsif v.stage='catalog' then
   v_out:=jsonb_build_object('type','catalog','catalog',v_cat,'page',v.page,'local',p_local);
 elsif v.stage='cart' then
   select coalesce(sum((a->>'quantity')::numeric*(a->>'price')::numeric),0) into v_total
     from jsonb_array_elements(v.cart) a;
   v_out:=jsonb_build_object('type','cart','cart',v.cart,'total',v_total);
 elsif v.stage='review' then
   select coalesce(sum((a->>'quantity')::numeric*(a->>'price')::numeric),0) into v_total
     from jsonb_array_elements(v.cart) a;
   v_out:=jsonb_build_object('type','review','cart',v.cart,'total',v_total,'name',v.customer_name);
 else
   v_out:=jsonb_build_object('type','welcome','local',p_local);
 end if;

 update gestlok_mg_orders_private.whatsapp_sessions set
  stage=v.stage,selected_id=v.selected_id,cart=v.cart,customer_name=v.customer_name,
  page=v.page,updated_at=now() where local=p_local and sender=p_sender;
 update gestlok_mg_orders_private.whatsapp_inbox set response=v_out
 where local=p_local and message_id=p_message_id;
 return v_out || jsonb_build_object('duplicate',false,'sent',false);
end $$;

create or replace function public.gestlok_mg_whatsapp_sent(p_local text,p_message_id text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update gestlok_mg_orders_private.whatsapp_inbox
 set sent_at=coalesce(sent_at,now())
 where local=p_local and message_id=p_message_id;
 return found;
end $$;

revoke all on function public.gestlok_mg_orders_catalog(text),
 public.gestlok_mg_orders_catalog_save(text,text,numeric,uuid),
 public.gestlok_mg_orders_catalog_disable(text,uuid),
 public.gestlok_mg_whatsapp_turn(text,text,text,text,text),
 public.gestlok_mg_whatsapp_sent(text,text)
 from public,anon,authenticated;
grant execute on function public.gestlok_mg_orders_catalog(text),
 public.gestlok_mg_orders_catalog_save(text,text,numeric,uuid),
 public.gestlok_mg_orders_catalog_disable(text,uuid) to authenticated;
grant execute on function public.gestlok_mg_whatsapp_turn(text,text,text,text,text),
 public.gestlok_mg_whatsapp_sent(text,text) to service_role;
