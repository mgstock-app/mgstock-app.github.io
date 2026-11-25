-- Apply only after deploying and verifying gestlok-hq-worker in the same project.
-- Production schedule, 15-minute cadence. No Groq call without an authorized mission.
select cron.schedule('gestlok-hq-worker','*/15 * * * *',$job$
 select net.http_post(
  url:='https://vgsepaaewbctjsjcpeta.supabase.co/functions/v1/gestlok-hq-worker',
  headers:=jsonb_build_object('Content-Type','application/json','x-gestlok-hq-worker',(select decrypted_secret from vault.decrypted_secrets where name='gestlok_hq_worker_secret' limit 1)),
  body:='{}'::jsonb,timeout_milliseconds:=60000
 );
$job$);
-- To stop future rounds: select cron.unschedule('gestlok-hq-worker');
