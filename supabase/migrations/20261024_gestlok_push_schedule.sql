-- Supabase schedules, UTC: 02:15 UTC = 23:15 Argentina (UTC-3).
-- The cron credential is generated within Postgres; never sent to a browser,
-- checked into source or returned from SQL queries.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $init$
declare
  token text := replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
begin
  if not exists(select 1 from public.gestlok_push_control where id=1) then
    insert into public.gestlok_push_control(id,cron_token_hash)
    values(1,encode(sha256(convert_to(token,'UTF8')),'hex'));
    perform vault.create_secret(token,'gestlok_push_cron_secret','GestLok background notification worker');
  end if;
end
$init$;

-- Deliver notifications for new business events with a short maximum delay.
select cron.schedule(
 'gestlok-push-dispatch',
 '*/5 * * * *',
 $job$
  select net.http_post(
    url:='https://vgsepaaewbctjsjcpeta.supabase.co/functions/v1/gestlok-push',
    headers:=jsonb_build_object(
       'Content-Type','application/json',
       'x-gestlok-cron',(select decrypted_secret from vault.decrypted_secrets where name='gestlok_push_cron_secret' limit 1)
    ),
    body:='{"op":"dispatch"}'::jsonb,
    timeout_milliseconds:=10000
  )
 $job$
);

-- A single function keeps enqueue and delivery in the same scheduled job.
create or replace function public.gestlok_digest_and_dispatch()
returns void language plpgsql security definer set search_path=''
as $
begin
 perform public.gestlok_queue_daily_digest();
 perform net.http_post(
    url:='https://vgsepaaewbctjsjcpeta.supabase.co/functions/v1/gestlok-push',
    headers:=jsonb_build_object(
       'Content-Type','application/json',
       'x-gestlok-cron',(select decrypted_secret from vault.decrypted_secrets where name='gestlok_push_cron_secret' limit 1)
    ),
    body:='{"op":"dispatch"}'::jsonb,
    timeout_milliseconds:=10000
 );
end $;
revoke all on function public.gestlok_digest_and_dispatch() from public,anon,authenticated;

-- The closing digest is generated and sent every day at 23:15
-- America/Argentina/Buenos_Aires (02:15 UTC the following day).
select cron.schedule(
 'gestlok-digest-2315-argentina',
 '15 2 * * *',
 $job$ select public.gestlok_digest_and_dispatch(); $job$
);
