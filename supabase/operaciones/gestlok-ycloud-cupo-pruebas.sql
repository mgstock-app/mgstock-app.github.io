-- ONLY the isolated "gestlok-pruebas" project. Never a production migration.
-- A simulated, conservative ledger. It neither reads a provider nor sends
-- WhatsApp messages. No provider evidence/real opening balances are seeded.
-- Every successful reservation remains counted even after a failed or uncertain
-- send simulation. The dispatch gate in one-shot.mjs is independently disabled.

create table gestlok_ycloud_pilot_private.quota_windows (
 sender_key text not null check (sender_key ~ '^[0-9a-f]{64}$'),
 period_start timestamptz not null,
 period_end timestamptz not null,
 observed_at timestamptz not null,
 used_upper_bound integer not null check (used_upper_bound between 0 and 1000000000),
 unresolved_upper_bound integer not null check (unresolved_upper_bound between 0 and 1000000000),
 evidence_key text not null check (evidence_key ~ '^[0-9a-f]{64}$'),
 evidence_kind text not null default 'synthetic' check (evidence_kind = 'synthetic'),
 blocked boolean not null default false,
 primary key (sender_key,period_start),
 check (period_end > period_start and period_end - period_start between interval '27 days' and interval '32 days'),
 check (observed_at >= period_start and observed_at < period_end)
);

create table gestlok_ycloud_pilot_private.quota_reservations (
 sender_key text not null,
 period_start timestamptz not null,
 message_key text not null check (message_key ~ '^[0-9a-f]{64}$'),
 units integer not null check (units between 1 and 10),
 created_at timestamptz not null default now(),
 -- Globally deduplicate by commercial number, including across months.
 primary key (sender_key,message_key),
 foreign key (sender_key,period_start) references gestlok_ycloud_pilot_private.quota_windows(sender_key,period_start)
);
create index gestlok_ycloud_quota_reservations_window
 on gestlok_ycloud_pilot_private.quota_reservations(sender_key,period_start);

alter table gestlok_ycloud_pilot_private.quota_windows enable row level security;
alter table gestlok_ycloud_pilot_private.quota_reservations enable row level security;
revoke all on gestlok_ycloud_pilot_private.quota_windows,gestlok_ycloud_pilot_private.quota_reservations from public,anon,authenticated,service_role;
grant select on gestlok_ycloud_pilot_private.quota_windows to service_role;
grant select,insert on gestlok_ycloud_pilot_private.quota_reservations to service_role;

-- All calls must originate from the trusted server with a normalized, verified
-- commercial phone key (not an empresa/sucursal or customer key).
-- The only allowed evidence kind is synthetic. Only the DB owner can seed it.
-- There is deliberately no "provider verified" flag or send authorization.
create function public.gestlok_ycloud_pilot_reserve_quota(p_sender_key text,p_message_key text,p_units integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 w gestlok_ycloud_pilot_private.quota_windows;
 active_windows integer;
 used bigint;
 remaining bigint;
 actual_now timestamptz;
 deny jsonb := '{"reserved":false,"sendAllowed":false,"simulated":true}'::jsonb;
begin
 if p_sender_key is null or p_sender_key !~ '^[0-9a-f]{64}$'
  or p_message_key is null or p_message_key !~ '^[0-9a-f]{64}$'
  or p_units is null or p_units not between 1 and 10 then
  return deny||jsonb_build_object('reason','invalid_request');
 end if;
 -- Serialize reservations across all tenants using a number, even around a
 -- month boundary. Advisory hash collisions only make unrelated numbers wait.
 perform pg_advisory_xact_lock(hashtextextended('gestlok-yc-quota:'||p_sender_key,0));
 actual_now:=clock_timestamp();
 if exists(select 1 from gestlok_ycloud_pilot_private.quota_reservations
  where sender_key=p_sender_key and message_key=p_message_key) then
  return deny||jsonb_build_object('reason','duplicate');
 end if;
 select count(*) into active_windows from gestlok_ycloud_pilot_private.quota_windows
  where sender_key=p_sender_key and period_start<=actual_now and period_end>actual_now;
 if active_windows<>1 then return deny||jsonb_build_object('reason','no_unique_current_evidence'); end if;
 select * into w from gestlok_ycloud_pilot_private.quota_windows
  where sender_key=p_sender_key and period_start<=actual_now and period_end>actual_now;
 if w.blocked then return deny||jsonb_build_object('reason','blocked'); end if;
 if w.observed_at>actual_now or actual_now-w.observed_at>interval '5 minutes'
  or w.period_end-actual_now<interval '10 minutes' then
  return deny||jsonb_build_object('reason','stale_or_boundary_evidence');
 end if;
 -- Carry unconfirmed reservations from older windows forward conservatively.
 -- Only a deliberate future reconciliation with authoritative provider data
 -- could reduce this overestimate; no automatic release is implemented.
 select coalesce(sum(units),0) into used from gestlok_ycloud_pilot_private.quota_reservations
  where sender_key=p_sender_key;
 -- 100 free-message safety buffer; no positive dispatch approval.
 remaining:=greatest(0::bigint,900::bigint-w.used_upper_bound-w.unresolved_upper_bound-used);
 if p_units>remaining then return deny||jsonb_build_object('reason','limit_reached','remaining',remaining); end if;
 insert into gestlok_ycloud_pilot_private.quota_reservations(sender_key,period_start,message_key,units)
  values(p_sender_key,w.period_start,p_message_key,p_units);
 return jsonb_build_object('reserved',true,'reason','simulated_reservation','simulated',true,'sendAllowed',false,'remaining',remaining-p_units);
end $$;
revoke all on function public.gestlok_ycloud_pilot_reserve_quota(text,text,integer) from public,anon,authenticated;
grant execute on function public.gestlok_ycloud_pilot_reserve_quota(text,text,integer) to service_role;
