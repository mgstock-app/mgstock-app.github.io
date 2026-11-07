-- Mi Gusto · Munro y Don Torcuato · WhatsApp definitivo (aditiva).
-- Cada sucursal trabaja por separado: su número, su conexión con Meta, su carta, sus mensajes y sus pedidos.
-- - Mensajes del bot editables desde GESTLOK por sucursal.
-- - N.º de pedido por sucursal (MG-001), observaciones del cliente, ítems estructurados.
-- - Cantidades desde una lista, mismo producto suma cantidades, conversación vencida vuelve al inicio.
-- - Conexión con Meta (coexistencia con la app del teléfono): App ID, configuración, token y
--   App Secret guardados en Supabase Vault. Nunca se devuelven al navegador.
-- - Sin carga manual de pedidos en Mi Gusto (solo WhatsApp). Pedidos históricos intactos.
-- No toca Caja, Stock, Pagos Online, Plan Scanner ni otras empresas.

-- 1) Columnas nuevas ---------------------------------------------------------------
alter table gestlok_mg_orders_private.channels
  add column if not exists next_order_number integer not null default 1;
alter table gestlok_mg_orders_private.channels
  drop constraint if exists channels_next_order_number_check;
alter table gestlok_mg_orders_private.channels
  add constraint channels_next_order_number_check check (next_order_number between 1 and 9999999);

alter table gestlok_mg_orders_private.orders add column if not exists order_number integer;
alter table gestlok_mg_orders_private.orders add column if not exists items jsonb;
alter table gestlok_mg_orders_private.orders drop constraint if exists orders_items_array_check;
alter table gestlok_mg_orders_private.orders
  add constraint orders_items_array_check check (items is null or jsonb_typeof(items)='array');
create unique index if not exists mg_orders_local_number
  on gestlok_mg_orders_private.orders(local,order_number) where order_number is not null;

alter table gestlok_mg_orders_private.whatsapp_sessions
  add column if not exists notes text not null default '';
alter table gestlok_mg_orders_private.whatsapp_sessions drop constraint if exists whatsapp_sessions_notes_check;
alter table gestlok_mg_orders_private.whatsapp_sessions
  add constraint whatsapp_sessions_notes_check check (length(notes) <= 300);
alter table gestlok_mg_orders_private.whatsapp_sessions drop constraint if exists whatsapp_sessions_stage_check;
alter table gestlok_mg_orders_private.whatsapp_sessions
  add constraint whatsapp_sessions_stage_check
  check (stage in ('start','catalog','quantity','cart','name','notes','review','human'));

-- 2) Mensajes editables por sucursal ------------------------------------------------
create table if not exists gestlok_mg_orders_private.whatsapp_settings (
  local text primary key references gestlok_mg_orders_private.channels(local),
  welcome_text text not null check (length(btrim(welcome_text)) between 2 and 900),
  option_order text not null check (length(btrim(option_order)) between 2 and 20),
  option_prices text not null check (length(btrim(option_prices)) between 2 and 20),
  option_human text not null check (length(btrim(option_human)) between 2 and 20),
  human_text text not null check (length(btrim(human_text)) between 2 and 900),
  review_text text not null check (length(btrim(review_text)) between 2 and 300),
  confirmed_text text not null check (length(btrim(confirmed_text)) between 2 and 600),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table gestlok_mg_orders_private.whatsapp_settings enable row level security;
revoke all on gestlok_mg_orders_private.whatsapp_settings from public, anon, authenticated;

-- Textos iniciales (los pedidos por la usuaria). Cada sucursal los edita por separado desde GESTLOK.
insert into gestlok_mg_orders_private.whatsapp_settings(
  local,welcome_text,option_order,option_prices,option_human,human_text,review_text,confirmed_text
) values (
  'munro',
  E'¡Bienvenido a Mi Gusto! 🥟\n\n¿Cómo podemos ayudarte?',
  'Hacer un pedido','Ver carta y precios','Hablar con el local',
  'Perfecto. Alguien de Mi Gusto Munro te responde por acá en un momento. Para volver al menú automático, escribí MENU.',
  'Revisá tu pedido antes de confirmarlo:',
  '✅ ¡Pedido confirmado! Ya lo recibió Mi Gusto Munro.'
) on conflict (local) do nothing;
insert into gestlok_mg_orders_private.whatsapp_settings(
  local,welcome_text,option_order,option_prices,option_human,human_text,review_text,confirmed_text
) values (
  'torcuato',
  E'¡Bienvenido a Mi Gusto! 🥟\n\n¿Cómo podemos ayudarte?',
  'Hacer un pedido','Ver carta y precios','Hablar con el local',
  'Perfecto. Alguien de Mi Gusto Don Torcuato te responde por acá en un momento. Para volver al menú automático, escribí MENU.',
  'Revisá tu pedido antes de confirmarlo:',
  '✅ ¡Pedido confirmado! Ya lo recibió Mi Gusto Don Torcuato.'
) on conflict (local) do nothing;

-- 3) Conexión con Meta ------------------------------------------------------------
create table if not exists gestlok_mg_orders_private.whatsapp_meta_app (
  id boolean primary key default true check (id),
  app_id text check (app_id is null or app_id ~ '^[0-9]{5,25}$'),
  config_id text check (config_id is null or config_id ~ '^[0-9]{5,25}$'),
  app_secret_id uuid,
  verify_token text not null default encode(extensions.gen_random_bytes(18),'hex')
    check (verify_token ~ '^[0-9a-f]{20,80}$'),
  webhook_verified_at timestamptz,
  updated_at timestamptz,
  updated_by uuid
);
alter table gestlok_mg_orders_private.whatsapp_meta_app enable row level security;
revoke all on gestlok_mg_orders_private.whatsapp_meta_app from public, anon, authenticated;
insert into gestlok_mg_orders_private.whatsapp_meta_app(id) values (true) on conflict (id) do nothing;

create table if not exists gestlok_mg_orders_private.whatsapp_connections (
  local text primary key references gestlok_mg_orders_private.channels(local),
  waba_id text not null check (waba_id ~ '^[0-9]{5,25}$'),
  phone_number_id text not null unique check (phone_number_id ~ '^[0-9]{5,25}$'),
  display_phone text not null default '' check (length(display_phone) <= 40),
  verified_name text not null default '' check (length(verified_name) <= 200),
  is_on_biz_app boolean,
  platform_type text not null default '' check (length(platform_type) <= 40),
  token_secret_id uuid not null,
  bot_enabled boolean not null default false,
  connected_at timestamptz not null default now(),
  connected_by uuid,
  last_event_at timestamptz,
  sync_status jsonb not null default '{}'::jsonb check (jsonb_typeof(sync_status)='object')
);
alter table gestlok_mg_orders_private.whatsapp_connections enable row level security;
revoke all on gestlok_mg_orders_private.whatsapp_connections from public, anon, authenticated;

-- 4) Ayudas internas -------------------------------------------------------------
create or replace function gestlok_mg_orders_private.can_configure(p_local text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 -- Munro y Don Torcuato, cada una con sus propios datos.
 return p_local in ('munro','torcuato')
   and coalesce(gestlok_mg_orders_private.allowed(p_local),false)
   and public.mi_rol() in ('dueno','creadora');
end $$;

create or replace function gestlok_mg_orders_private.order_code(p_number integer)
returns text language sql immutable set search_path='' as $$
 select case when p_number is null then null else 'MG-'||lpad(p_number::text,3,'0') end
$$;

create or replace function gestlok_mg_orders_private.details(o gestlok_mg_orders_private.orders)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'id',o.id,'local',o.local,'customer_name',o.customer_name,
  'customer_phone',o.customer_phone,'items_detail',o.items_detail,
  'total',o.total,'payment_method',o.payment_method,'source',o.source,
  'notes',o.notes,'status',o.status,'created_at',o.created_at,
  'received_at',o.received_at,
  'order_number',o.order_number,
  'order_code',gestlok_mg_orders_private.order_code(o.order_number),
  'items',coalesce(o.items,'[]'::jsonb),
  'units',(select coalesce(sum((a->>'quantity')::integer),0)
           from jsonb_array_elements(coalesce(o.items,'[]'::jsonb)) a))
$$;

-- 5) Sin carga manual: los pedidos de Mi Gusto entran solo desde WhatsApp ----------
create or replace function public.gestlok_mg_orders_add(
 p_local text,p_customer_name text,p_customer_phone text,
 p_items_detail text,p_total numeric,p_notes text default ''
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order gestlok_mg_orders_private.orders;
        v_phone text:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
begin
 if p_local in ('munro','torcuato') then
   raise exception 'Los pedidos de Mi Gusto ingresan solamente desde WhatsApp' using errcode='42501';
 end if;
 if not gestlok_mg_orders_private.allowed(p_local) then
   raise exception 'Acceso denegado al local' using errcode='42501';
 end if;
 if length(btrim(coalesce(p_customer_name,''))) not between 2 and 120
    or length(v_phone) not between 8 and 15
    or length(btrim(coalesce(p_items_detail,''))) not between 2 and 4000
    or length(coalesce(p_notes,'')) > 1000
    or p_total is null or p_total <= 0 or p_total >= 1000000000 then
   raise exception 'Revisá los datos del pedido' using errcode='22023';
 end if;
 insert into gestlok_mg_orders_private.orders(
   local,customer_name,customer_phone,items_detail,total,notes,created_by
 ) values (
   p_local,btrim(p_customer_name),v_phone,btrim(p_items_detail),
   p_total,coalesce(p_notes,''),auth.uid()
 ) returning * into v_order;
 insert into gestlok_mg_orders_private.events(order_id,local,event,actor)
 values(v_order.id,p_local,'created',auth.uid());
 return gestlok_mg_orders_private.details(v_order);
end $$;

-- 6) Panel de GESTLOK ---------------------------------------------------------------
create or replace function public.gestlok_mg_whatsapp_settings(p_local text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_conf boolean;
begin
 if not gestlok_mg_orders_private.allowed(p_local) then
   raise exception 'Acceso denegado' using errcode='42501';
 end if;
 v_conf:=gestlok_mg_orders_private.can_configure(p_local);
 return jsonb_build_object(
  'local',p_local,
  'can_configure',v_conf,
  'settings',(select to_jsonb(s)-'local'-'updated_by' from gestlok_mg_orders_private.whatsapp_settings s where s.local=p_local),
  'connection',(select jsonb_build_object(
      'display_phone',c.display_phone,'verified_name',c.verified_name,
      'is_on_biz_app',c.is_on_biz_app,'platform_type',c.platform_type,
      'bot_enabled',c.bot_enabled,'connected_at',c.connected_at,
      'last_event_at',c.last_event_at,'sync_status',c.sync_status)
    from gestlok_mg_orders_private.whatsapp_connections c where c.local=p_local),
  'meta_app',case when v_conf then (select jsonb_build_object(
      'app_id',m.app_id,'config_id',m.config_id,'has_app_secret',m.app_secret_id is not null,
      'verify_token',m.verify_token,'webhook_verified_at',m.webhook_verified_at)
    from gestlok_mg_orders_private.whatsapp_meta_app m where m.id) end,
  'last_inbound_at',(select max(i.received_at) from gestlok_mg_orders_private.whatsapp_inbox i where i.local=p_local),
  'inbound_24h',(select count(*) from gestlok_mg_orders_private.whatsapp_inbox i
                 where i.local=p_local and i.received_at > now()-interval '24 hours')
 );
end $$;

create or replace function public.gestlok_mg_whatsapp_settings_save(p_local text,p_settings jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v jsonb:=coalesce(p_settings,'{}'::jsonb);
 f text;
begin
 if not gestlok_mg_orders_private.can_configure(p_local) then
   raise exception 'Solo el dueño o la administradora configuran los mensajes de WhatsApp' using errcode='42501';
 end if;
 foreach f in array array['welcome_text','option_order','option_prices','option_human','human_text','review_text','confirmed_text'] loop
   if jsonb_typeof(v->f) is distinct from 'string' then
     raise exception 'Falta el texto %',f using errcode='22023';
   end if;
 end loop;
 if lower(btrim(v->>'option_order')) in (lower(btrim(v->>'option_prices')),lower(btrim(v->>'option_human')))
    or lower(btrim(v->>'option_prices'))=lower(btrim(v->>'option_human')) then
   raise exception 'Las tres opciones tienen que tener nombres distintos' using errcode='22023';
 end if;
 insert into gestlok_mg_orders_private.whatsapp_settings as s(
   local,welcome_text,option_order,option_prices,option_human,human_text,review_text,confirmed_text,updated_at,updated_by
 ) values (
   p_local,btrim(v->>'welcome_text'),btrim(v->>'option_order'),btrim(v->>'option_prices'),
   btrim(v->>'option_human'),btrim(v->>'human_text'),btrim(v->>'review_text'),btrim(v->>'confirmed_text'),
   now(),auth.uid()
 ) on conflict (local) do update set
   welcome_text=excluded.welcome_text,option_order=excluded.option_order,
   option_prices=excluded.option_prices,option_human=excluded.option_human,
   human_text=excluded.human_text,review_text=excluded.review_text,
   confirmed_text=excluded.confirmed_text,updated_at=now(),updated_by=auth.uid();
 return public.gestlok_mg_whatsapp_settings(p_local);
end $$;

-- App ID y configuración son públicos (los usa el botón de Meta). El App Secret se guarda
-- cifrado en Vault y no se devuelve nunca.
create or replace function public.gestlok_mg_whatsapp_meta_app_save(
 p_local text,p_app_id text,p_config_id text,p_app_secret text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_app text:=btrim(coalesce(p_app_id,'')); v_cfg text:=btrim(coalesce(p_config_id,''));
        v_secret text:=btrim(coalesce(p_app_secret,'')); v_id uuid;
begin
 if not gestlok_mg_orders_private.can_configure(p_local) then
   raise exception 'Solo el dueño o la administradora conectan WhatsApp' using errcode='42501';
 end if;
 if v_app !~ '^[0-9]{5,25}$' or v_cfg !~ '^[0-9]{5,25}$' then
   raise exception 'El App ID y el ID de configuración son números largos de Meta' using errcode='22023';
 end if;
 if v_secret<>'' and v_secret !~ '^[0-9a-f]{24,64}$' then
   raise exception 'El App Secret de Meta tiene 32 letras y números (0-9, a-f)' using errcode='22023';
 end if;
 select app_secret_id into v_id from gestlok_mg_orders_private.whatsapp_meta_app where id;
 if v_secret<>'' then
   if v_id is null then
     v_id:=vault.create_secret(v_secret,'gestlok_mg_whatsapp_app_secret','Mi Gusto · App Secret de Meta');
   else
     perform vault.update_secret(v_id,v_secret);
   end if;
 end if;
 update gestlok_mg_orders_private.whatsapp_meta_app
 set app_id=v_app,config_id=v_cfg,app_secret_id=v_id,updated_at=now(),updated_by=auth.uid()
 where id;
 return public.gestlok_mg_whatsapp_settings(p_local);
end $$;

create or replace function public.gestlok_mg_whatsapp_set_bot(p_local text,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not gestlok_mg_orders_private.can_configure(p_local) then
   raise exception 'Solo el dueño o la administradora activan las respuestas automáticas' using errcode='42501';
 end if;
 update gestlok_mg_orders_private.whatsapp_connections
 set bot_enabled=coalesce(p_enabled,false) where local=p_local;
 if not found then
   raise exception 'Primero conectá el WhatsApp de esta sucursal con Meta' using errcode='22023';
 end if;
 return public.gestlok_mg_whatsapp_settings(p_local);
end $$;

-- La Edge Function lo llama con el JWT de la persona antes de completar la conexión.
create or replace function public.gestlok_mg_whatsapp_can_connect(p_local text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not gestlok_mg_orders_private.can_configure(p_local) then
   raise exception 'Solo el dueño o la administradora conectan WhatsApp' using errcode='42501';
 end if;
 return jsonb_build_object('ok',true,'local',p_local,'user_id',auth.uid(),
  'expected_number',(select whatsapp_number from gestlok_mg_orders_private.channels where local=p_local));
end $$;

-- 7) Solo servidor (service_role) -------------------------------------------------
create or replace function public.gestlok_mg_whatsapp_server_config()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'app_id',m.app_id,'verify_token',m.verify_token,
  'app_secret',(select d.decrypted_secret from vault.decrypted_secrets d where d.id=m.app_secret_id))
 from gestlok_mg_orders_private.whatsapp_meta_app m where m.id
$$;

create or replace function public.gestlok_mg_whatsapp_webhook_verified()
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update gestlok_mg_orders_private.whatsapp_meta_app set webhook_verified_at=now() where id;
 return found;
end $$;

create or replace function public.gestlok_mg_whatsapp_route(p_phone_number_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c gestlok_mg_orders_private.whatsapp_connections;
begin
 if coalesce(p_phone_number_id,'') !~ '^[0-9]{5,25}$' then return null; end if;
 update gestlok_mg_orders_private.whatsapp_connections set last_event_at=now()
 where phone_number_id=p_phone_number_id returning * into c;
 if not found then return null; end if;
 return jsonb_build_object('local',c.local,'enabled',c.bot_enabled,
  'token',(select d.decrypted_secret from vault.decrypted_secrets d where d.id=c.token_secret_id));
end $$;

create or replace function public.gestlok_mg_whatsapp_connection_save(
 p_local text,p_waba_id text,p_phone_number_id text,p_display_phone text,p_verified_name text,
 p_is_on_biz_app boolean,p_platform_type text,p_token text,p_user uuid,p_sync jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_old gestlok_mg_orders_private.whatsapp_connections; v_secret uuid;
begin
 if p_local not in ('munro','torcuato') then
   raise exception 'Sucursal inválida' using errcode='42501';
 end if;
 if coalesce(p_waba_id,'') !~ '^[0-9]{5,25}$' or coalesce(p_phone_number_id,'') !~ '^[0-9]{5,25}$'
    or length(coalesce(p_token,'')) not between 20 and 2000 then
   raise exception 'Datos de conexión inválidos' using errcode='22023';
 end if;
 if exists(select 1 from gestlok_mg_orders_private.whatsapp_connections
           where phone_number_id=p_phone_number_id and local<>p_local) then
   raise exception 'Ese número ya pertenece a otra sucursal' using errcode='23505';
 end if;
 select * into v_old from gestlok_mg_orders_private.whatsapp_connections where local=p_local for update;
 if found then
   v_secret:=v_old.token_secret_id;
   perform vault.update_secret(v_secret,p_token);
 else
   v_secret:=vault.create_secret(p_token,'gestlok_mg_whatsapp_token_'||p_local,'Mi Gusto · token de WhatsApp Cloud API · '||p_local);
 end if;
 insert into gestlok_mg_orders_private.whatsapp_connections as c(
   local,waba_id,phone_number_id,display_phone,verified_name,is_on_biz_app,platform_type,
   token_secret_id,connected_at,connected_by,sync_status
 ) values (
   p_local,p_waba_id,p_phone_number_id,left(coalesce(p_display_phone,''),40),left(coalesce(p_verified_name,''),200),
   p_is_on_biz_app,left(coalesce(p_platform_type,''),40),v_secret,now(),p_user,coalesce(p_sync,'{}'::jsonb)
 ) on conflict (local) do update set
   waba_id=excluded.waba_id,phone_number_id=excluded.phone_number_id,display_phone=excluded.display_phone,
   verified_name=excluded.verified_name,is_on_biz_app=excluded.is_on_biz_app,
   platform_type=excluded.platform_type,token_secret_id=excluded.token_secret_id,
   connected_at=now(),connected_by=excluded.connected_by,sync_status=excluded.sync_status;
 return jsonb_build_object('ok',true,'local',p_local);
end $$;

-- 8) Conversación de WhatsApp (reemplaza la versión anterior; misma firma) -----------
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
 if v.stage='quantity' and v_cmd ~ '^mi:qty:[0-9]{1,2}$' then
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
       v_line:=(v_row->>'quantity')||' × '||(v_row->>'name')||' · $'||(v_row->>'price');
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

 if v_texts is not null then v_out:=v_out||jsonb_build_object('texts',v_texts); end if;

 update gestlok_mg_orders_private.whatsapp_sessions set
  stage=v.stage,selected_id=v.selected_id,cart=v.cart,customer_name=v.customer_name,
  notes=v.notes,page=v.page,updated_at=now() where local=p_local and sender=p_sender;
 update gestlok_mg_orders_private.whatsapp_inbox set response=v_out
 where local=p_local and message_id=p_message_id;
 return v_out || jsonb_build_object('duplicate',false,'sent',false);
end $$;

-- 9) Permisos ---------------------------------------------------------------------
revoke all on all functions in schema gestlok_mg_orders_private from public, anon, authenticated;
revoke all on function
 public.gestlok_mg_whatsapp_settings(text),
 public.gestlok_mg_whatsapp_settings_save(text,jsonb),
 public.gestlok_mg_whatsapp_meta_app_save(text,text,text,text),
 public.gestlok_mg_whatsapp_set_bot(text,boolean),
 public.gestlok_mg_whatsapp_can_connect(text),
 public.gestlok_mg_whatsapp_server_config(),
 public.gestlok_mg_whatsapp_webhook_verified(),
 public.gestlok_mg_whatsapp_route(text),
 public.gestlok_mg_whatsapp_connection_save(text,text,text,text,text,boolean,text,text,uuid,jsonb),
 public.gestlok_mg_whatsapp_turn(text,text,text,text,text),
 public.gestlok_mg_orders_add(text,text,text,text,numeric,text)
 from public, anon, authenticated;
grant execute on function
 public.gestlok_mg_whatsapp_settings(text),
 public.gestlok_mg_whatsapp_settings_save(text,jsonb),
 public.gestlok_mg_whatsapp_meta_app_save(text,text,text,text),
 public.gestlok_mg_whatsapp_set_bot(text,boolean),
 public.gestlok_mg_whatsapp_can_connect(text),
 public.gestlok_mg_orders_add(text,text,text,text,numeric,text)
 to authenticated;
grant execute on function
 public.gestlok_mg_whatsapp_server_config(),
 public.gestlok_mg_whatsapp_webhook_verified(),
 public.gestlok_mg_whatsapp_route(text),
 public.gestlok_mg_whatsapp_connection_save(text,text,text,text,text,boolean,text,text,uuid,jsonb),
 public.gestlok_mg_whatsapp_turn(text,text,text,text,text)
 to service_role;
comment on table gestlok_mg_orders_private.whatsapp_connections is
 'Mi Gusto · conexión Cloud API por sucursal. El token vive en Vault (token_secret_id). Solo service_role.';
