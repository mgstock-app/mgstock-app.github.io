-- Mi Gusto Munro: puente opcional de notificaciones Android -> GESTLOK.
-- No utiliza WhatsApp Cloud API; no recibe el chat ni el pedido completo.
-- El teléfono del local transmite SOLO una señal genérica de notificación.
create table if not exists gestlok_mg_orders_private.android_bridge_keys (
 local text primary key check(local='munro'),
 token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'),
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 created_by uuid,
 last_event_at timestamptz
);
create table if not exists gestlok_mg_orders_private.android_alerts (
 id uuid primary key default gen_random_uuid(),
 local text not null check(local='munro'),
 kind text not null default 'whatsapp_business_notification' check(kind='whatsapp_business_notification'),
 status text not null default 'pendiente' check(status in ('pendiente','visto')),
 created_at timestamptz not null default now(),
 seen_at timestamptz,
 seen_by uuid
);
create index if not exists idx_mg_android_alerts_pending
 on gestlok_mg_orders_private.android_alerts(local,created_at desc)
 where status='pendiente';
alter table gestlok_mg_orders_private.android_bridge_keys enable row level security;
alter table gestlok_mg_orders_private.android_alerts enable row level security;
revoke all on gestlok_mg_orders_private.android_bridge_keys,gestlok_mg_orders_private.android_alerts from public,anon,authenticated;

create or replace function public.gestlok_mg_android_bridge_create(p_local text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare token text;
begin
 if p_local<>'munro' or not gestlok_mg_orders_private.allowed(p_local)
  or public.mi_rol() not in ('dueno','creadora')
 then raise exception 'Solo dueña/administradora de Munro puede crear este vínculo' using errcode='42501'; end if;
 token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into gestlok_mg_orders_private.android_bridge_keys(local,token_hash,created_by,created_at,enabled)
 values ('munro',encode(sha256(convert_to(token,'UTF8')),'hex'),auth.uid(),now(),true)
 on conflict (local) do update
  set token_hash=excluded.token_hash,created_by=excluded.created_by,created_at=excluded.created_at,enabled=true;
 return jsonb_build_object('ok',true,'local','munro','token',token);
end $$;

create or replace function public.gestlok_mg_android_bridge_state(p_local text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_local<>'munro' or not gestlok_mg_orders_private.allowed(p_local)
 then raise exception 'Sin acceso a los avisos de Munro' using errcode='42501'; end if;
 return jsonb_build_object(
  'configured', exists(select 1 from gestlok_mg_orders_private.android_bridge_keys where local='munro' and enabled),
  'last_event_at',(select last_event_at from gestlok_mg_orders_private.android_bridge_keys where local='munro'),
  'alerts', coalesce((select jsonb_agg(jsonb_build_object('id',id,'status',status,'created_at',created_at)
                                    order by created_at desc,id desc)
                      from (select id,status,created_at from gestlok_mg_orders_private.android_alerts
                            where local='munro' and status='pendiente'
                            order by created_at desc limit 100) q),'[]'::jsonb)
 );
end $$;

create or replace function public.gestlok_mg_android_bridge_ack(p_local text,p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if p_local<>'munro' or not gestlok_mg_orders_private.allowed(p_local)
 then raise exception 'Sin acceso a los avisos de Munro' using errcode='42501'; end if;
 if p_id is null then raise exception 'Aviso inválido'; end if;
 update gestlok_mg_orders_private.android_alerts
 set status='visto',seen_at=now(),seen_by=auth.uid()
 where id=p_id and local='munro' and status='pendiente';
 get diagnostics changed=row_count;
 return changed=1;
end $$;

-- Única puerta de ingreso: llamada de Edge Function con service_role, autenticada
-- mediante la clave generada previamente en la cuenta de la dueña.
create or replace function public.gestlok_mg_android_bridge_ingest(p_local text,p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare expected text; alert_id uuid;
begin
 if p_local<>'munro' or coalesce(p_token,'') !~ '^[a-f0-9]{64}$'
 then raise exception 'Vínculo inválido' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtext('gestlok_android_whatsapp_munro'));
 select token_hash into expected from gestlok_mg_orders_private.android_bridge_keys
 where local='munro' and enabled for update;
 if expected is null or expected<>encode(sha256(convert_to(p_token,'UTF8')),'hex')
 then raise exception 'Vínculo inválido' using errcode='42501'; end if;
 update gestlok_mg_orders_private.android_bridge_keys
 set last_event_at=now() where local='munro';
 -- Evitar duplicaciones cuando el sistema Android republica inmediatamente el mismo aviso.
 if exists(select 1 from gestlok_mg_orders_private.android_alerts
           where local='munro' and created_at>now()-interval '2 seconds')
 then return jsonb_build_object('ok',true,'created',false); end if;
 insert into gestlok_mg_orders_private.android_alerts(local) values('munro')
 returning id into alert_id;
 return jsonb_build_object('ok',true,'created',true,'id',alert_id);
end $$;

revoke all on function public.gestlok_mg_android_bridge_create(text),
 public.gestlok_mg_android_bridge_state(text), public.gestlok_mg_android_bridge_ack(text,uuid),
 public.gestlok_mg_android_bridge_ingest(text,text) from public,anon,authenticated;
grant execute on function public.gestlok_mg_android_bridge_create(text),
 public.gestlok_mg_android_bridge_state(text),public.gestlok_mg_android_bridge_ack(text,uuid) to authenticated;
revoke all on function public.gestlok_mg_android_bridge_ingest(text,text) from public,anon,authenticated;
grant execute on function public.gestlok_mg_android_bridge_ingest(text,text) to service_role;
