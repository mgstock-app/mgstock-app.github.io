-- Pedidos WhatsApp: el gerente y el dueño consultan avisos pendientes y vistos
-- exclusivamente en la sucursal ya autorizada por Mi Gusto. No expone chats.
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
                                        'customer_phone',customer_phone)
                     order by created_at desc,id desc)
    from (select id,status,created_at,customer_phone
          from gestlok_mg_orders_private.android_alerts
          where local=p_local and status='pendiente'
          order by created_at desc limit 100) q),'[]'::jsonb),
  'reviewed',coalesce(
   (select jsonb_agg(jsonb_build_object('id',id,'status',status,'created_at',created_at,
                                        'seen_at',seen_at,'customer_phone',customer_phone)
                     order by seen_at desc nulls last,id desc)
    from (select id,status,created_at,seen_at,customer_phone
          from gestlok_mg_orders_private.android_alerts
          where local=p_local and status='visto'
          order by seen_at desc nulls last,id desc limit 100) q),'[]'::jsonb)
 );
end $$;

revoke all on function public.gestlok_mg_android_bridge_state(text)
 from public,anon,authenticated;
grant execute on function public.gestlok_mg_android_bridge_state(text) to authenticated;
