-- Mi Gusto: vista previa limitada de las notificaciones Android de WhatsApp Business.
-- Solo texto que el propio Android expone; nunca se consultan chats de Meta.
-- Sucursales separadas y acceso exclusivamente mediante los RPC ya autorizados.
alter table gestlok_mg_orders_private.android_alerts
 add column if not exists notification_preview text;

do $
begin
 if not exists (
   select 1 from pg_constraint
   where conname='android_alerts_preview_max_length'
     and conrelid='gestlok_mg_orders_private.android_alerts'::regclass
 ) then
  alter table gestlok_mg_orders_private.android_alerts
   add constraint android_alerts_preview_max_length
   check (notification_preview is null or char_length(notification_preview) <= 240);
 end if;
end $;

-- Ingesta con versión nueva: conserva el enlace y la validación de clave del RPC v2,
-- además de su prevención de duplicados y aislamiento de sucursal.
create or replace function public.gestlok_mg_android_bridge_ingest_v3(
 p_local text, p_token text, p_customer_phone text default null,
 p_notification_preview text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_preview text;
begin
 v_preview:=nullif(left(trim(regexp_replace(coalesce(p_notification_preview,''), '[[:cntrl:]]+', ' ', 'g')),240),'');
 if v_preview in ('{not_text}','{not_message}') then v_preview:=null; end if;
 -- v2 valida token privado, sucursal y habilitación antes de insertar.
 v_result:=public.gestlok_mg_android_bridge_ingest_v2(p_local,p_token,p_customer_phone);
 if v_result->>'created'='true' and (v_result->>'id') is not null then
   update gestlok_mg_orders_private.android_alerts
      set notification_preview=v_preview
    where local=p_local and id=(v_result->>'id')::uuid;
 end if;
 return v_result || jsonb_build_object('has_preview',v_preview is not null and v_result->>'created'='true');
end $$;

-- Solo integrantes autorizados de la sucursal leen el aviso y su vista previa.
create or replace function public.gestlok_mg_android_bridge_state(p_local text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_local not in ('munro','torcuato') or
    not coalesce(gestlok_mg_orders_private.allowed(p_local),false)
 then raise exception 'Sin acceso a los avisos del local' using errcode='42501'; end if;
 return jsonb_build_object(
  'configured',exists(select 1 from gestlok_mg_orders_private.android_bridge_keys
                      where local=p_local and enabled),
  'last_event_at',(select last_event_at from gestlok_mg_orders_private.android_bridge_keys
                   where local=p_local),
  'alerts',coalesce(
   (select jsonb_agg(jsonb_build_object('id',id,'status',status,'created_at',created_at,
                    'customer_phone',customer_phone,'notification_preview',notification_preview)
                    order by created_at desc,id desc)
    from (select id,status,created_at,customer_phone,notification_preview
          from gestlok_mg_orders_private.android_alerts
          where local=p_local and status='pendiente'
          order by created_at desc limit 100) q),'[]'::jsonb),
  'reviewed',coalesce(
   (select jsonb_agg(jsonb_build_object('id',id,'status',status,'created_at',created_at,
                    'seen_at',seen_at,'customer_phone',customer_phone,
                    'notification_preview',notification_preview)
                    order by seen_at desc nulls last,id desc)
    from (select id,status,created_at,seen_at,customer_phone,notification_preview
          from gestlok_mg_orders_private.android_alerts
          where local=p_local and status='visto'
          order by seen_at desc nulls last,id desc limit 100) q),'[]'::jsonb)
 );
end $$;

revoke all on function public.gestlok_mg_android_bridge_ingest_v3(text,text,text,text)
 from public,anon,authenticated;
grant execute on function public.gestlok_mg_android_bridge_ingest_v3(text,text,text,text)
 to service_role;
revoke all on function public.gestlok_mg_android_bridge_state(text) from public,anon,authenticated;
grant execute on function public.gestlok_mg_android_bridge_state(text) to authenticated;
