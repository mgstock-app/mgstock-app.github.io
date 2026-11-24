-- GESTLOK HQ: private, manually managed task queue. No agent execution or tenant access.
create schema if not exists gestlok_hq_private;
revoke all on schema gestlok_hq_private from public, anon, authenticated;
grant usage on schema gestlok_hq_private to authenticated;
create table gestlok_hq_private.tasks (
 id uuid primary key default gen_random_uuid(),
 creator_id uuid not null,
 agent text not null check(agent in ('desarrollo','calidad','atencion','marketing','datos')),
 instruction text not null check(char_length(btrim(instruction)) between 1 and 4000),
 status text not null default 'pendiente' check(status in ('pendiente','cerrada','cancelada')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table gestlok_hq_private.tasks enable row level security;
revoke all on gestlok_hq_private.tasks from public, anon, authenticated;
create index hq_tasks_creator_date on gestlok_hq_private.tasks(creator_id,created_at desc);
create function gestlok_hq_private.require_creator() returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v uuid := gestlok_platform.require_admin();
begin
 if v is null or v is distinct from auth.uid() or lower(coalesce(auth.jwt()->>'email','')) <> 'kmu15lopez@gmail.com'
 or not exists(select 1 from auth.users u where u.id=v and u.email_confirmed_at is not null and lower(u.email)='kmu15lopez@gmail.com') then
 raise exception 'Acceso exclusivo de la creadora' using errcode='42501';
 end if;
 return v;
end $$;
revoke all on function gestlok_hq_private.require_creator() from public,anon,authenticated;
create function gestlok_hq_private.list_tasks() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v uuid:=gestlok_hq_private.require_creator();
begin return coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select id,agent,instruction,status,created_at,updated_at from gestlok_hq_private.tasks where creator_id=v order by created_at desc limit 200) t),'[]'::jsonb); end $$;
create function gestlok_hq_private.add_task(p_agent text,p_instruction text) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid:=gestlok_hq_private.require_creator(); r uuid;
begin insert into gestlok_hq_private.tasks(creator_id,agent,instruction) values(v,p_agent,btrim(p_instruction)) returning id into r; return r; end $$;
create function gestlok_hq_private.close_task(p_id uuid,p_status text) returns boolean language plpgsql security definer set search_path='' as $$
declare v uuid:=gestlok_hq_private.require_creator();
begin
 if p_status is null or p_status not in ('cerrada','cancelada') then raise exception 'Estado inválido' using errcode='22023'; end if;
 update gestlok_hq_private.tasks set status=p_status,updated_at=now() where id=p_id and creator_id=v and status='pendiente';
 return found;
end $$;
revoke all on function gestlok_hq_private.list_tasks(),gestlok_hq_private.add_task(text,text),gestlok_hq_private.close_task(uuid,text) from public,anon,authenticated;
grant execute on function gestlok_hq_private.list_tasks(),gestlok_hq_private.add_task(text,text),gestlok_hq_private.close_task(uuid,text) to authenticated;
create function public.gestlok_hq_list_tasks() returns jsonb language sql stable security invoker set search_path='' as $$ select gestlok_hq_private.list_tasks() $$;
create function public.gestlok_hq_add_task(p_agent text,p_instruction text) returns uuid language sql security invoker set search_path='' as $$ select gestlok_hq_private.add_task(p_agent,p_instruction) $$;
create function public.gestlok_hq_close_task(p_id uuid,p_status text) returns boolean language sql security invoker set search_path='' as $$ select gestlok_hq_private.close_task(p_id,p_status) $$;
revoke all on function public.gestlok_hq_list_tasks(),public.gestlok_hq_add_task(text,text),public.gestlok_hq_close_task(uuid,text) from public,anon,authenticated;
grant execute on function public.gestlok_hq_list_tasks(),public.gestlok_hq_add_task(text,text),public.gestlok_hq_close_task(uuid,text) to authenticated;
