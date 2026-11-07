-- El Molino Café: precios, envíos y devoluciones sincronizados.
-- Solo tenant 6c8717ea... / San Isidro -> Acassuso. Aislamiento en servidor.
-- Fechas de negocio: America/Argentina/Buenos_Aires; cierre a las 23:59.
create table if not exists public.gestlok_molino_prices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '6c8717ea-5f78-426b-9458-74a5dcac6e4e'
    check (tenant_id='6c8717ea-5f78-426b-9458-74a5dcac6e4e'),
  product text not null check(length(btrim(product)) between 1 and 140),
  amount numeric(14,2) not null check(amount>=0 and amount<=999999999),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index if not exists gestlok_molino_price_name_active
  on public.gestlok_molino_prices (tenant_id,lower(btrim(product))) where active;

create table if not exists public.gestlok_molino_price_changes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '6c8717ea-5f78-426b-9458-74a5dcac6e4e'
    check (tenant_id='6c8717ea-5f78-426b-9458-74a5dcac6e4e'),
  price_id uuid,
  day date not null,
  product text not null,
  previous_amount numeric(14,2),
  amount numeric(14,2),
  changed_at timestamptz not null default now(),
  changed_by uuid
);
create index if not exists gestlok_molino_price_changes_day on public.gestlok_molino_price_changes(day,changed_at);

create table if not exists public.gestlok_molino_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '6c8717ea-5f78-426b-9458-74a5dcac6e4e'
    check (tenant_id='6c8717ea-5f78-426b-9458-74a5dcac6e4e'),
  day date not null,
  kind text not null check(kind in ('envio','devolucion')),
  product text not null check(length(btrim(product)) between 1 and 140),
  quantity numeric(12,2) not null check(quantity>0 and quantity<=999999),
  note text not null default '' check(length(note)<=1000),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  acknowledgement_note text not null default '' check(length(acknowledgement_note)<=1000)
);
create index if not exists gestlok_molino_movement_day_kind on public.gestlok_molino_movements(day,kind,created_at);

create table if not exists public.gestlok_molino_daily_archive (
  day date primary key,
  tenant_id uuid not null default '6c8717ea-5f78-426b-9458-74a5dcac6e4e'
    check(tenant_id='6c8717ea-5f78-426b-9458-74a5dcac6e4e'),
  snapshot jsonb not null,
  archived_at timestamptz not null default now()
);
create index if not exists gestlok_molino_archive_date on public.gestlok_molino_daily_archive(day desc);

-- El perfil lo decide la membresía verificada y el tenant ACTIVO del servidor.
-- Aun siendo miembro de un local, un gerente no puede operar el otro.
-- La creadora tiene los permisos comerciales completos de ambos locales.
create or replace function public.gestlok_molino_scope()
returns text language sql stable security definer set search_path=''
as $$
 select coalesce((
  select case
    when e.data->>'rol'='creadora'
      and e.data->>'email'='kmu15lopez@gmail.com'
      and exists(select 1 from gestlok_platform.admins a where a.user_id=auth.uid())
      then 'admin'
    when e.data->>'rol'='dueno' then 'dueno'
    when e.data->>'rol'='gerente'
      and coalesce(e.data->'locales','[]'::jsonb) ? 'loc-6c8717ea5f78426b9458-si'
      and not coalesce(e.data->'locales','[]'::jsonb) ? 'loc-6c8717ea5f78426b9458'
      then 'san_isidro'
    when e.data->>'rol'='gerente'
      and coalesce(e.data->'locales','[]'::jsonb) ? 'loc-6c8717ea5f78426b9458'
      and not coalesce(e.data->'locales','[]'::jsonb) ? 'loc-6c8717ea5f78426b9458-si'
      then 'acassuso'
    else null end
  from public.docs e
  where e.col='equipo'
    and e.tenant_id='6c8717ea-5f78-426b-9458-74a5dcac6e4e'
    and lower(e.data->>'email')=gestlok_tenancy.verified_role_context_email()
    and gestlok_tenancy.current_tenant_id()=e.tenant_id
  limit 1
 ),'none')
$$;
revoke all on function public.gestlok_molino_scope() from public,anon;
grant execute on function public.gestlok_molino_scope() to authenticated;

-- Las tablas sólo permiten SELECT con RLS. TODAS las escrituras atraviesan
-- RPCs transaccionales que validan quién puede actuar sobre cada producto.
alter table public.gestlok_molino_prices enable row level security;
alter table public.gestlok_molino_price_changes enable row level security;
alter table public.gestlok_molino_movements enable row level security;
alter table public.gestlok_molino_daily_archive enable row level security;
revoke all on public.gestlok_molino_prices,public.gestlok_molino_price_changes,
 public.gestlok_molino_movements,public.gestlok_molino_daily_archive from anon,authenticated;
grant select on public.gestlok_molino_prices,public.gestlok_molino_price_changes,
 public.gestlok_molino_movements,public.gestlok_molino_daily_archive to authenticated;
drop policy if exists molino_prices_read on public.gestlok_molino_prices;
create policy molino_prices_read on public.gestlok_molino_prices for select to authenticated
 using(tenant_id='6c8717ea-5f78-426b-9458-74a5dcac6e4e' and public.gestlok_molino_scope()<>'none');
drop policy if exists molino_changes_read on public.gestlok_molino_price_changes;
create policy molino_changes_read on public.gestlok_molino_price_changes for select to authenticated
 using(tenant_id='6c8717ea-5f78-426b-9458-74a5dcac6e4e' and public.gestlok_molino_scope()<>'none');
drop policy if exists molino_movements_read on public.gestlok_molino_movements;
create policy molino_movements_read on public.gestlok_molino_movements for select to authenticated
 using(tenant_id='6c8717ea-5f78-426b-9458-74a5dcac6e4e' and public.gestlok_molino_scope()<>'none');
drop policy if exists molino_archive_read on public.gestlok_molino_daily_archive;
create policy molino_archive_read on public.gestlok_molino_daily_archive for select to authenticated
 using(tenant_id='6c8717ea-5f78-426b-9458-74a5dcac6e4e' and public.gestlok_molino_scope()<>'none');

-- El historial de envíos y devoluciones se cierra a las 23:59 de Argentina.
-- Una vez archivado un día, el snapshot nunca se reescribe.
create or replace function gestlok_platform.molino_archive_due()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
        v_cutoff boolean := to_char(now() at time zone 'America/Argentina/Buenos_Aires','HH24:MI') >= '23:59';
        v_day date; v_count integer := 0;
begin
 for v_day in
    select distinct x.day
    from (
      select m.day from public.gestlok_molino_movements m where m.day<v_today or (m.day=v_today and v_cutoff)
      union all
      select p.day from public.gestlok_molino_price_changes p where p.day<v_today or (p.day=v_today and v_cutoff)
      union all
      select v_today where v_cutoff
      union all
      select v_today-1
    ) x where x.day >= date '2026-11-07'
    and not exists(select 1 from public.gestlok_molino_daily_archive a where a.day=x.day)
 loop
   insert into public.gestlok_molino_daily_archive(day,snapshot)
   values(v_day,jsonb_build_object(
      'day',v_day,
      'envios',coalesce((select jsonb_agg(to_jsonb(m)-'tenant_id' order by m.created_at,m.id)
          from public.gestlok_molino_movements m where m.day=v_day and m.kind='envio'),'[]'::jsonb),
      'devoluciones',coalesce((select jsonb_agg(to_jsonb(m)-'tenant_id' order by m.created_at,m.id)
          from public.gestlok_molino_movements m where m.day=v_day and m.kind='devolucion'),'[]'::jsonb),
      'cambios_precios',coalesce((select jsonb_agg(to_jsonb(p)-'tenant_id' order by p.changed_at,p.id)
          from public.gestlok_molino_price_changes p where p.day=v_day),'[]'::jsonb)
   )) on conflict(day) do nothing;
   if found then v_count:=v_count+1; end if;
 end loop;
 return v_count;
end;
$$;
revoke all on function gestlok_platform.molino_archive_due() from public,anon,authenticated;

-- RPC de lectura; devuelve sólo operaciones de este tenant y las capacidades
-- exactas concedidas por el servidor. No lee productos ni movimientos ajenos.
create or replace function public.gestlok_molino_state()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_scope text:=public.gestlok_molino_scope();
        v_day date:=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
 if v_scope='none' then raise exception 'Acceso denegado a El Molino Café' using errcode='42501'; end if;
 return jsonb_build_object(
  'scope',v_scope,'day',v_day::text,
  'closed',to_char(now() at time zone 'America/Argentina/Buenos_Aires','HH24:MI')>='23:59',
  'prices',coalesce((select jsonb_agg(to_jsonb(p)-'tenant_id' order by lower(p.product))
        from public.gestlok_molino_prices p where p.active),'[]'::jsonb),
  'envios',coalesce((select jsonb_agg(to_jsonb(m)-'tenant_id' order by m.created_at,m.id)
        from public.gestlok_molino_movements m where m.day=v_day and m.kind='envio'),'[]'::jsonb),
  'devoluciones',coalesce((select jsonb_agg(to_jsonb(m)-'tenant_id' order by m.created_at,m.id)
        from public.gestlok_molino_movements m where m.day=v_day and m.kind='devolucion'),'[]'::jsonb),
  'history',coalesce((select jsonb_agg(jsonb_build_object(
       'day',a.day,'envios',jsonb_array_length(a.snapshot->'envios'),
       'devoluciones',jsonb_array_length(a.snapshot->'devoluciones'),
       'cambios_precios',jsonb_array_length(a.snapshot->'cambios_precios')) order by a.day desc)
     from (select * from public.gestlok_molino_daily_archive order by day desc limit 90) a),'[]'::jsonb)
 );
end;
$$;

create or replace function public.gestlok_molino_history(p_day date)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_snapshot jsonb;
begin
 if public.gestlok_molino_scope()='none' then raise exception 'Acceso denegado' using errcode='42501'; end if;
 select snapshot into v_snapshot from public.gestlok_molino_daily_archive where day=p_day;
 return coalesce(v_snapshot,jsonb_build_object('day',p_day,'envios','[]'::jsonb,
            'devoluciones','[]'::jsonb,'cambios_precios','[]'::jsonb,'pending_archive',true));
end;
$$;

-- San Isidro carga productos y precios; Acassuso sólo los ve.
create or replace function public.gestlok_molino_save_price(
 p_id uuid default null,p_product text default null,p_amount numeric default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_scope text:=public.gestlok_molino_scope();
        v_old numeric(14,2); v_row public.gestlok_molino_prices%rowtype;
        v_product text:=btrim(coalesce(p_product,''));
begin
 if v_scope not in ('admin','dueno','san_isidro') then raise exception 'Solo San Isidro puede modificar Precios' using errcode='42501'; end if;
 if length(v_product) not between 1 and 140 or p_amount is null or p_amount<0 or p_amount>999999999
 then raise exception 'Completá producto y monto válido' using errcode='22023'; end if;
 if p_id is null then
   insert into public.gestlok_molino_prices(product,amount,updated_by)
     values(v_product,p_amount,auth.uid()) returning * into v_row;
 else
   select amount into v_old from public.gestlok_molino_prices
    where id=p_id and active for update;
   if not found then raise exception 'Producto no encontrado' using errcode='22023'; end if;
   update public.gestlok_molino_prices
      set product=v_product,amount=p_amount,updated_at=now(),updated_by=auth.uid()
    where id=p_id and active returning * into v_row;
 end if;
 insert into public.gestlok_molino_price_changes(price_id,day,product,previous_amount,amount,changed_by)
 values(v_row.id,(now() at time zone 'America/Argentina/Buenos_Aires')::date,
        v_product,v_old,p_amount,auth.uid());
 return to_jsonb(v_row)-'tenant_id';
end;
$$;

create or replace function public.gestlok_molino_remove_price(p_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_scope text:=public.gestlok_molino_scope();
        v_row public.gestlok_molino_prices%rowtype;
begin
 if v_scope not in ('admin','dueno','san_isidro') then raise exception 'Sin permiso para eliminar precios' using errcode='42501'; end if;
 update public.gestlok_molino_prices set active=false,updated_at=now(),updated_by=auth.uid()
 where id=p_id and active returning * into v_row;
 if not found then raise exception 'Producto no encontrado' using errcode='22023'; end if;
 insert into public.gestlok_molino_price_changes(price_id,day,product,previous_amount,amount,changed_by)
 values(v_row.id,(now() at time zone 'America/Argentina/Buenos_Aires')::date,
        v_row.product,v_row.amount,null,auth.uid());
 return jsonb_build_object('removed',true,'id',v_row.id);
end;
$$;

-- Los envíos los carga San Isidro, las devoluciones las carga Acassuso.
-- El detalle es editable únicamente por el emisor, antes del OK y del cierre.
create or replace function public.gestlok_molino_save_movement(
 p_kind text,p_id uuid default null,p_product text default null,
 p_quantity numeric default null,p_note text default '')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_scope text:=public.gestlok_molino_scope();
        v_day date:=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
        v_row public.gestlok_molino_movements%rowtype;
begin
 if p_kind not in ('envio','devolucion') then raise exception 'Tipo inválido' using errcode='22023'; end if;
 if v_scope not in ('admin','dueno') and not
   (v_scope='san_isidro' and p_kind='envio' or v_scope='acassuso' and p_kind='devolucion')
 then raise exception 'Este local no puede cargar esa operación' using errcode='42501'; end if;
 if to_char(now() at time zone 'America/Argentina/Buenos_Aires','HH24:MI')>='23:59'
 then raise exception 'El día ya cerró a las 23:59' using errcode='22023'; end if;
 if length(btrim(coalesce(p_product,''))) not between 1 and 140
    or p_quantity is null or p_quantity<=0 or p_quantity>999999
    or length(coalesce(p_note,''))>1000
 then raise exception 'Revisá producto, cantidad y observación' using errcode='22023'; end if;
 if p_id is null then
   insert into public.gestlok_molino_movements(day,kind,product,quantity,note,created_by,updated_by)
   values(v_day,p_kind,btrim(p_product),p_quantity,coalesce(p_note,''),auth.uid(),auth.uid())
   returning * into v_row;
 else
   update public.gestlok_molino_movements
      set product=btrim(p_product),quantity=p_quantity,note=coalesce(p_note,''),
          updated_at=now(),updated_by=auth.uid()
    where id=p_id and day=v_day and kind=p_kind and acknowledged_at is null
    returning * into v_row;
   if not found then raise exception 'El detalle ya fue confirmado, cerrado o no existe' using errcode='22023'; end if;
 end if;
 return to_jsonb(v_row)-'tenant_id';
end;
$$;

-- Un tilde OK POR CADA PRODUCTO. La confirmación verde también se refleja
-- en el local emisor, sin concederle edición del detalle ajeno.
create or replace function public.gestlok_molino_acknowledge(
 p_id uuid,p_note text default '')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_scope text:=public.gestlok_molino_scope();
        v_day date:=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
        v_row public.gestlok_molino_movements%rowtype;
begin
 if length(coalesce(p_note,''))>1000 then raise exception 'Observación demasiado larga' using errcode='22023'; end if;
 if to_char(now() at time zone 'America/Argentina/Buenos_Aires','HH24:MI')>='23:59'
 then raise exception 'El día ya cerró a las 23:59' using errcode='22023'; end if;
 update public.gestlok_molino_movements
  set acknowledged_at=now(),acknowledged_by=auth.uid(),
      acknowledgement_note=coalesce(p_note,''),updated_at=now()
  where id=p_id and day=v_day and acknowledged_at is null
    and (v_scope in ('admin','dueno')
      or (v_scope='acassuso' and kind='envio')
      or (v_scope='san_isidro' and kind='devolucion'))
  returning * into v_row;
 if not found then raise exception 'Sin permiso, ya confirmado o cerrado' using errcode='42501'; end if;
 return to_jsonb(v_row)-'tenant_id';
end;
$$;
do $$
declare fn text;
begin
 foreach fn in array array[
  'gestlok_molino_state()','gestlok_molino_history(date)',
  'gestlok_molino_save_price(uuid,text,numeric)','gestlok_molino_remove_price(uuid)',
  'gestlok_molino_save_movement(text,uuid,text,numeric,text)',
  'gestlok_molino_acknowledge(uuid,text)'
 ] loop
    execute 'revoke all on function public.'||fn||' from public,anon';
    execute 'grant execute on function public.'||fn||' to authenticated';
 end loop;
end;
$$;

-- Publicar solo estas tablas con RLS para escuchar cambios en vivo.
do $$
declare t text;
begin
 foreach t in array array['gestlok_molino_prices','gestlok_molino_movements','gestlok_molino_daily_archive'] loop
  if not exists(select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename=t)
  then execute 'alter publication supabase_realtime add table public.'||quote_ident(t); end if;
 end loop;
end; $$;

-- pg_cron utiliza hora UTC; Argentina equivale a UTC-3 todo el año.
-- A las 02:59 UTC son las 23:59 en Buenos Aires. Backup cada 15 minutos.
select cron.schedule('molino-cierre-2359-ar','59 2 * * *','select gestlok_platform.molino_archive_due();');
select cron.schedule('molino-cierre-respaldo','*/15 * * * *','select gestlok_platform.molino_archive_due();');
