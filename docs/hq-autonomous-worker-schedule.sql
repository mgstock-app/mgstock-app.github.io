-- GESTLOK HQ retirado. No programar ni reactivar el motor.
-- Desactivar solo el antiguo job y conservar su historial.
select cron.alter_job(jobid, active := false) from cron.job where jobname='gestlok-hq-worker' and active;
