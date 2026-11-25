-- HQ Web Push: opt-in por dispositivo, exclusivamente para la creadora.
-- No se reutilizan colas ni destinatarios de los comercios.
create table if not exists gestlok_hq_private.push_devices(
 endpoint text primary key, creator_id uuid not null references auth.users(id) on delete cascade,
 auth_key text not null,p256dh_key text not null,registered_at timestamptz not null default now()
);
create table if not exists gestlok_hq_private.push_jobs(
 id uuid primary key default gen_random_uuid(),
 run_id uuid not null references gestlok_hq_private.agent_runs(id) on delete cascade,
 endpoint text not null references gestlok_hq_private.push_devices(endpoint) on delete cascade,
 creator_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), next_at timestamptz not null default now(),
 attempts integer not null default 0, lease uuid, delivered_at timestamptz,
 unique(run_id,endpoint)
);
alter table gestlok_hq_private.push_devices enable row level security;
alter table gestlok_hq_private.push_jobs enable row level security;
revoke all on gestlok_hq_private.push_devices,gestlok_hq_private.push_jobs from public,anon,authenticated;
create index if not exists hq_push_jobs_due on gestlok_hq_private.push_jobs(next_at) where delivered_at is null;
create or replace function public.gestlok_hq_push_device(p_endpoint text,p_enable boolean,p_auth text default null,p_p256dh text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v uuid:=auth.uid();
begin
 if v is null then raise exception 'Sesión requerida' using errcode='42501'; end if;
 if p_enable is false then
  delete from gestlok_hq_private.push_devices where endpoint=p_endpoint and creator_id=v;
  return found;
 end if;
 perform gestlok_hq_private.require_creator();
 if p_enable is distinct from true or p_endpoint is null or length(p_endpoint)>2048
 or p_endpoint !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|push[.]services[.]mozilla[.]com|updates[.]push[.]services[.]mozilla[.]org|notify[.]windows[.]com|[a-zA-Z0-9-]+[.]notify[.]windows[.]com|web[.]push[.]apple[.]com|[a-zA-Z0-9-]+[.]push[.]apple[.]com)/[^#[:space:]]+$'
 or coalesce(p_auth,'') !~ '^[A-Za-z0-9_-]{16,100}$'
 or coalesce(p_p256dh,'') !~ '^[A-Za-z0-9_-]{16,200}$' then
  raise exception 'Suscripción inválida' using errcode='22023';
 end if;
 if (select count(*) from gestlok_hq_private.push_devices where creator_id=v)>=12
 and not exists(select 1 from gestlok_hq_private.push_devices where endpoint=p_endpoint and creator_id=v) then
  raise exception 'Límite de dispositivos' using errcode='22023';
 end if;
 insert into gestlok_hq_private.push_devices(endpoint,creator_id,auth_key,p256dh_key)
 values(p_endpoint,v,p_auth,p_p256dh)
 on conflict(endpoint) do update set auth_key=excluded.auth_key,p256dh_key=excluded.p256dh_key,registered_at=now()
 where gestlok_hq_private.push_devices.creator_id=v;
 return found;
end $$;
revoke all on function public.gestlok_hq_push_device(text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_hq_push_device(text,boolean,text,text) to authenticated;
create or replace function gestlok_hq_private.enqueue_director_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.state is distinct from 'working' or new.state is distinct from 'review' then return new; end if;
 if not exists(select 1 from gestlok_hq_private.tasks t where t.id=new.task_id and t.creator_id=new.creator_id and t.agent='lider' and t.status='pendiente') then return new; end if;
 insert into gestlok_hq_private.push_jobs(run_id,endpoint,creator_id)
 select new.id,d.endpoint,d.creator_id from gestlok_hq_private.push_devices d where d.creator_id=new.creator_id
 on conflict(run_id,endpoint) do nothing;
 return new;
end $$;
revoke all on function gestlok_hq_private.enqueue_director_push() from public,anon,authenticated;
drop trigger if exists hq_director_push on gestlok_hq_private.agent_runs;
create trigger hq_director_push after update of state on gestlok_hq_private.agent_runs for each row execute function gestlok_hq_private.enqueue_director_push();
-- Se verifica nuevamente el destinatario y que el informe continúe pendiente.
-- Se usa un lease atómico para despachos concurrentes; nunca se devuelven informes.
create or replace function public.gestlok_hq_push_claim()
returns table(id uuid,lease uuid,endpoint text,auth_key text,p256dh_key text)
language plpgsql security definer set search_path='' as $$
begin
 delete from gestlok_hq_private.push_jobs j where j.created_at<now()-interval '7 days';
 return query
 with due as (
  select j.id from gestlok_hq_private.push_jobs j
  join gestlok_hq_private.push_devices d on d.endpoint=j.endpoint and d.creator_id=j.creator_id
  join gestlok_hq_private.agent_runs r on r.id=j.run_id and r.creator_id=j.creator_id
  join gestlok_hq_private.tasks t on t.id=r.task_id and t.creator_id=r.creator_id
  join gestlok_platform.admins a on a.user_id=j.creator_id
  join auth.users u on u.id=a.user_id
  where j.delivered_at is null and j.attempts<3 and j.next_at<=now() and j.created_at>now()-interval '24 hours'
    and r.state='review' and t.status='pendiente' and t.agent='lider'
    and u.email_confirmed_at is not null and lower(u.email)='kmu15lopez@gmail.com'
    and (u.banned_until is null or u.banned_until<=now())
  order by j.created_at limit 20 for update of j skip locked
 ), claimed as (
  update gestlok_hq_private.push_jobs j set attempts=j.attempts+1,next_at=now()+interval '5 minutes',lease=gen_random_uuid()
  from due where j.id=due.id returning j.id,j.lease,j.endpoint,j.creator_id
 )
 select c.id,c.lease,d.endpoint,d.auth_key,d.p256dh_key from claimed c
 join gestlok_hq_private.push_devices d on d.endpoint=c.endpoint and d.creator_id=c.creator_id;
end $$;
revoke all on function public.gestlok_hq_push_claim() from public,anon,authenticated;
grant execute on function public.gestlok_hq_push_claim() to service_role;
create or replace function public.gestlok_hq_push_ack(p_id uuid,p_lease uuid,p_result text)
returns boolean language plpgsql security definer set search_path='' as $$
declare ep text; own uuid;
begin
 if p_result not in ('sent','retry','gone') then return false; end if;
 update gestlok_hq_private.push_jobs j set lease=null,
 delivered_at=case when p_result='sent' then now() else j.delivered_at end,
 next_at=now()+interval '5 minutes'
 where j.id=p_id and j.lease=p_lease returning j.endpoint,j.creator_id into ep,own;
 if not found then return false; end if;
 if p_result='gone' then delete from gestlok_hq_private.push_devices where endpoint=ep and creator_id=own; end if;
 return true;
end $$;
revoke all on function public.gestlok_hq_push_ack(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.gestlok_hq_push_ack(uuid,uuid,text) to service_role;
