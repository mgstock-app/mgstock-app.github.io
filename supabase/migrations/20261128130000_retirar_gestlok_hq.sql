-- Retiro definitivo del acceso operativo de GESTLOK HQ. No borra tareas, informes ni registros.
-- Mantener el historial privado y las demás microapps, avisos comerciales y Renata QA.
do $retire$
declare f record;
begin
  if to_regclass('gestlok_hq_private.worker_control') is not null then
    update gestlok_hq_private.worker_control set paused_until='infinity'::timestamptz;
  end if;
  if to_regclass('cron.job') is not null then
    perform cron.alter_job(jobid, active := false)
      from cron.job where jobname='gestlok-hq-worker' and active;
  end if;
  for f in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.prokind='f' and (n.nspname='gestlok_hq_private'
      or (n.nspname='public' and left(p.proname,11)='gestlok_hq_'))
  loop
    execute format('revoke execute on function %I.%I(%s) from PUBLIC, anon, authenticated, service_role',
      f.nspname,f.proname,f.args);
  end loop;
end $retire$;
