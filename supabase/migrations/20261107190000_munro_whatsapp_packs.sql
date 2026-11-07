create or replace function public.gestlok_mg_whatsapp_turn(
 p_local text,p_sender text,p_message_id text,p_text text,p_profile_name text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v gestlok_mg_orders_private.whatsapp_sessions;
 v_out jsonb;
 v_existing gestlok_mg_orders_private.whatsapp_inbox;
 v_cat jsonb:='[]'::jsonb;
 v_item gestlok_mg_orders_private.menu_items;
 v_total numeric(12,2);
 v_units integer;
 v_qty integer;
 v_msg text:=left(btrim(coalesce(p_text,'')),500);
 v_cmd text;
 v_texts jsonb;
 v_order gestlok_mg_orders_private.orders;
 v_line text;
 v_lines text:='';
 v_row jsonb;
 v_id uuid;
 v_num integer;
 v_pack_empanadas integer;
 v_pack_sauces integer;
 v_flavors constant text[] := array['Carne a Cuchillo','Carne Picante','Carne Suave','Carne con Aceitunas','Pollo al Champignon','Roquefort con Jamón','Pollo','Jamón y Queso','Verdura','Choclo','Cebolla y Queso','Jamón, Huevo y Queso','Calabaza','Cuatro Quesos','Big Burger','Vacío y Provoleta','Doble Bacon Cheeseburger','Matambre a la Pizza','Mexican Pibil Pork','American Chicken','La Sagrada'];
 v_sauces constant text[] := array['Barbacoa','American ketchup','crema de ajo','cheddar','criolla','chimi'];
 v_choices text[];
 v_flavor_ids integer[];
 v_sauce_ids integer[];
 v_details text;
 v_full boolean:=false;
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

 -- Conversación sin movimiento por 3 horas: vuelve al inicio (incluye «Hablar con el local»).
 if v.stage<>'start' and v.updated_at < now()-interval '3 hours' then
   v.stage:='start';v.selected_id:=null;v.cart:='[]'::jsonb;v.customer_name:='';v.notes:='';v.page:=0;
 end if;

 select to_jsonb(s)-'local'-'updated_at'-'updated_by' into v_texts
 from gestlok_mg_orders_private.whatsapp_settings s where s.local=p_local;

 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'price',p.price) order by p.name),'[]'::jsonb)
 into v_cat from (
   select id,name,price from gestlok_mg_orders_private.menu_items
   where local=p_local and active=true order by name limit 100
 ) p;

 v_cmd:=lower(v_msg);
 -- El cliente puede escribir el nombre de la opción en lugar de tocar el botón.
 if v_texts is not null and v.stage='start' then
   if v_cmd=lower(btrim(v_texts->>'option_order')) then v_cmd:='mi:order';
   elsif v_cmd=lower(btrim(v_texts->>'option_prices')) then v_cmd:='mi:prices';
   elsif v_cmd=lower(btrim(v_texts->>'option_human')) then v_cmd:='mi:human';
   end if;
 end if;
 if p_local='munro' and (v.stage='quantity' or v.stage='catalog') then
   select pack.empanadas,pack.sauces into v_pack_empanadas,v_pack_sauces
   from gestlok_mg_orders_private.menu_items item
   join (values
        ('3 empanadas + lata 354 ml + salsa',3,1),
        ('2 empanadas + lata 354 ml + salsa',2,1),
        ('3 empanadas + 1 salsa',3,1),
        ('2 empanadas + 1 salsa',2,1),
        ('6 empanadas + 2 salsas',6,2),
        ('12 empanadas + 3 salsas',12,3),
        ('8 empanadas + 2 salsas',8,2),
        ('Pizza grande mitad Muzza y mitad Jamón y Morrón + 2 empanadas',2,0),
        ('Pizza grande Muzza + 6 empanadas + 2 salsas',6,2),
        ('18 empanadas + 5 salsas',18,5)
   ) pack(name,empanadas,sauces) on pack.name=item.name
   where item.local='munro' and item.active and item.id=case
     when v.stage='quantity' then v.selected_id
     when v_cmd ~ '^mi:product:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then substring(v_cmd from 12)::uuid
   end;
 end if;
 if v.stage='quantity' and v_pack_empanadas is null and v_cmd ~ '^mi:qty:[0-9]{1,2}$' then
   v_msg:=substring(v_cmd from 8);v_cmd:=v_msg;
 end if;

 if v_cmd in ('menu','menú','inicio','hola','buenas','buen día','buen dia','cancelar','mi:cancel') then
   v.stage:='start';v.selected_id:=null;v.cart:='[]'::jsonb;v.customer_name:='';v.notes:='';v.page:=0;
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
     v_out:=jsonb_build_object('type','quantity','name',v_item.name,'price',v_item.price);
     if v_pack_empanadas is not null then
       v_out:=jsonb_build_object('type','pack','name',v_item.name,'price',v_item.price);
     end if;
   end if;
 elsif v.stage='quantity' and v_pack_empanadas is not null then
   select * into v_item from gestlok_mg_orders_private.menu_items
   where id=v.selected_id and local=p_local and active=true;
   v_choices:=string_to_array(v_msg,'/');
   if btrim(v_choices[1]) ~ '^([1-9]|1[0-9]|2[01])( +([1-9]|1[0-9]|2[01]))*$' then
     v_flavor_ids:=regexp_split_to_array(btrim(v_choices[1]),' +')::integer[];
   end if;
   if btrim(v_choices[2]) ~ '^[1-6]( +[1-6])*$' then
     v_sauce_ids:=regexp_split_to_array(btrim(v_choices[2]),' +')::integer[];
   end if;
   if cardinality(v_flavor_ids) is distinct from v_pack_empanadas
     or coalesce(cardinality(v_sauce_ids),0) <> v_pack_sauces
     or cardinality(v_choices) <> (case when v_pack_sauces=0 then 1 else 2 end) then
     v_out:=jsonb_build_object('type','pack','name',v_item.name,'price',v_item.price,'invalid',true);
   else
     select string_agg(quantity||' × '||v_flavors[choice],', ' order by choice)
     into v_details from (select choice,count(*) quantity from unnest(v_flavor_ids) choice group by choice) counts;
     if v_pack_sauces>0 then
       v_details:=v_details||' / Salsas: '||(select string_agg(quantity||' × '||v_sauces[choice],', ' order by choice)
         from (select choice,count(*) quantity from unnest(v_sauce_ids) choice group by choice) counts);
     end if;
     if jsonb_array_length(v.cart)<8 then
       v.cart:=v.cart||jsonb_build_array(jsonb_build_object(
         'id',v_item.id,'name',v_item.name,'price',v_item.price,'quantity',1,'details',v_details,
         'choices',array_to_string(v_flavor_ids,' ')||case when v_pack_sauces>0 then ' / '||array_to_string(v_sauce_ids,' ') else '' end));
     else
       v_full:=true;
     end if;
     v.stage:='cart';v.selected_id:=null;
     select coalesce(sum((a->>'quantity')::numeric*(a->>'price')::numeric),0) into v_total
     from jsonb_array_elements(v.cart) a;
     v_out:=jsonb_build_object('type','cart','cart',v.cart,'total',v_total,'full',v_full);
   end if;
 elsif v.stage='quantity' then
   if (case when v_msg ~ '^[0-9]{1,2}$' then v_msg::integer else 0 end) not between 1 and 50 then
     v_out:=jsonb_build_object('type','invalid_quantity');
   else
     select * into v_item from gestlok_mg_orders_private.menu_items
       where id=v.selected_id and local=p_local and active=true;
     if not found then
       v.stage:='catalog';v_out:=jsonb_build_object('type','catalog','catalog',v_cat,'page',0,'local',p_local);
     else
       v_qty:=v_msg::integer;
       if exists(select 1 from jsonb_array_elements(v.cart) a where a->>'id'=v_item.id::text) then
         -- Mismo producto: se suman las cantidades en un solo renglón.
         select jsonb_agg(case when a.value->>'id'=v_item.id::text
                  then jsonb_set(a.value,'{quantity}',to_jsonb(least(99,(a.value->>'quantity')::integer+v_qty)))
                  else a.value end order by a.ord)
         into v.cart from jsonb_array_elements(v.cart) with ordinality a(value,ord);
       elsif jsonb_array_length(v.cart)<8 then
         v.cart:=v.cart || jsonb_build_array(jsonb_build_object('id',v_item.id,'name',v_item.name,'price',v_item.price,'quantity',v_qty));
       else
         v_full:=true;
       end if;
       v.stage:='cart';v.selected_id:=null;
       select coalesce(sum((a->>'quantity')::numeric*(a->>'price')::numeric),0) into v_total
       from jsonb_array_elements(v.cart) a;
       v_out:=jsonb_build_object('type','cart','cart',v.cart,'total',v_total,'full',v_full);
     end if;
   end if;
 elsif v_cmd='mi:finish' and v.stage='cart' then
   if jsonb_array_length(v.cart)>0 then
     v.stage:='name';v_out:=jsonb_build_object('type','ask_name');
   else
     v.stage:='catalog';v_out:=jsonb_build_object('type','catalog','catalog',v_cat,'page',0,'local',p_local);
   end if;
 elsif v.stage='name' then
   if length(v_msg) not between 2 and 100 or v_msg like 'mi:%' then
     v_out:=jsonb_build_object('type','invalid_name');
   else
     v.customer_name:=v_msg;v.stage:='notes';
     v_out:=jsonb_build_object('type','ask_notes');
   end if;
 elsif v.stage='notes' then
   if v_cmd in ('mi:nonotes','no','sin observaciones','ninguna','nada','-') then
     v.notes:='';
   elsif v_msg like 'mi:%' or length(v_msg)<1 then
     v.notes:='';
   else
     v.notes:=left(v_msg,300);
   end if;
   v.stage:='review';
   select coalesce(sum((a->>'quantity')::numeric*(a->>'price')::numeric),0) into v_total
     from jsonb_array_elements(v.cart) a;
   v_out:=jsonb_build_object('type','review','cart',v.cart,'total',v_total,'name',v.customer_name,'notes',v.notes);
 elsif v_cmd='mi:edit' and v.stage='review' then
   v.stage:='cart';
   select coalesce(sum((a->>'quantity')::numeric*(a->>'price')::numeric),0) into v_total
       from jsonb_array_elements(v.cart) a;
   v_out:=jsonb_build_object('type','cart','cart',v.cart,'total',v_total,'full',false);
 elsif v_cmd='mi:confirm' and v.stage='review' then
   select coalesce(sum((a->>'quantity')::numeric*(a->>'price')::numeric),0),
          coalesce(sum((a->>'quantity')::integer),0)
     into v_total,v_units from jsonb_array_elements(v.cart) a;
   if v_total<=0 or length(v.customer_name)<2 then
     v.stage:='start';v_out:=jsonb_build_object('type','welcome','local',p_local);
   else
     for v_row in select value from jsonb_array_elements(v.cart) loop
       v_line:=(v_row->>'quantity')||' × '||(v_row->>'name')||' · $'||(v_row->>'price')||coalesce(E'\n  '||(v_row->>'details'),'');
       v_lines:=v_lines||case when v_lines='' then '' else E'\n' end||v_line;
     end loop;
     -- Número correlativo por sucursal (la fila del canal serializa los pedidos simultáneos).
     update gestlok_mg_orders_private.channels set next_order_number=next_order_number+1
     where local=p_local returning next_order_number-1 into v_num;
     insert into gestlok_mg_orders_private.orders(
        local,customer_name,customer_phone,items_detail,total,payment_method,
        source,external_message_id,notes,created_by,order_number,items
     ) values(
        p_local,v.customer_name,p_sender,v_lines,v_total,'efectivo',
        'whatsapp',p_message_id,v.notes,null,v_num,v.cart
     ) returning * into v_order;
     insert into gestlok_mg_orders_private.events(order_id,local,event,actor)
     values(v_order.id,p_local,'created',null);
     v_out:=jsonb_build_object('type','confirmed','order_id',v_order.id,'total',v_total,'units',v_units,
       'order_number',v_num,'order_code',gestlok_mg_orders_private.order_code(v_num),'local',p_local);
     v.stage:='start';v.cart:='[]'::jsonb;v.customer_name:='';v.notes:='';v.selected_id:=null;v.page:=0;
   end if;
 elsif v.stage='start' then
   v_out:=jsonb_build_object('type','welcome','local',p_local);
 elsif v.stage='catalog' then
   v_out:=jsonb_build_object('type','catalog','catalog',v_cat,'page',v.page,'local',p_local);
 elsif v.stage='cart' then
   select coalesce(sum((a->>'quantity')::numeric*(a->>'price')::numeric),0) into v_total
     from jsonb_array_elements(v.cart) a;
   v_out:=jsonb_build_object('type','cart','cart',v.cart,'total',v_total,'full',false);
 elsif v.stage='review' then
   select coalesce(sum((a->>'quantity')::numeric*(a->>'price')::numeric),0) into v_total
     from jsonb_array_elements(v.cart) a;
   v_out:=jsonb_build_object('type','review','cart',v.cart,'total',v_total,'name',v.customer_name,'notes',v.notes);
 else
   v_out:=jsonb_build_object('type','welcome','local',p_local);
 end if;

 if v_out->>'type'='pack' then
   v_out:=v_out||jsonb_build_object('flavors',v_flavors,'sauces',v_sauces,
     'empanada_count',v_pack_empanadas,'sauce_count',v_pack_sauces);
 end if;
 if v_texts is not null then v_out:=v_out||jsonb_build_object('texts',v_texts); end if;

 update gestlok_mg_orders_private.whatsapp_sessions set
  stage=v.stage,selected_id=v.selected_id,cart=v.cart,customer_name=v.customer_name,
  notes=v.notes,page=v.page,updated_at=now() where local=p_local and sender=p_sender;
 update gestlok_mg_orders_private.whatsapp_inbox set response=v_out
 where local=p_local and message_id=p_message_id;
 return v_out || jsonb_build_object('duplicate',false,'sent',false);
end $$;
