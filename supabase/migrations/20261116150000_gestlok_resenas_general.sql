-- Reseñas con cupón · versión GENERAL para empresas nuevas (16/11/2026).
-- Regla de la usuaria: lo que usan las empresas actuales no se modifica. Esta versión vive en un esquema propio
-- (gestlok_resenas_gen_private) y funciones propias (gestlok_resenas_gen_*). No lee ni cambia las Reseñas de
-- Mi Gusto (gestlok_resenas_private), que además queda excluida aunque alguien intente habilitarla acá.
-- - Se enciende empresa por empresa (tabla empresas); sin habilitar, nadie ve ni usa nada.
-- - Cada local tiene sus cupones y sus ajustes: % de descuento, días de validez y mensaje de WhatsApp.
-- - Un cupón pendiente por teléfono y local a la vez. Se usa una sola vez y solo en el local que lo emitió.
-- - Dueño y gerentes del local registran y marcan usados; solo el dueño cambia los ajustes.
-- Solo agrega; no borra ni modifica datos existentes.
create schema if not exists gestlok_resenas_gen_private;
revoke all on schema gestlok_resenas_gen_private from public,anon,authenticated;

create table if not exists gestlok_resenas_gen_private.empresas(
 tenant_id uuid primary key check(tenant_id<>'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid),
 enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists gestlok_resenas_gen_private.ajustes(
 tenant_id uuid not null references gestlok_resenas_gen_private.empresas(tenant_id),
 local text not null check(char_length(local) between 1 and 120),
 discount integer not null default 10 check(discount between 1 and 100),
 valid_days integer not null default 30 check(valid_days between 1 and 365),
 message text not null default '' check(char_length(message)<=600),
 updated_at timestamptz not null default now(),
 updated_by uuid not null,
 primary key(tenant_id,local)
);
create table if not exists gestlok_resenas_gen_private.coupons(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references gestlok_resenas_gen_private.empresas(tenant_id),
 local text not null check(char_length(local) between 1 and 120),
 customer_name text not null check(length(btrim(customer_name)) between 2 and 100),
 phone text not null check(phone ~ '^[0-9]{10}$'),
 code text not null unique check(code ~ '^[A-HJ-NP-Z2-9]{6}$'),
 discount integer not null check(discount between 1 and 100),
 valid_until date not null,
 created_at timestamptz not null default now(),
 created_by uuid not null,
 used_at timestamptz,
 used_by uuid,
 check((used_at is null)=(used_by is null))
);
create index if not exists resenas_gen_coupons_local on gestlok_resenas_gen_private.coupons(tenant_id,local,created_at desc);
create index if not exists resenas_gen_coupons_phone on gestlok_resenas_gen_private.coupons(tenant_id,local,phone);
create table if not exists gestlok_resenas_gen_private.events(
 id bigint generated always as identity primary key,
 coupon_id uuid not null references gestlok_resenas_gen_private.coupons(id),
 action text not null check(action in ('created','used','edited')),
 actor uuid not null,
 detail jsonb not null default '{}'::jsonb,
 happened_at timestamptz not null default now()
);
create unique index if not exists resenas_gen_events_used_once on gestlok_resenas_gen_private.events(coupon_id) where action='used';
alter table gestlok_resenas_gen_private.empresas enable row level security;
alter table gestlok_resenas_gen_private.ajustes enable row level security;
alter table gestlok_resenas_gen_private.coupons enable row level security;
alter table gestlok_resenas_gen_private.events enable row level security;
revoke all on all tables in schema gestlok_resenas_gen_private from public,anon,authenticated;

create or replace function gestlok_resenas_gen_private.today_ar() returns date
language sql stable set search_path='' as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

-- Empresa de la sesión, solo si está habilitada (nunca Mi Gusto).
create or replace function gestlok_resenas_gen_private.tenant() returns uuid
language sql stable security definer set search_path='' as $$
 select e.tenant_id from gestlok_resenas_gen_private.empresas e
 where auth.uid() is not null and e.enabled and e.tenant_id=gestlok_tenancy.current_tenant_id()
   and e.tenant_id<>'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
$$;
-- Puede operar el local: dueño (o creadora con edición habilitada) de la empresa, o gerente asignado a ese local.
create or replace function gestlok_resenas_gen_private.authorized(p_local text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(gestlok_resenas_gen_private.tenant() is not null and p_local is not null
   and public.mi_rol() in ('creadora','dueno','gerente') and public.puede_editar_local(p_local),false)
$$;
create or replace function gestlok_resenas_gen_private.owner() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(gestlok_resenas_gen_private.tenant() is not null and public.mi_rol() in ('creadora','dueno'),false)
$$;

create or replace function gestlok_resenas_gen_private.phone(p_phone text) returns text
language plpgsql immutable set search_path='' as $$
declare p text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
begin
 if left(p,4)='0054' then p:=substr(p,5);
 elsif left(p,2)='54' and length(p)>11 then p:=substr(p,3); end if;
 if length(p)=11 and left(p,1)='9' then p:=substr(p,2); end if;
 if left(p,1)='0' then p:=substr(p,2); end if;
 if p !~ '^[0-9]{10}$' then raise exception 'Teléfono inválido: usar 10 dígitos sin 0 ni 15' using errcode='22023'; end if;
 return p;
end $$;
-- 6 caracteres de un alfabeto de 32 símbolos sin O, 0, I ni 1 (fáciles de dictar); 256 es múltiplo de 32: sin sesgo.
create or replace function gestlok_resenas_gen_private.new_code() returns text
language plpgsql volatile set search_path='' as $$
declare a constant text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea:=uuid_send(gen_random_uuid()); c text:='';
begin
 for i in 0..5 loop c:=c||substr(a,(get_byte(b,i)%32)+1,1); end loop;
 return c;
end $$;
create or replace function gestlok_resenas_gen_private.payload(c gestlok_resenas_gen_private.coupons) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'local',c.local,'customer_name',c.customer_name,'phone',c.phone,'code',c.code,
 'discount',c.discount,'valid_until',c.valid_until,'created_at',c.created_at,'used_at',c.used_at,
 'status',case when c.used_at is not null then 'used'
   when gestlok_resenas_gen_private.today_ar()>c.valid_until then 'expired' else 'pending' end)
$$;
create or replace function gestlok_resenas_gen_private.settings(p_tenant uuid,p_local text) returns jsonb
language sql stable set search_path='' as $$
 select coalesce((select jsonb_build_object('discount',a.discount,'valid_days',a.valid_days,'message',a.message)
   from gestlok_resenas_gen_private.ajustes a where a.tenant_id=p_tenant and a.local=p_local),
   jsonb_build_object('discount',10,'valid_days',30,'message',''))
$$;

-- Qué ve esta cuenta: si la empresa lo tiene habilitado, sus locales y si puede cambiar ajustes. Nunca da error.
create or replace function public.gestlok_resenas_gen_scope() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid:=gestlok_resenas_gen_private.tenant(); l jsonb;
begin
 if t is null or public.mi_rol() is null or public.mi_rol() not in ('creadora','dueno','gerente') then
  return jsonb_build_object('enabled',false);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'nombre',coalesce(nullif(btrim(d.data->>'nombre'),''),d.id))
   order by coalesce((d.data->>'orden')::numeric,99),d.data->>'nombre'),'[]'::jsonb) into l
 from public.docs d where d.col='locales' and d.tenant_id=t and public.puede_editar_local(d.id);
 return jsonb_build_object('enabled',jsonb_array_length(l)>0,'tenant_id',t,'locals',l,
  'can_config',gestlok_resenas_gen_private.owner());
exception when others then return jsonb_build_object('enabled',false);
end $$;

create or replace function public.gestlok_resenas_gen_list(p_local text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid:=gestlok_resenas_gen_private.tenant();
begin
 if not gestlok_resenas_gen_private.authorized(p_local) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 return jsonb_build_object('settings',gestlok_resenas_gen_private.settings(t,p_local),
  'coupons',coalesce((select jsonb_agg(gestlok_resenas_gen_private.payload(c) order by c.created_at desc,c.id)
   from (select * from gestlok_resenas_gen_private.coupons x where x.tenant_id=t and x.local=p_local
         order by x.created_at desc,x.id limit 1000) c),'[]'::jsonb));
end $$;

create or replace function public.gestlok_resenas_gen_create(p_local text,p_name text,p_phone text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t uuid:=gestlok_resenas_gen_private.tenant(); c gestlok_resenas_gen_private.coupons; p text;
 d date:=gestlok_resenas_gen_private.today_ar(); s jsonb;
begin
 if not gestlok_resenas_gen_private.authorized(p_local) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 p:=gestlok_resenas_gen_private.phone(p_phone);
 if p_name is null or length(btrim(p_name)) not between 2 and 100 then raise exception 'Nombre inválido' using errcode='22023'; end if;
 -- Un pedido por teléfono y local a la vez: dos equipos no emiten dos cupones al mismo cliente.
 perform pg_advisory_xact_lock(hashtext('gestlok_resenas_gen'),hashtext(t::text||'/'||p_local||'/'||p));
 if exists(select 1 from gestlok_resenas_gen_private.coupons x where x.tenant_id=t and x.local=p_local and x.phone=p
           and x.used_at is null and x.valid_until>=d) then
  raise exception 'El cliente ya tiene un cupón pendiente en este local' using errcode='23505';
 end if;
 s:=gestlok_resenas_gen_private.settings(t,p_local);
 for attempt in 1..32 loop
  begin
   insert into gestlok_resenas_gen_private.coupons(tenant_id,local,customer_name,phone,code,discount,valid_until,created_by)
   values(t,p_local,btrim(p_name),p,gestlok_resenas_gen_private.new_code(),(s->>'discount')::int,d+(s->>'valid_days')::int,auth.uid())
   returning * into c;
   insert into gestlok_resenas_gen_private.events(coupon_id,action,actor) values(c.id,'created',auth.uid());
   return gestlok_resenas_gen_private.payload(c);
  exception when unique_violation then null; -- choque de código: se reintenta con otro
  end;
 end loop;
 raise exception 'No se pudo generar código único; reintentar';
end $$;

create or replace function public.gestlok_resenas_gen_redeem(p_local text,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t uuid:=gestlok_resenas_gen_private.tenant(); c gestlok_resenas_gen_private.coupons;
begin
 if not gestlok_resenas_gen_private.authorized(p_local) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 -- Atómico: solo uno de dos usos simultáneos encuentra el cupón sin usar.
 update gestlok_resenas_gen_private.coupons set used_at=now(),used_by=auth.uid()
 where id=p_id and tenant_id=t and local=p_local and used_at is null and gestlok_resenas_gen_private.today_ar()<=valid_until
 returning * into c;
 if not found then raise exception 'Cupón utilizado, vencido, de otro local o inexistente' using errcode='22023'; end if;
 insert into gestlok_resenas_gen_private.events(coupon_id,action,actor) values(c.id,'used',auth.uid());
 return gestlok_resenas_gen_private.payload(c);
end $$;

-- Corregir nombre o teléfono de un cupón pendiente (queda registrado el valor anterior).
create or replace function public.gestlok_resenas_gen_update(p_local text,p_id uuid,p_name text,p_phone text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t uuid:=gestlok_resenas_gen_private.tenant(); c gestlok_resenas_gen_private.coupons; o gestlok_resenas_gen_private.coupons; p text;
begin
 if not gestlok_resenas_gen_private.authorized(p_local) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 p:=gestlok_resenas_gen_private.phone(p_phone);
 if p_name is null or length(btrim(p_name)) not between 2 and 100 then raise exception 'Nombre inválido' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtext('gestlok_resenas_gen'),hashtext(t::text||'/'||p_local||'/'||p));
 select * into o from gestlok_resenas_gen_private.coupons where id=p_id and tenant_id=t and local=p_local
  and used_at is null and gestlok_resenas_gen_private.today_ar()<=valid_until for update;
 if not found then raise exception 'Solo se corrigen cupones pendientes de este local' using errcode='22023'; end if;
 if exists(select 1 from gestlok_resenas_gen_private.coupons x where x.tenant_id=t and x.local=p_local and x.phone=p and x.id<>p_id
           and x.used_at is null and x.valid_until>=gestlok_resenas_gen_private.today_ar()) then
  raise exception 'El cliente ya tiene un cupón pendiente en este local' using errcode='23505';
 end if;
 update gestlok_resenas_gen_private.coupons set customer_name=btrim(p_name),phone=p where id=p_id returning * into c;
 insert into gestlok_resenas_gen_private.events(coupon_id,action,actor,detail)
 values(c.id,'edited',auth.uid(),jsonb_build_object('customer_name',o.customer_name,'phone',o.phone));
 return gestlok_resenas_gen_private.payload(c);
end $$;

-- Ajustes del local: solo el dueño. Los cupones ya emitidos conservan su descuento y su vencimiento.
create or replace function public.gestlok_resenas_gen_settings_save(p_local text,p_discount integer,p_valid_days integer,p_message text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t uuid:=gestlok_resenas_gen_private.tenant(); m text:=btrim(coalesce(p_message,''));
begin
 if not gestlok_resenas_gen_private.authorized(p_local) or not gestlok_resenas_gen_private.owner() then
  raise exception 'Solo el dueño cambia los ajustes' using errcode='42501';
 end if;
 if p_discount is null or p_discount not between 1 and 100 or p_valid_days is null or p_valid_days not between 1 and 365
    or char_length(m)>600 then
  raise exception 'Revisá el descuento (1 a 100), los días (1 a 365) y el mensaje (hasta 600 caracteres)' using errcode='22023';
 end if;
 insert into gestlok_resenas_gen_private.ajustes(tenant_id,local,discount,valid_days,message,updated_by)
 values(t,p_local,p_discount,p_valid_days,m,auth.uid())
 on conflict(tenant_id,local) do update set discount=excluded.discount,valid_days=excluded.valid_days,
  message=excluded.message,updated_at=now(),updated_by=excluded.updated_by;
 return gestlok_resenas_gen_private.settings(t,p_local);
end $$;

-- Las funciones privadas nunca se exponen; solo las RPC con controles.
revoke all on all functions in schema gestlok_resenas_gen_private from public,anon,authenticated;
revoke all on function public.gestlok_resenas_gen_scope(),public.gestlok_resenas_gen_list(text),
 public.gestlok_resenas_gen_create(text,text,text),public.gestlok_resenas_gen_redeem(text,uuid),
 public.gestlok_resenas_gen_update(text,uuid,text,text),public.gestlok_resenas_gen_settings_save(text,integer,integer,text) from public,anon;
grant execute on function public.gestlok_resenas_gen_scope(),public.gestlok_resenas_gen_list(text),
 public.gestlok_resenas_gen_create(text,text,text),public.gestlok_resenas_gen_redeem(text,uuid),
 public.gestlok_resenas_gen_update(text,uuid,text,text),public.gestlok_resenas_gen_settings_save(text,integer,integer,text) to authenticated;
comment on table gestlok_resenas_gen_private.empresas is 'Reseñas con cupón general: empresas habilitadas. Mi Gusto usa su propia versión (gestlok_resenas_private) y no puede figurar acá.';
