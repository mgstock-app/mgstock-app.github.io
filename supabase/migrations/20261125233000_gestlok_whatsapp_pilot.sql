-- PILOT ONLY. This queue is not GESTLOK Chat's commercial inbox.
create schema if not exists gestlok_wa_pilot_private;
revoke all on schema gestlok_wa_pilot_private from public,anon,authenticated;
create table if not exists gestlok_wa_pilot_private.messages(
 message_id text primary key check(length(message_id)<=256),
 sender text not null check(sender ~ '^[0-9]{8,15}$'),
 body text not null check(length(body) between 1 and 2000),
 provider_at timestamptz not null, received_at timestamptz not null default now()
);
alter table gestlok_wa_pilot_private.messages enable row level security;
revoke all on gestlok_wa_pilot_private.messages from public,anon,authenticated;
create or replace function public.gestlok_wa_pilot_ingest(p_messages jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if jsonb_typeof(p_messages) is distinct from 'array' or jsonb_array_length(p_messages)>50 then raise exception 'Invalid batch';end if;
 perform pg_advisory_xact_lock(202611252329);
 delete from gestlok_wa_pilot_private.messages where received_at<now()-interval '24 hours';
 if (select count(*) from gestlok_wa_pilot_private.messages)>=1000 then raise exception 'Pilot limit';end if;
 insert into gestlok_wa_pilot_private.messages(message_id,sender,body,provider_at)
 select m->>'messageId',m->>'sender',m->>'text',to_timestamp((m->>'timestamp')::double precision)
 from jsonb_array_elements(p_messages) m
 where (m->>'messageId') ~ '^wamid[.][A-Za-z0-9+/_=.-]{1,250}$'
 and to_timestamp((m->>'timestamp')::double precision) between now()-interval '24 hours' and now()+interval '5 minutes'
 on conflict(message_id) do nothing;
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function public.gestlok_wa_pilot_ingest(jsonb) from public,anon,authenticated;
grant execute on function public.gestlok_wa_pilot_ingest(jsonb) to service_role;
