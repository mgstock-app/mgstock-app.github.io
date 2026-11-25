-- QR login: challenges only, no reusable session tokens in PostgreSQL.
create schema if not exists gestlok_qr_private;
revoke all on schema gestlok_qr_private from public,anon,authenticated;
create table if not exists gestlok_qr_private.challenges (
 id uuid primary key default gen_random_uuid(),
 desktop_hash text not null check(desktop_hash ~ '^[a-f0-9]{64}$'),
 scan_hash text not null check(scan_hash ~ '^[a-f0-9]{64}$'),
 origin text not null,
 code text not null check(code ~ '^[0-9]{6}$'),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '2 minutes'),
 state text not null default 'pending' check(state in ('pending','approved','consumed','cancelled')),
 approved_user uuid,
 approved_session uuid,
 approved_at timestamptz,
 consumed_at timestamptz
);
alter table gestlok_qr_private.challenges enable row level security;
revoke all on table gestlok_qr_private.challenges from public,anon,authenticated;
create index if not exists qr_challenges_created on gestlok_qr_private.challenges(created_at);

-- Only the server may call this function. It validates both device proofs and the mobile session.
create or replace function public.gestlok_qr_operation(p_action text,p_origin text,p_id uuid default null,p_proof text default null,p_other text default null,p_code text default null,p_user uuid default null,p_session uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c gestlok_qr_private.challenges; mobile_ok boolean;
begin
 if p_origin not in ('https://gestlok.com.ar','https://www.gestlok.com.ar','https://gestlok-prueba.vercel.app','https://gestlok-testing.vercel.app') then raise exception 'Origen inválido' using errcode='22023'; end if;
 if p_proof is null or p_proof !~ '^[a-f0-9]{64}$' then raise exception 'Solicitud inválida' using errcode='22023'; end if;
 if p_action='create' then
  if p_other is null or p_other !~ '^[a-f0-9]{64}$' or p_other=p_proof or coalesce(p_code,'') !~ '^[0-9]{6}$' then raise exception 'Solicitud inválida' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(2026112521);
  delete from gestlok_qr_private.challenges where created_at<now()-interval '24 hours';
  if (select count(*) from gestlok_qr_private.challenges where created_at>now()-interval '1 minute')>=60 or (select count(*) from gestlok_qr_private.challenges)>=2000 then raise exception 'Límite temporal' using errcode='P0001'; end if;
  insert into gestlok_qr_private.challenges(desktop_hash,scan_hash,origin,code) values(p_proof,p_other,p_origin,p_code) returning * into c;
  return jsonb_build_object('id',c.id,'code',c.code,'expires_at',c.expires_at);
 end if;
 if p_id is null or p_action not in ('preview','approve','claim','cancel') then raise exception 'Solicitud inválida' using errcode='22023'; end if;
 select * into c from gestlok_qr_private.challenges where id=p_id and origin=p_origin and
 (case when p_action in ('preview','approve') then scan_hash else desktop_hash end)=p_proof for update;
 if not found or c.expires_at<=now() or c.state in ('cancelled','consumed') then return jsonb_build_object('state','expired'); end if;
 if p_action in ('preview','approve') then
  select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
    where s.id=p_session and s.user_id=p_user and (s.not_after is null or s.not_after>now())
    and u.email_confirmed_at is not null and u.email is not null and (u.banned_until is null or u.banned_until<=now())
    and not exists(select 1 from auth.mfa_factors f where f.user_id=u.id)) into mobile_ok;
  if not mobile_ok then return jsonb_build_object('state','unsupported'); end if;
  if c.state<>'pending' then return jsonb_build_object('state','expired'); end if;
  if p_action='preview' then return jsonb_build_object('state','pending','code',c.code,'expires_at',c.expires_at); end if;
  if p_code is distinct from c.code then return jsonb_build_object('state','invalid'); end if;
  update gestlok_qr_private.challenges set state='approved',approved_user=p_user,approved_session=p_session,approved_at=now() where id=c.id;
  return jsonb_build_object('state','approved');
 end if;
 if p_action='cancel' then
  update gestlok_qr_private.challenges set state='cancelled' where id=c.id;
  return jsonb_build_object('state','cancelled');
 end if;
 if c.state='pending' then return jsonb_build_object('state','pending'); end if;
 -- Claim consumes the challenge before minting credentials; parallel or replayed requests lose.
 select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
 where s.id=c.approved_session and s.user_id=c.approved_user and (s.not_after is null or s.not_after>now())
 and u.email_confirmed_at is not null and u.email is not null and (u.banned_until is null or u.banned_until<=now())
 and not exists(select 1 from auth.mfa_factors f where f.user_id=u.id)) into mobile_ok;
 update gestlok_qr_private.challenges set state='consumed',consumed_at=now() where id=c.id;
 if not mobile_ok then return jsonb_build_object('state','expired'); end if;
 return jsonb_build_object('state','claimed','user_id',c.approved_user);
end $$;
revoke all on function public.gestlok_qr_operation(text,text,uuid,text,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.gestlok_qr_operation(text,text,uuid,text,text,text,uuid,uuid) to service_role;
