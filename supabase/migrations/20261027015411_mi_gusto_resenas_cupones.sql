begin;

-- Reseñas · Mi Gusto (Munro y Torcuato, cada sucursal con datos propios).
-- Base: propuesta de Codex (codex/munro-resenas, nunca aplicada), ampliada a las dos sucursales.
-- No modifica docs, stock, roles ni datos previos.
-- - Cupón 10% OFF con código aleatorio de 6 caracteres sin O/0/I/1, único para siempre.
-- - Un cupón por teléfono, mes y sucursal. Se usa solo en la sucursal que lo emitió, una única vez.
-- - Emisión y uso del 1 al 12 (hora de Buenos Aires); desde el 13 los pendientes quedan vencidos.
-- - El beneficio no depende de publicar ni demostrar una reseña en Google.
create schema if not exists gestlok_resenas_private;
revoke all on schema gestlok_resenas_private from public,anon,authenticated;

create function gestlok_resenas_private.authorized(p_local text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(auth.uid() is not null
   and p_local in ('munro','torcuato')
   and gestlok_tenancy.current_tenant_id()='cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
   and (public.mi_rol() in ('creadora','dueno')
     or (public.mi_rol()='gerente' and public.puede_editar_local(p_local))),false)
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

-- 6 caracteres de un alfabeto de 32 símbolos sin O, 0, I ni 1 (fáciles de dictar).
-- Usa los primeros 6 bytes de un UUID v4 (aleatorios); 256 es múltiplo de 32: sin sesgo.
create function gestlok_resenas_private.new_code() returns text
language plpgsql volatile set search_path='' as $$
declare a constant text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea:=uuid_send(gen_random_uuid()); c text:='';
begin
 for i in 0..5 loop c:=c||substr(a,(get_byte(b,i)%32)+1,1); end loop;
 return c;
end $$;

create table gestlok_resenas_private.coupons(
 id uuid primary key default gen_random_uuid(),
 local text not null check(local in ('munro','torcuato')),
 customer_name text not null check(length(btrim(customer_name)) between 2 and 100),
 phone text not null check(phone ~ '^[0-9]{10}$'),
 code text not null unique check(code ~ '^[A-HJ-NP-Z2-9]{6}$'),
 period date not null check(extract(day from period)=1),
 discount integer not null default 10 check(discount=10),
 created_at timestamptz not null default now(),
 created_by uuid not null,
 used_at timestamptz,
 used_by uuid,
 unique(local,phone,period),
 check((used_at is null)=(used_by is null))
);
create index coupons_local_created on gestlok_resenas_private.coupons(local,created_at desc);
alter table gestlok_resenas_private.coupons enable row level security;
revoke all on gestlok_resenas_private.coupons from public,anon,authenticated;

create table gestlok_resenas_private.events(
 id bigint generated always as identity primary key,
 coupon_id uuid not null references gestlok_resenas_private.coupons(id),
 action text not null check(action in ('created','used')),
 actor uuid not null,
 happened_at timestamptz not null default now()
);
create unique index events_used_once on gestlok_resenas_private.events(coupon_id) where action='used';
alter table gestlok_resenas_private.events enable row level security;
revoke all on gestlok_resenas_private.events from public,anon,authenticated;

create function gestlok_resenas_private.payload(c gestlok_resenas_private.coupons) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'local',c.local,'customer_name',c.customer_name,'phone',c.phone,'code',c.code,
 'period',c.period,'discount',c.discount,'created_at',c.created_at,'used_at',c.used_at,
 'expires_at',((c.period+12)::timestamp at time zone 'America/Argentina/Buenos_Aires'),
 'status',case when c.used_at is not null then 'used'
   when gestlok_resenas_private.today_ar()<c.period or gestlok_resenas_private.today_ar()>=c.period+12 then 'expired' else 'pending' end)
$$;

create function public.gestlok_resenas_list(p_local text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not gestlok_resenas_private.authorized(p_local) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(gestlok_resenas_private.payload(c) order by c.created_at desc,c.id)
   from gestlok_resenas_private.coupons c where c.local=p_local),'[]'::jsonb);
end $$;

create function public.gestlok_resenas_create(p_local text,p_name text,p_phone text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c gestlok_resenas_private.coupons; p text; d date:=gestlok_resenas_private.today_ar();
begin
 if not gestlok_resenas_private.authorized(p_local) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 if extract(day from d)>12 then raise exception 'Fuera de vigencia: emisión del 1 al 12' using errcode='22023'; end if;
 p:=gestlok_resenas_private.phone(p_phone);
 if p_name is null or length(btrim(p_name)) not between 2 and 100 then raise exception 'Nombre inválido' using errcode='22023'; end if;
 -- Los índices únicos son la autoridad ante concurrencia; solo se reintentan choques de código.
 for attempt in 1..32 loop
  begin
   insert into gestlok_resenas_private.coupons(local,customer_name,phone,code,period,created_by)
   values(p_local,btrim(p_name),p,gestlok_resenas_private.new_code(),date_trunc('month',d)::date,auth.uid()) returning * into c;
   insert into gestlok_resenas_private.events(coupon_id,action,actor) values(c.id,'created',auth.uid());
   return gestlok_resenas_private.payload(c);
  exception when unique_violation then
   if exists(select 1 from gestlok_resenas_private.coupons where local=p_local and phone=p and period=date_trunc('month',d)::date)
    then raise exception 'El cliente ya tiene cupón este mes en esta sucursal' using errcode='23505'; end if;
  end;
 end loop;
 raise exception 'No se pudo generar código único; reintentar';
end $$;

create function public.gestlok_resenas_redeem(p_local text,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c gestlok_resenas_private.coupons; d date:=gestlok_resenas_private.today_ar();
begin
 if not gestlok_resenas_private.authorized(p_local) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 -- Atómico: solo uno de dos usos simultáneos encuentra el cupón sin usar.
 update gestlok_resenas_private.coupons set used_at=now(),used_by=auth.uid()
 where id=p_id and local=p_local and used_at is null and d>=period and d<period+12 returning * into c;
 if not found then raise exception 'Cupón utilizado, vencido, de otra sucursal o inexistente' using errcode='22023'; end if;
 insert into gestlok_resenas_private.events(coupon_id,action,actor) values(c.id,'used',auth.uid());
 return gestlok_resenas_private.payload(c);
end $$;

-- Las funciones privadas nunca se exponen; solo las tres RPC con controles.
revoke all on all functions in schema gestlok_resenas_private from public,anon,authenticated;
revoke all on function public.gestlok_resenas_list(text),public.gestlok_resenas_create(text,text,text),public.gestlok_resenas_redeem(text,uuid) from public,anon;
grant execute on function public.gestlok_resenas_list(text),public.gestlok_resenas_create(text,text,text),public.gestlok_resenas_redeem(text,uuid) to authenticated;
comment on table gestlok_resenas_private.coupons is 'Mi Gusto: Munro y Torcuato con datos propios. Beneficio independiente de reseñas en Google. Sin borrar, reemitir ni revertir estados.';
commit;
