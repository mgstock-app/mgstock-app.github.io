-- GESTLOK · Mi Gusto: avisos de WhatsApp Business por sucursal, sin Cloud API.
-- Extiende el puente Android existente. No toca pedidos, chats, canales Meta ni la caja.
alter table gestlok_mg_orders_private.android_bridge_keys
 drop constraint if exists android_bridge_keys_local_check;
alter table gestlok_mg_orders_private.android_bridge_keys
 add constraint android_bridge_keys_local_check check (local in ('munro','torcuato'));

alter table gestlok_mg_orders_private.android_alerts
 drop constraint if exists android_alerts_local_check;
alter table gestlok_mg_orders_private.android_alerts
 add constraint android_alerts_local_check check (local in ('munro','torcuato'));
alter table gestlok_mg_orders_private.android_alerts
 add column if not exists customer_phone text;
alter table gestlok_mg_orders_private.android_alerts
 add constraint android_alerts_phone_format check
 (customer_phone is null or customer_phone ~ '^[0-9]{10,15}$');

-- Solo dueños y creadora pueden emitir/reemplazar una clave; cada local tiene su propia clave.
create or replace function public.gestlok_mg_android_bridge_create(p_local text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_token text;
begin
 if p_local not in ('munro','torcuato')
 or not gestlok_mg_orders_private.allowed(p_local)
 or public.mi_rol() not in ('dueno','creadora')
 then raise exception 'Sin permiso para conectar WhatsApp de esta sucursal' using errcode='42501'; end if;
 v_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into gestlok_mg_orders_private.android_bridge_keys(local,token_hash,created_by,created_at,enabled)
 values (p_local,encode(sha256(convert_to(v_token,'UTF8')),'hex'),auth.uid(),now(),true)
 on conflict (local) do update set token_hash=excluded.token_hash,
 created_by=excluded.created_by,created_at=excluded.created_at,enabled=true;
 return jsonb_build_object('ok',true,'local',p_local,'token',v_token);
end $$;

create or replace function public.gestlok_mg_android_bridge_state(p_local text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_local not in ('munro','torcuato') or not gestlok_mg_orders_private.allowed(p_local)
 then raise exception 'Sin acceso a los avisos del local' using errcode='42501'; end if;
 return jsonb_build_object(
  'configured',exists(select 1 from gestlok_mg_orders_private.android_bridge_keys
                      where local=p_local and enabled),
  'last_event_at',(select last_event_at from gestlok_mg_orders_private.android_bridge_keys
                   where local=p_local),
  'alerts',coalesce(
   (select jsonb_agg(jsonb_build_object('id',id,'status',status,'created_at',created_at,
                                        'customer_phone',customer_phone)
                     order by created_at desc,id desc)
    from (select id,status,created_at,customer_phone
          from gestlok_mg_orders_private.android_alerts
          where local=p_local and status='pendiente'
          order by created_at desc limit 100) q),'[]'::jsonb)
 );
end $$;

create or replace function public.gestlok_mg_android_bridge_ack(p_local text,p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if p_local not in ('munro','torcuato') or not gestlok_mg_orders_private.allowed(p_local)
 then raise exception 'Sin acceso a los avisos del local' using errcode='42501'; end if;
 if p_id is null then raise exception 'Aviso inválido'; end if;
 update gestlok_mg_orders_private.android_alerts
 set status='visto',seen_at=now(),seen_by=auth.uid()
 where id=p_id and local=p_local and status='pendiente';
 get diagnostics changed=row_count;
 return changed=1;
end $$;

-- Punto de ingreso nuevo: la función de borde autoriza el token POR local.
-- Solo se acepta un teléfono numérico opcional. No se almacenan mensajes ni nombres.
-- Se mantiene el RPC anterior para que los dispositivos previos no se rompan.
create or replace function public.gestlok_mg_android_bridge_ingest_v2(
 p_local text,p_token text,p_customer_phone text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_expected text; v_phone text; v_id uuid;
begin
 if p_local not in ('munro','torcuato') or coalesce(p_token,'') !~ '^[a-f0-9]{64}$'
 then raise exception 'Vínculo inválido' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtext('gestlok_android_whatsapp_'||p_local));
 select token_hash into v_expected from gestlok_mg_orders_private.android_bridge_keys
 where local=p_local and enabled for update;
 if v_expected is null or v_expected<>encode(sha256(convert_to(p_token,'UTF8')),'hex')
 then raise exception 'Vínculo inválido' using errcode='42501'; end if;
 v_phone:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
 -- Formato local 11xxxxxxxx → WhatsApp internacional argentino 54911xxxxxxxx.
 if v_phone ~ '^11[0-9]{8}
 update gestlok_mg_orders_private.android_bridge_keys set last_event_at=now()
 where local=p_local;
 -- Evitar duplicados inmediatos de Android. Ventana POR sucursal, no global.
 if exists(select 1 from gestlok_mg_orders_private.android_alerts
           where local=p_local and created_at>now()-interval '2 seconds')
 then return jsonb_build_object('ok',true,'created',false); end if;
 insert into gestlok_mg_orders_private.android_alerts(local,customer_phone)
 values (p_local,v_phone) returning id into v_id;
 return jsonb_build_object('ok',true,'created',true,'id',v_id,'has_phone',v_phone is not null);
end $$;

revoke all on function public.gestlok_mg_android_bridge_create(text),
 public.gestlok_mg_android_bridge_state(text),
 public.gestlok_mg_android_bridge_ack(text,uuid),
 public.gestlok_mg_android_bridge_ingest_v2(text,text,text)
 from public,anon,authenticated;
grant execute on function public.gestlok_mg_android_bridge_create(text),
 public.gestlok_mg_android_bridge_state(text),
 public.gestlok_mg_android_bridge_ack(text,uuid) to authenticated;
grant execute on function public.gestlok_mg_android_bridge_ingest_v2(text,text,text) to service_role;
 then v_phone:='549'||v_phone; end if;
 if v_phone ~ '^5411[0-9]{8}
 update gestlok_mg_orders_private.android_bridge_keys set last_event_at=now()
 where local=p_local;
 -- Evitar duplicados inmediatos de Android. Ventana POR sucursal, no global.
 if exists(select 1 from gestlok_mg_orders_private.android_alerts
           where local=p_local and created_at>now()-interval '2 seconds')
 then return jsonb_build_object('ok',true,'created',false); end if;
 insert into gestlok_mg_orders_private.android_alerts(local,customer_phone)
 values (p_local,v_phone) returning id into v_id;
 return jsonb_build_object('ok',true,'created',true,'id',v_id,'has_phone',v_phone is not null);
end $$;

revoke all on function public.gestlok_mg_android_bridge_create(text),
 public.gestlok_mg_android_bridge_state(text),
 public.gestlok_mg_android_bridge_ack(text,uuid),
 public.gestlok_mg_android_bridge_ingest_v2(text,text,text)
 from public,anon,authenticated;
grant execute on function public.gestlok_mg_android_bridge_create(text),
 public.gestlok_mg_android_bridge_state(text),
 public.gestlok_mg_android_bridge_ack(text,uuid) to authenticated;
grant execute on function public.gestlok_mg_android_bridge_ingest_v2(text,text,text) to service_role;
 then v_phone:='549'||substr(v_phone,3); end if;
 if length(v_phone) not between 10 and 15 then v_phone:=null; end if;
 update gestlok_mg_orders_private.android_bridge_keys set last_event_at=now()
 where local=p_local;
 -- Evitar duplicados inmediatos de Android. Ventana POR sucursal, no global.
 if exists(select 1 from gestlok_mg_orders_private.android_alerts
           where local=p_local and created_at>now()-interval '2 seconds')
 then return jsonb_build_object('ok',true,'created',false); end if;
 insert into gestlok_mg_orders_private.android_alerts(local,customer_phone)
 values (p_local,v_phone) returning id into v_id;
 return jsonb_build_object('ok',true,'created',true,'id',v_id,'has_phone',v_phone is not null);
end $$;

revoke all on function public.gestlok_mg_android_bridge_create(text),
 public.gestlok_mg_android_bridge_state(text),
 public.gestlok_mg_android_bridge_ack(text,uuid),
 public.gestlok_mg_android_bridge_ingest_v2(text,text,text)
 from public,anon,authenticated;
grant execute on function public.gestlok_mg_android_bridge_create(text),
 public.gestlok_mg_android_bridge_state(text),
 public.gestlok_mg_android_bridge_ack(text,uuid) to authenticated;
grant execute on function public.gestlok_mg_android_bridge_ingest_v2(text,text,text) to service_role;
