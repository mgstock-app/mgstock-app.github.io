begin;

-- No modifica docs, stock, roles ni datos previos. No aplicar antes de publicar.
create schema if not exists gestlok_resenas_private;
revoke all on schema gestlok_resenas_private from public,anon,authenticated;

create function gestlok_resenas_private.authorized() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(auth.uid() is not null
   and gestlok_tenancy.current_tenant_id()='cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
   and (public.mi_rol() in ('creadora','dueno')
     or (public.mi_rol()='gerente' and public.puede_editar_local('munro'))),false)
$$;

create function gestlok_resenas_private.today_ar() returns date
language sql stable set search_path='' as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

create function gestlok_resenas_private.phone(p_phone text) returns text
language plpgsql immutable set search_path='' as $$
declare p text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
begin
 if left(p,4)='0054' then p:=substr(p,5);
 elsif left(p,2)='54' and length(p)>11 then p:=substr(p,3); end if;
 if length(p)=11 and left(p,1)='9' then p:=substr(p,2); end if;
 if left(p,1)='0' then p:=substr(p,2); end if;
 if p !~ '^[0-9]{10}$' then raise exception 'Teléfono argentino inválido: usar 10 dígitos sin 0 ni 15' using errcode='22023'; end if;
 return p;
end $$;

create table gestlok_resenas_private.coupons(
 id uuid primary key default gen_random_uuid(),
 customer_name text not null check(length(btrim(customer_name)) between 2 and 100),
 phone text not null check(phone ~ '^[0-9]{10}$'),
 code text not null unique check(code ~ '^[A-F0-9]{6}$'),
 period date not null check(extract(day from period)=1),
 discount integer not null default 10 check(discount=10),
 created_at timestamptz not null default now(),
 created_by uuid not null,
 used_at timestamptz,
 used_by uuid,
 unique(phone,period),
 check((used_at is null)=(used_by is null))
);
alter table gestlok_resenas_private.coupons enable row level security;
revoke all on gestlok_resenas_private.coupons from public,anon,authenticated;

create table gestlok_resenas_private.events(
 id bigint generated always as identity primary key,
 coupon_id uuid not null references gestlok_resenas_private.coupons(id),
 action text not null check(action in ('created','used')),
 actor uuid not null,
 happened_at timestamptz not null default now()
);
alter table gestlok_resenas_private.events enable row level security;
revoke all on gestlok_resenas_private.events from public,anon,authenticated;

create function gestlok_resenas_private.payload(c gestlok_resenas_private.coupons) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'customer_name',c.customer_name,'phone',c.phone,'code',c.code,
 'period',c.period,'discount',c.discount,'created_at',c.created_at,'used_at',c.used_at,
 'expires_at',((c.period+12)::timestamp at time zone 'America/Argentina/Buenos_Aires'),
 'status',case when c.used_at is not null then 'used'
   when gestlok_resenas_private.today_ar()<c.period or gestlok_resenas_private.today_ar()>=c.period+12 then 'expired' else 'pending' end)
$$;

create function public.gestlok_resenas_list() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not gestlok_resenas_private.authorized() then raise exception 'Acceso denegado' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(gestlok_resenas_private.payload(c) order by c.created_at desc,c.id)
   from gestlok_resenas_private.coupons c),'[]'::jsonb);
end $$;

create function public.gestlok_resenas_create(p_name text,p_phone text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c gestlok_resenas_private.coupons; p text; d date:=gestlok_resenas_private.today_ar();
begin
 if not gestlok_resenas_private.authorized() then raise exception 'Acceso denegado' using errcode='42501'; end if;
 if extract(day from d)>12 then raise exception 'Fuera de vigencia: emisión del 1 al 12' using errcode='22023'; end if;
 p:=gestlok_resenas_private.phone(p_phone);
 if p_name is null or length(btrim(p_name)) not between 2 and 100 then raise exception 'Nombre inválido' using errcode='22023'; end if;
 -- Unique indexes are the concurrency authority; retry only random code collisions.
 for attempt in 1..32 loop
  begin
   insert into gestlok_resenas_private.coupons(customer_name,phone,code,period,created_by)
   values(btrim(p_name),p,upper(substr(md5(gen_random_uuid()::text),1,6)),date_trunc('month',d)::date,auth.uid()) returning * into c;
   insert into gestlok_resenas_private.events(coupon_id,action,actor) values(c.id,'created',auth.uid());
   return gestlok_resenas_private.payload(c);
  exception when unique_violation then
   if exists(select 1 from gestlok_resenas_private.coupons where phone=p and period=date_trunc('month',d)::date)
    then raise exception 'El cliente ya tiene cupón este mes' using errcode='23505'; end if;
  end;
 end loop;
 raise exception 'No se pudo generar código único; reintentar';
end $$;

create function public.gestlok_resenas_redeem(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c gestlok_resenas_private.coupons; d date:=gestlok_resenas_private.today_ar();
begin
 if not gestlok_resenas_private.authorized() then raise exception 'Acceso denegado' using errcode='42501'; end if;
 update gestlok_resenas_private.coupons set used_at=now(),used_by=auth.uid()
 where id=p_id and used_at is null and d>=period and d<period+12 returning * into c;
 if not found then raise exception 'Cupón utilizado, vencido o inexistente' using errcode='22023'; end if;
 insert into gestlok_resenas_private.events(coupon_id,action,actor) values(c.id,'used',auth.uid());
 return gestlok_resenas_private.payload(c);
end $$;

-- Private helpers never exposed via the API; only the three guarded RPCs are callable.
revoke all on all functions in schema gestlok_resenas_private from public,anon,authenticated;
revoke all on function public.gestlok_resenas_list(),public.gestlok_resenas_create(text,text),public.gestlok_resenas_redeem(uuid) from public,anon;
grant execute on function public.gestlok_resenas_list(),public.gestlok_resenas_create(text,text),public.gestlok_resenas_redeem(uuid) to authenticated;
comment on table gestlok_resenas_private.coupons is 'Mi Gusto–Munro only. Benefit independent of Google reviews. No delete/reissue or status reversal.';
commit;
