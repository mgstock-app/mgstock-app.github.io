-- Web Push separado de dueños/gerentes: preferencias explícitas por navegador y sucursal.
-- Las tablas visibles al Data API tienen RLS y ningún GRANT a anon/authenticated.
alter table gestlok_chat_private.sucursales
  add column if not exists cliente_push_promos_activo boolean not null default false;

create table if not exists public.gestlok_chat_cliente_push_devices (
  endpoint text primary key check (length(endpoint) between 60 and 2048),
  sucursal_id uuid not null references gestlok_chat_private.sucursales(id) on delete cascade,
  conversacion_id uuid not null references gestlok_chat_private.conversaciones(id) on delete cascade,
  p256dh_key text not null check (length(p256dh_key) between 16 and 200),
  auth_key text not null check (length(auth_key) between 16 and 100),
  pedidos boolean not null default true,
  promos boolean not null default false,
  enabled boolean not null default true,
  registrado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);
create index if not exists gchat_push_por_conv on public.gestlok_chat_cliente_push_devices(conversacion_id) where enabled and pedidos;
create index if not exists gchat_push_promos_por_sucursal on public.gestlok_chat_cliente_push_devices(sucursal_id) where enabled and promos;
alter table public.gestlok_chat_cliente_push_devices enable row level security;
revoke all on table public.gestlok_chat_cliente_push_devices from public, anon, authenticated;
grant select,insert,update,delete on public.gestlok_chat_cliente_push_devices to service_role;

create table if not exists public.gestlok_chat_cliente_push_events (
  id bigint generated always as identity primary key,
  sucursal_id uuid not null references gestlok_chat_private.sucursales(id) on delete cascade,
  conversacion_id uuid references gestlok_chat_private.conversaciones(id) on delete set null,
  categoria text not null check (categoria in ('pedido','promocion')),
  titulo text not null check(length(titulo) between 4 and 100),
  cuerpo text not null check(length(cuerpo) between 2 and 180),
  creado_at timestamptz not null default now(),
  enviado_at timestamptz
);
create index if not exists gchat_push_events_pend on public.gestlok_chat_cliente_push_events(id) where enviado_at is null;
alter table public.gestlok_chat_cliente_push_events enable row level security;
revoke all on table public.gestlok_chat_cliente_push_events from public, anon, authenticated;
grant select,insert,update,delete on public.gestlok_chat_cliente_push_events to service_role;
grant usage,select on sequence public.gestlok_chat_cliente_push_events_id_seq to service_role;

create table if not exists public.gestlok_chat_cliente_push_deliveries (
  event_id bigint not null references public.gestlok_chat_cliente_push_events(id) on delete cascade,
  endpoint text not null references public.gestlok_chat_cliente_push_devices(endpoint) on delete cascade,
  intentos integer not null default 0 check (intentos between 0 and 5),
  entregado_at timestamptz,
  error text,
  primary key (event_id,endpoint)
);
alter table public.gestlok_chat_cliente_push_deliveries enable row level security;
revoke all on table public.gestlok_chat_cliente_push_deliveries from public, anon, authenticated;
grant select,insert,update,delete on public.gestlok_chat_cliente_push_deliveries to service_role;

-- La identidad de la conversación se valida desde el token anónimo de 256 bits.
-- No se permite registrar endpoints en otra sucursal ni leer registros de clientes.
create or replace function public.gestlok_chat_cliente_push_vincular(
  p_slug text, p_token_hash bytea, p_endpoint text, p_p256dh text, p_auth text,
  p_pedidos boolean, p_promos boolean, p_desvincular boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c gestlok_chat_private.conversaciones; s gestlok_chat_private.sucursales;
begin
  select * into s from gestlok_chat_private.sucursales where slug=p_slug and activa=true;
  if s.id is null then raise exception 'Sucursal no disponible' using errcode='22023'; end if;
  select * into c from gestlok_chat_private.conversaciones
   where token_hash=p_token_hash and sucursal_id=s.id and creada_at>now()-interval '60 days';
  if c.id is null then raise exception 'Sesión inválida' using errcode='42501'; end if;
  if p_endpoint is null or length(p_endpoint) > 2048 or
     p_endpoint !~ '^https://[A-Za-z0-9.:/_?&=%+~-]+$' then
    raise exception 'Endpoint inválido' using errcode='22023';
  end if;
  if p_desvincular then
    delete from public.gestlok_chat_cliente_push_devices
      where endpoint=p_endpoint and conversacion_id=c.id and sucursal_id=s.id;
    return jsonb_build_object('ok',true,'enabled',false);
  end if;
  if coalesce(p_pedidos,false)=false and coalesce(p_promos,false)=false then
    delete from public.gestlok_chat_cliente_push_devices
      where endpoint=p_endpoint and conversacion_id=c.id and sucursal_id=s.id;
    return jsonb_build_object('ok',true,'enabled',false);
  end if;
  if p_p256dh !~ '^[A-Za-z0-9_-]{16,200}$' or p_auth !~ '^[A-Za-z0-9_-]{16,100}$' then
    raise exception 'Claves inválidas' using errcode='22023';
  end if;
  if (select count(*) from public.gestlok_chat_cliente_push_devices
      where conversacion_id=c.id) >= 5 and not exists(
        select 1 from public.gestlok_chat_cliente_push_devices
         where endpoint=p_endpoint and conversacion_id=c.id) then
    raise exception 'Demasiados dispositivos vinculados' using errcode='P0001';
  end if;
  insert into public.gestlok_chat_cliente_push_devices
    (endpoint,sucursal_id,conversacion_id,p256dh_key,auth_key,pedidos,promos,enabled)
  values (p_endpoint,s.id,c.id,p_p256dh,p_auth,
    coalesce(p_pedidos,false),coalesce(p_promos,false) and s.cliente_push_promos_activo,true)
  on conflict(endpoint) do update set sucursal_id=excluded.sucursal_id,
    conversacion_id=excluded.conversacion_id,p256dh_key=excluded.p256dh_key,
    auth_key=excluded.auth_key,pedidos=excluded.pedidos,promos=excluded.promos,
    enabled=true,actualizado_at=now();
  return jsonb_build_object('ok',true,'enabled',true);
end $$;
revoke all on function public.gestlok_chat_cliente_push_vincular(text,bytea,text,text,text,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.gestlok_chat_cliente_push_vincular(text,bytea,text,text,text,boolean,boolean,boolean) to service_role;

-- Notificar cada transición real; sin nombres ni datos de contacto en pantalla bloqueada.
create or replace function gestlok_chat_private.encolar_push_cliente_pedido()
returns trigger language plpgsql security definer set search_path='' as $$
declare texto text;
begin
  if new.es_prueba then return new; end if;
  if tg_op='UPDATE' and new.estado is not distinct from old.estado
      and new.recibido_at is not distinct from old.recibido_at then return new; end if;
  texto := case
    when new.estado='pendiente' then 'Tu pedido fue recibido y espera la confirmación del local.'
    when new.estado='confirmado' then 'El local confirmó tu pedido.'
    when new.estado='terminado' then case when new.entrega='envio'
      then 'Tu pedido está en camino.' else 'Tu pedido está listo para retirar.' end
    when new.estado='rechazado' then 'El local no pudo confirmar tu pedido. Entrá al chat para consultar.'
    when new.estado='cancelado' then 'Tu pedido fue cancelado.'
    else 'Hay una novedad sobre tu pedido.' end;
  insert into public.gestlok_chat_cliente_push_events
    (sucursal_id,conversacion_id,categoria,titulo,cuerpo)
  values (new.sucursal_id,new.conversacion_id,'pedido','GESTLOK Chat · Tu pedido',texto);
  return new;
end $$;
drop trigger if exists gchat_push_pedido_estado on gestlok_chat_private.pedidos;
create trigger gchat_push_pedido_estado after insert or update of estado,recibido_at
 on gestlok_chat_private.pedidos for each row
 execute function gestlok_chat_private.encolar_push_cliente_pedido();

-- Dueño/administradora: activar promociones y enviar a SUS clientes, máximo una cada 24h.
create or replace function public.gestlok_chat_panel_push_promociones(
 p_sucursal uuid, p_enabled boolean default null, p_mensaje text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare nivel text; s gestlok_chat_private.sucursales; msg text;
begin
 nivel := gestlok_chat_private.exigir(p_sucursal,
   case when p_enabled is null and p_mensaje is null then 'ver' else 'configurar' end);
 if p_enabled is not null then
   update gestlok_chat_private.sucursales
     set cliente_push_promos_activo=p_enabled,actualizada_at=now(),actualizada_por=auth.uid()
     where id=p_sucursal;
 end if;
 select * into s from gestlok_chat_private.sucursales where id=p_sucursal;
 if p_mensaje is not null then
   if s.cliente_push_promos_activo is not true then
      raise exception 'Primero habilitá promociones' using errcode='P0001';
   end if;
   msg:=btrim(p_mensaje);
   if length(msg) not between 10 and 150 then
      raise exception 'Escribí una promoción entre 10 y 150 caracteres' using errcode='22023';
   end if;
   if exists(select 1 from public.gestlok_chat_cliente_push_events
     where sucursal_id=p_sucursal and categoria='promocion'
       and creado_at>now()-interval '24 hours') then
      raise exception 'Solo se puede avisar una promoción cada 24 horas' using errcode='P0001';
   end if;
   insert into public.gestlok_chat_cliente_push_events
     (sucursal_id,categoria,titulo,cuerpo)
   values(p_sucursal,'promocion','Promoción de '||left(s.nombre,75),msg);
 end if;
 return jsonb_build_object('ok',true,'enabled',s.cliente_push_promos_activo,'nivel',nivel);
end $$;
revoke all on function public.gestlok_chat_panel_push_promociones(uuid,boolean,text) from public,anon;
grant execute on function public.gestlok_chat_panel_push_promociones(uuid,boolean,text) to authenticated,service_role;

-- Dispatcher central cada minuto; la clave reside en Supabase Vault y nunca sale al navegador.
select cron.schedule('gestlok-chat-cliente-push-dispatch','* * * * *', $cron$
 select net.http_post(
  url:='https://vgsepaaewbctjsjcpeta.supabase.co/functions/v1/gestlok-chat-push?op=dispatch',
  headers:=jsonb_build_object('Content-Type','application/json',
   'x-gestlok-cron',(select decrypted_secret from vault.decrypted_secrets
     where name='gestlok_push_cron_secret' limit 1)),
  body:='{}'::jsonb,timeout_milliseconds:=30000);
$cron$);
