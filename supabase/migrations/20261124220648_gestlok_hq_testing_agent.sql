alter table gestlok_hq_private.tasks drop constraint tasks_agent_check, add constraint tasks_agent_check check(agent in ('desarrollo','calidad','testing','atencion','marketing','datos'));
