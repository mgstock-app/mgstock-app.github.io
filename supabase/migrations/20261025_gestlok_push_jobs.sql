-- Tareas del sistema de cinco notificaciones GestLok.
-- Requiere aplicar primero 20261025_gestlok_push_five_categories.sql.
-- 08:00 Argentina (UTC-3) = 11:00 UTC, un máximo de un aviso por local y categoría/día.
select cron.schedule('gestlok-push-due-0800-ar','0 11 * * *',
  $job$ select public.gestlok_push_queue_due(); $job$);
-- Revisa la cola cada minuto. Solo la clave guardada en Vault puede invocar dispatch.
select cron.schedule('gestlok-push-dispatch-v2','* * * * *',
  $job$
    select net.http_post(
      url:='https://vgsepaaewbctjsjcpeta.supabase.co/functions/v1/gestlok-push?op=dispatch',
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'x-gestlok-cron',(
          select decrypted_secret from vault.decrypted_secrets
          where name='gestlok_push_cron_secret' limit 1
        )
      ),
      body:='{}'::jsonb, timeout_milliseconds:=30000
    );
  $job$);
