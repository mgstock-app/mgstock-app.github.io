-- Mi Gusto · se retira «Pedidos WhatsApp» (lo reemplaza la Central de mensajes de GESTLOK Chat en Munro y Don Torcuato).
-- NO borra datos: quedan guardados en gestlok_mg_orders_private (al 19/11/2026: 0 pedidos, 0 números conectados,
-- 57 productos de la carta de Munro y 1 aviso del puente Android). El borrado definitivo es una decisión aparte.
-- Corta el acceso: la app ya no puede usar sus funciones y se apagan las claves del puente de avisos de Android.
-- Repetible. No toca Pagos Online (gestlok_mg_online_*) ni ningún otro módulo.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and (p.proname like 'gestlok\_mg\_orders\_%' or p.proname like 'gestlok\_mg\_whatsapp\_%'
                   or p.proname like 'gestlok\_mg\_android\_%') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
  if to_regclass('gestlok_mg_orders_private.android_bridge_keys') is not null then
    update gestlok_mg_orders_private.android_bridge_keys set enabled = false where enabled;
  end if;
  if to_regclass('gestlok_mg_orders_private.whatsapp_connections') is not null then
    update gestlok_mg_orders_private.whatsapp_connections set bot_enabled = false where bot_enabled;
  end if;
end $$;
